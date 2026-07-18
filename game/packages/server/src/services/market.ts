/**
 * Marché L1 taux fixe — GB §9/§13, DG §11.1.
 *
 * Physicalité canon : un marché n'échange QUE le stock physiquement présent
 * sur sa planète, contre la soute d'un vaisseau À QUAI (les droits
 * d'atterrissage gardent déjà l'accès — chunk J). Le slot est directionnel :
 * le marché ACHÈTE `give` et paie en `get` au taux posté (le taux est le
 * prix ; aucun frais séparé en taux fixe [TUNE-v1], les bp sont un
 * mécanisme AMM/L2). Les limites quotidienne/absolue se vérifient contre le
 * journal `trades`. Whitelist vide = ouvert. Auto-échange permis (canon :
 * « self-wash trading is pointless, not dangerous »).
 */
import {
  AMM_FEE_HOUSE_BP,
  ammLpFeeBp,
  ammQuote,
  containersUsed,
  fixedTradeOutput,
  isAmmSlot,
  validateAmmSeed,
  ALL_RESOURCE_IDS,
  HULLS,
  MARKET_SLOTS_BY_LEVEL,
  REPRICE_MIN_INTERVAL_MS,
  tradableAboveFloor,
  validateInnateOffer,
  validateMarketSlot,
  type HullCategory,
  type HullSize,
  type AmmSlot,
  type InnateOffer,
  type MarketSlot,
  type ResourceId,
  type SlotInput,
} from '@atg/shared';
import type pg from 'pg';
import { evalLazy } from '../sim/lazy.js';
import { loadProductionSnapshot, recomputePlanetRates } from '../sim/rebase.js';
import { CommandError, governingArchetypes } from './planets.js';

const toMs = (d: Date | string) => new Date(d).getTime();

type AnySlot = MarketSlot | AmmSlot;

/** Le tableau peut porter des TROUS (null) : slot AMM libéré au retrait. */
function slotsOf(config: unknown): (AnySlot | null)[] {
  const c = config as { slots?: (AnySlot | null)[] } | null;
  return Array.isArray(c?.slots) ? c.slots : [];
}

const isResource = (r: string) =>
  (ALL_RESOURCE_IDS as readonly string[]).includes(r);

/**
 * Configure un slot d'échange (propriétaire seul). Slots = niveau du
 * marché ; re-tarification d'un slot existant ≤ 1/min (DG §11.1).
 */
export async function setMarketSlot(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  slotIndex: number,
  input: SlotInput,
  opts: { nowMs?: number } = {},
): Promise<{ slots: (AnySlot | null)[] }> {
  const nowMs = opts.nowMs ?? Date.now();
  const invalid = validateMarketSlot(input);
  if (invalid) throw new CommandError('not_available', invalid);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
      [bodyId, playerId],
    );
    if (!owned[0]) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { rows } = await client.query(
      `SELECT id, key, level, status, config FROM buildings
       WHERE id = $1 AND body_id = $2 FOR UPDATE`,
      [buildingId, bodyId],
    );
    const b = rows[0];
    if (!b) throw new CommandError('not_found', 'Bâtiment inconnu');
    if (b.key !== 'market') {
      throw new CommandError('not_available', 'Les slots d\'échange vivent sur un market');
    }
    if (b.status !== 'active') {
      throw new CommandError('not_available', 'Le marché doit être actif');
    }
    const maxSlots = MARKET_SLOTS_BY_LEVEL[b.level as 1 | 2 | 3] ?? 1;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) {
      throw new CommandError(
        'not_available',
        `Un market L${b.level} n'a que ${maxSlots} slot(s) (canon : slots = niveau)`,
      );
    }
    const slots = slotsOf(b.config);
    const existing = slots[slotIndex];
    if (isAmmSlot(existing)) {
      throw new CommandError(
        'not_available',
        'Slot occupé par un pool AMM — retirez la liquidité d\'abord',
      );
    }
    if (
      existing &&
      existing.give === input.give &&
      existing.get === input.get &&
      existing.rate !== input.rate &&
      nowMs - (existing.rateUpdatedAtMs ?? 0) < REPRICE_MIN_INTERVAL_MS
    ) {
      throw new CommandError(
        'not_available',
        'Re-tarification limitée à une fois par minute',
      );
    }
    slots[slotIndex] = { ...input, rateUpdatedAtMs: nowMs };
    await client.query(
      `UPDATE buildings SET config = config || jsonb_build_object('slots', $2::jsonb)
       WHERE id = $1`,
      [buildingId, JSON.stringify(slots)],
    );
    await client.query('COMMIT');
    return { slots };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface AmmSlotView {
  mode: 'amm';
  slotIndex: number;
  x: ResourceId;
  y: ResourceId;
  rx: number;
  ry: number;
  /** Spot y/x (information — jamais un oracle, DG §11.2). */
  spot: number;
  lpFeeBp: number;
  houseFeeBp: number;
  dailyLimitT: number;
  absoluteLimitT: number;
  whitelist: string[];
}

export interface MarketView {
  buildingId: string;
  level: number;
  slots: (
    | (MarketSlot & {
        slotIndex: number;
        /** Stock de `get` disponible côté planète (info visiteur). */
        payableStockT: number;
      })
    | AmmSlotView
  )[];
}

/**
 * Marchés visibles d'une planète : le propriétaire, ou quiconque a un
 * vaisseau À QUAI (canon : « browsable by a buyer docked » — GB §9).
 */
export async function listMarkets(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<MarketView[]> {
  const { rows: access } = await pool.query(
    `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2
     UNION ALL
     SELECT 1 FROM ships WHERE owner_id = $2 AND docked_body_id = $1
     LIMIT 1`,
    [bodyId, playerId],
  );
  if (!access[0]) {
    throw new CommandError('forbidden', 'Les offres se consultent à quai');
  }
  const { rows: markets } = await pool.query(
    `SELECT id, level, config FROM buildings
     WHERE body_id = $1 AND key = 'market' AND status = 'active'
     ORDER BY created_at`,
    [bodyId],
  );
  const { rows: stockRows } = await pool.query(
    `SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock
     WHERE body_id = $1`,
    [bodyId],
  );
  const stock = new Map<string, number>();
  for (const r of stockRows) {
    stock.set(
      r.resource,
      evalLazy(
        { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
        nowMs,
        { min: 0 },
      ),
    );
  }
  return markets.map((m) => ({
    buildingId: m.id,
    level: m.level,
    slots: slotsOf(m.config).flatMap((s, i) =>
      s === null
        ? []
        : isAmmSlot(s)
        ? ({
            mode: 'amm' as const,
            slotIndex: i,
            x: s.pool.x,
            y: s.pool.y,
            rx: Math.floor(s.pool.rx * 1000) / 1000,
            ry: Math.floor(s.pool.ry * 1000) / 1000,
            spot: Math.round((s.pool.ry / s.pool.rx) * 10_000) / 10_000,
            lpFeeBp: ammLpFeeBp(Number(m.level)),
            houseFeeBp: AMM_FEE_HOUSE_BP,
            dailyLimitT: s.dailyLimitT,
            absoluteLimitT: s.absoluteLimitT,
            whitelist: s.whitelist,
          } satisfies AmmSlotView)
          : {
              ...s,
              slotIndex: i,
              payableStockT: Math.floor((stock.get(s.get) ?? 0) * 10) / 10,
            },
    ),
  }));
}

/**
 * Exécute un échange à taux fixe : le vaisseau (à quai) donne `giveT` de
 * `slot.give` depuis sa soute et reçoit `giveT × rate` de `slot.get` ;
 * le stock planétaire encaisse/paie physiquement.
 */
export async function executeTrade(
  pool: pg.Pool,
  playerId: string,
  buildingId: string,
  slotIndex: number,
  shipId: string,
  giveT: number,
  opts: { nowMs?: number } = {},
): Promise<{ gaveT: number; gotT: number; gotResource: ResourceId }> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(giveT) || giveT <= 0) {
    throw new CommandError('not_available', 'Quantité invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: markets } = await client.query(
      `SELECT id, body_id, level, status, config FROM buildings
       WHERE id = $1 AND key = 'market' FOR UPDATE`,
      [buildingId],
    );
    const market = markets[0];
    if (!market) throw new CommandError('not_found', 'Marché inconnu');
    if (market.status !== 'active') {
      throw new CommandError('not_available', 'Le marché doit être actif');
    }
    const slot = slotsOf(market.config)[slotIndex];
    if (!slot) throw new CommandError('not_found', 'Slot non configuré');
    if (isAmmSlot(slot)) {
      throw new CommandError('not_available', 'Slot AMM : utilisez l\'échange AMM');
    }
    const bodyId = market.body_id as string;

    const { rows: bodyRows } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1`,
      [bodyId],
    );
    const ownerId = bodyRows[0]?.owner_id as string | null;
    if (slot.whitelist.length > 0 && playerId !== ownerId) {
      if (!slot.whitelist.includes(playerId)) {
        throw new CommandError('forbidden', 'Ce slot est réservé (whitelist)');
      }
    }

    // Physicalité : le vaisseau du trader est À QUAI sur la planète du marché.
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = ships[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (ship.status !== 'docked' || ship.docked_body_id !== bodyId) {
      throw new CommandError('not_available', 'On commerce à quai, sur place');
    }

    // Limites du slot (journal trades).
    const { rows: sums } = await client.query(
      `SELECT
         COALESCE(sum(gave_t) FILTER (WHERE created_at > now() - interval '1 day'), 0) AS day_t,
         COALESCE(sum(gave_t), 0) AS total_t
       FROM trades WHERE market_building_id = $1 AND slot_index = $2`,
      [buildingId, slotIndex],
    );
    if (slot.dailyLimitT > 0 && Number(sums[0].day_t) + giveT > slot.dailyLimitT + 1e-9) {
      throw new CommandError(
        'not_available',
        `Limite quotidienne du slot atteinte (${slot.dailyLimitT} T/jour)`,
      );
    }
    if (
      slot.absoluteLimitT > 0 &&
      Number(sums[0].total_t) + giveT > slot.absoluteLimitT + 1e-9
    ) {
      throw new CommandError(
        'not_available',
        `Limite absolue du slot atteinte (${slot.absoluteLimitT} T)`,
      );
    }

    const gotT = fixedTradeOutput(giveT, slot.rate);
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    if ((cargo[slot.give] ?? 0) + 1e-9 < giveT) {
      throw new CommandError('insufficient_resources', `Soute insuffisante : ${slot.give}`);
    }

    // État planétaire matérialisé (verrouillé) : le marché paie sur stock,
    // encaisse sous cap de stockage (refus explicite sinon).
    const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');
    const payable = snap.stocks[slot.get] ?? 0;
    if (payable + 1e-9 < gotT) {
      throw new CommandError(
        'insufficient_resources',
        `Le marché n'a plus assez de ${slot.get} (${payable.toFixed(1)} T)`,
      );
    }
    const usedT = Object.values(snap.stocks).reduce((s, v) => s + (v ?? 0), 0);
    if (usedT + giveT - gotT > snap.storageCapT + 1e-9) {
      throw new CommandError('not_available', 'Stockage du marché plein');
    }

    // Soute : -give, +got — sous la capacité de conteneurs.
    const left = (cargo[slot.give] ?? 0) - giveT;
    if (left <= 1e-9) delete cargo[slot.give];
    else cargo[slot.give] = left;
    cargo[slot.get] = (cargo[slot.get] ?? 0) + gotT;
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    const capacity = hull?.containers ?? 0;
    if (containersUsed(cargo) > capacity) {
      throw new CommandError(
        'not_available',
        `Conteneurs insuffisants pour encaisser (${containersUsed(cargo)}/${capacity})`,
      );
    }

    // Écritures physiques.
    for (const [res, amount] of [
      [slot.give, (snap.stocks[slot.give] ?? 0) + giveT],
      [slot.get, payable - gotT],
    ] as [string, number][]) {
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
        [bodyId, res, amount, nowMs],
      );
    }
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(cargo),
    ]);
    await client.query(
      `INSERT INTO trades (market_building_id, body_id, trader, slot_index,
                           gave_resource, gave_t, got_resource, got_t)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [buildingId, bodyId, playerId, slotIndex, slot.give, giveT, slot.get, gotT],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { gaveT: giveT, gotT, gotResource: slot.get as ResourceId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Gouvernance TOUTE mercantile (intersection, GB §9/§11) — sinon pas d'inné. */
async function requireMercantileGovernance(
  client: pg.PoolClient | pg.Pool,
  bodyId: string,
  ownerId: string,
): Promise<void> {
  const archetypes = await governingArchetypes(client, bodyId, ownerId);
  if (archetypes.length === 0 || !archetypes.every((a) => a === 'mercantile')) {
    throw new CommandError(
      'mask_denied',
      'Le commerce inné exige une gouvernance TOUTE mercantile (GB §9)',
    );
  }
}

function innateOffersOf(config: unknown): InnateOffer[] {
  const c = config as { innateOffers?: InnateOffer[] } | null;
  return Array.isArray(c?.innateOffers) ? c.innateOffers : [];
}

/** Verrouille un marché ACTIF et son slot AMM ; retourne le contexte. */
async function lockAmmSlot(
  client: pg.PoolClient,
  buildingId: string,
  slotIndex: number,
): Promise<{
  market: Record<string, unknown> & { body_id: string; level: number };
  slots: (AnySlot | null)[];
  slot: AmmSlot;
}> {
  const { rows: markets } = await client.query(
    `SELECT id, body_id, level, status, config FROM buildings
     WHERE id = $1 AND key = 'market' FOR UPDATE`,
    [buildingId],
  );
  const market = markets[0];
  if (!market) throw new CommandError('not_found', 'Marché inconnu');
  if (market.status !== 'active') {
    throw new CommandError('not_available', 'Le marché doit être actif');
  }
  const slots = slotsOf(market.config);
  const slot = slots[slotIndex];
  if (!slot || !isAmmSlot(slot)) {
    throw new CommandError('not_found', 'Aucun pool AMM sur ce slot');
  }
  return { market, slots, slot };
}

/**
 * Seed d'un pool AMM (GB §13, DG §11.2) : marché L2+ actif, propriétaire
 * seul, slot libre ou taux-fixe (un pool existant se retire d'abord).
 * Les deux jambes sont déduites PHYSIQUEMENT du stock planétaire — le
 * RATIO du dépôt est le prix initial (« seeding is a pricing decision »).
 * Les réserves restent du stock physique : elles comptent au cap (rebase).
 */
export async function seedAmmPool(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  slotIndex: number,
  input: {
    x: string;
    y: string;
    depositX: number;
    depositY: number;
    dailyLimitT: number;
    absoluteLimitT: number;
    whitelist: string[];
  },
  opts: { nowMs?: number } = {},
): Promise<{ slots: (AnySlot | null)[] }> {
  const nowMs = opts.nowMs ?? Date.now();
  const invalid = validateAmmSeed(input, isResource);
  if (invalid) throw new CommandError('not_available', invalid);
  if (
    !Number.isFinite(input.dailyLimitT) ||
    input.dailyLimitT < 0 ||
    !Number.isFinite(input.absoluteLimitT) ||
    input.absoluteLimitT < 0
  ) {
    throw new CommandError('not_available', 'Limites invalides');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [bodyId, playerId],
    );
    if (!owned[0]) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { rows } = await client.query(
      `SELECT id, key, level, status, config FROM buildings
       WHERE id = $1 AND body_id = $2 FOR UPDATE`,
      [buildingId, bodyId],
    );
    const b = rows[0];
    if (!b) throw new CommandError('not_found', 'Bâtiment inconnu');
    if (b.key !== 'market') {
      throw new CommandError('not_available', 'Les pools AMM vivent sur un market');
    }
    if (b.status !== 'active') {
      throw new CommandError('not_available', 'Le marché doit être actif');
    }
    if (b.level < 2) {
      throw new CommandError(
        'not_available',
        'Les pools AMM demandent un marché L2+ (canon : L1 = taux fixe)',
      );
    }
    const maxSlots = MARKET_SLOTS_BY_LEVEL[b.level as 1 | 2 | 3] ?? 1;
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= maxSlots) {
      throw new CommandError(
        'not_available',
        `Un market L${b.level} n'a que ${maxSlots} slot(s) (canon : slots = niveau)`,
      );
    }
    const slots = slotsOf(b.config);
    if (isAmmSlot(slots[slotIndex])) {
      throw new CommandError(
        'not_available',
        'Slot occupé par un pool AMM — retirez la liquidité d\'abord',
      );
    }

    // Déduction PHYSIQUE des deux jambes du stock planétaire matérialisé.
    const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');
    for (const [res, need] of [
      [input.x, input.depositX],
      [input.y, input.depositY],
    ] as [ResourceId, number][]) {
      const have = snap.stocks[res] ?? 0;
      if (have + 1e-9 < need) {
        throw new CommandError(
          'insufficient_resources',
          `Stock insuffisant pour seeder : ${res} (${have.toFixed(1)} T)`,
        );
      }
    }
    // x et y distincts : deux écritures indépendantes.
    for (const [res, need] of [
      [input.x, input.depositX],
      [input.y, input.depositY],
    ] as [ResourceId, number][]) {
      await client.query(
        `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
         WHERE body_id = $1 AND resource = $2`,
        [bodyId, res, (snap.stocks[res] ?? 0) - need, nowMs],
      );
    }
    slots[slotIndex] = {
      mode: 'amm',
      pool: {
        x: input.x as ResourceId,
        y: input.y as ResourceId,
        rx: input.depositX,
        ry: input.depositY,
        seededAtMs: nowMs,
      },
      dailyLimitT: input.dailyLimitT,
      absoluteLimitT: input.absoluteLimitT,
      whitelist: input.whitelist,
    };
    await client.query(
      `UPDATE buildings SET config = config || jsonb_build_object('slots', $2::jsonb)
       WHERE id = $1`,
      [buildingId, JSON.stringify(slots)],
    );
    // Rebase : les réserves comptent désormais au cap (frein/halt).
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { slots };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Liquidité (v1 : PROPRIÉTAIRE seul — les LP visiteurs, liens de conquête
 * et retrait garanti arrivent avec les shares P4, annoncé).
 * - add : dépôt PROPORTIONNEL au ratio courant (préserve le prix) — on
 *   donne tonsX, tonsY = tonsX × ry/rx ;
 * - remove : pct % des DEUX réserves reviennent au stock (delta net de
 *   stockage nul — réserves et stock comptent au même cap) ; 100 % vide
 *   et LIBÈRE le slot.
 */
export async function ammLiquidity(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  slotIndex: number,
  input: { action: 'add'; tonsX: number } | { action: 'remove'; pct: number },
  opts: { nowMs?: number } = {},
): Promise<{ slots: (AnySlot | null)[] }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [bodyId, playerId],
    );
    if (!owned[0]) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { market, slots, slot } = await lockAmmSlot(client, buildingId, slotIndex);
    if (market.body_id !== bodyId) {
      throw new CommandError('not_found', 'Marché inconnu');
    }
    const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');

    if (input.action === 'add') {
      if (!Number.isFinite(input.tonsX) || input.tonsX <= 0) {
        throw new CommandError('not_available', 'Quantité invalide');
      }
      const tonsY = input.tonsX * (slot.pool.ry / slot.pool.rx);
      for (const [res, need] of [
        [slot.pool.x, input.tonsX],
        [slot.pool.y, tonsY],
      ] as [ResourceId, number][]) {
        const have = snap.stocks[res] ?? 0;
        if (have + 1e-9 < need) {
          throw new CommandError(
            'insufficient_resources',
            `Stock insuffisant : ${res} (${have.toFixed(1)} T)`,
          );
        }
        await client.query(
          `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
           WHERE body_id = $1 AND resource = $2`,
          [bodyId, res, have - need, nowMs],
        );
      }
      slot.pool.rx += input.tonsX;
      slot.pool.ry += tonsY;
    } else {
      if (!Number.isFinite(input.pct) || input.pct <= 0 || input.pct > 100) {
        throw new CommandError('not_available', 'Pourcentage invalide (0–100]');
      }
      const outX = (slot.pool.rx * input.pct) / 100;
      const outY = (slot.pool.ry * input.pct) / 100;
      for (const [res, back] of [
        [slot.pool.x, outX],
        [slot.pool.y, outY],
      ] as [ResourceId, number][]) {
        await client.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
           ON CONFLICT (body_id, resource)
           DO UPDATE SET amount_t = planet_stock.amount_t + $3,
                         as_of = to_timestamp($4 / 1000.0)`,
          [bodyId, res, back, nowMs],
        );
      }
      slot.pool.rx -= outX;
      slot.pool.ry -= outY;
      if (input.pct >= 100 - 1e-9 || slot.pool.rx <= 1e-9 || slot.pool.ry <= 1e-9) {
        // Slot vidé et libéré (null = trou réutilisable, comme un slot vide).
        slots[slotIndex] = null;
      }
    }
    await client.query(
      `UPDATE buildings SET config = config || jsonb_build_object('slots', $2::jsonb)
       WHERE id = $1`,
      [buildingId, JSON.stringify(slots)],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { slots };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Échange AMM (GB §13, DG §11.2) : le vaisseau À QUAI donne `giveT` d'une
 * jambe du pool et reçoit l'autre au produit constant ; frais 25 bp LP
 * (20 bp si marché L3) accumulés DANS la réserve d'entrée + 25 bp maison
 * au stock planétaire. Limites quotidienne/absolue contre le journal
 * `trades` (mêmes requêtes que le taux fixe). Whitelist, propriétaire
 * exempt. Auto-échange permis (le spot n'est jamais un oracle).
 */
export async function executeAmmTrade(
  pool: pg.Pool,
  playerId: string,
  buildingId: string,
  slotIndex: number,
  shipId: string,
  give: string,
  giveT: number,
  opts: { nowMs?: number } = {},
): Promise<{
  gaveT: number;
  gotT: number;
  gotResource: ResourceId;
  lpFeeT: number;
  houseFeeT: number;
  spotAfter: number;
}> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(giveT) || giveT <= 0) {
    throw new CommandError('not_available', 'Quantité invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { market, slots, slot } = await lockAmmSlot(client, buildingId, slotIndex);
    const bodyId = market.body_id;
    if (give !== slot.pool.x && give !== slot.pool.y) {
      throw new CommandError('not_available', 'Cette jambe n\'est pas dans la paire');
    }
    const gotResource = (give === slot.pool.x ? slot.pool.y : slot.pool.x) as ResourceId;

    const { rows: bodyRows } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1 FOR UPDATE`,
      [bodyId],
    );
    const ownerId = bodyRows[0]?.owner_id as string | null;
    if (slot.whitelist.length > 0 && playerId !== ownerId) {
      if (!slot.whitelist.includes(playerId)) {
        throw new CommandError('forbidden', 'Ce slot est réservé (whitelist)');
      }
    }

    // Physicalité : à quai sur la planète du marché.
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = ships[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (ship.status !== 'docked' || ship.docked_body_id !== bodyId) {
      throw new CommandError('not_available', 'On commerce à quai, sur place');
    }

    // Limites du slot (journal trades — mêmes fenêtres que le taux fixe).
    const { rows: sums } = await client.query(
      `SELECT
         COALESCE(sum(gave_t) FILTER (WHERE created_at > now() - interval '1 day'), 0) AS day_t,
         COALESCE(sum(gave_t), 0) AS total_t
       FROM trades WHERE market_building_id = $1 AND slot_index = $2`,
      [buildingId, slotIndex],
    );
    if (slot.dailyLimitT > 0 && Number(sums[0].day_t) + giveT > slot.dailyLimitT + 1e-9) {
      throw new CommandError(
        'not_available',
        `Limite quotidienne du slot atteinte (${slot.dailyLimitT} T/jour)`,
      );
    }
    if (
      slot.absoluteLimitT > 0 &&
      Number(sums[0].total_t) + giveT > slot.absoluteLimitT + 1e-9
    ) {
      throw new CommandError(
        'not_available',
        `Limite absolue du slot atteinte (${slot.absoluteLimitT} T)`,
      );
    }

    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    if ((cargo[give] ?? 0) + 1e-9 < giveT) {
      throw new CommandError('insufficient_resources', `Soute insuffisante : ${give}`);
    }

    const rIn = give === slot.pool.x ? slot.pool.rx : slot.pool.ry;
    const rOut = give === slot.pool.x ? slot.pool.ry : slot.pool.rx;
    const q = ammQuote(rIn, rOut, giveT, ammLpFeeBp(Number(market.level)), AMM_FEE_HOUSE_BP);
    if (q.outT <= 1e-9) {
      throw new CommandError('not_available', 'Sortie négligeable (pool trop déséquilibré)');
    }

    // Cap de stockage : la planète + pools gagnent net (giveT − outT) ; on
    // ne refuse que si l'échange AGGRAVE un dépassement (§3.3b).
    const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');
    const usedT =
      Object.values(snap.stocks).reduce((s, v) => s + (v ?? 0), 0) + snap.pooledT;
    const netT = giveT - q.outT;
    if (netT > 0 && usedT + netT > snap.storageCapT + 1e-9) {
      throw new CommandError('not_available', 'Stockage du marché plein');
    }

    // Soute : −give, +got — sous la capacité de conteneurs.
    const left = (cargo[give] ?? 0) - giveT;
    if (left <= 1e-9) delete cargo[give];
    else cargo[give] = left;
    cargo[gotResource] = (cargo[gotResource] ?? 0) + q.outT;
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    const capacity = hull?.containers ?? 0;
    if (containersUsed(cargo) > capacity) {
      throw new CommandError(
        'not_available',
        `Conteneurs insuffisants pour encaisser (${containersUsed(cargo)}/${capacity})`,
      );
    }

    // Écritures : réserves du pool, commission maison au stock, soute.
    if (give === slot.pool.x) {
      slot.pool.rx = q.newRIn;
      slot.pool.ry = q.newROut;
    } else {
      slot.pool.ry = q.newRIn;
      slot.pool.rx = q.newROut;
    }
    await client.query(
      `UPDATE buildings SET config = config || jsonb_build_object('slots', $2::jsonb)
       WHERE id = $1`,
      [buildingId, JSON.stringify(slots)],
    );
    await client.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
      [bodyId, give, (snap.stocks[give as ResourceId] ?? 0) + q.houseFeeT, nowMs],
    );
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(cargo),
    ]);
    await client.query(
      `INSERT INTO trades (market_building_id, body_id, trader, slot_index,
                           gave_resource, gave_t, got_resource, got_t)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [buildingId, bodyId, playerId, slotIndex, give, giveT, gotResource, q.outT],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return {
      gaveT: giveT,
      gotT: q.outT,
      gotResource,
      lpFeeT: q.lpFeeT,
      houseFeeT: q.houseFeeT,
      spotAfter: q.spotAfter,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Publie les offres innées d'un monde marchand (liste COMPLÈTE remplacée —
 * l'ordre vit dans la donnée). Propriétaire + gouvernance mercantile.
 */
export async function setInnateOffers(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  offers: InnateOffer[],
): Promise<{ offers: InnateOffer[] }> {
  if (offers.length > 8) {
    throw new CommandError('not_available', 'Au plus une offre par ressource innée');
  }
  const seen = new Set<string>();
  for (const o of offers) {
    const invalid = validateInnateOffer(o);
    if (invalid) throw new CommandError('not_available', invalid);
    if (seen.has(o.sell)) {
      throw new CommandError('not_available', `Deux offres pour ${o.sell}`);
    }
    seen.add(o.sell);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id FROM bodies WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [bodyId],
    );
    if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
    if (bodies[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    await requireMercantileGovernance(client, bodyId, playerId);
    await client.query(
      `UPDATE bodies SET config = config || jsonb_build_object('innateOffers', $2::jsonb)
       WHERE id = $1`,
      [bodyId, JSON.stringify(offers)],
    );
    await client.query('COMMIT');
    return { offers };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface InnateOfferView extends InnateOffer {
  offerIndex: number;
  /** Surplus réellement négociable (stock − plancher). */
  availableT: number;
}

/**
 * Offres innées visibles : propriétaire, ou vaisseau À QUAI **ou EN
 * SURVOL** — l'hospitalité du monde marchand ne demande pas de droit
 * d'atterrissage [TUNE-v1 interp, JOURNAL]. Servies uniquement tant que la
 * gouvernance reste toute mercantile.
 */
export async function listInnateOffers(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<InnateOfferView[]> {
  const { rows: bodies } = await pool.query(
    `SELECT id, owner_id, config FROM bodies WHERE id = $1 AND body_type = 'planet'`,
    [bodyId],
  );
  if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
  const ownerId = bodies[0].owner_id as string | null;
  if (!ownerId) return [];
  const { rows: access } = await pool.query(
    `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2
     UNION ALL
     SELECT 1 FROM ships WHERE owner_id = $2
       AND (docked_body_id = $1 OR hover_body_id = $1)
     LIMIT 1`,
    [bodyId, playerId],
  );
  if (!access[0]) {
    throw new CommandError('forbidden', 'L\'hospitalité se demande sur place');
  }
  const archetypes = await governingArchetypes(pool, bodyId, ownerId);
  if (archetypes.length === 0 || !archetypes.every((a) => a === 'mercantile')) {
    return []; // la gouvernance a changé : l'inné se tait
  }
  const offers = innateOffersOf(bodies[0].config);
  if (offers.length === 0) return [];
  const { rows: stockRows } = await pool.query(
    `SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock
     WHERE body_id = $1`,
    [bodyId],
  );
  const stock = new Map<string, number>();
  for (const r of stockRows) {
    stock.set(
      r.resource,
      evalLazy(
        { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
        nowMs,
        { min: 0 },
      ),
    );
  }
  return offers.map((o, i) => ({
    ...o,
    offerIndex: i,
    availableT:
      Math.floor(tradableAboveFloor(stock.get(o.sell) ?? 0, o.keepFloorT) * 10) / 10,
  }));
}

/**
 * Achat inné : le visiteur (à quai OU en survol) paie `buyT × price` de
 * `want` depuis sa soute et reçoit `buyT` de `sell` — jamais sous le
 * plancher keep-for-self. Journalisé (market_building_id NULL, slot −1).
 */
export async function executeInnateTrade(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  offerIndex: number,
  shipId: string,
  buyT: number,
  opts: { nowMs?: number } = {},
): Promise<{ boughtT: number; paidT: number; paidResource: ResourceId }> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!Number.isFinite(buyT) || buyT <= 0) {
    throw new CommandError('not_available', 'Quantité invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id, config FROM bodies
       WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [bodyId],
    );
    if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
    const ownerId = bodies[0].owner_id as string | null;
    if (!ownerId) throw new CommandError('not_available', 'Monde sauvage');
    await requireMercantileGovernance(client, bodyId, ownerId);
    const offer = innateOffersOf(bodies[0].config)[offerIndex];
    if (!offer) throw new CommandError('not_found', 'Offre inconnue');

    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = ships[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    const onSite =
      (ship.status === 'docked' && ship.docked_body_id === bodyId) ||
      (ship.status === 'hovering' && ship.hover_body_id === bodyId);
    if (!onSite) {
      throw new CommandError('not_available', 'L\'hospitalité se demande sur place');
    }

    const paidT = buyT * offer.price;
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    if ((cargo[offer.want] ?? 0) + 1e-9 < paidT) {
      throw new CommandError('insufficient_resources', `Soute insuffisante : ${offer.want}`);
    }

    const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
      forUpdate: true,
    });
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');
    const sellable = tradableAboveFloor(
      snap.stocks[offer.sell] ?? 0,
      offer.keepFloorT,
    );
    if (sellable + 1e-9 < buyT) {
      throw new CommandError(
        'insufficient_resources',
        `Surplus insuffisant au-dessus du plancher (${sellable.toFixed(1)} T)`,
      );
    }
    const usedT = Object.values(snap.stocks).reduce((s, v) => s + (v ?? 0), 0);
    if (usedT + paidT - buyT > snap.storageCapT + 1e-9) {
      throw new CommandError('not_available', 'Stockage du monde marchand plein');
    }

    const left = (cargo[offer.want] ?? 0) - paidT;
    if (left <= 1e-9) delete cargo[offer.want];
    else cargo[offer.want] = left;
    cargo[offer.sell] = (cargo[offer.sell] ?? 0) + buyT;
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    if (containersUsed(cargo) > (hull?.containers ?? 0)) {
      throw new CommandError(
        'not_available',
        `Conteneurs insuffisants (${containersUsed(cargo)}/${hull?.containers ?? 0})`,
      );
    }

    for (const [res, amount] of [
      [offer.sell, (snap.stocks[offer.sell] ?? 0) - buyT],
      [offer.want, (snap.stocks[offer.want] ?? 0) + paidT],
    ] as [string, number][]) {
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
        [bodyId, res, amount, nowMs],
      );
    }
    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(cargo),
    ]);
    await client.query(
      `INSERT INTO trades (market_building_id, body_id, trader, slot_index,
                           gave_resource, gave_t, got_resource, got_t)
       VALUES (NULL, $1, $2, -1, $3, $4, $5, $6)`,
      [bodyId, playerId, offer.want, paidT, offer.sell, buyT],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { boughtT: buyT, paidT, paidResource: offer.want as ResourceId };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

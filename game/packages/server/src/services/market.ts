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
  containersUsed,
  fixedTradeOutput,
  HULLS,
  MARKET_SLOTS_BY_LEVEL,
  REPRICE_MIN_INTERVAL_MS,
  tradableAboveFloor,
  validateInnateOffer,
  validateMarketSlot,
  type HullCategory,
  type HullSize,
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

function slotsOf(config: unknown): MarketSlot[] {
  const c = config as { slots?: MarketSlot[] } | null;
  return Array.isArray(c?.slots) ? c.slots : [];
}

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
): Promise<{ slots: MarketSlot[] }> {
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

export interface MarketView {
  buildingId: string;
  level: number;
  slots: (MarketSlot & {
    slotIndex: number;
    /** Stock de `get` disponible côté planète (info visiteur). */
    payableStockT: number;
  })[];
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
    slots: slotsOf(m.config).map((s, i) => ({
      ...s,
      slotIndex: i,
      payableStockT: Math.floor((stock.get(s.get) ?? 0) * 10) / 10,
    })),
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

/**
 * Rebase d'une planète : matérialise stocks & gisements, recalcule les
 * débits (production.ts, pur), écrit les nouveaux taux et replanifie les
 * événements de bord. S'exécute DANS la transaction appelante ; le
 * verrou FOR UPDATE du corps sérialise les rebases d'une même planète.
 */
import {
  isAmmSlot,
  BASE_STORAGE_ALLOWANCE_T,
  BUILDINGS,
  efficiency,
  GAME_DAY_SECONDS,
  governanceMultiplier,
  hoverIdleFuelUPerDay,
  popCap,
  RARITY_TIER_INDEX,
  type BuildingKey,
  type PlanetSize,
  type Quality,
  type Rarity,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from './events.js';
import { evalLazy, whenReaches } from './lazy.js';
import {
  computeRates,
  STORAGE_EDGE_FRACTIONS,
  type IndustryState,
  type RatesResult,
} from './production.js';
import { rebaseShipDrain, shipFuelState } from './shipDrain.js';

/** Coque du propriétaire en survol — candidate au drain planétaire (GB §7). */
interface HoverShip {
  id: string;
  hull_category: string;
  hull_size: string | null;
  fuel: Record<string, number> | null;
  fuel_rate_u_per_day: number | string | null;
  fuel_as_of: Date | string | null;
  /** fuel_<type> consommé par cette coque. */
  resource: ResourceId;
  needPerDay: number;
}

export interface ProductionSnapshot {
  bodyId: string;
  ownerId: string | null;
  size: PlanetSize;
  quality: Quality;
  population: number;
  illness: number;
  popAsOfMs: number | null;
  storageCapT: number;
  stocks: Partial<Record<ResourceId, number>>;
  /** Réserves AMM par ressource (stock physique, hors `stocks`). */
  pooled: Partial<Record<ResourceId, number>>;
  pooledT: number;
  deposits: Partial<Record<ResourceId, number>>;
  depositInitial: Partial<Record<ResourceId, number>>;
  industries: IndustryState[];
  buildings: {
    id: string;
    key: BuildingKey;
    level: 1 | 2 | 3;
    status: string;
    workforce: number;
    runPct: number;
    recipe: string | null;
  }[];
  hoverShips: HoverShip[];
  rates: RatesResult;
}

const toMs = (d: Date | string) => new Date(d).getTime();

/**
 * Charge et matérialise l'état de production d'une planète à `nowMs`.
 * `forUpdate` verrouille les lignes (chemin d'écriture).
 */
export async function loadProductionSnapshot(
  client: pg.PoolClient,
  bodyId: string,
  nowMs: number,
  opts: { forUpdate?: boolean } = {},
): Promise<ProductionSnapshot | null> {
  const lock = opts.forUpdate ? ' FOR UPDATE' : '';
  const { rows: bodyRows } = await client.query(
    `SELECT id, owner_id, size, quality, tiles, population, illness, pop_as_of
     FROM bodies WHERE id = $1 AND body_type = 'planet'${lock}`,
    [bodyId],
  );
  const body = bodyRows[0];
  if (!body) return null;

  const { rows: stockRows } = await client.query(
    `SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock
     WHERE body_id = $1${lock}`,
    [bodyId],
  );
  const stocks: Partial<Record<ResourceId, number>> = {};
  for (const r of stockRows) {
    stocks[r.resource as ResourceId] = evalLazy(
      { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
      nowMs,
      { min: 0 },
    );
  }

  const { rows: depositRows } = await client.query(
    `SELECT resource, initial_t, amount_t, rate_t_per_day, as_of FROM deposits
     WHERE body_id = $1${lock}`,
    [bodyId],
  );
  const deposits: Partial<Record<ResourceId, number>> = {};
  const depositInitial: Partial<Record<ResourceId, number>> = {};
  for (const r of depositRows) {
    deposits[r.resource as ResourceId] = evalLazy(
      { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
      nowMs,
      { min: 0 },
    );
    depositInitial[r.resource as ResourceId] = r.initial_t;
  }

  const { rows: buildingRows } = await client.query(
    `SELECT id, key, level, status, workforce, run_pct, recipe, config
     FROM buildings WHERE body_id = $1 ORDER BY created_at, id`,
    [bodyId],
  );

  // Réserves des pools AMM (marchés ACTIFS) : stock PHYSIQUE de la planète
  // — elles comptent dans le cap de stockage (DG §3.3b) et le census.
  const pooled: Partial<Record<ResourceId, number>> = {};
  let pooledT = 0;
  for (const b of buildingRows) {
    if (b.key !== 'market' || b.status !== 'active') continue;
    const slots = Array.isArray(b.config?.slots) ? b.config.slots : [];
    for (const slot of slots) {
      if (!isAmmSlot(slot)) continue;
      pooled[slot.pool.x as ResourceId] =
        (pooled[slot.pool.x as ResourceId] ?? 0) + slot.pool.rx;
      pooled[slot.pool.y as ResourceId] =
        (pooled[slot.pool.y as ResourceId] ?? 0) + slot.pool.ry;
      pooledT += slot.pool.rx + slot.pool.ry;
    }
  }

  // Coques du PROPRIÉTAIRE en survol : leur drain de loitering frappe le
  // stock planétaire (GB §7 — resupply round-trips). Les coques d'autrui
  // en survol paient leur propre réservoir (jamais le stock d'ici).
  const hoverShips: HoverShip[] = [];
  const hoverFuelNeeds: Partial<Record<ResourceId, number>> = {};
  if (body.owner_id) {
    const { rows: shipRows } = await client.query(
      `SELECT id, hull_category, hull_size, fuel, fuel_rate_u_per_day, fuel_as_of
       FROM ships
       WHERE hover_body_id = $1 AND owner_id = $2 AND status = 'hovering'
       ORDER BY id${lock}`,
      [bodyId, body.owner_id],
    );
    for (const s of shipRows) {
      const needPerDay = hoverIdleFuelUPerDay(s.hull_category, s.hull_size);
      if (needPerDay <= 0) continue;
      const resource = `fuel_${shipFuelState(s).type}` as ResourceId;
      hoverShips.push({ ...s, resource, needPerDay });
      hoverFuelNeeds[resource] = (hoverFuelNeeds[resource] ?? 0) + needPerDay;
    }
  }

  let depotBonus = 0;
  const industries: IndustryState[] = [];
  for (const b of buildingRows) {
    if (b.key === 'depot' && b.status === 'active') {
      depotBonus += [200, 400, 600][b.level - 1] ?? 0;
    }
    const def = BUILDINGS[b.key as BuildingKey];
    if (
      b.status === 'active' &&
      def?.batchesPerDayByLevel &&
      typeof b.recipe === 'string' &&
      b.recipe.length > 0
    ) {
      industries.push({
        buildingId: b.id,
        key: b.key,
        level: b.level as 1 | 2 | 3,
        recipe: b.recipe,
        baseBatchesPerDay: def.batchesPerDayByLevel[b.level - 1]!,
        workforce: b.workforce,
        runPct: b.run_pct,
      });
    }
  }

  const size = body.size as PlanetSize;
  const quality = body.quality as Quality;
  const population = body.population ?? 0;
  const cap = popCap(size, quality);
  const storageCapT = BASE_STORAGE_ALLOWANCE_T[size] + depotBonus;

  // G — gouvernance (GB §11, DG §4.1, chunk W) : sous l'exigence de
  // gouverneurs par taille, le monde tourne à 0.5 ; le vaisseau personnel
  // du propriétaire À QUAI compte comme un gouverneur temporaire.
  let governance = { g: 1 };
  if (body.owner_id) {
    const { rows: govRows } = await client.query(
      `SELECT rarity FROM npcs
       WHERE bound_host_type = 'planet' AND bound_host_id = $1`,
      [bodyId],
    );
    const { rows: parked } = await client.query(
      `SELECT 1 FROM ships
       WHERE hull_category = 'personal' AND owner_id = $1
         AND status = 'docked' AND docked_body_id = $2 LIMIT 1`,
      [body.owner_id, bodyId],
    );
    governance = governanceMultiplier({
      size,
      installedTiers: govRows.map(
        (r) => RARITY_TIER_INDEX[r.rarity as Rarity] ?? 0,
      ),
      personalShipParked: parked.length > 0,
    });
  }
  const planetMultiplier = efficiency(population / cap) * governance.g;

  const rates = computeRates({
    planetMultiplier,
    population,
    storageCapT,
    stocks,
    pooledT,
    deposits,
    industries,
    hoverFuelNeeds,
  });

  return {
    bodyId,
    ownerId: body.owner_id,
    size,
    quality,
    population,
    illness: body.illness ?? 0,
    popAsOfMs: body.pop_as_of ? toMs(body.pop_as_of) : null,
    storageCapT,
    stocks,
    pooled,
    pooledT,
    deposits,
    depositInitial,
    industries,
    buildings: buildingRows.map((b) => ({
      id: b.id,
      key: b.key,
      level: b.level,
      status: b.status,
      workforce: b.workforce,
      runPct: b.run_pct,
      recipe: b.recipe,
    })),
    hoverShips,
    rates,
  };
}

/**
 * Rebase complet : matérialise, recalcule, écrit les taux, replanifie les
 * bords. Retourne le snapshot (utile aux appelants).
 */
export async function recomputePlanetRates(
  client: pg.PoolClient,
  bodyId: string,
  nowMs: number,
): Promise<ProductionSnapshot | null> {
  const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
    forUpdate: true,
  });
  if (!snap) return null;

  // Écrit stocks matérialisés + nouveaux taux (lignes manquantes créées).
  const resources = new Set<ResourceId>([
    ...(Object.keys(snap.stocks) as ResourceId[]),
    ...(Object.keys(snap.rates.stockRates) as ResourceId[]),
  ]);
  for (const res of resources) {
    const amount = snap.stocks[res] ?? 0;
    const rate = snap.rates.stockRates[res] ?? 0;
    await client.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, rate_t_per_day, as_of)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = $4, as_of = to_timestamp($5 / 1000.0)`,
      [bodyId, res, amount, rate, nowMs],
    );
  }
  for (const [res, remaining] of Object.entries(snap.deposits)) {
    const rate = snap.rates.depositRates[res as ResourceId] ?? 0;
    await client.query(
      `UPDATE deposits SET amount_t = $3, rate_t_per_day = $4,
              as_of = to_timestamp($5 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [bodyId, res, remaining, rate, nowMs],
    );
  }

  // Drains de loitering (GB §7) : chaque coque en survol du propriétaire
  // est rebasée — servie par le stock ⇒ réservoir figé ; non servie
  // (fuel_x à sec sans arrivage) ⇒ le réservoir paie. Tout-ou-rien par
  // ressource [TUNE-v1, JOURNAL] ; le bord de stock à 0 déclenchera la
  // bascule planète→réservoir au prochain recompute.
  const hoverNeedByRes: Partial<Record<ResourceId, number>> = {};
  for (const s of snap.hoverShips) {
    hoverNeedByRes[s.resource] = (hoverNeedByRes[s.resource] ?? 0) + s.needPerDay;
  }
  for (const s of snap.hoverShips) {
    const served =
      (snap.rates.hoverConsumption[s.resource] ?? 0) >=
      (hoverNeedByRes[s.resource] ?? 0) - 1e-9;
    await rebaseShipDrain(client, s, nowMs, served ? 'none' : 'tank');
  }

  // Replanifie les bords : on purge les bords futurs de CETTE planète puis
  // on programme le plus proche (le handler rebasera et replanifiera).
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL
       AND kind IN ('stock_edge', 'deposit_dry')
       AND payload->>'bodyId' = $1`,
    [bodyId],
  );

  let earliestStockEdge: number | null = null;
  // Bords à la baisse : un stock atteint 0.
  for (const res of resources) {
    const rate = snap.rates.stockRates[res] ?? 0;
    if (rate < -1e-9) {
      const at = whenReaches(
        { amount: snap.stocks[res] ?? 0, ratePerDay: rate, asOfMs: nowMs },
        0,
      );
      if (at !== null && (earliestStockEdge === null || at < earliestStockEdge)) {
        earliestStockEdge = at;
      }
    }
  }
  // Bords à la hausse : le stockage TOTAL franchit un seuil du frein.
  const totalRate = Object.values(snap.rates.stockRates).reduce(
    (s, v) => s + (v ?? 0),
    0,
  );
  if (totalRate > 1e-9) {
    const total = Object.values(snap.stocks).reduce((s, v) => s + (v ?? 0), 0);
    for (const f of STORAGE_EDGE_FRACTIONS) {
      const threshold = f * snap.storageCapT;
      if (total < threshold - 1e-9) {
        const at = nowMs + ((threshold - total) / totalRate) * GAME_DAY_SECONDS * 1000;
        if (earliestStockEdge === null || at < earliestStockEdge) {
          earliestStockEdge = at;
        }
        break; // le seuil suivant sera planifié après ce franchissement
      }
    }
  }
  if (earliestStockEdge !== null) {
    await enqueue(client, 'stock_edge', new Date(earliestStockEdge), { bodyId });
  }

  // Gisement le plus proche du tarissement.
  let earliestDry: { at: number; resource: string } | null = null;
  for (const [res, remaining] of Object.entries(snap.deposits)) {
    const rate = snap.rates.depositRates[res as ResourceId] ?? 0;
    if (rate < -1e-9 && (remaining ?? 0) > 0) {
      const at = whenReaches(
        { amount: remaining ?? 0, ratePerDay: rate, asOfMs: nowMs },
        0,
      );
      if (at !== null && (earliestDry === null || at < earliestDry.at)) {
        earliestDry = { at, resource: res };
      }
    }
  }
  if (earliestDry) {
    await enqueue(client, 'deposit_dry', new Date(earliestDry.at), {
      bodyId,
      resource: earliestDry.resource,
    });
  }

  // Un pop_daily en attente doit exister pour toute planète habitée.
  if (snap.ownerId && snap.population > 0) {
    const { rows } = await client.query(
      `SELECT 1 FROM events
       WHERE processed_at IS NULL AND kind = 'pop_daily'
         AND payload->>'bodyId' = $1 LIMIT 1`,
      [bodyId],
    );
    if (!rows[0]) {
      const base = snap.popAsOfMs ?? nowMs;
      await enqueue(
        client,
        'pop_daily',
        new Date(base + GAME_DAY_SECONDS * 1000),
        { bodyId },
      );
    }
  }

  return snap;
}

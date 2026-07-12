/**
 * Lecture & commandes planète — GB §9/§18, DG §5/§6.
 * Toutes les règles d'accès sont appliquées ICI (CLAUDE.md §10) : la
 * propriété, le masque de gouvernance, l'ADN tech du seed, les tuiles et
 * les coûts sont vérifiés côté serveur, dans des transactions.
 */
import {
  BASE_STORAGE_ALLOWANCE_T,
  BUILD_HOURS_BY_LEVEL,
  BUILDINGS,
  effectiveMask,
  efficiency,
  planetTechAvailability,
  popCap,
  resolveCost,
  ROLE_TO_ARCHETYPE,
  TECH_NODES,
  type Archetype,
  type BuildingKey,
  type Climate,
  type CostBundle,
  type NpcRole,
  type PlanetSize,
  type Quality,
  type ResourceBundle,
  type TechNodeKey,
} from '@atg/shared';
import type pg from 'pg';
import { evalLazy } from '../sim/lazy.js';
import { enqueue } from '../sim/events.js';

export class CommandError extends Error {
  constructor(
    public readonly code:
      | 'not_found'
      | 'forbidden'
      | 'not_available'
      | 'not_unlocked'
      | 'already_unlocked'
      | 'prereq_missing'
      | 'mask_denied'
      | 'tile_invalid'
      | 'tile_taken'
      | 'max_instances'
      | 'insufficient_resources'
      | 'unbuildable',
    message: string,
  ) {
    super(message);
  }
}

/** Archétypes gouvernant effectivement la planète (gouverneurs + vaisseau personnel). */
async function governingArchetypes(
  client: pg.PoolClient | pg.Pool,
  bodyId: string,
  ownerId: string,
): Promise<Archetype[]> {
  const out: Archetype[] = [];
  const { rows: govs } = await client.query(
    `SELECT role FROM npcs
     WHERE bound_host_type = 'planet' AND bound_host_id = $1`,
    [bodyId],
  );
  for (const g of govs) out.push(ROLE_TO_ARCHETYPE[g.role as NpcRole]);
  const { rows: ps } = await client.query(
    `SELECT p.politics FROM ships s JOIN players p ON p.id = s.owner_id
     WHERE s.hull_category = 'personal' AND s.docked_body_id = $1
       AND s.owner_id = $2`,
    [bodyId, ownerId],
  );
  if (ps[0]) out.push(ps[0].politics as Archetype);
  return out;
}

const toMs = (d: Date | string) => new Date(d).getTime();

export interface PlanetDetail {
  id: string;
  name: string;
  x: number;
  y: number;
  size: PlanetSize;
  climate: Climate;
  quality: Quality;
  tiles: number;
  isStarter: boolean;
  population: number;
  popCap: number;
  planetEfficiency: number;
  storageUsedT: number;
  storageCapT: number;
  stock: Record<string, number>;
  deposits: { resource: string; remainingT: number; initialT: number }[];
  buildings: {
    id: string;
    key: BuildingKey;
    level: number;
    tileIndex: number | null;
    status: string;
    completesAt: string | null;
    recipe: string | null;
  }[];
  tech: {
    available: TechNodeKey[];
    maxLevel: Record<string, number>;
    unlocked: TechNodeKey[];
    maskAllowed: TechNodeKey[];
    governingArchetypes: Archetype[];
  };
}

export async function planetDetail(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<PlanetDetail> {
  const { rows } = await pool.query(
    `SELECT * FROM bodies WHERE id = $1 AND body_type = 'planet'`,
    [bodyId],
  );
  const body = rows[0];
  if (!body) throw new CommandError('not_found', 'Planète inconnue');
  // Autorisation : le détail complet est réservé au propriétaire (le
  // niveau d'intel télescope pour les tiers arrive en P3).
  if (body.owner_id !== playerId) {
    throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
  }

  const { rows: stockRows } = await pool.query(
    'SELECT resource, amount_t, rate_t_per_day, as_of FROM planet_stock WHERE body_id = $1',
    [bodyId],
  );
  const stock: Record<string, number> = {};
  let storageUsed = 0;
  for (const r of stockRows) {
    const v = evalLazy(
      { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
      nowMs,
      { min: 0 },
    );
    stock[r.resource] = Math.floor(v * 100) / 100;
    storageUsed += v;
  }

  const { rows: depositRows } = await pool.query(
    'SELECT resource, initial_t, amount_t, rate_t_per_day, as_of FROM deposits WHERE body_id = $1 ORDER BY resource',
    [bodyId],
  );
  const deposits = depositRows.map((r) => ({
    resource: r.resource,
    initialT: r.initial_t,
    remainingT:
      Math.floor(
        evalLazy(
          { amount: r.amount_t, ratePerDay: r.rate_t_per_day, asOfMs: toMs(r.as_of) },
          nowMs,
          { min: 0 },
        ) * 100,
      ) / 100,
  }));

  const { rows: buildingRows } = await pool.query(
    'SELECT id, key, level, tile_index, status, completes_at, recipe FROM buildings WHERE body_id = $1 ORDER BY created_at',
    [bodyId],
  );

  // Cap de stockage = franchise de base + dépôts actifs (DG §3.3b).
  let depotBonus = 0;
  for (const b of buildingRows) {
    if (b.key === 'depot' && b.status === 'active') {
      depotBonus += [200, 400, 600][b.level - 1] ?? 0;
    }
  }
  const storageCap =
    BASE_STORAGE_ALLOWANCE_T[body.size as PlanetSize] + depotBonus;

  const availability = planetTechAvailability(body.seed);
  const { rows: unlockRows } = await pool.query(
    'SELECT node_key FROM tech_unlocks WHERE body_id = $1',
    [bodyId],
  );
  const archetypes = await governingArchetypes(pool, bodyId, playerId);
  const mask = effectiveMask(archetypes);

  const cap = popCap(body.size as PlanetSize, body.quality as Quality);
  const population = body.population ?? 0;

  return {
    id: body.id,
    name: body.name,
    x: body.x,
    y: body.y,
    size: body.size,
    climate: body.climate,
    quality: body.quality,
    tiles: body.tiles,
    isStarter: body.is_starter,
    population,
    popCap: cap,
    planetEfficiency: efficiency(population / cap),
    storageUsedT: Math.round(storageUsed * 100) / 100,
    storageCapT: storageCap,
    stock,
    deposits,
    buildings: buildingRows.map((b) => ({
      id: b.id,
      key: b.key,
      level: b.level,
      tileIndex: b.tile_index,
      status: b.status,
      completesAt: b.completes_at ? new Date(b.completes_at).toISOString() : null,
      recipe: b.recipe,
    })),
    tech: {
      available: [...availability.available],
      maxLevel: Object.fromEntries(availability.maxLevel),
      unlocked: unlockRows.map((r) => r.node_key),
      maskAllowed: [...mask],
      governingArchetypes: archetypes,
    },
  };
}

/**
 * Paie un coût depuis le stock de la planète (transaction appelante).
 * Tout-ou-rien : lève insufficient_resources si un poste manque.
 */
async function payCost(
  client: pg.PoolClient,
  bodyId: string,
  climate: Climate,
  cost: CostBundle,
  nowMs: number,
): Promise<void> {
  const resolved: ResourceBundle = resolveCost(cost, climate);
  for (const [resource, amount] of Object.entries(resolved)) {
    if (!amount) continue;
    const { rows } = await client.query(
      `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
       WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
      [bodyId, resource],
    );
    const current = rows[0]
      ? evalLazy(
          {
            amount: rows[0].amount_t,
            ratePerDay: rows[0].rate_t_per_day,
            asOfMs: toMs(rows[0].as_of),
          },
          nowMs,
          { min: 0 },
        )
      : 0;
    if (current < amount) {
      throw new CommandError(
        'insufficient_resources',
        `Ressource insuffisante : ${resource} (${Math.floor(current)}/${amount})`,
      );
    }
    await client.query(
      `UPDATE planet_stock
       SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [bodyId, resource, current - amount, nowMs],
    );
  }
}

async function loadOwnedPlanet(
  client: pg.PoolClient,
  playerId: string,
  bodyId: string,
): Promise<{ seed: string; climate: Climate; size: PlanetSize; tiles: number }> {
  const { rows } = await client.query(
    `SELECT seed, climate, size, tiles, owner_id FROM bodies
     WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
    [bodyId],
  );
  if (!rows[0]) throw new CommandError('not_found', 'Planète inconnue');
  if (rows[0].owner_id !== playerId) {
    throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
  }
  return rows[0];
}

/** Déverrouille un nœud tech (une fois par planète) — GB §18 phase 1. */
export async function unlockNode(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  nodeKey: TechNodeKey,
  nowMs = Date.now(),
): Promise<void> {
  const node = TECH_NODES[nodeKey];
  if (!node) throw new CommandError('not_found', `Nœud inconnu : ${nodeKey}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planet = await loadOwnedPlanet(client, playerId, bodyId);
    const availability = planetTechAvailability(planet.seed);
    if (!availability.available.has(nodeKey)) {
      throw new CommandError(
        'not_available',
        'Ce nœud n\'existe pas dans l\'ADN tech de cette planète',
      );
    }
    const { rows: unlocked } = await client.query(
      'SELECT node_key FROM tech_unlocks WHERE body_id = $1',
      [bodyId],
    );
    const unlockedSet = new Set(unlocked.map((r) => r.node_key));
    if (unlockedSet.has(nodeKey)) {
      throw new CommandError('already_unlocked', 'Nœud déjà déverrouillé');
    }
    for (const p of node.prerequisites) {
      if (!unlockedSet.has(p)) {
        throw new CommandError('prereq_missing', `Prérequis manquant : ${p}`);
      }
    }
    const archetypes = await governingArchetypes(client, bodyId, playerId);
    if (!effectiveMask(archetypes).has(nodeKey)) {
      throw new CommandError(
        'mask_denied',
        'Le masque de gouvernance de cette planète interdit ce nœud',
      );
    }
    await payCost(client, bodyId, planet.climate, node.unlockCost, nowMs);
    await client.query(
      'INSERT INTO tech_unlocks (body_id, node_key) VALUES ($1, $2)',
      [bodyId, nodeKey],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Place un bâtiment (GB §18 phase 2) : coût + tuile + chantier + événement. */
export async function placeBuilding(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingKey: BuildingKey,
  tileIndex: number | null,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ buildingId: string; completesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = opts.timeScale ?? 1;
  const def = BUILDINGS[buildingKey];
  if (!def) throw new CommandError('not_found', `Bâtiment inconnu : ${buildingKey}`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planet = await loadOwnedPlanet(client, playerId, bodyId);
    if (planet.tiles === 0) {
      throw new CommandError('unbuildable', 'Monde toxique : aucune tuile constructible (canon GB §3)');
    }
    const { rows: unlocked } = await client.query(
      'SELECT 1 FROM tech_unlocks WHERE body_id = $1 AND node_key = $2',
      [bodyId, buildingKey],
    );
    if (!unlocked[0]) {
      throw new CommandError('not_unlocked', 'Carte non déverrouillée sur cette planète');
    }
    const archetypes = await governingArchetypes(client, bodyId, playerId);
    if (!effectiveMask(archetypes).has(buildingKey)) {
      throw new CommandError('mask_denied', 'Masque de gouvernance : construction interdite');
    }
    if (def.usesTile) {
      if (
        tileIndex === null ||
        !Number.isInteger(tileIndex) ||
        tileIndex < 0 ||
        tileIndex >= planet.tiles
      ) {
        throw new CommandError('tile_invalid', 'Tuile invalide');
      }
      const { rows: taken } = await client.query(
        'SELECT 1 FROM buildings WHERE body_id = $1 AND tile_index = $2',
        [bodyId, tileIndex],
      );
      if (taken[0]) throw new CommandError('tile_taken', 'Tuile déjà occupée');
    } else if (tileIndex !== null) {
      throw new CommandError('tile_invalid', 'Ce bâtiment est une infrastructure sans tuile');
    }
    if (def.maxInstances) {
      const { rows: count } = await client.query(
        'SELECT count(*)::int AS n FROM buildings WHERE body_id = $1 AND key = $2',
        [bodyId, buildingKey],
      );
      if (count[0].n >= def.maxInstances) {
        throw new CommandError('max_instances', `Maximum ${def.maxInstances} instances`);
      }
    }
    await payCost(client, bodyId, planet.climate, def.placementCost, nowMs);
    const buildMs =
      (BUILD_HOURS_BY_LEVEL[0] * 3_600_000) / Math.max(timeScale, 1e-9);
    const completesAt = new Date(nowMs + buildMs);
    const { rows: created } = await client.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, completes_at)
       VALUES ($1, $2, 1, $3, 'constructing', $4) RETURNING id`,
      [bodyId, buildingKey, tileIndex, completesAt],
    );
    await enqueue(client, 'construction_complete', completesAt, {
      buildingId: created[0]!.id,
    });
    await client.query('COMMIT');
    return { buildingId: created[0]!.id, completesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

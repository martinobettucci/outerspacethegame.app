/**
 * Lecture & commandes planète — GB §9/§18, DG §5/§6.
 * Toutes les règles d'accès sont appliquées ICI (CLAUDE.md §10) : la
 * propriété, le masque de gouvernance, l'ADN tech du seed, les tuiles,
 * les recettes/gisements et les coûts sont vérifiés côté serveur, dans
 * des transactions ; chaque commande rebase les débits de la planète.
 */
import {
  BASIC_RESOURCES,
  colonyGraceUntilMs,
  isInColonyGrace,
  BUILD_HOURS_BY_LEVEL,
  BUILDINGS,
  DEMOLISH_HOURS,
  DEMOLISH_REFUND_RATIO,
  CLIMATE_CRYSTAL,
  DOCK_DWELL_HOURS_DEFAULT,
  DOCK_DWELL_HOURS_MAX,
  DOCK_DWELL_HOURS_MIN,
  DOCK_RESERVED_SELF_DEFAULT,
  DOCK_RESERVED_SELF_MAX,
  occupiesDock,
  spaceportDocks,
  effectiveMask,
  efficiency,
  planetTechAvailability,
  popCap,
  RECIPES,
  resolveCost,
  ROLE_TO_ARCHETYPE,
  TECH_NODES,
  WORKFORCE_ASSIGNABLE_SHARE,
  WORKFORCE_OPTIMAL_BY_LEVEL,
  type Archetype,
  type BuildingKey,
  type Climate,
  type CostBundle,
  type MarketSlot,
  type NpcRole,
  type PlanetSize,
  type Quality,
  type RecipeId,
  type ResourceBundle,
  type ResourceId,
  type TechNodeKey,
} from '@atg/shared';
import type pg from 'pg';
import { evalLazy, whenReaches } from '../sim/lazy.js';
import { enqueue } from '../sim/events.js';
import {
  loadProductionSnapshot,
  recomputePlanetRates,
} from '../sim/rebase.js';

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
      | 'unbuildable'
      | 'recipe_invalid'
      | 'deposit_taken'
      | 'workforce_invalid'
      | 'max_level',
    message: string,
  ) {
    super(message);
  }
}

/** Archétypes gouvernant effectivement la planète (gouverneurs + vaisseau personnel). */
export async function governingArchetypes(
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
  illness: number;
  planetEfficiency: number;
  storageUsedT: number;
  storageCapT: number;
  storageU: number;
  workforceAssigned: number;
  workforceAssignable: number;
  stock: Record<string, { amount: number; ratePerDay: number }>;
  deposits: {
    resource: string;
    remainingT: number;
    initialT: number;
    ratePerDay: number;
    dryAt: string | null;
  }[];
  buildings: {
    id: string;
    key: BuildingKey;
    level: number;
    tileIndex: number | null;
    status: string;
    completesAt: string | null;
    recipe: string | null;
    workforce: number;
    runPct: number;
    effBatchesPerDay: number | null;
    workforceU: number | null;
    limiting: string | null;
    landing: 'self' | 'everyone' | null;
    dwellHours: number | null;
    reservedForSelf: number | null;
    visibility: 'public' | 'private' | null;
    marketSlots: MarketSlot[] | null;
  }[];
  /** Docks agrégés des spaceports ACTIFS (null si aucun). */
  docks: {
    total: { s: number; m: number; l: number };
    occupied: { s: number; m: number; l: number };
    visitors: number;
    reservedForSelf: number;
    dwellHours: number;
  } | null;
  colonizedAt: string | null;
  graceUntil: string | null;
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
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, name, x, y, seed, size, climate, quality, tiles, owner_id,
              is_starter, population, illness, colonized_at
       FROM bodies WHERE id = $1 AND body_type = 'planet'`,
      [bodyId],
    );
    const body = rows[0];
    if (!body) throw new CommandError('not_found', 'Planète inconnue');
    // Autorisation : le détail complet est réservé au propriétaire (le
    // niveau d'intel télescope pour les tiers arrive en P3).
    if (body.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }

    const snap = await loadProductionSnapshot(client, bodyId, nowMs);
    if (!snap) throw new CommandError('not_found', 'Planète inconnue');

    const { rows: buildingRows } = await client.query(
      `SELECT id, key, level, tile_index, status, completes_at, recipe,
              workforce, run_pct, config
       FROM buildings WHERE body_id = $1 ORDER BY created_at, id`,
      [bodyId],
    );
    const rateByBuilding = new Map(
      snap.rates.industries.map((i) => [i.buildingId, i]),
    );

    const availability = planetTechAvailability(body.seed);
    const { rows: unlockRows } = await client.query(
      'SELECT node_key FROM tech_unlocks WHERE body_id = $1',
      [bodyId],
    );
    const archetypes = await governingArchetypes(client, bodyId, playerId);
    const mask = effectiveMask(archetypes);

    // Docks des spaceports actifs (DG §5.1) : capacité cumulée, coques à
    // quai par taille (les exemptions n'occupent pas), visiteurs, dwell le
    // plus généreux et docks réservés (mêmes règles que landShip).
    const activePorts = buildingRows.filter(
      (b) => b.key === 'spaceport' && b.status === 'active',
    );
    let docks: PlanetDetail['docks'] = null;
    if (activePorts.length > 0) {
      const total = { s: 0, m: 0, l: 0 };
      let reservedForSelf = 0;
      for (const p of activePorts) {
        const d = spaceportDocks(Number(p.level));
        total.s += d.s;
        total.m += d.m;
        total.l += d.l;
        reservedForSelf += Math.max(
          0,
          Math.min(
            DOCK_RESERVED_SELF_MAX,
            Number(p.config?.reservedForSelf ?? DOCK_RESERVED_SELF_DEFAULT),
          ),
        );
      }
      const { rows: dockedRows } = await client.query(
        `SELECT hull_category, hull_size, owner_id FROM ships
         WHERE docked_body_id = $1 AND status = 'docked'`,
        [bodyId],
      );
      const occ = dockedRows.filter((o) =>
        occupiesDock(o.hull_category, o.hull_size),
      );
      const occupied = { s: 0, m: 0, l: 0 };
      for (const o of occ) {
        occupied[o.hull_size as 's' | 'm' | 'l'] += 1;
      }
      docks = {
        total,
        occupied,
        visitors: occ.filter((o) => o.owner_id !== body.owner_id).length,
        reservedForSelf,
        dwellHours: Math.max(
          ...activePorts.map((p) =>
            Number(p.config?.dwellHours ?? DOCK_DWELL_HOURS_DEFAULT),
          ),
        ),
      };
    }

    const cap = popCap(snap.size, snap.quality);
    const storageUsed = Object.values(snap.stocks).reduce(
      (s, v) => s + (v ?? 0),
      0,
    );
    const workforceAssigned = buildingRows.reduce(
      (s, b) => s + (b.workforce ?? 0),
      0,
    );

    const stock: PlanetDetail['stock'] = {};
    const allRes = new Set<string>([
      ...Object.keys(snap.stocks),
      ...Object.keys(snap.rates.stockRates),
    ]);
    for (const res of allRes) {
      stock[res] = {
        amount:
          Math.floor(((snap.stocks[res as ResourceId] ?? 0) as number) * 100) / 100,
        ratePerDay:
          Math.round(((snap.rates.stockRates[res as ResourceId] ?? 0) as number) * 100) /
          100,
      };
    }

    return {
      id: body.id,
      name: body.name,
      x: body.x,
      y: body.y,
      size: snap.size,
      climate: body.climate,
      quality: snap.quality,
      tiles: body.tiles,
      isStarter: body.is_starter,
      population: snap.population,
      popCap: cap,
      illness: snap.illness,
      planetEfficiency: efficiency(snap.population / cap),
      storageUsedT: Math.round(storageUsed * 100) / 100,
      storageCapT: snap.storageCapT,
      storageU: Math.round(snap.rates.storageU * 1000) / 1000,
      workforceAssigned,
      workforceAssignable: Math.floor(
        snap.population * WORKFORCE_ASSIGNABLE_SHARE,
      ),
      colonizedAt: body.colonized_at
        ? new Date(body.colonized_at).toISOString()
        : null,
      graceUntil:
        body.colonized_at &&
        isInColonyGrace(new Date(body.colonized_at).getTime(), nowMs)
          ? new Date(
              colonyGraceUntilMs(new Date(body.colonized_at).getTime()),
            ).toISOString()
          : null,
      stock,
      docks,
      deposits: Object.entries(snap.deposits)
        .map(([resource, remaining]) => {
          const rate = snap.rates.depositRates[resource as ResourceId] ?? 0;
          const dryMs =
            rate < -1e-9
              ? whenReaches(
                  { amount: remaining ?? 0, ratePerDay: rate, asOfMs: nowMs },
                  0,
                )
              : null;
          return {
            resource,
            remainingT: Math.floor((remaining ?? 0) * 100) / 100,
            initialT: snap.depositInitial[resource as ResourceId] ?? 0,
            ratePerDay: Math.round(rate * 100) / 100,
            dryAt: dryMs ? new Date(dryMs).toISOString() : null,
          };
        })
        .sort((a, b) => a.resource.localeCompare(b.resource)),
      buildings: buildingRows.map((b) => {
        const r = rateByBuilding.get(b.id);
        return {
          id: b.id,
          key: b.key,
          level: b.level,
          tileIndex: b.tile_index,
          status: b.status,
          completesAt: b.completes_at
            ? new Date(b.completes_at).toISOString()
            : null,
          recipe: b.recipe,
          workforce: b.workforce,
          runPct: b.run_pct,
          effBatchesPerDay: r ? Math.round(r.effBatchesPerDay * 100) / 100 : null,
          workforceU: r ? Math.round(r.workforceU * 1000) / 1000 : null,
          limiting: r ? r.limiting : null,
          landing:
            b.key === 'spaceport'
              ? b.config?.landing === 'everyone'
                ? ('everyone' as const)
                : ('self' as const)
              : null,
          dwellHours:
            b.key === 'spaceport'
              ? Number(b.config?.dwellHours ?? DOCK_DWELL_HOURS_DEFAULT)
              : null,
          reservedForSelf:
            b.key === 'spaceport'
              ? Number(b.config?.reservedForSelf ?? DOCK_RESERVED_SELF_DEFAULT)
              : null,
          // Défaut PRIVÉ [TUNE-v1, JOURNAL] : jamais de fuite accidentelle.
          visibility:
            b.key === 'warehouse'
              ? b.config?.visibility === 'public'
                ? ('public' as const)
                : ('private' as const)
              : null,
          marketSlots:
            b.key === 'market'
              ? Array.isArray(b.config?.slots)
                ? (b.config.slots as MarketSlot[])
                : []
              : null,
        };
      }),
      tech: {
        available: [...availability.available],
        maxLevel: Object.fromEntries(availability.maxLevel),
        unlocked: unlockRows.map((r) => r.node_key),
        maskAllowed: [...mask],
        governingArchetypes: archetypes,
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Paie un coût depuis le stock de la planète (transaction appelante).
 * Tout-ou-rien : lève insufficient_resources si un poste manque.
 */
export async function payCost(
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
): Promise<{
  seed: string;
  climate: Climate;
  size: PlanetSize;
  tiles: number;
  population: number;
}> {
  const { rows } = await client.query(
    `SELECT seed, climate, size, tiles, owner_id, population FROM bodies
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
        "Ce nœud n'existe pas dans l'ADN tech de cette planète",
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
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Valide la recette demandée pour un bâtiment-industrie. */
async function validateRecipe(
  client: pg.PoolClient,
  bodyId: string,
  buildingKey: BuildingKey,
  recipe: string | null,
): Promise<string | null> {
  const def = BUILDINGS[buildingKey];
  if (!def.batchesPerDayByLevel) {
    if (recipe) {
      throw new CommandError('recipe_invalid', 'Ce bâtiment ne prend pas de recette');
    }
    return null;
  }
  if (!recipe) {
    throw new CommandError(
      'recipe_invalid',
      'Une industrie mint exactement une chose : choisir la recette à la construction (canon GB §9)',
    );
  }
  if (recipe.startsWith('extract:')) {
    if (buildingKey !== 'mine' && buildingKey !== 'crystal_extractor') {
      throw new CommandError('recipe_invalid', 'Seuls mine et crystal_extractor extraient');
    }
    const resource = recipe.slice('extract:'.length) as ResourceId;
    const isBasic = (BASIC_RESOURCES as readonly string[]).includes(resource);
    const isCrystal = Object.values(CLIMATE_CRYSTAL).includes(
      resource as (typeof CLIMATE_CRYSTAL)[Climate],
    );
    if (buildingKey === 'mine' && !isBasic) {
      throw new CommandError('recipe_invalid', 'Une mine extrait un matériau de base');
    }
    if (buildingKey === 'crystal_extractor' && !isCrystal) {
      throw new CommandError('recipe_invalid', 'Un extracteur de cristal extrait un cristal');
    }
    const { rows: dep } = await client.query(
      'SELECT amount_t FROM deposits WHERE body_id = $1 AND resource = $2',
      [bodyId, resource],
    );
    if (buildingKey === 'crystal_extractor' && !dep[0]) {
      throw new CommandError(
        'recipe_invalid',
        'Aucun gisement de ce cristal ici (les cristaux ne se minent pas en trace)',
      );
    }
    if (dep[0]) {
      // Max 1 extracteur par gisement (DG §3.3) — toute instance non démolie.
      const { rows: taken } = await client.query(
        `SELECT 1 FROM buildings
         WHERE body_id = $1 AND recipe = $2 AND status <> 'demolishing' LIMIT 1`,
        [bodyId, recipe],
      );
      if (taken[0]) {
        throw new CommandError(
          'deposit_taken',
          'Ce gisement a déjà son extracteur (max 1 par gisement)',
        );
      }
    }
    return recipe;
  }
  const r = RECIPES[recipe as RecipeId];
  if (!r || r.extraction || !r.buildings.includes(buildingKey)) {
    throw new CommandError('recipe_invalid', `Recette invalide pour ${buildingKey}`);
  }
  return recipe;
}

/** Place un bâtiment (GB §18 phase 2) : coût + tuile + chantier + événement. */
export async function placeBuilding(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingKey: BuildingKey,
  tileIndex: number | null,
  opts: { nowMs?: number; timeScale?: number; recipe?: string | null } = {},
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
      throw new CommandError(
        'unbuildable',
        'Monde toxique : aucune tuile constructible (canon GB §3)',
      );
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
    const recipe = await validateRecipe(client, bodyId, buildingKey, opts.recipe ?? null);

    // Workforce par défaut : 0,7 × optimal si la population le permet
    // [TUNE — réglable ensuite ; le point idéal E(0,7) = 1].
    let workforce = 0;
    if (def.batchesPerDayByLevel) {
      const { rows: wf } = await client.query(
        'SELECT COALESCE(sum(workforce), 0)::int AS assigned FROM buildings WHERE body_id = $1',
        [bodyId],
      );
      const assignable = Math.floor(
        (planet.population ?? 0) * WORKFORCE_ASSIGNABLE_SHARE,
      );
      workforce = Math.max(
        0,
        Math.min(
          Math.round(0.7 * WORKFORCE_OPTIMAL_BY_LEVEL[0]),
          assignable - wf[0].assigned,
        ),
      );
    }

    await payCost(client, bodyId, planet.climate, def.placementCost, nowMs);
    const buildMs =
      (BUILD_HOURS_BY_LEVEL[0] * 3_600_000) / Math.max(timeScale, 1e-9);
    const completesAt = new Date(nowMs + buildMs);
    const { rows: created } = await client.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status,
          completes_at, recipe, workforce)
       VALUES ($1, $2, 1, $3, 'constructing', $4, $5, $6) RETURNING id`,
      [bodyId, buildingKey, tileIndex, completesAt, recipe, workforce],
    );
    await enqueue(client, 'construction_complete', completesAt, {
      buildingId: created[0]!.id,
    });
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { buildingId: created[0]!.id, completesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Réglages d'un bâtiment : workforce et % de cadence (GB §9/§10). */
export async function setBuildingSettings(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  settings: {
    workforce?: number;
    runPct?: number;
    landing?: string;
    dwellHours?: number;
    reservedForSelf?: number;
    visibility?: string;
  },
  nowMs = Date.now(),
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planet = await loadOwnedPlanet(client, playerId, bodyId);
    const { rows } = await client.query(
      `SELECT id, key, workforce, run_pct FROM buildings
       WHERE id = $1 AND body_id = $2 FOR UPDATE`,
      [buildingId, bodyId],
    );
    if (!rows[0]) throw new CommandError('not_found', 'Bâtiment inconnu');

    // Politique d'atterrissage (GB §9) — réservée au spaceport, v1
    // self|everyone (friends/neighbours avec les factions, P4).
    if (settings.landing !== undefined) {
      if (rows[0].key !== 'spaceport') {
        throw new CommandError(
          'not_available',
          'La politique d\'atterrissage se règle sur un spaceport',
        );
      }
      if (!['self', 'everyone'].includes(settings.landing)) {
        throw new CommandError('workforce_invalid', 'Politique inconnue');
      }
      await client.query(
        `UPDATE buildings
           SET config = config || jsonb_build_object('landing', $2::text)
         WHERE id = $1`,
        [buildingId, settings.landing],
      );
    }

    // Visibilité du warehouse (GB §9 : public = browsable à quai ET fuite ;
    // privé = réserve stratégique cachée). Warehouse uniquement.
    if (settings.visibility !== undefined) {
      if (rows[0].key !== 'warehouse') {
        throw new CommandError(
          'not_available',
          'La visibilité se règle sur un warehouse',
        );
      }
      if (!['public', 'private'].includes(settings.visibility)) {
        throw new CommandError('workforce_invalid', 'Visibilité inconnue');
      }
      await client.query(
        `UPDATE buildings
           SET config = config || jsonb_build_object('visibility', $2::text)
         WHERE id = $1`,
        [buildingId, settings.visibility],
      );
    }

    // Séjour au sol max avant éviction (docks, DG §8.6) — spaceport only.
    if (settings.dwellHours !== undefined) {
      if (rows[0].key !== 'spaceport') {
        throw new CommandError(
          'not_available',
          'Le séjour au sol se règle sur un spaceport',
        );
      }
      if (
        !Number.isInteger(settings.dwellHours) ||
        settings.dwellHours < DOCK_DWELL_HOURS_MIN ||
        settings.dwellHours > DOCK_DWELL_HOURS_MAX
      ) {
        throw new CommandError(
          'workforce_invalid',
          `Séjour au sol invalide (${DOCK_DWELL_HOURS_MIN}–${DOCK_DWELL_HOURS_MAX} h)`,
        );
      }
      await client.query(
        `UPDATE buildings
           SET config = config || jsonb_build_object('dwellHours', $2::int)
         WHERE id = $1`,
        [buildingId, settings.dwellHours],
      );
    }

    // Docks réservés pour soi (« ready to depart », GB §9) — spaceport only.
    if (settings.reservedForSelf !== undefined) {
      if (rows[0].key !== 'spaceport') {
        throw new CommandError(
          'not_available',
          'Les docks réservés se règlent sur un spaceport',
        );
      }
      if (
        !Number.isInteger(settings.reservedForSelf) ||
        settings.reservedForSelf < 0 ||
        settings.reservedForSelf > DOCK_RESERVED_SELF_MAX
      ) {
        throw new CommandError(
          'workforce_invalid',
          `Docks réservés invalides (0–${DOCK_RESERVED_SELF_MAX})`,
        );
      }
      await client.query(
        `UPDATE buildings
           SET config = config || jsonb_build_object('reservedForSelf', $2::int)
         WHERE id = $1`,
        [buildingId, settings.reservedForSelf],
      );
    }

    const workforce = settings.workforce ?? rows[0].workforce;
    const runPct = settings.runPct ?? rows[0].run_pct;
    if (
      !Number.isInteger(workforce) ||
      workforce < 0 ||
      !Number.isInteger(runPct) ||
      runPct < 0 ||
      runPct > 100
    ) {
      throw new CommandError('workforce_invalid', 'Réglages invalides');
    }
    const { rows: wf } = await client.query(
      `SELECT COALESCE(sum(workforce), 0)::int AS assigned FROM buildings
       WHERE body_id = $1 AND id <> $2`,
      [bodyId, buildingId],
    );
    const assignable = Math.floor(
      (planet.population ?? 0) * WORKFORCE_ASSIGNABLE_SHARE,
    );
    if (wf[0].assigned + workforce > assignable) {
      throw new CommandError(
        'workforce_invalid',
        `Workforce assignable dépassée (${wf[0].assigned + workforce}/${assignable} — max 60 % de la population)`,
      );
    }
    await client.query(
      'UPDATE buildings SET workforce = $2, run_pct = $3 WHERE id = $1',
      [buildingId, workforce, runPct],
    );
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Crédite un panier au stock (remboursements) — l'overfill est permis
 * (physique §3.3b : seules les productions s'arrêtent au cap). */
async function creditBundle(
  client: pg.PoolClient,
  bodyId: string,
  climate: Climate,
  bundle: CostBundle,
  ratio: number,
  nowMs: number,
): Promise<ResourceBundle> {
  const resolved = resolveCost(bundle, climate);
  const credited: ResourceBundle = {};
  for (const [resource, amount] of Object.entries(resolved)) {
    if (!amount) continue;
    const credit = Math.floor(amount * ratio * 100) / 100;
    if (credit <= 0) continue;
    credited[resource as ResourceId] = credit;
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
    await client.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
      [bodyId, resource, current + credit, nowMs],
    );
  }
  return credited;
}

/** Coût total investi dans une instance (placement + montées de niveau). */
function investedCost(def: (typeof BUILDINGS)[BuildingKey], level: number): CostBundle {
  const out: CostBundle = { ...def.placementCost };
  for (let l = 2; l <= level; l++) {
    const step = def.levelUpCost[l - 2]!;
    for (const [res, qty] of Object.entries(step)) {
      out[res as keyof CostBundle] =
        ((out[res as keyof CostBundle] as number | undefined) ?? 0) + (qty as number);
    }
  }
  return out;
}

/**
 * Montée de niveau sur place (GB §18, DG §5.1) : coût du palier, plafond
 * de profondeur de l'ADN du seed, politique de niveau (intersection),
 * chantier aux heures du niveau cible.
 */
export async function levelUpBuilding(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date; newLevel: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = opts.timeScale ?? 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planet = await loadOwnedPlanet(client, playerId, bodyId);
    const { rows } = await client.query(
      `SELECT id, key, level, status FROM buildings
       WHERE id = $1 AND body_id = $2 FOR UPDATE`,
      [buildingId, bodyId],
    );
    if (!rows[0]) throw new CommandError('not_found', 'Bâtiment inconnu');
    if (rows[0].status !== 'active') {
      throw new CommandError('not_available', 'Le bâtiment doit être actif pour monter de niveau');
    }
    const key = rows[0].key as BuildingKey;
    const def = BUILDINGS[key];
    const level = rows[0].level as number;
    if (level >= 3) {
      throw new CommandError('max_level', 'Niveau maximal atteint (3)');
    }
    const targetLevel = level + 1;
    // Plafond de profondeur roulé par le seed (GB §18).
    const availability = planetTechAvailability(planet.seed);
    const cap = availability.maxLevel.get(key) ?? 3;
    if (targetLevel > cap) {
      throw new CommandError(
        'max_level',
        `L'ADN tech de ce monde plafonne ${key} au niveau ${cap}`,
      );
    }
    // Politique de niveau (ex. market L2+ Mercantile) : intersection —
    // TOUS les archétypes gouvernants doivent la porter.
    if (def.politicsFromLevel && targetLevel >= def.politicsFromLevel.level) {
      const archetypes = await governingArchetypes(client, bodyId, playerId);
      const required = def.politicsFromLevel.archetype;
      if (archetypes.length === 0 || !archetypes.every((a) => a === required)) {
        throw new CommandError(
          'mask_denied',
          `Le niveau ${targetLevel} de ${key} exige une gouvernance ${required}`,
        );
      }
    }
    await payCost(client, bodyId, planet.climate, def.levelUpCost[targetLevel - 2]!, nowMs);
    const buildMs =
      (BUILD_HOURS_BY_LEVEL[targetLevel - 1]! * 3_600_000) /
      Math.max(timeScale, 1e-9);
    const completesAt = new Date(nowMs + buildMs);
    // Montée EN PLACE : la production s'interrompt pendant le chantier
    // [TUNE interp — JOURNAL session 30].
    await client.query(
      `UPDATE buildings SET level = $2, status = 'constructing', completes_at = $3
       WHERE id = $1`,
      [buildingId, targetLevel, completesAt],
    );
    await enqueue(client, 'construction_complete', completesAt, { buildingId });
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { completesAt, newLevel: targetLevel };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Démolition (DG §6) : remboursement 50 % de l'investi crédité au
 * lancement, tuile libérée à l'issue (6 h), production stoppée aussitôt.
 */
export async function demolishBuilding(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
  buildingId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date; refunded: ResourceBundle }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = opts.timeScale ?? 1;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planet = await loadOwnedPlanet(client, playerId, bodyId);
    const { rows } = await client.query(
      `SELECT id, key, level, status FROM buildings
       WHERE id = $1 AND body_id = $2 FOR UPDATE`,
      [buildingId, bodyId],
    );
    if (!rows[0]) throw new CommandError('not_found', 'Bâtiment inconnu');
    if (rows[0].status === 'demolishing') {
      throw new CommandError('not_available', 'Démolition déjà en cours');
    }
    const def = BUILDINGS[rows[0].key as BuildingKey];
    const refunded = await creditBundle(
      client,
      bodyId,
      planet.climate,
      investedCost(def, rows[0].level),
      DEMOLISH_REFUND_RATIO,
      nowMs,
    );
    const completesAt = new Date(
      nowMs + (DEMOLISH_HOURS * 3_600_000) / Math.max(timeScale, 1e-9),
    );
    await client.query(
      `UPDATE buildings SET status = 'demolishing', completes_at = $2
       WHERE id = $1`,
      [buildingId, completesAt],
    );
    await enqueue(client, 'demolition_complete', completesAt, { buildingId });
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { completesAt, refunded };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

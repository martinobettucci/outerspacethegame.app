/**
 * Spawn nouveau joueur — la poche de Fermi (DESIGN_GUIDE §2.2).
 *
 * Garanties implémentées :
 * 1. région ≥ 150 pc de tout actif d'un autre joueur, hors R_nova de toute
 *    étoile ; ≥ 1 étoile ≤ 40 pc ; ≥ 2 planètes inhabitées ≤ 60 pc ;
 *    voisin actif à 150–240 pc quand l'univers en possède un (le TOUT
 *    PREMIER joueur d'un univers n'a pas de voisin possible — cas de
 *    bootstrap documenté au JOURNAL).
 * 2. starter tempéré, D–F, ≥ 10 tuiles, gisements garantis (rolls.ts).
 * 3. stock de départ ×U(1.0, 1.3) + 150 u de fuel du type de l'étoile.
 * 4. pop 1 200, vaisseau personnel docké, Cargo-S, 1 pilote commun.
 * 5. anti-abus : starter lié au compte 45 j, is_starter (jamais mintable).
 *
 * Résolution de la bande dégénérée étoile S (R_nova = 40 pc exactement) :
 * l'étoile de la poche est S et placée à 40 pc pile — signalé comme
 * TUNE-GAP au JOURNAL (bande [R_nova, 40] vide pour M/L).
 */
import {
  GAME_DAY_SECONDS,
  PEOPLES,
  popCap,
  SeededStream,
  type People,
  type ResourceBundle,
  type StarFuelType,
} from '@atg/shared';
import type pg from 'pg';
import { rollName, rollStar, rollStarterPlanet, rollPlanet } from './rolls.js';
import { recomputePlanetRates } from '../sim/rebase.js';

/** Contraintes de la poche. [TUNE] DG §2.2 */
export const POCKET_MIN_ISOLATION_PC = 150;
export const POCKET_NEIGHBOR_MAX_PC = 240;
export const POCKET_STAR_MAX_PC = 40;
export const POCKET_WILD_MAX_PC = 60;
export const STARTER_ACCOUNT_BIND_DAYS = 45;
/**
 * Population de départ = 0,6 × popCap — u = 0.6 ⇒ E_planet ≈ 0.95, « les
 * nouvelles colonies naissent saines » (DG §2.2). Le « 1 200 » du guide est
 * exactement 0,6 × cap d'une small-F ; généralisé aux starters medium
 * [TUNE interp, JOURNAL session 30].
 */
export const STARTER_POP_UTILIZATION = 0.6;
export const STARTER_FUEL_U = 150;

/** Stock de départ (avant ×U(1.0, 1.3)). [TUNE] DG §2.2 */
export const STARTER_STOCK: ResourceBundle = {
  ore: 60,
  carbon: 40,
  silicon: 30,
  hydrogen: 20,
  oxygen: 20,
  food_1: 30,
  water: 30,
};

/** Ceinture de développement où naissent les poches (compacte). [TUNE] */
const BELT_MIN = 480_000;
const BELT_MAX = 520_000;

export interface SpawnResult {
  starterPlanetId: string;
  starId: string;
  wildPlanetIds: string[];
  pocketCenter: { x: number; y: number };
  starFuelType: StarFuelType;
  pilotNpcId: string;
  personalShipId: string;
  cargoShipId: string;
}

interface ActiveAsset {
  x: number;
  y: number;
}

async function activeForeignAssets(
  client: pg.PoolClient,
  playerId: string,
): Promise<ActiveAsset[]> {
  const { rows } = await client.query<ActiveAsset>(
    `SELECT x, y FROM bodies WHERE owner_id IS NOT NULL AND owner_id <> $1`,
    [playerId],
  );
  return rows;
}

async function starsNear(
  client: pg.PoolClient,
  x: number,
  y: number,
  radius: number,
): Promise<{ x: number; y: number; r_nova: number }[]> {
  const { rows } = await client.query(
    `SELECT x, y, r_nova FROM bodies
     WHERE body_type = 'star'
       AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
    [x - radius, x + radius, y - radius, y + radius],
  );
  return rows;
}

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.hypot(ax - bx, ay - by);

/**
 * Choisit un centre de poche satisfaisant les contraintes d'isolement et,
 * si l'univers a déjà des actifs, la garantie de voisin 150–240 pc.
 */
async function findPocketCenter(
  client: pg.PoolClient,
  stream: SeededStream,
  playerId: string,
): Promise<{ x: number; y: number }> {
  const foreign = await activeForeignAssets(client, playerId);
  for (let attempt = 0; attempt < 512; attempt++) {
    let x: number;
    let y: number;
    if (foreign.length > 0) {
      // Anneau 150–240 pc autour d'un actif existant (voisin garanti).
      const anchor = foreign[stream.int(0, foreign.length - 1)]!;
      const r = stream.uniform(POCKET_MIN_ISOLATION_PC, POCKET_NEIGHBOR_MAX_PC);
      const theta = stream.uniform(0, 2 * Math.PI);
      x = anchor.x + r * Math.cos(theta);
      y = anchor.y + r * Math.sin(theta);
    } else {
      x = stream.uniform(BELT_MIN, BELT_MAX);
      y = stream.uniform(BELT_MIN, BELT_MAX);
    }
    // ≥ 150 pc de TOUT actif étranger.
    if (
      foreign.some((a) => dist(a.x, a.y, x, y) < POCKET_MIN_ISOLATION_PC)
    ) {
      continue;
    }
    // Hors R_nova de toute étoile existante (les nôtres arrivent après,
    // placées à distance sûre par construction).
    const stars = await starsNear(client, x, y, 200);
    if (stars.some((s) => dist(s.x, s.y, x, y) < s.r_nova)) continue;
    return { x, y };
  }
  throw new Error(
    'Spawn : impossible de trouver une poche de Fermi satisfaisant les contraintes (univers saturé ?)',
  );
}

/**
 * Crée le système starter complet d'un joueur. S'exécute DANS la
 * transaction fournie (l'inscription est atomique).
 */
export async function spawnStarterSystem(
  client: pg.PoolClient,
  opts: {
    playerId: string;
    playerKey: string; // clé stable (email) pour les seeds déterministes
    universeSeed: string;
    nowMs?: number;
  },
): Promise<SpawnResult> {
  const now = opts.nowMs ?? Date.now();
  const stream = new SeededStream(
    opts.universeSeed,
    `pocket:${opts.playerKey}`,
  );
  const center = await findPocketCenter(client, stream, opts.playerId);

  // 1. L'étoile de la poche : classe S (R_nova 40), à 40 pc pile du starter.
  const starSeed = `${opts.universeSeed}:star:${opts.playerKey}`;
  const star = rollStar(starSeed, 's');
  const starTheta = stream.uniform(0, 2 * Math.PI);
  const starX = center.x + POCKET_STAR_MAX_PC * Math.cos(starTheta);
  const starY = center.y + POCKET_STAR_MAX_PC * Math.sin(starTheta);
  const { rows: starRows } = await client.query<{ id: string }>(
    `INSERT INTO bodies (body_type, name, x, y, seed, star_class,
        star_fuel_type, star_fuel_stock, star_fuel_initial, r_nova)
     VALUES ('star', $1, $2, $3, $4, $5, $6, $7, $7, $8) RETURNING id`,
    [
      rollName(starSeed, 'star'),
      starX,
      starY,
      starSeed,
      star.starClass,
      star.fuelType,
      star.fuelStock,
      star.rNova,
    ],
  );
  const starId = starRows[0]!.id;

  // 2. Le starter au centre de la poche.
  const starterSeed = `${opts.universeSeed}:starter:${opts.playerKey}`;
  const starter = rollStarterPlanet(starterSeed);
  const starterPop = Math.round(
    STARTER_POP_UTILIZATION * popCap(starter.size, starter.quality),
  );
  const boundUntil = new Date(
    now + STARTER_ACCOUNT_BIND_DAYS * GAME_DAY_SECONDS * 1000,
  );
  const { rows: pRows } = await client.query<{ id: string }>(
    `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
        tiles, owner_id, is_starter, account_bound_until, colonized_at,
        population, pop_as_of)
     VALUES ('planet', $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10,
        to_timestamp($11 / 1000.0), $12, to_timestamp($11 / 1000.0))
     RETURNING id`,
    [
      rollName(starterSeed, 'planet'),
      center.x,
      center.y,
      starterSeed,
      starter.size,
      starter.climate,
      starter.quality,
      starter.tiles,
      opts.playerId,
      boundUntil,
      now,
      starterPop,
    ],
  );
  const starterPlanetId = pRows[0]!.id;

  // Gisements du starter.
  for (const d of starter.deposits) {
    await client.query(
      `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
       VALUES ($1, $2, $3, $3, to_timestamp($4 / 1000.0))`,
      [starterPlanetId, d.resource, d.initialT, now],
    );
  }

  // Stock de départ ×U(1.0, 1.3) + fuel de l'étoile voisine.
  const grantMult = stream.uniform(1.0, 1.3);
  const grants: [string, number][] = Object.entries(STARTER_STOCK).map(
    ([r, t]) => [r, Math.round(t * grantMult)],
  );
  grants.push([`fuel_${star.fuelType}`, STARTER_FUEL_U]);
  for (const [resource, amount] of grants) {
    await client.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
      [starterPlanetId, resource, amount, now],
    );
  }

  // 3. Deux planètes sauvages ≤ 60 pc (colonisables plus tard).
  const wildPlanetIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    const wSeed = `${opts.universeSeed}:wild:${opts.playerKey}:${i}`;
    const wild = rollPlanet(wSeed);
    let wx = 0;
    let wy = 0;
    for (let attempt = 0; ; attempt++) {
      const r = stream.uniform(18, POCKET_WILD_MAX_PC);
      const theta = stream.uniform(0, 2 * Math.PI);
      wx = center.x + r * Math.cos(theta);
      wy = center.y + r * Math.sin(theta);
      if (dist(wx, wy, starX, starY) >= star.rNova) break;
      if (attempt > 64) throw new Error('Spawn : placement wild impossible');
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles)
       VALUES ('planet', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        rollName(wSeed, 'planet'),
        wx,
        wy,
        wSeed,
        wild.size,
        wild.climate,
        wild.quality,
        wild.tiles,
      ],
    );
    wildPlanetIds.push(rows[0]!.id);
    for (const d of wild.deposits) {
      await client.query(
        `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
         VALUES ($1, $2, $3, $3, to_timestamp($4 / 1000.0))`,
        [rows[0]!.id, d.resource, d.initialT, now],
      );
    }
  }

  // 4. Vaisseaux : personnel (invulnérable, GB §21) + Cargo-S de départ.
  const { rows: psRows } = await client.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, name, x, y, status, docked_body_id, docked_at)
     VALUES ($1, 'personal', 'Sovereign anchor', $2, $3, 'docked', $4, now())
     RETURNING id`,
    [opts.playerId, center.x, center.y, starterPlanetId],
  );
  const { rows: csRows } = await client.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, docked_body_id, docked_at, fuel, survival)
     VALUES ($1, 'cargo', 's', 'First hauler', $2, $3, 'docked', $4, now(), $5, $6)
     RETURNING id`,
    [
      opts.playerId,
      center.x,
      center.y,
      starterPlanetId,
      JSON.stringify({ [star.fuelType]: 0 }),
      JSON.stringify({ water: 2, food: 2, oxygen: 2 }),
    ],
  );

  // 5. Le pilote commun (rolls individuels — canon GB §12) [TUNE §11.4].
  const npcStream = new SeededStream(
    opts.universeSeed,
    `starter-pilot:${opts.playerKey}`,
  );
  const people: People = PEOPLES[npcStream.weighted([0.6, 0.3, 0.1])]!;
  const statRoll = 0.04 * npcStream.uniform(0.5, 1.5); // baseline commun ×U(0.5,1.5)
  const { rows: npcRows } = await client.query<{ id: string }>(
    `INSERT INTO npcs (owner_id, people, role, rarity, stat_rolls)
     VALUES ($1, $2, 'pilot', 'common', $3) RETURNING id`,
    [opts.playerId, people, JSON.stringify({ settler_risk_reduction: statRoll })],
  );

  // Rebase initial : matérialise les taux (zéro) et planifie le premier
  // pop_daily du monde habité.
  await recomputePlanetRates(client, starterPlanetId, now);

  return {
    starterPlanetId,
    starId,
    wildPlanetIds,
    pocketCenter: center,
    starFuelType: star.fuelType,
    pilotNpcId: npcRows[0]!.id,
    personalShipId: psRows[0]!.id,
    cargoShipId: csRows[0]!.id,
  };
}

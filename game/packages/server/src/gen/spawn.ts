/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Seed contract” and §P2 “Starter spawn”/“Pocket luck”; GAME_BOOK.md §19/§22; DESIGN_GUIDE.md §2.2/§2.2b. */
/**
 * Spawn nouveau joueur — la poche de Fermi (DESIGN_GUIDE §2.2 + §2.2b).
 *
 * Garanties implémentées :
 * 1. région ≥ 150 pc de tout actif d'un autre joueur, hors R_nova de toute
 *    étoile ; ≥ 1 étoile ≤ 40 pc ; ≥ 2 planètes inhabitées ≤ 60 pc ;
 *    voisin actif à 150–240 pc quand l'univers en possède un (le TOUT
 *    PREMIER joueur d'un univers n'a pas de voisin possible — cas de
 *    bootstrap documenté au JOURNAL).
 * 2. starter tempéré, D–F, ≥ 10 tuiles, gisements garantis (rolls.ts).
 * 3. stock de départ ×U(1.0, 1.3) + 150 u de fuel du type de l'étoile,
 *    et savoir T0 pré-débloqué (telescope/probe_pad/depot/mine — GB §19
 *    « starter knowledge », la pose reste payante).
 * 4. pop 350 à la pyramide stationnaire, vaisseau personnel docké,
 *    Cargo-S, 1 pilote commun.
 * 5. anti-abus : starter lié au compte 45 j, is_starter (jamais mintable).
 * 6. §2.2b (directive responsable 2026-07-20) — pocket luck : 2 starters à
 *    1 %, 3 à 0,1 % (chaque extra COLONISÉE + dotation complète propre) ;
 *    wilds 3 à 1 %, 4 à 0,1 %. Frontière latente : 1–3 mondes bonus par
 *    inscription à U(800–4000) pc, INVISIBLES de tout joueur existant au
 *    moment du spawn (K = 8 tentatives puis skip silencieux — l'univers
 *    encombré auto-étrangle le flux, attendu) ; richesse ρ_eff par distance
 *    au centre, ruines héritées, stocks résiduels, étoile propre à 25 %.
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
  STABLE_PYRAMID,
  STARTER_POP,
  STARTER_PRE_UNLOCKED,
  type People,
  type ResourceBundle,
  type StarFuelType,
} from '@atg/shared';
import type pg from 'pg';
import {
  BONUS_CENTROID_FALLBACK_N,
  BONUS_COUNT_MAX,
  BONUS_COUNT_MIN,
  BONUS_MAX_PC,
  BONUS_MIN_PC,
  BONUS_PLACEMENT_ATTEMPTS,
  BONUS_STAR_FUEL_RICH_FACTOR,
  bonusRhoEffFromCentroid,
  bonusRhoEffFromPocket,
  bonusStarChance,
  pocketLuckStream,
  rollBonusPlanet,
  rollLeftoverSupply,
  rollName,
  rollPlanet,
  rollPocketLuck,
  rollRuins,
  rollStar,
  rollStarterPlanet,
} from './rolls.js';
import {
  BASE_SKY_PC,
  PROBE_SCAN_PC,
  SHIP_SCAN_PC,
  TELESCOPE_SCOPE_PC_PER_LEVEL,
} from '../services/world.js';
import { recomputePlanetRates } from '../sim/rebase.js';

/** Contraintes de la poche. [TUNE] DG §2.2 */
export const POCKET_MIN_ISOLATION_PC = 150;
export const POCKET_NEIGHBOR_MAX_PC = 240;
export const POCKET_STAR_MAX_PC = 40;
export const POCKET_WILD_MAX_PC = 60;
export const STARTER_ACCOUNT_BIND_DAYS = 45;
export const STARTER_FUEL_U = 150;

/**
 * Stock de départ (avant ×U(1.0, 1.3)). [TUNE] DG §2.2 — relevé le
 * 2026-07-19 (décision responsable) : l'ancienne dotation (ore 60…) ne
 * couvrait pas une ouverture « télescope d'abord » PLUS la mine —
 * softlock sans revenu ni rattrapage. Contrainte de plafond : le roll
 * MAXIMAL (×1.3) + 150 u de fuel doit rester NETTEMENT sous le frein de
 * stockage 0.7 × 800 T d'un starter S (DG §3.3b) — « new colonies start
 * healthy », et l'exactitude paresseuse suppose des taux stables entre
 * bords. Somme 280 → max 364 + 150 = 514 T (u ≈ 0.64).
 */
export const STARTER_STOCK: ResourceBundle = {
  ore: 100,
  carbon: 44,
  silicon: 28,
  hydrogen: 24,
  oxygen: 20,
  food_1: 32,
  water: 32,
};

/** Ceinture de développement où naissent les poches (compacte). [TUNE] */
const BELT_MIN = 480_000;
const BELT_MAX = 520_000;

export interface SpawnResult {
  /** Starter primaire (les vaisseaux/pilote y sont dockés). */
  starterPlanetId: string;
  /** TOUS les starters, primaire inclus (§2.2b : 1 ; 2 à 1 % ; 3 à 0,1 %). */
  starterPlanetIds: string[];
  starId: string;
  wildPlanetIds: string[];
  /** Mondes bonus lointains réellement placés (skip silencieux possible). */
  bonusPlanetIds: string[];
  pocketCenter: { x: number; y: number };
  starFuelType: StarFuelType;
  pilotNpcId: string;
  personalShipId: string;
  cargoShipId: string;
}

/* ------------------------------------------------------------------ */
/* §2.2b — invariant d'invisibilité des mondes bonus                    */
/* ------------------------------------------------------------------ */

/**
 * Un point est-il DANS la visibilité courante d'au moins un joueur ?
 * Mêmes règles que visibleBodies (services/world.ts) : corps possédés
 * (ciel 60 pc + 200 pc × niveau du télescope actif), sondes 60 pc,
 * vaisseaux hors transit 20 pc — tous propriétaires confondus.
 */
export async function isPointVisibleToAnyPlayer(
  client: pg.PoolClient,
  x: number,
  y: number,
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM (
        SELECT b.x, b.y,
               $3::float + COALESCE((
                 SELECT max($4::float * t.level) FROM buildings t
                 WHERE t.body_id = b.id AND t.key = 'telescope'
                   AND t.status = 'active'
               ), 0) AS radius
        FROM bodies b WHERE b.owner_id IS NOT NULL
        UNION ALL
        SELECT s.x, s.y,
               CASE WHEN s.hull_category = 'probe' THEN $5::float
                    ELSE $6::float END AS radius
        FROM ships s
        WHERE s.status IN ('hovering', 'idle', 'docked', 'stranded')
      ) scopes
      WHERE (scopes.x - $1) * (scopes.x - $1)
          + (scopes.y - $2) * (scopes.y - $2)
          <= scopes.radius * scopes.radius
      LIMIT 1`,
    [x, y, BASE_SKY_PC, TELESCOPE_SCOPE_PC_PER_LEVEL, PROBE_SCAN_PC, SHIP_SCAN_PC],
  );
  return rows.length > 0;
}

export type VisibilityProbe = (x: number, y: number) => Promise<boolean>;
/** Richesse ρ_eff d'un point candidat (centroïde ou repli poche, §2.2b). */
export type RichnessProbe = (x: number, y: number) => number;

/**
 * Choisit une position de monde bonus (et de son étoile éventuelle) hors
 * de toute visibilité — K tentatives puis null (skip silencieux, DG §2.2b).
 * La sonde de visibilité est injectable : le chemin « univers saturé » est
 * testable unitairement sans fabriquer une galaxie dense.
 *
 * Round 10 : la richesse ρ_eff est calculée PAR TENTATIVE (elle dépend de
 * la position), et la présence d'étoile en découle — P_star = 0,25 + 0,5·ρ
 * (PATCH 10-2). L'étoile est toujours rollée en amont (déterministe) ; on
 * n'utilise sa R_nova que si le tirage lié à ρ retient une étoile.
 */
export async function placeBonusCandidate(
  stream: SeededStream,
  center: { x: number; y: number },
  isVisible: VisibilityProbe,
  richnessAt: RichnessProbe,
  starNovaPc: number,
): Promise<{
  x: number;
  y: number;
  rho: number;
  hasStar: boolean;
  starX: number | null;
  starY: number | null;
} | null> {
  for (let attempt = 0; attempt < BONUS_PLACEMENT_ATTEMPTS; attempt++) {
    const r = stream.uniform(BONUS_MIN_PC, BONUS_MAX_PC);
    const theta = stream.uniform(0, 2 * Math.PI);
    const x = center.x + r * Math.cos(theta);
    const y = center.y + r * Math.sin(theta);
    const rho = richnessAt(x, y);
    const hasStar = stream.float() < bonusStarChance(rho);
    let starX: number | null = null;
    let starY: number | null = null;
    if (hasStar) {
      // Géométrie de poche : l'étoile à distance sûre, la planète hors
      // R_nova par construction.
      const starDist = stream.uniform(starNovaPc + 5, starNovaPc + 30);
      const starTheta = stream.uniform(0, 2 * Math.PI);
      starX = x + starDist * Math.cos(starTheta);
      starY = y + starDist * Math.sin(starTheta);
    }
    if (await isVisible(x, y)) continue;
    if (starX !== null && starY !== null && (await isVisible(starX, starY))) {
      continue;
    }
    return { x, y, rho, hasStar, starX, starY };
  }
  return null;
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
/** Clé de verrou d'avis pour SÉRIALISER les spawns (Round 10 PATCH 10-6) :
 *  ferme la course TOCTOU entre inscriptions concurrentes (isolement de
 *  poche + invariant d'invisibilité évalués sur des snapshots disjoints). */
export const SPAWN_ADVISORY_LOCK_KEY = 0x415447_5350_4157n & 0x7fffffffffffffffn; // "ATGSPAW"

export async function spawnStarterSystem(
  client: pg.PoolClient,
  opts: {
    playerId: string;
    playerKey: string; // clé stable (email) pour les seeds déterministes
    universeSeed: string;
    luckPepper: string; // secret du tirage de luck (PATCH 10-5)
    nowMs?: number;
  },
): Promise<SpawnResult> {
  const now = opts.nowMs ?? Date.now();
  // PATCH 10-6 : sérialise les spawns concurrents (relâché en fin de txn).
  await client.query('SELECT pg_advisory_xact_lock($1)', [
    SPAWN_ADVISORY_LOCK_KEY.toString(),
  ]);
  const stream = new SeededStream(
    opts.universeSeed,
    `pocket:${opts.playerKey}`,
  );
  // §2.2b : la luck se tire d'un flux SÉPARÉ derrière le poivre secret
  // (PATCH 10-5) — plus sur le flux de poche public. Le farming hors-ligne
  // devient impossible sans LUCK_PEPPER ; une fuite se corrige par rotation.
  const luck = rollPocketLuck(pocketLuckStream(opts.luckPepper, opts.playerKey));
  const center = await findPocketCenter(client, stream, opts.playerId);

  // §2.2b (Round 10) — centroïde vivant des mondes possédés, capturé AVANT
  // tout insert de CE joueur (donc sur les seuls autres joueurs) : ancre la
  // richesse des mondes bonus. `n` sous BONUS_CENTROID_FALLBACK_N → repli
  // « distance à la poche » plus bas.
  const { rows: cen } = await client.query<{
    cx: number | null;
    cy: number | null;
    n: number;
  }>(
    `SELECT avg(x)::float8 AS cx, avg(y)::float8 AS cy, count(*)::int AS n
     FROM bodies WHERE owner_id IS NOT NULL`,
  );
  const centroidN = Number(cen[0]?.n ?? 0);
  const centroidX = cen[0]?.cx ?? center.x;
  const centroidY = cen[0]?.cy ?? center.y;

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

  // 2. Le(s) starter(s) — §2.2b pocket luck : chaque starter SUPPLÉMENTAIRE
  // (1 % → 2, 0,1 % → 3) naît COLONISÉ + dotation complète propre (décision
  // responsable 2026-07-20) ; le primaire reste au centre de la poche, les
  // extras à 18–60 pc hors R_nova (même règle que les sauvages).
  const boundUntil = new Date(
    now + STARTER_ACCOUNT_BIND_DAYS * GAME_DAY_SECONDS * 1000,
  );
  const starterPlanetIds: string[] = [];
  for (let s = 0; s < luck.starters; s++) {
    // Seed du primaire INCHANGÉ (comptes historiques reproductibles).
    const starterSeed =
      s === 0
        ? `${opts.universeSeed}:starter:${opts.playerKey}`
        : `${opts.universeSeed}:starter:${opts.playerKey}:${s}`;
    const starter = rollStarterPlanet(starterSeed);
    let sx = center.x;
    let sy = center.y;
    if (s > 0) {
      for (let attempt = 0; ; attempt++) {
        const r = stream.uniform(18, POCKET_WILD_MAX_PC);
        const theta = stream.uniform(0, 2 * Math.PI);
        sx = center.x + r * Math.cos(theta);
        sy = center.y + r * Math.sin(theta);
        if (dist(sx, sy, starX, starY) >= star.rNova) break;
        if (attempt > 64) {
          throw new Error('Spawn : placement starter bonus impossible');
        }
      }
    }
    // v2 (chunk BB, DG §3.2-v2 l — Round 9) : chaque starter naît SOUS sa
    // capacité d'emploi précoce, à la pyramide stationnaire.
    const starterPop = STARTER_POP;
    const { rows: pRows } = await client.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, owner_id, is_starter, account_bound_until, colonized_at,
          population, pop_children, pop_seniors, pop_as_of)
       VALUES ('planet', $1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10,
          to_timestamp($11 / 1000.0), $12, $13, $14, to_timestamp($11 / 1000.0))
       RETURNING id`,
      [
        rollName(starterSeed, 'planet'),
        sx,
        sy,
        starterSeed,
        starter.size,
        starter.climate,
        starter.quality,
        starter.tiles,
        opts.playerId,
        boundUntil,
        now,
        starterPop,
        // Pyramide stationnaire v2 (DG §3.2-v2 l) — population = TOTAL.
        Math.round(starterPop * STABLE_PYRAMID.children),
        Math.round(starterPop * STABLE_PYRAMID.seniors),
      ],
    );
    const starterId = pRows[0]!.id;
    starterPlanetIds.push(starterId);

    // Gisements du starter.
    for (const d of starter.deposits) {
      await client.query(
        `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
         VALUES ($1, $2, $3, $3, to_timestamp($4 / 1000.0))`,
        [starterId, d.resource, d.initialT, now],
      );
    }

    // Savoir de départ (GB §19 « starter knowledge ») : les T0
    // jamais-masqués naissent débloqués — la pose reste payante.
    for (const nodeKey of STARTER_PRE_UNLOCKED) {
      await client.query(
        `INSERT INTO tech_unlocks (body_id, node_key) VALUES ($1, $2)`,
        [starterId, nodeKey],
      );
    }

    // Stock de départ ×U(1.0, 1.3) PROPRE à chaque starter (§2.2b) + fuel
    // de l'étoile voisine.
    const grantMult = stream.uniform(1.0, 1.3);
    const grants: [string, number][] = Object.entries(STARTER_STOCK).map(
      ([r, t]) => [r, Math.round(t * grantMult)],
    );
    grants.push([`fuel_${star.fuelType}`, STARTER_FUEL_U]);
    for (const [resource, amount] of grants) {
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
        [starterId, resource, amount, now],
      );
    }
  }
  const starterPlanetId = starterPlanetIds[0]!;

  // 3. Planètes sauvages ≤ 60 pc (§2.2b luck : 2 ; 3 à 1 % ; 4 à 0,1 %).
  const wildPlanetIds: string[] = [];
  for (let i = 0; i < luck.wilds; i++) {
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
        status, docked_body_id, docked_at, fuel, survival, engine_type,
        accessories)
     VALUES ($1, 'cargo', 's', 'First hauler', $2, $3, 'docked', $4, now(), $5, $6, $7,
        '["metamorphic_hull"]'::jsonb)
     RETURNING id`,
    [
      opts.playerId,
      center.x,
      center.y,
      starterPlanetId,
      JSON.stringify({ [star.fuelType]: 0 }),
      JSON.stringify({ water: 2, food: 2, oxygen: 2 }),
      // W2 : moteur figé au build — le hauler de départ naît accordé à
      // son étoile natale.
      star.fuelType,
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

  // 6. §2.2b — la frontière latente : 1–3 mondes bonus lointains, hors de
  // toute visibilité COURANTE (sinon skip silencieux). Flux dédiés par
  // candidat : les tentatives de placement ne perturbent pas la poche.
  //
  // Round 10 : la richesse ρ_eff est ancrée sur le CENTROÏDE VIVANT des
  // mondes possédés (capturé AVANT les inserts de ce joueur — cf. plus
  // haut), avec repli « distance à la poche » tant que l'univers est trop
  // petit (< BONUS_CENTROID_FALLBACK_N corps). Plus loin du cœur peuplé =
  // plus riche, et le cœur densifiant, les cohortes tardives sont plus
  // riches (mont ée émergente ∝ √N).
  const richnessAt: RichnessProbe = (x, y) =>
    centroidN >= BONUS_CENTROID_FALLBACK_N
      ? bonusRhoEffFromCentroid(dist(x, y, centroidX, centroidY))
      : bonusRhoEffFromPocket(dist(x, y, center.x, center.y));

  const bonusPlanetIds: string[] = [];
  const countStream = new SeededStream(
    opts.universeSeed,
    `bonus-count:${opts.playerKey}`,
  );
  const bonusCount = countStream.int(BONUS_COUNT_MIN, BONUS_COUNT_MAX);
  for (let i = 0; i < bonusCount; i++) {
    const bonusSeed = `${opts.universeSeed}:bonus:${opts.playerKey}:${i}`;
    const bonusStarSeed = `${opts.universeSeed}:bonusstar:${opts.playerKey}:${i}`;
    const place = new SeededStream(
      opts.universeSeed,
      `bonus-place:${opts.playerKey}:${i}`,
    );
    // L'étoile est rollée DÉTERMINISTIQUEMENT en amont (classe → R_nova
    // pour la géométrie) ; sa PRÉSENCE se décide dans le placement selon la
    // richesse du candidat (P_star = 0,25 + 0,5·ρ_eff, PATCH 10-2).
    const bonusStar = rollStar(bonusStarSeed);
    const spot = await placeBonusCandidate(
      place,
      center,
      (x, y) => isPointVisibleToAnyPlayer(client, x, y),
      richnessAt,
      bonusStar.rNova,
    );
    if (!spot) continue; // univers saturé ici : PAS de monde bonus (attendu)

    const rho = spot.rho;
    const bonus = rollBonusPlanet(bonusSeed, rho);
    const { rows: bRows } = await client.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles, config)
       VALUES ('planet', $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id`,
      [
        rollName(bonusSeed, 'planet'),
        spot.x,
        spot.y,
        bonusSeed,
        bonus.size,
        bonus.climate,
        bonus.quality,
        bonus.tiles,
        JSON.stringify({ bonus: { rhoEff: rho } }),
      ],
    );
    const bonusId = bRows[0]!.id;
    bonusPlanetIds.push(bonusId);

    for (const d of bonus.deposits) {
      await client.query(
        `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
         VALUES ($1, $2, $3, $3, to_timestamp($4 / 1000.0))`,
        [bonusId, d.resource, d.initialT, now],
      );
    }

    // Ruines : actives, workforce 0, tuiles ≥ 2 (0/1 libres pour le kit de
    // colonisation §12.3). Inertes tant que le monde est sans propriétaire
    // (règle extinction) ; héritées par le colonisateur.
    for (const ruin of rollRuins(bonusSeed, rho, bonus.tiles)) {
      await client.query(
        `INSERT INTO buildings (body_id, key, level, tile_index, status,
            workforce, config)
         VALUES ($1, $2, $3, $4, 'active', 0, $5::jsonb)`,
        // investedPaid = {} : personne n'a payé cette ruine — la démolition
        // ne remboursera RIEN (PATCH 10-4).
        [bonusId, ruin.key, ruin.level, ruin.tileIndex,
         JSON.stringify({ investedPaid: {} })],
      );
    }

    // Stocks résiduels (« higher supply ») — le frein de stockage §3.3b
    // gouvernera tout excédent après l'atterrissage.
    for (const supply of rollLeftoverSupply(bonusSeed, rho)) {
      if (supply.amountT <= 0) continue;
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
        [bonusId, supply.resource, supply.amountT, now],
      );
    }

    if (spot.hasStar && spot.starX !== null && spot.starY !== null) {
      await client.query(
        `INSERT INTO bodies (body_type, name, x, y, seed, star_class,
            star_fuel_type, star_fuel_stock, star_fuel_initial, r_nova)
         VALUES ('star', $1, $2, $3, $4, $5, $6, $7, $7, $8)`,
        [
          rollName(bonusStarSeed, 'star'),
          spot.starX,
          spot.starY,
          bonusStarSeed,
          bonusStar.starClass,
          bonusStar.fuelType,
          bonusStar.fuelStock * (1 + BONUS_STAR_FUEL_RICH_FACTOR * rho),
          bonusStar.rNova,
        ],
      );
    }
  }

  // Rebase initial : matérialise les taux (zéro) et planifie le premier
  // pop_daily de CHAQUE monde habité (starters bonus compris).
  for (const id of starterPlanetIds) {
    await recomputePlanetRates(client, id, now);
  }

  return {
    starterPlanetId,
    starterPlanetIds,
    starId,
    wildPlanetIds,
    bonusPlanetIds,
    pocketCenter: center,
    starFuelType: star.fuelType,
    pilotNpcId: npcRows[0]!.id,
    personalShipId: psRows[0]!.id,
    cargoShipId: csRows[0]!.id,
  };
}

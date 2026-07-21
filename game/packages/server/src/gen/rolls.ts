/**
 * Rolls de génération des corps célestes — DESIGN_GUIDE §2.1.
 * Fonctions PURES de (seed) : re-calculables, jamais stockées en dehors
 * des colonnes matérialisées (déterminisme canon).
 */
import { createHmac } from 'node:crypto';
import {
  BUILDINGS,
  CLIMATE_CRYSTAL,
  DEPOSIT_BASE_STOCK_T,
  DEPOSIT_SIZE_MULT,
  POP_QUALITY_MULT,
  SeededStream,
  type BasicResource,
  type BuildingKey,
  type Climate,
  type PlanetSize,
  type Quality,
  type ResourceId,
  type StarClass,
  type StarFuelType,
  BASIC_RESOURCES,
} from '@atg/shared';

/** Poids des rolls planète. [TUNE] DG §2.1 */
export const SIZE_WEIGHTS: [PlanetSize, number][] = [
  ['s', 0.5],
  ['m', 0.35],
  ['l', 0.15],
];
export const CLIMATE_WEIGHTS: [Climate, number][] = [
  ['temperate', 0.4],
  ['hot', 0.25],
  ['cold', 0.25],
  ['poison', 0.1],
];
export const QUALITY_WEIGHTS: [Quality, number][] = [
  ['F', 0.4],
  ['E', 0.25],
  ['D', 0.16],
  ['C', 0.1],
  ['B', 0.06],
  ['A', 0.03],
];
/** Tuiles par classe (canon GB §3). */
export const TILE_RANGES: Record<PlanetSize, [number, number]> = {
  s: [4, 8],
  m: [6, 12],
  l: [10, 20],
};

export interface PlanetRoll {
  size: PlanetSize;
  climate: Climate;
  quality: Quality;
  tiles: number;
  deposits: { resource: ResourceId; initialT: number }[];
}

export interface StarRoll {
  starClass: StarClass;
  fuelType: StarFuelType;
  fuelStock: number;
  rNova: number;
}

/** Multiplicateur de taille des étoiles. [TUNE] DG §2.1 */
export const STAR_SIZE_MULT: Record<StarClass, number> = { s: 1, m: 4, l: 16 };

function pick<T>(stream: SeededStream, weighted: [T, number][]): T {
  const idx = stream.weighted(weighted.map(([, w]) => w));
  return weighted[idx]![0];
}

function rollDeposits(
  stream: SeededStream,
  size: PlanetSize,
  climate: Climate,
  quality: Quality,
  guaranteed: readonly ResourceId[] = [],
  // §2.2b : les mondes bonus tirent 4–8 gisements ×(1 + 2ρ_eff) ; les
  // valeurs par défaut préservent EXACTEMENT l'ordre de tirage historique.
  opts: { countLo?: number; countHi?: number; richMult?: number } = {},
): { resource: ResourceId; initialT: number }[] {
  // 3–7 gisements [TUNE] ; cristal climatique toujours possible ; poison
  // roule TOUJOURS un gisement Nox (canon §3.3).
  const count = stream.int(opts.countLo ?? 3, opts.countHi ?? 7);
  const pool: ResourceId[] = [...BASIC_RESOURCES];
  const chosen = new Set<ResourceId>(guaranteed);
  if (climate === 'poison') chosen.add(CLIMATE_CRYSTAL.poison);
  // Chance de cristal climatique [TUNE 60 %] pour les autres climats.
  else if (stream.float() < 0.6) chosen.add(CLIMATE_CRYSTAL[climate]);
  const shuffled = stream.shuffle(pool as BasicResource[]);
  for (const r of shuffled) {
    if (chosen.size >= Math.max(count, chosen.size)) break;
    chosen.add(r);
  }
  const sizeMult = DEPOSIT_SIZE_MULT[size];
  const qMult = POP_QUALITY_MULT[quality];
  const richMult = opts.richMult ?? 1;
  return [...chosen].map((resource) => ({
    resource,
    initialT: Math.round(
      DEPOSIT_BASE_STOCK_T * sizeMult * qMult * stream.uniform(0.6, 1.4) *
        richMult,
    ),
  }));
}

/** Roll complet d'une planète depuis son seed (DG §2.1). */
export function rollPlanet(seed: string): PlanetRoll {
  const stream = new SeededStream(seed, 'planet-roll');
  const size = pick(stream, SIZE_WEIGHTS);
  const climate = pick(stream, CLIMATE_WEIGHTS);
  const quality = pick(stream, QUALITY_WEIGHTS);
  const [lo, hi] = TILE_RANGES[size];
  const tiles = climate === 'poison' ? 0 : stream.int(lo, hi);
  return {
    size,
    climate,
    quality,
    tiles,
    deposits: rollDeposits(stream, size, climate, quality),
  };
}

/**
 * Roll du starter — DG §2.2 : tempéré, qualité D–F, s|m, ≥ 10 tuiles
 * (surclasse le roll de taille), gisements garantis
 * {ore, carbon, hydrogen, oxygen, silicon, cristal climatique, lithium|gold}.
 */
export const STARTER_GUARANTEED_MIN_TILES = 10;

export function rollStarterPlanet(seed: string): PlanetRoll {
  const stream = new SeededStream(seed, 'starter-roll');
  const size: PlanetSize = stream.float() < 0.5 ? 's' : 'm';
  const quality = (['D', 'E', 'F'] as Quality[])[stream.int(0, 2)]!;
  const climate: Climate = 'temperate';
  const [, hi] = TILE_RANGES[size];
  const tiles = Math.max(
    STARTER_GUARANTEED_MIN_TILES,
    stream.int(STARTER_GUARANTEED_MIN_TILES, Math.max(hi, STARTER_GUARANTEED_MIN_TILES)),
  );
  const oneOf: ResourceId = stream.float() < 0.5 ? 'lithium' : 'gold';
  const guaranteed: ResourceId[] = [
    'ore',
    'carbon',
    'hydrogen',
    'oxygen',
    'silicon',
    CLIMATE_CRYSTAL[climate],
    oneOf,
  ];
  return {
    size,
    climate,
    quality,
    tiles,
    deposits: rollDeposits(stream, size, climate, quality, guaranteed),
  };
}

/** Roll d'une étoile (DG §2.1) : F0 = 5e6 × sizeMult × U(0.5, 1.5). */
export function rollStar(seed: string, forceClass?: StarClass): StarRoll {
  const stream = new SeededStream(seed, 'star-roll');
  const starClass =
    forceClass ??
    (['s', 'm', 'l'] as StarClass[])[stream.weighted([0.6, 0.3, 0.1])]!;
  const fuelType = (['cold', 'hot', 'gas'] as StarFuelType[])[
    stream.weighted([1, 1, 1])
  ]!;
  const sizeMult = STAR_SIZE_MULT[starClass];
  return {
    starClass,
    fuelType,
    fuelStock: 5e6 * sizeMult * stream.uniform(0.5, 1.5),
    rNova: 40 * Math.cbrt(sizeMult),
  };
}

/** Générateur de noms procédural (seedé) — habillage, sans effet de jeu. */
const SYLLABLES_A = ['Ka', 'Ve', 'Tho', 'Ry', 'Ze', 'Al', 'Or', 'Nu', 'Sa', 'Il', 'Um', 'Dra'];
const SYLLABLES_B = ['ri', 'la', 'ne', 'vo', 'ta', 'mi', 'sh', 'ke', 'ru', 'do', 'xa', 'li'];
const SYLLABLES_C = ['n', 's', 'th', 'x', 'm', 'r', 'd', 'v', '', '', '', ''];

export function rollName(seed: string, kind: 'planet' | 'star'): string {
  const stream = new SeededStream(seed, `name:${kind}`);
  const name =
    SYLLABLES_A[stream.int(0, SYLLABLES_A.length - 1)]! +
    SYLLABLES_B[stream.int(0, SYLLABLES_B.length - 1)]! +
    SYLLABLES_C[stream.int(0, SYLLABLES_C.length - 1)]!;
  if (kind === 'star') return `${name} ${['Alpha', 'Beta', 'Prime', 'Major', 'Minor'][stream.int(0, 4)]}`;
  return name;
}

/* ------------------------------------------------------------------ */
/* §2.2b — Pocket luck & mondes bonus (directive responsable 2026-07-20) */
/* ------------------------------------------------------------------ */

/**
 * Seuils LITTÉRAUX de la directive : +2 à 0,1 %, +1 à 1,0 % (P(≥+1) = 1,1 %).
 * Fonction pure — la vérité des seuils est testable exactement. [TUNE]
 */
export function luckCount(u: number, base: number): number {
  if (u < 0.001) return base + 2;
  if (u < 0.011) return base + 1;
  return base;
}

export interface PocketLuck {
  /** Nombre de planètes starter (1 ; 2 à 1 % ; 3 à 0,1 %). */
  starters: number;
  /** Nombre de planètes inhabitées proches (2 ; 3 à 1 % ; 4 à 0,1 %). */
  wilds: number;
}

/**
 * Deux tirages indépendants, ordre FIGÉ (starters puis wilds — stabilité
 * du flux, DG §2.2b). À consommer en tout premier sur le flux de poche.
 */
export function rollPocketLuck(stream: SeededStream): PocketLuck {
  const starters = luckCount(stream.float(), 1);
  const wilds = luckCount(stream.float(), 2);
  return { starters, wilds };
}

/**
 * Flux de tirage de la pocket-luck derrière un SECRET rotatif (Round 10
 * PATCH 10-5) : la graine est HMAC(LUCK_PEPPER, email), jamais le seed
 * d'univers — le farming multi-starter hors-ligne devient impossible sans
 * le poivre, et une fuite se corrige par rotation (la géométrie de poche
 * reste sur (universeSeed, email), donc les poches déjà nées ne bougent
 * pas). Déterministe pour un poivre donné → injectable en test.
 */
export function pocketLuckStream(
  luckPepper: string,
  playerKey: string,
): SeededStream {
  const seed = createHmac('sha256', luckPepper).update(playerKey).digest('hex');
  return new SeededStream(seed, 'pocket-luck');
}

/** Contraintes des mondes bonus. [TUNE] DG §2.2b */
export const BONUS_COUNT_MIN = 1;
export const BONUS_COUNT_MAX = 3;
export const BONUS_MIN_PC = 800; // > 660 pc (scope max ancré au starter)
export const BONUS_MAX_PC = 4_000;
export const BONUS_PLACEMENT_ATTEMPTS = 8;
/** Chance d'étoile bonus liée à la richesse (Round 10 PATCH 10-2) :
 *  P_star = BONUS_STAR_BASE + BONUS_STAR_RHO_SLOPE·ρ_eff. [TUNE] */
export const BONUS_STAR_BASE = 0.25;
export const BONUS_STAR_RHO_SLOPE = 0.5;
export const BONUS_STAR_FUEL_RICH_FACTOR = 2; // stock ×(1 + f·ρ_eff)

/**
 * Richesse effective (Balance Round 10, décision responsable 2026-07-21) :
 * ré-ancrée sur le CENTROÏDE vivant des mondes possédés — le gradient
 * « distance au centre de l'univers » était mort-né (le cluster peuplé
 * n'atteint jamais la zone riche, cf. BALANCE_LOG Round 10 F1). Plancher
 * relevé 0,25 → 0,40 : tout monde bonus est LISIBLEMENT au moins riche.
 * ρ_eff = 0,40 + 0,60 × clamp(d_centroïde / 22 000, 0, 1). [TUNE]
 */
export const BONUS_RHO_FLOOR = 0.4;
export const BONUS_RHO_CENTROID_SCALE_PC = 22_000;
/** En dessous de ce nombre de corps possédés, l'univers est trop petit
 *  pour un centroïde stable : repli sur la distance à la poche. [TUNE] */
export const BONUS_CENTROID_FALLBACK_N = 50;
/** Repli poche : 800 pc → plancher 0,25, 4 000 pc → saturé. [TUNE] */
export const BONUS_RHO_POCKET_FLOOR = 0.25;

export function bonusRhoEffFromCentroid(dCentroid: number): number {
  const t = Math.min(1, Math.max(0, dCentroid / BONUS_RHO_CENTROID_SCALE_PC));
  return BONUS_RHO_FLOOR + (1 - BONUS_RHO_FLOOR) * t;
}

/** Repli « distance à la poche » pour les tout premiers explorateurs
 *  (univers < BONUS_CENTROID_FALLBACK_N corps possédés). [TUNE] */
export function bonusRhoEffFromPocket(dPocket: number): number {
  const t = Math.min(
    1,
    Math.max(0, (dPocket - BONUS_MIN_PC) / (BONUS_MAX_PC - BONUS_MIN_PC)),
  );
  return BONUS_RHO_POCKET_FLOOR + (1 - BONUS_RHO_POCKET_FLOOR) * t;
}

/** Probabilité d'étoile bonus pour une richesse donnée. [TUNE] */
export function bonusStarChance(rhoEff: number): number {
  return BONUS_STAR_BASE + BONUS_STAR_RHO_SLOPE * rhoEff;
}

/** Profils « riches » vers lesquels les poids standards sont mélangés. [TUNE] */
export const RICH_QUALITY_WEIGHTS: [Quality, number][] = [
  ['F', 0.02],
  ['E', 0.05],
  ['D', 0.13],
  ['C', 0.25],
  ['B', 0.3],
  ['A', 0.25],
];
export const RICH_SIZE_WEIGHTS: [PlanetSize, number][] = [
  ['s', 0.2],
  ['m', 0.4],
  ['l', 0.4],
];

/** Mélange linéaire de deux tables de poids alignées par clé. */
function blendWeights<T>(
  base: [T, number][],
  rich: [T, number][],
  rho: number,
): [T, number][] {
  const richMap = new Map(rich);
  return base.map(([k, w]) => [k, w * (1 - rho) + (richMap.get(k) ?? 0) * rho]);
}

/**
 * Roll d'un monde bonus (DG §2.2b) : qualité/taille tirées vers le profil
 * riche par ρ_eff, tuiles dans la MOITIÉ HAUTE de la classe, 4–8 gisements
 * ×(1 + 2ρ_eff). Climat inchangé (poison lointain = jackpot Nox, 0 tuile).
 */
export function rollBonusPlanet(seed: string, rhoEff: number): PlanetRoll {
  const stream = new SeededStream(seed, 'bonus-roll');
  const size = pick(stream, blendWeights(SIZE_WEIGHTS, RICH_SIZE_WEIGHTS, rhoEff));
  const climate = pick(stream, CLIMATE_WEIGHTS);
  const quality = pick(
    stream,
    blendWeights(QUALITY_WEIGHTS, RICH_QUALITY_WEIGHTS, rhoEff),
  );
  const [lo, hi] = TILE_RANGES[size];
  const tiles =
    climate === 'poison' ? 0 : stream.int(Math.ceil((lo + hi) / 2), hi);
  return {
    size,
    climate,
    quality,
    tiles,
    deposits: rollDeposits(stream, size, climate, quality, [], {
      countLo: 4,
      countHi: 8,
      richMult: 1 + 2 * rhoEff,
    }),
  };
}

/**
 * Pool des ruines — dérivé du catalogue (règle de complétude, jamais une
 * liste en dur) : sur tuile, apolitique à TOUS les niveaux, non-industrie,
 * ET **tier ≤ 2** (Round 10 PATCH 10-3). Le prédicat brut balayait la
 * mégastructure réseau `stargate_yard` (tier 4) dans les décombres — un
 * monde bonus pouvait faire naître un stargate_yard L3 abandonné, hérité
 * fonctionnel + forcé dans l'ADN L3. Le plafond de tier ferme cette porte.
 * Set courant : telescope, depot, warehouse, spaceport, workshop, clinic,
 * obs_station.
 */
export const RUIN_MAX_TIER = 2;
export const RUIN_POOL: readonly BuildingKey[] = (
  Object.keys(BUILDINGS) as BuildingKey[]
).filter((k) => {
  const d = BUILDINGS[k];
  return (
    d.usesTile &&
    d.politics === null &&
    !d.politicsFromLevel &&
    !d.batchesPerDayByLevel &&
    d.tier <= RUIN_MAX_TIER
  );
});

export interface RuinRoll {
  key: BuildingKey;
  level: 1 | 2 | 3;
  tileIndex: number;
}

/**
 * Bâtiments abandonnés d'un monde bonus (DG §2.2b) :
 * count = round(ρ_eff × U(0,4)) plafonné à ⌊tuiles/2⌋ ET tuiles−2 (les
 * tuiles 0/1 restent libres pour le kit de colonisation §12.3) ; niveaux
 * L3 à P = 0,15 + 0,45·ρ_eff, L2 0,30, sinon L1 ; maxInstances respecté.
 */
export function rollRuins(
  seed: string,
  rhoEff: number,
  tiles: number,
): RuinRoll[] {
  const stream = new SeededStream(seed, 'bonus-ruins');
  const raw = Math.round(rhoEff * stream.uniform(0, 4));
  const count = Math.max(
    0,
    Math.min(raw, Math.floor(tiles / 2), Math.max(0, tiles - 2)),
  );
  const ruins: RuinRoll[] = [];
  const used = new Map<BuildingKey, number>();
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const key = RUIN_POOL[stream.int(0, RUIN_POOL.length - 1)]!;
      const max = BUILDINGS[key].maxInstances ?? Number.POSITIVE_INFINITY;
      if ((used.get(key) ?? 0) >= max) continue;
      used.set(key, (used.get(key) ?? 0) + 1);
      const u = stream.float();
      const pL3 = 0.15 + 0.45 * rhoEff;
      const level: 1 | 2 | 3 = u < pL3 ? 3 : u < pL3 + 0.3 ? 2 : 1;
      ruins.push({ key, level, tileIndex: 2 + i });
      break;
    }
  }
  return ruins;
}

/**
 * Stocks résiduels d'un monde bonus : 2–5 ressources parmi les basiques +
 * vivres, chacune ρ_eff × U(40, 200) T. [TUNE] DG §2.2b
 */
export function rollLeftoverSupply(
  seed: string,
  rhoEff: number,
): { resource: string; amountT: number }[] {
  const stream = new SeededStream(seed, 'bonus-supply');
  const pool: string[] = [...BASIC_RESOURCES, 'food_1', 'water'];
  const n = stream.int(2, 5);
  const shuffled = stream.shuffle(pool);
  return shuffled.slice(0, n).map((resource) => ({
    resource,
    amountT: Math.round(rhoEff * stream.uniform(40, 200)),
  }));
}

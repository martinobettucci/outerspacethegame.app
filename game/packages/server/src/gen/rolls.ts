/**
 * Rolls de génération des corps célestes — DESIGN_GUIDE §2.1.
 * Fonctions PURES de (seed) : re-calculables, jamais stockées en dehors
 * des colonnes matérialisées (déterminisme canon).
 */
import {
  CLIMATE_CRYSTAL,
  DEPOSIT_BASE_STOCK_T,
  DEPOSIT_SIZE_MULT,
  POP_QUALITY_MULT,
  SeededStream,
  type BasicResource,
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
): { resource: ResourceId; initialT: number }[] {
  // 3–7 gisements [TUNE] ; cristal climatique toujours possible ; poison
  // roule TOUJOURS un gisement Nox (canon §3.3).
  const count = stream.int(3, 7);
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
  return [...chosen].map((resource) => ({
    resource,
    initialT: Math.round(
      DEPOSIT_BASE_STOCK_T * sizeMult * qMult * stream.uniform(0.6, 1.4),
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

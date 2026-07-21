/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Tech tree runtime”; GAME_BOOK.md §18; DESIGN_GUIDE.md §5. */
/**
 * Arbre technologique — GAMEBOOK §18, DESIGN_GUIDE §5 (v0.9.2).
 *
 * UN DAG global ; chaque planète en voit un sous-ensemble déterministe
 * (masque de seed). Le contenu du graphe (prérequis exacts) n'était pas
 * chiffré par le guide (« model exists; content does not », GB §27.B) :
 * les arêtes marquées [TUNE-GAP] ci-dessous sont des propositions,
 * listées dans TECH_TUNE_GAPS et en attente d'un tour d'équilibrage.
 *
 * Canon intangible : telescope, probe_pad, depot, mine et colony_program
 * ne sont JAMAIS masqués par le seed (garantie du démarrage, GB §18/§19).
 */
import { BUILDINGS, type BuildingKey } from './buildings.js';
import type { CostBundle } from './resources.js';
import { SeededStream } from './rng.js';
import type { Archetype } from './types.js';
import { UNITS, type UnitKey } from './units.js';

export type UnitCardKey = `unit_${UnitKey}`;
export type TechNodeKey = BuildingKey | UnitCardKey | 'colony_program';

export interface TechNodeDef {
  key: TechNodeKey;
  kind: 'building' | 'unit_card' | 'program';
  tier: 0 | 1 | 2 | 3 | 4 | 5;
  /** Prérequis (arêtes du DAG). */
  prerequisites: readonly TechNodeKey[];
  /** Politique de production requise (null = masque commun). */
  politics: Archetype | null;
  /** Jamais masqué par le seed (canon). */
  neverMasked: boolean;
  unlockCost: CostBundle;
}

const b = (key: BuildingKey, prerequisites: readonly TechNodeKey[]): TechNodeDef => ({
  key,
  kind: 'building',
  tier: BUILDINGS[key].tier,
  prerequisites,
  politics: BUILDINGS[key].politics,
  neverMasked: ['telescope', 'probe_pad', 'depot', 'mine'].includes(key),
  unlockCost: BUILDINGS[key].unlockCost,
});

const u = (
  key: UnitKey,
  tier: 2 | 3,
  prerequisites: readonly TechNodeKey[],
): TechNodeDef => ({
  key: `unit_${key}`,
  kind: 'unit_card',
  tier,
  prerequisites,
  politics: 'militarist',
  neverMasked: false,
  unlockCost: UNITS[key].cardUnlockCost,
});

export const TECH_NODES: Record<TechNodeKey, TechNodeDef> = {
  // T0 — universels, sans prérequis.
  telescope: b('telescope', []),
  probe_pad: b('probe_pad', []),
  depot: b('depot', []),
  mine: b('mine', []),
  // T1 — masque commun. Arêtes §5 ; warehouse←depot [TUNE-GAP].
  spaceport: b('spaceport', ['depot']),
  workshop: b('workshop', ['mine']),
  market: b('market', ['depot']),
  residential: b('residential', ['depot']),
  farm: b('farm', []),
  waterworks: b('waterworks', []),
  smelter: b('smelter', ['mine']),
  crystal_extractor: b('crystal_extractor', ['mine']),
  refinery: b('refinery', ['crystal_extractor']),
  warehouse: b('warehouse', ['depot']),
  // T2 — arêtes [TUNE-GAP] : lab←waterworks, clinic←lab,
  // obs_station←telescope, shipyard←spaceport.
  lab: b('lab', ['waterworks']),
  clinic: b('clinic', ['lab']),
  obs_station: b('obs_station', ['telescope']),
  shipyard: b('shipyard', ['spaceport']),
  fuelcell_plant: b('fuelcell_plant', ['refinery']),
  unit_turret_light: u('turret_light', 2, ['workshop']),
  // T3 — arêtes [TUNE-GAP] sauf mention §5.
  military_district: b('military_district', ['spaceport']),
  weapon_foundry: b('weapon_foundry', ['military_district']),
  research_center: b('research_center', ['lab']),
  diplomatic_district: b('diplomatic_district', ['market']),
  casino: b('casino', ['market']),
  commerce_district: b('commerce_district', ['market']),
  faction_hq: b('faction_hq', ['diplomatic_district']),
  unit_tank_ground: u('tank_ground', 3, ['unit_turret_light']),
  unit_tank_antiair: u('tank_antiair', 3, ['unit_turret_light']),
  unit_turret_heavy: u('turret_heavy', 3, ['military_district']),
  unit_cannon: u('cannon', 3, ['military_district']),
  unit_tank_combined: u('tank_combined', 3, ['military_district']),
  colony_program: {
    key: 'colony_program',
    kind: 'program',
    tier: 3,
    // Sans prérequis : l'expansion libre n'est jamais verrouillée (v0.2).
    prerequisites: [],
    politics: null,
    neverMasked: true,
    unlockCost: { ore: 100, steel_l: 50, fuel_cells: 25 },
  },
  // T4 / T5 — arêtes [TUNE-GAP].
  stargate_yard: b('stargate_yard', ['shipyard']),
  terraformer: b('terraformer', ['lab']),
  artificial_planet_yard: b('artificial_planet_yard', ['stargate_yard']),
};

export const ALL_TECH_KEYS = Object.keys(TECH_NODES) as TechNodeKey[];

/**
 * Savoir de départ du starter (GB §19 « starter knowledge », décision
 * responsable 2026-07-19) : les bâtiments T0 jamais-masqués naissent
 * DÉBLOQUÉS sur la planète starter — la pose reste payante. Sans cela,
 * dépenser la dotation avant l'unlock de la mine (ouverture télescope
 * d'abord, parfaitement naturelle) laissait le compte sans AUCUN revenu
 * ni rattrapage : softlock définitif. colony_program reste un unlock
 * payant (objectif de milieu de partie, tier 3).
 */
export const STARTER_PRE_UNLOCKED: readonly TechNodeKey[] = [
  'telescope',
  'probe_pad',
  'depot',
  'mine',
];

/** Probabilité de conservation d'une branche par palier. [TUNE] DG §5 */
export const SEED_KEEP_PROBABILITY: Record<number, number> = {
  0: 1,
  1: 0.95,
  2: 0.8,
  3: 0.55,
  4: 0.3,
  5: 0.12,
};

/**
 * Poids du plafond de profondeur (niveau max du bâtiment) roulé par
 * branche conservée : L3 50 % / L2 30 % / L1 20 %. [TUNE-GAP]
 */
export const DEPTH_CAP_WEIGHTS = [0.2, 0.3, 0.5] as const;

/**
 * ADN enrichi des mondes bonus (DG §2.2b, directive responsable
 * 2026-07-20). Uplift de la probabilité de conservation par palier :
 * p → p + K·ρ·(1−p) ; uplift du plafond de profondeur : +1 (max 3) avec
 * probabilité BASE + SLOPE·ρ, tiré d'un flux SÉPARÉ (`tech-dna-bonus`)
 * consommé uniquement quand ρ > 0 — l'ADN des mondes standards reste
 * identique octet pour octet. [TUNE]
 */
export const DNA_BONUS_KEEP_FACTOR = 0.6;
export const DNA_BONUS_CAP_BASE = 0.3;
export const DNA_BONUS_CAP_SLOPE = 0.5;

export interface PlanetTechAvailability {
  /** Nœud présent dans l'ADN tech de la planète ? */
  available: Set<TechNodeKey>;
  /** Niveau max constructible par bâtiment (plafond de profondeur). */
  maxLevel: Map<TechNodeKey, 1 | 2 | 3>;
}

/**
 * Masque d'ADN tech d'une planète — fonction pure de (DAG, seed), jamais
 * stockée (canon GB §18). Un nœud dont un prérequis est masqué est
 * inatteignable même s'il est lui-même conservé (cohérence du DAG).
 *
 * `richness` (∈ [0, 1], DG §2.2b) : enrichissement d'ADN des mondes bonus.
 * À 0 (défaut), le chemin est STRICTEMENT identique à l'historique — aucun
 * tirage supplémentaire, mêmes seuils. À ρ > 0, les seuils de conservation
 * montent (superset garanti pour un même seed) et les plafonds gagnent +1
 * avec probabilité croissante via le flux séparé `tech-dna-bonus`.
 */
export function planetTechAvailability(
  seed: string,
  richness = 0,
): PlanetTechAvailability {
  const stream = new SeededStream(seed, 'tech-dna');
  const bonus =
    richness > 0 ? new SeededStream(seed, 'tech-dna-bonus') : null;
  const kept = new Set<TechNodeKey>();
  const maxLevel = new Map<TechNodeKey, 1 | 2 | 3>();
  // Ordre stable = ordre de déclaration (déterministe).
  for (const key of ALL_TECH_KEYS) {
    const node = TECH_NODES[key];
    const roll = stream.float(); // consommé pour CHAQUE nœud (stabilité)
    const capRoll = stream.weighted(DEPTH_CAP_WEIGHTS);
    // Flux bonus : UN tirage par nœud, conservé ou non (stabilité du flux
    // indépendante du keep-set).
    const capUplift =
      bonus !== null &&
      bonus.float() < DNA_BONUS_CAP_BASE + DNA_BONUS_CAP_SLOPE * richness;
    const p0 = SEED_KEEP_PROBABILITY[node.tier] ?? 1;
    const p =
      bonus !== null ? p0 + DNA_BONUS_KEEP_FACTOR * richness * (1 - p0) : p0;
    if (node.neverMasked || roll < p) {
      kept.add(key);
      const base = node.neverMasked ? 3 : capRoll + 1;
      maxLevel.set(
        key,
        Math.min(3, base + (capUplift && !node.neverMasked ? 1 : 0)) as
          | 1
          | 2
          | 3,
      );
    }
  }
  // Élagage : un nœud sans chemin complet de prérequis disponibles est retiré.
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...kept]) {
      if (
        TECH_NODES[key].prerequisites.some((p) => !kept.has(p))
      ) {
        kept.delete(key);
        maxLevel.delete(key);
        changed = true;
      }
    }
  }
  return { available: kept, maxLevel };
}

/* ------------------------------------------------------------------ */
/* Masques de gouvernance — DG §4.1                                    */
/* ------------------------------------------------------------------ */

/**
 * Un archétype autorise-t-il ce nœud ?
 * Nœud commun (politics null) : toujours. Nœud politisé : seulement le
 * même archétype. (La colonne « denies » de §4.1 est portée par le champ
 * politics des nœuds — chaque nœud sensible est mono-politique en v0.)
 */
export function archetypeAllows(
  archetype: Archetype,
  node: TechNodeKey,
): boolean {
  const politics = TECH_NODES[node].politics;
  return politics === null || politics === archetype;
}

/**
 * Masque effectif d'une planète = intersection des masques de tous les
 * gouverneurs présents (canon GB §11). Sans gouverneur ni vaisseau
 * personnel : masque commun uniquement.
 */
export function effectiveMask(governorArchetypes: readonly Archetype[]): Set<TechNodeKey> {
  const out = new Set<TechNodeKey>();
  for (const key of ALL_TECH_KEYS) {
    if (governorArchetypes.length === 0) {
      if (TECH_NODES[key].politics === null) out.add(key);
    } else if (governorArchetypes.every((a) => archetypeAllows(a, key))) {
      out.add(key);
    }
  }
  return out;
}

/** Écarts [TUNE-GAP] du contenu de l'arbre (règle de complétude). */
export const TECH_TUNE_GAPS: readonly string[] = [
  'Arêtes de prérequis proposées (non chiffrées par le guide) : warehouse←depot, lab←waterworks, clinic←lab, obs_station←telescope, shipyard←spaceport, military_district←spaceport, weapon_foundry←military_district, research_center←lab, diplomatic_district←market, casino←market, commerce_district←market, faction_hq←diplomatic_district, tank_ground/tank_antiair←turret_light, turret_heavy/cannon/tank_combined←military_district, stargate_yard←shipyard, terraformer←lab, artificial_planet_yard←stargate_yard',
  'Plafond de profondeur par branche : poids L1 20 % / L2 30 % / L3 50 % (DEPTH_CAP_WEIGHTS)',
];

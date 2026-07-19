/**
 * Recettes d'industrie (fongibles) et items dérivés (non fongibles) —
 * DESIGN_GUIDE §6 (v0), COMPLET. Tous les chiffres [TUNE].
 *
 * « Une industrie mint exactement une chose » (canon GB §9) : chaque
 * instance choisit UNE recette à la construction ; changer = retool 24 h.
 */
import type { BuildingKey } from './buildings.js';
import type { CostBundle, ResourceBundle, ResourceId } from './resources.js';

export type RecipeId =
  | 'steel_l'
  | 'steel_h'
  | 'water'
  | 'heavy_water'
  | 'food_1'
  | 'food_2'
  | 'food_3'
  | 'med_1'
  | 'med_2'
  | 'med_3'
  | 'cells_from_hot'
  | 'cells_from_cold'
  | 'cells_from_temperate'
  | 'cells_from_nox'
  | 'mine_extraction'
  | 'crystal_extraction';

export interface RecipeDef {
  id: RecipeId;
  /** Bâtiments capables d'exécuter cette recette. */
  buildings: readonly BuildingKey[];
  /** Entrées consommées par lot. Vide pour l'extraction (gisement). */
  inputs: ResourceBundle;
  /** Sorties produites par lot. Extraction : résolue par le gisement. */
  outputs: ResourceBundle;
  /** Extraction sur gisement (mine / crystal_extractor) ? */
  extraction?: boolean;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  mine_extraction: {
    id: 'mine_extraction',
    buildings: ['mine'],
    inputs: {},
    outputs: {},
    extraction: true,
  },
  crystal_extraction: {
    id: 'crystal_extraction',
    buildings: ['crystal_extractor'],
    inputs: {},
    outputs: {},
    extraction: true,
  },
  steel_l: {
    id: 'steel_l',
    buildings: ['smelter'],
    inputs: { ore: 2, carbon: 1 },
    outputs: { steel_l: 1 },
  },
  steel_h: {
    id: 'steel_h',
    buildings: ['smelter'],
    inputs: { ore: 3, uranium: 1 },
    outputs: { steel_h: 1 },
  },
  water: {
    id: 'water',
    buildings: ['waterworks'],
    inputs: { hydrogen: 2, oxygen: 1 },
    outputs: { water: 1 },
  },
  heavy_water: {
    id: 'heavy_water',
    buildings: ['waterworks'],
    inputs: { water: 1, deuterium: 1 },
    outputs: { heavy_water: 1 },
  },
  food_1: {
    id: 'food_1',
    buildings: ['farm'],
    inputs: { carbon: 1, water: 1, phosphor: 1 },
    outputs: { food_1: 1 },
  },
  food_2: {
    id: 'food_2',
    buildings: ['farm'],
    inputs: { carbon: 1, water: 1, sulfur: 1 },
    outputs: { food_2: 1 },
  },
  food_3: {
    id: 'food_3',
    buildings: ['farm'],
    inputs: { carbon: 1, water: 1, silicon: 1 },
    outputs: { food_3: 1 },
  },
  med_1: {
    id: 'med_1',
    buildings: ['lab'],
    inputs: { water: 1, lithium: 1 },
    outputs: { med_1: 1 },
  },
  med_2: {
    id: 'med_2',
    buildings: ['lab'],
    inputs: { water: 1, sulfur: 1 },
    outputs: { med_2: 1 },
  },
  med_3: {
    id: 'med_3',
    buildings: ['lab'],
    inputs: { water: 1, phosphor: 1 },
    outputs: { med_3: 1 },
  },
  // Cellules : 1 cristal + 1 silicium → 2 cellules ; Nox → 4. [TUNE]
  cells_from_hot: {
    id: 'cells_from_hot',
    buildings: ['refinery', 'fuelcell_plant'],
    inputs: { crystal_hot: 1, silicon: 1 },
    outputs: { fuel_cells: 2 },
  },
  cells_from_cold: {
    id: 'cells_from_cold',
    buildings: ['refinery', 'fuelcell_plant'],
    inputs: { crystal_cold: 1, silicon: 1 },
    outputs: { fuel_cells: 2 },
  },
  cells_from_temperate: {
    id: 'cells_from_temperate',
    buildings: ['refinery', 'fuelcell_plant'],
    inputs: { crystal_temperate: 1, silicon: 1 },
    outputs: { fuel_cells: 2 },
  },
  cells_from_nox: {
    id: 'cells_from_nox',
    buildings: ['refinery', 'fuelcell_plant'],
    inputs: { crystal_nox: 1, silicon: 1 },
    outputs: { fuel_cells: 4 },
  },
};

export const ALL_RECIPE_IDS = Object.keys(RECIPES) as RecipeId[];

/** Recettes exécutables par un bâtiment donné. */
export function recipesForBuilding(key: BuildingKey): RecipeDef[] {
  return ALL_RECIPE_IDS.map((id) => RECIPES[id]).filter((r) =>
    r.buildings.includes(key),
  );
}

/* ------------------------------------------------------------------ */
/* Items dérivés (entités non fongibles, GB §8) — v0 COMPLET           */
/* ------------------------------------------------------------------ */

export type ItemKey =
  | 'beam_laser'
  | 'harvest_rig'
  | 'junk_collector'
  | 'claim_rig'
  | 'scanner'
  | 'shield_hot'
  | 'shield_cold'
  | 'shield_radio'
  | 'terraform_core';

export interface ItemDef {
  key: ItemKey;
  /** Bâtiment producteur (workshop L2+ pour accessoires ; foundry pour armes). */
  producer: BuildingKey;
  /** Niveau minimal du bâtiment producteur. */
  producerMinLevel: 1 | 2 | 3;
  cost: CostBundle;
  effects: string;
}

export const ITEMS: Record<ItemKey, ItemDef> = {
  beam_laser: {
    key: 'beam_laser',
    producer: 'weapon_foundry',
    producerMinLevel: 1,
    cost: { steel_h: 4, crystal_hot: 2, gold: 1, fuel_cells: 20 },
    effects: 'weapon upgrade component (per-unit derived item)',
  },
  harvest_rig: {
    key: 'harvest_rig',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 20, crystal_any: 5, gold: 5 },
    effects:
      'star harvesting: yield/day = R_max × (1 − d/d_max)², hull dmg near the star (DG §8.8)',
  },
  junk_collector: {
    key: 'junk_collector',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 15, silicon: 5 },
    effects: 'collects 30 T junk/day',
  },
  claim_rig: {
    key: 'claim_rig',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 25, gold: 5 },
    effects: 'claims ownerless hulls after 2 h proximity',
  },
  scanner: {
    key: 'scanner',
    producer: 'workshop',
    producerMinLevel: 2,
    // [TUNE-GAP] coût non chiffré par le guide — proposition.
    cost: { steel_l: 15, silicon: 5, lithium: 5 },
    effects: 'ship-mounted scanning accessory',
  },
  shield_hot: {
    key: 'shield_hot',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 15, crystal_hot: 5 },
    effects: 'negates hot-environment hull wear (5%/day without it)',
  },
  shield_cold: {
    key: 'shield_cold',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 15, crystal_cold: 5 },
    effects: 'negates cold-environment hull wear',
  },
  shield_radio: {
    key: 'shield_radio',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_l: 15, crystal_nox: 5 },
    effects:
      'negates poison-harvest / black-hole / flare-zone hull wear (radiation shielding)',
  },
  terraform_core: {
    key: 'terraform_core',
    producer: 'workshop',
    producerMinLevel: 2,
    cost: { steel_h: 10, crystal_any: 5, fuel_cells: 50 },
    effects: 'colony fitting & terraformer consumable (politics-free, DG §6)',
  },
};

export const ALL_ITEM_KEYS = Object.keys(ITEMS) as ItemKey[];

/** Usure environnementale sans bouclier : 5 % des HP max/jour. [TUNE] DG §8.8 */
export const CLIMATE_WEAR_RATIO_PER_DAY = 0.05;

/** Fitting colonie : 1 terraform core + 400 cells + 150 steelL. [TUNE] DG §12 */
export const COLONY_FITTING_COST: CostBundle = {
  fuel_cells: 400,
  steel_l: 150,
};
export const COLONY_FITTING_CORES = 1;
export const COLONY_MIN_SETTLERS = 200;
/**
 * Provisions d'amorçage du kit colonial. [TUNE] Oxygène ajouté au chunk
 * BA (DG §3.2-v2 b/i) : sur un climat hostile la population respire AU
 * STOCK et l'épuisement est une mort INSTANTANÉE — coloniser hot/cold
 * sans bouteilles serait un suicide immédiat.
 */
export const COLONY_SEED_STOCK: ResourceBundle = {
  food_1: 30,
  water: 30,
  oxygen: 20,
};
export const COLONY_ESTABLISH_HOURS = 72;

/** Consommation « survie » générique : quelles ressources comptent. */
export const SURVIVAL_FOOD: readonly ResourceId[] = ['food_1', 'food_2', 'food_3'];

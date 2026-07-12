/**
 * Liste maîtresse des ressources fongibles — GAMEBOOK §24, GAME_BIBLE §6.
 * COMPLÈTE (30 entrées) et alignée sur les clés d'assets `res_{id}.gif`.
 *
 * Les items dérivés (beam laser, rigs, cores…) sont des ENTITÉS non
 * fongibles — voir items.ts — jamais listés ici (GB §8).
 */
import type { Climate } from './types.js';

export type ResourceTier = 'basic' | 'crystal' | 'refined' | 'propulsion';

export interface ResourceDef {
  id: ResourceId;
  tier: ResourceTier;
  /** Nom d'affichage (anglais — langue par défaut). */
  name: string;
  /** Pour les cristaux : climat qui les concentre (GB §8). */
  climate?: Climate;
}

/** Les douze matériaux de base — toujours minables (GB §24). */
export const BASIC_RESOURCES = [
  'oxygen',
  'carbon',
  'hydrogen',
  'ore',
  'lithium',
  'sulfur',
  'gold',
  'uranium',
  'deuterium',
  'aluminium',
  'phosphor',
  'silicon',
] as const;

export const CRYSTAL_RESOURCES = [
  'crystal_hot',
  'crystal_cold',
  'crystal_temperate',
  'crystal_nox',
] as const;

export const REFINED_RESOURCES = [
  'steel_l',
  'steel_h',
  'water',
  'heavy_water',
  'food_1',
  'food_2',
  'food_3',
  'med_1',
  'med_2',
  'med_3',
  'fuel_cells',
] as const;

export const PROPULSION_RESOURCES = [
  'fuel_cold',
  'fuel_hot',
  'fuel_gas',
] as const;

export type BasicResource = (typeof BASIC_RESOURCES)[number];
export type CrystalResource = (typeof CRYSTAL_RESOURCES)[number];
export type RefinedResource = (typeof REFINED_RESOURCES)[number];
export type PropulsionResource = (typeof PROPULSION_RESOURCES)[number];
export type ResourceId =
  | BasicResource
  | CrystalResource
  | RefinedResource
  | PropulsionResource;

/** Cristal concentré par chaque climat (GAME_BIBLE §6). */
export const CLIMATE_CRYSTAL: Record<Climate, CrystalResource> = {
  hot: 'crystal_hot',
  cold: 'crystal_cold',
  temperate: 'crystal_temperate',
  poison: 'crystal_nox',
};

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  oxygen: { id: 'oxygen', tier: 'basic', name: 'Oxygen' },
  carbon: { id: 'carbon', tier: 'basic', name: 'Carbon' },
  hydrogen: { id: 'hydrogen', tier: 'basic', name: 'Hydrogen' },
  ore: { id: 'ore', tier: 'basic', name: 'Ore' },
  lithium: { id: 'lithium', tier: 'basic', name: 'Lithium' },
  sulfur: { id: 'sulfur', tier: 'basic', name: 'Sulfur' },
  gold: { id: 'gold', tier: 'basic', name: 'Gold' },
  uranium: { id: 'uranium', tier: 'basic', name: 'Uranium' },
  deuterium: { id: 'deuterium', tier: 'basic', name: 'Deuterium' },
  aluminium: { id: 'aluminium', tier: 'basic', name: 'Aluminium' },
  phosphor: { id: 'phosphor', tier: 'basic', name: 'Phosphor' },
  silicon: { id: 'silicon', tier: 'basic', name: 'Silicon' },
  crystal_hot: {
    id: 'crystal_hot',
    tier: 'crystal',
    name: 'Ignis crystal',
    climate: 'hot',
  },
  crystal_cold: {
    id: 'crystal_cold',
    tier: 'crystal',
    name: 'Glace crystal',
    climate: 'cold',
  },
  crystal_temperate: {
    id: 'crystal_temperate',
    tier: 'crystal',
    name: 'Virid crystal',
    climate: 'temperate',
  },
  crystal_nox: {
    id: 'crystal_nox',
    tier: 'crystal',
    name: 'Nox crystal',
    climate: 'poison',
  },
  steel_l: { id: 'steel_l', tier: 'refined', name: 'Light steel' },
  steel_h: { id: 'steel_h', tier: 'refined', name: 'Heavy steel' },
  water: { id: 'water', tier: 'refined', name: 'Water' },
  heavy_water: { id: 'heavy_water', tier: 'refined', name: 'Heavy water' },
  food_1: { id: 'food_1', tier: 'refined', name: 'Staple rations' },
  food_2: { id: 'food_2', tier: 'refined', name: 'Preserved food' },
  food_3: { id: 'food_3', tier: 'refined', name: 'Cultured meals' },
  med_1: { id: 'med_1', tier: 'refined', name: 'Field medicine' },
  med_2: { id: 'med_2', tier: 'refined', name: 'Clinical medicine' },
  med_3: { id: 'med_3', tier: 'refined', name: 'Advanced medicine' },
  fuel_cells: { id: 'fuel_cells', tier: 'refined', name: 'Fuel cells' },
  fuel_cold: { id: 'fuel_cold', tier: 'propulsion', name: 'Cold star-fuel' },
  fuel_hot: { id: 'fuel_hot', tier: 'propulsion', name: 'Hot star-fuel' },
  fuel_gas: { id: 'fuel_gas', tier: 'propulsion', name: 'Gas star-fuel' },
};

export const ALL_RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[];

/** Familles « survie » (GB §6) — consommées par les équipages/populations. */
export const FOOD_RESOURCES: readonly ResourceId[] = [
  'food_1',
  'food_2',
  'food_3',
];
export const MEDICINE_RESOURCES: readonly ResourceId[] = [
  'med_1',
  'med_2',
  'med_3',
];

/** Un panier de ressources (coûts, grants, recettes). Quantités en tonnes. */
export type ResourceBundle = Partial<Record<ResourceId, number>>;

/**
 * Panier de COÛT : comme ResourceBundle, plus le pseudo-poste `crystal_any`
 * — « cristal climatique de la planète payeuse », résolu au moment du
 * paiement via CLIMATE_CRYSTAL (DG §5 : les coûts « crystal » du catalogue).
 */
export type CostBundle = ResourceBundle & { crystal_any?: number };

/** Résout un panier de coût sur une planète de climat donné. */
export function resolveCost(
  cost: CostBundle,
  climate: Climate,
): ResourceBundle {
  const { crystal_any, ...rest } = cost;
  const out: ResourceBundle = { ...rest };
  if (crystal_any) {
    const key = CLIMATE_CRYSTAL[climate];
    out[key] = (out[key] ?? 0) + crystal_any;
  }
  return out;
}

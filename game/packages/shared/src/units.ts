/**
 * Catalogue des unités sol — DESIGN_GUIDE §10.1 (v0 COMPLET, 6 types).
 * Tous les chiffres [TUNE]. L2/L3 ≈ ×1.4 / ×1.9 de la ligne L1.
 *
 * BUILD ≠ INSTALL (canon GB §9) : les unités sont des items portables,
 * produites en military_district (Militariste), installées n'importe où.
 * Slots de garnison pondérés par niveau (L1=1, L2=2, L3=3) ;
 * cap de garnison = 2 × tuiles en SLOTS [round 4b].
 */
import type { CostBundle } from './resources.js';
import type { VehicleSize } from './types.js';

export type UnitKey =
  | 'turret_light'
  | 'turret_heavy'
  | 'cannon'
  | 'tank_ground'
  | 'tank_antiair'
  | 'tank_combined';

export interface UnitDef {
  key: UnitKey;
  /** Nombre de niveaux existants (turrets/cannon : 2 ; tanks : 3). */
  levels: 2 | 3;
  atkL1: number;
  hpL1: number;
  costL1: CostBundle;
  /** Mitigation (turret_heavy 0.30 ; autres 0). [TUNE] */
  mitigation: number;
  /** Classe de taille (warehouse/transport ; DG §6). */
  size: VehicleSize;
  /** Coût d'unlock de la carte-unité (une fois par planète, Militariste). */
  cardUnlockCost: CostBundle;
  notes: string;
}

/** Multiplicateurs de niveau L2/L3 sur ATK et HP. [TUNE] DG §10.1 */
export const UNIT_LEVEL_MULT = [1, 1.4, 1.9] as const;

/** Upkeep par unité INSTALLÉE (cells/jour) — warehoused = zéro conso. [TUNE] */
export const UNIT_UPKEEP_CELLS_PER_DAY = 0.2;

/** Slots de garnison par niveau d'unité [round 4b]. */
export const GARRISON_SLOTS_BY_LEVEL = [1, 2, 3] as const;

/** Cap de garnison = 2 × tuiles (en slots) [round 4b]. */
export const GARRISON_SLOTS_PER_TILE = 2;

/** Coût cargo par classe (conteneurs). [TUNE] DG §6 */
export const VEHICLE_CARGO_CONTAINERS: Record<VehicleSize, number> = {
  s: 1,
  m: 2,
  l: 4,
};

/** Temps de déploiement warehouse → terrain. [TUNE] DG §6 */
export const UNIT_DEPLOY_MINUTES: Record<VehicleSize, number> = {
  s: 10,
  m: 60,
  l: 120,
};

/** Install/désinstall d'une unité livrée : 6 h ; concurrence hors-siège : 3. [round 5] */
export const UNIT_INSTALL_HOURS = 6;
export const UNIT_INSTALL_CONCURRENCY = 3;

export const UNITS: Record<UnitKey, UnitDef> = {
  turret_light: {
    key: 'turret_light',
    levels: 2,
    atkL1: 40,
    hpL1: 150,
    costL1: { steel_l: 10 },
    mitigation: 0,
    size: 's',
    cardUnlockCost: { ore: 30, steel_l: 10 },
    notes: 'cheap screen; fires on hovering ships at full ATK; mit 0',
  },
  turret_heavy: {
    key: 'turret_heavy',
    levels: 2,
    atkL1: 160,
    hpL1: 400,
    costL1: { steel_h: 40 },
    mitigation: 0.3,
    size: 'l',
    cardUnlockCost: { ore: 100, steel_h: 50, fuel_cells: 20 },
    notes: 'backbone; mit 0.30; heavy production requires warehouse space (no free L buffer slot)',
  },
  cannon: {
    key: 'cannon',
    levels: 2,
    atkL1: 120,
    hpL1: 200,
    costL1: { steel_h: 25 },
    mitigation: 0,
    size: 'l',
    cardUnlockCost: { ore: 80, steel_h: 40, fuel_cells: 15 },
    notes:
      'anti-orbital: range = the hover band only (~1 pc), never out-shoots the 3 pc engage bubble',
  },
  tank_ground: {
    key: 'tank_ground',
    levels: 3,
    atkL1: 40,
    hpL1: 250,
    costL1: { steel_l: 15 },
    mitigation: 0,
    size: 'm',
    cardUnlockCost: { ore: 40, steel_l: 20 },
    notes: 'fires on landed & force-landing ships ×1.5 — punishes the 24 h conquest hold',
  },
  tank_antiair: {
    key: 'tank_antiair',
    levels: 3,
    atkL1: 60,
    hpL1: 220,
    costL1: { steel_l: 20 },
    mitigation: 0,
    size: 'm',
    cardUnlockCost: { ore: 50, steel_l: 25 },
    notes: '×1.5 vs atmospheric ships (hovering, landed or force-landing)',
  },
  tank_combined: {
    key: 'tank_combined',
    levels: 3,
    atkL1: 70,
    hpL1: 260,
    costL1: { steel_l: 30 },
    mitigation: 0,
    size: 'l',
    cardUnlockCost: { ore: 80, steel_l: 40, fuel_cells: 10 },
    notes: 'premium generalist: hits atmospheric AND landed',
  },
};

export const ALL_UNIT_KEYS = Object.keys(UNITS) as UnitKey[];

/** Tampon sol libre sans warehouse : 2 M + 2 S + 10 items, AUCUN slot L. [TUNE] */
export const FREE_GROUND_BUFFER = { m: 2, s: 2, items: 10, l: 0 } as const;

/** Capacités warehouse L1 (L2 ×2, L3 ×3). [TUNE] DG §5.1 */
export const WAREHOUSE_L1_CAPACITY = { l: 2, m: 4, s: 6, items: 50 } as const;
export const WAREHOUSE_LEVEL_MULT = [1, 2, 3] as const;

/** Production military_district : 1 unité / 48·24·12 h × E par niveau. [TUNE] */
export const UNIT_PRODUCTION_HOURS_BY_DISTRICT_LEVEL = [48, 24, 12] as const;

/** Production weapon_foundry : 1 item / 168·84·42 h × E. [TUNE] */
export const ITEM_PRODUCTION_HOURS_BY_FOUNDRY_LEVEL = [168, 84, 42] as const;

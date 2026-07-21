/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W6; docs/BACKLOG.md §P3 “Ship hulls”; GAME_BOOK.md §14; DESIGN_GUIDE.md §8.2/§8.8. */
/**
 * ITEMS non-fongibles (W6, MASTER_PLAN — décisions responsable
 * 2026-07-21) : accessoires et upgrades fabriqués comme des OBJETS
 * occupant la balance d'items des warehouses (50 × mult/niveau — chunk
 * AD, réveillée ici), installés sur une coque ENTREPOSÉE (temps +
 * ressources). PAS de rnd de slots : les slots sont ceux de la coque
 * (canon). Un upgrade L3 en stock s'installe DIRECTEMENT (pas de
 * « montée » L2→L3).
 *
 * Découverte [interp v1 annoncée] : un item est fabricable là où son
 * bâtiment HÔTE est disponible dans l'ADN de la planète — l'arbre ADN
 * dédié des accessoires reste un approfondissement listé au MASTER_PLAN.
 */
import type { BuildingKey } from './buildings.js';
import type { CostBundle } from './resources.js';

export type ItemSlot = 'accessory' | 'engine' | 'armor' | 'obs' | 'weapon' | 'fuel';

export interface GearDef {
  key: string;
  kind: 'accessory' | 'upgrade';
  slot: ItemSlot;
  /** Niveau d'upgrade (2|3) — les accessoires n'en ont pas. */
  level?: 2 | 3;
  /** Bâtiment hôte de FABRICATION (doit être ACTIF sur le monde). */
  fabricator: BuildingKey;
  fabricationCost: CostBundle;
  /** Durée de fabrication (h-jeu). [TUNE] */
  fabricationHours: number;
  /** Coût d'installation (payé au stock du monde). [TUNE] */
  installCost: CostBundle;
  /** Immobilisation d'installation (h-jeu, coque entreposée). [TUNE] */
  installHours: number;
  /** Effet dormant (combat P5) — fabricable mais sans effet, annoncé. */
  dormant?: boolean;
  note: string;
}

/** Multiplicateurs DG §8.2 (L2/L3 = « level 1 / level 2 » du guide). */
export const ENGINE_SPEED_MULT: Record<2 | 3, number> = { 2: 1.15, 3: 1.3 };
export const ARMOR_HP_MULT: Record<2 | 3, number> = { 2: 1.3, 3: 1.6 };
export const TANK_MULT: Record<2 | 3, number> = { 2: 1.5, 3: 2.0 };

const upgrade = (
  slot: Exclude<ItemSlot, 'accessory'>,
  level: 2 | 3,
  fabricator: BuildingKey,
  fabricationCost: CostBundle,
  note: string,
  dormant = false,
): GearDef => ({
  key: `${slot}_l${level}`,
  kind: 'upgrade',
  slot,
  level,
  fabricator,
  fabricationCost,
  fabricationHours: level === 2 ? 24 : 72,
  installCost: { steel_l: 10 },
  installHours: 12,
  dormant,
  note,
});

export const GEAR: Record<string, GearDef> = {
  /** W3 : porte le nombre de sondes ancrées de 1 à 2. */
  advanced_refueling_system: {
    key: 'advanced_refueling_system',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 30, silicon: 15, gold: 5 },
    fabricationHours: 48,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Twin anchor manifolds — two tanker probes may couple at once.',
  },
  /** Rigs historiques — DES ACCESSOIRES comme les autres (erratum
   *  responsable 2026-07-22) : un slot accessoire chacun. */
  harvest_rig: {
    key: 'harvest_rig',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 20, crystal_temperate: 5, gold: 5 },
    fabricationHours: 24,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Star harvesting rig — yield by closeness, hull risk closer still.',
  },
  junk_collector: {
    key: 'junk_collector',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 15, silicon: 5 },
    fabricationHours: 24,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Scoops drifting junk fields — 30 T/day.',
  },
  claim_rig: {
    key: 'claim_rig',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 25, gold: 5 },
    fabricationHours: 24,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Claims ownerless wrecks after two hours of held proximity.',
  },
  engine_l2: upgrade('engine', 2, 'shipyard', { steel_l: 40, fuel_cells: 20 }, 'Speed ×1.15.'),
  engine_l3: upgrade('engine', 3, 'shipyard', { steel_h: 60, fuel_cells: 50 }, 'Speed ×1.30.'),
  armor_l2: upgrade('armor', 2, 'shipyard', { steel_l: 50 }, 'Hull ×1.3.'),
  armor_l3: upgrade('armor', 3, 'shipyard', { steel_h: 80 }, 'Hull ×1.6.'),
  fuel_l2: upgrade('fuel', 2, 'shipyard', { steel_l: 30, silicon: 10 }, 'Tank ×1.5.'),
  fuel_l3: upgrade('fuel', 3, 'shipyard', { steel_h: 45, silicon: 20 }, 'Tank ×2.0.'),
  obs_l2: upgrade('obs', 2, 'shipyard', { silicon: 40, gold: 10 }, 'Targeting (dormant until combat).', true),
  obs_l3: upgrade('obs', 3, 'shipyard', { silicon: 80, gold: 25 }, 'Targeting (dormant until combat).', true),
  weapon_l2: upgrade('weapon', 2, 'weapon_foundry', { steel_l: 60, fuel_cells: 15 }, 'Weapons (dormant until combat).', true),
  weapon_l3: upgrade('weapon', 3, 'weapon_foundry', { steel_h: 90, fuel_cells: 40 }, 'Weapons (dormant until combat).', true),
};

export const ALL_GEAR_KEYS = Object.keys(GEAR);

/** Capacité d'ITEMS d'un monde : Σ 50 × mult par warehouse ACTIF
 * (chunk AD — réveillée par W6). */
export function itemCapacity(warehouseLevels: number[]): number {
  let cap = 0;
  for (const level of warehouseLevels) {
    cap += 50 * ([1, 2, 3][(level as 1 | 2 | 3) - 1] ?? 0);
  }
  return cap;
}

/** Upgrades installés d'une coque : {slot: niveau}. */
export type InstalledUpgrades = Partial<Record<Exclude<ItemSlot, 'accessory'>, 2 | 3>>;

/** Multiplicateur de VITESSE d'une coque selon son upgrade moteur. */
export function engineSpeedMult(upgrades: InstalledUpgrades | null | undefined): number {
  const l = upgrades?.engine;
  return l ? ENGINE_SPEED_MULT[l] : 1;
}

/** Multiplicateur de HP max selon l'upgrade d'armure. */
export function armorHpMult(upgrades: InstalledUpgrades | null | undefined): number {
  const l = upgrades?.armor;
  return l ? ARMOR_HP_MULT[l] : 1;
}

/** Capacité de réservoir EFFECTIVE (u) : tank de coque × upgrade fuel. */
export function effectiveTankU(
  baseTankU: number,
  upgrades: InstalledUpgrades | null | undefined,
): number {
  const l = upgrades?.fuel;
  return baseTankU * (l ? TANK_MULT[l] : 1);
}

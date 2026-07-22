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

export type ItemSlot = 'accessory' | 'engine' | 'armor' | 'obs' | 'weapon' | 'fuel' | 'cargo';

export interface GearDef {
  key: string;
  kind: 'accessory' | 'upgrade';
  slot: ItemSlot;
  /** Niveau d'upgrade (2|3) — les accessoires n'en ont pas. */
  level?: 2 | 3;
  /** Bâtiment hôte de FABRICATION (doit être ACTIF sur le monde). */
  fabricator: BuildingKey;
  /** Niveau minimal du bâtiment hôte (grades ENHANCED : 3). [TUNE] */
  fabricatorMinLevel?: 2 | 3;
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

/** Niveau du bâtiment hôte exigé pour FABRIQUER un grade enhanced. */
export const ENHANCED_FABRICATOR_LEVEL = 3;

/** Fabrique la variante ENHANCED d'un accessoire (bâtiment hôte L3,
 *  coût ×2 [TUNE]) — le grade se fige À LA FABRICATION. */
function enhanced(base: GearDef): GearDef {
  const cost: Record<string, number> = {};
  for (const [k, v] of Object.entries(base.fabricationCost)) cost[k] = (v as number) * 2;
  return {
    ...base,
    key: `${base.key}_enhanced`,
    fabricationCost: cost,
    fabricationHours: base.fabricationHours * 2,
    fabricatorMinLevel: ENHANCED_FABRICATOR_LEVEL,
    note: `${base.note} (enhanced grade — L3 fabrication).`,
  };
}

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
  /** W9a — la coque MÉTAMORPHOSE est un accessoire : installée D'OFFICE
   *  sans surcoût à la construction, démontable pour arbitrer les
   *  slots ; SANS elle, pas de bouclier morphique (W5). */
  metamorphic_hull: {
    key: 'metamorphic_hull',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 20, silicon: 10 },
    fabricationHours: 24,
    installCost: { steel_l: 5 },
    installHours: 12,
    note: 'Molecular-rewrite lattice — enables climate morphing. Fitted free on every new hull; strip it to free the slot.',
  },
  /** W9b — électrolyseur : eau → O2 + H (L2 : aussi l'inverse). */
  electrolyzer: {
    key: 'electrolyzer',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 25, silicon: 15, gold: 5 },
    fabricationHours: 24,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Splits water into oxygen and hydrogen — burns fuel while running.',
  },
  electrolyzer_l2: {
    key: 'electrolyzer_l2',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 40, silicon: 25, gold: 10 },
    fabricationHours: 48,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Runs the split both ways — water from oxygen and hydrogen too.',
  },
  /** W9-batch — décompresseur de cells : 1 fuel_cell → 50 fuel, 1 jour
   *  À L'ARRÊT, zéro carburant brûlé (exemple canon 2026-07-22). */
  cell_decompressor: {
    key: 'cell_decompressor',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'fuelcell_plant',
    fabricationCost: { steel_l: 25, silicon: 10, gold: 5 },
    fabricationHours: 24,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'Cracks one fuel cell into raw drive fuel — a day at rest, no burn.',
  },
  /** W9c — vivarium : carburant + oxygène → nourriture (sans niveaux). */
  vivarium: {
    key: 'vivarium',
    kind: 'accessory',
    slot: 'accessory',
    fabricator: 'workshop',
    fabricationCost: { steel_l: 30, phosphor: 10, water: 10 },
    fabricationHours: 48,
    installCost: { steel_l: 10 },
    installHours: 12,
    note: 'A sealed garden — grows food from oxygen while the lights burn fuel.',
  },
  // W9d — les 19 PASSIFS du catalogue (effets dans passives.ts,
  // chiffres [TUNE] jusqu'à W9f). Gates = bâtiment hôte thématique.
  heat_recycler: { key: 'heat_recycler', kind: 'accessory', slot: 'fuel', fabricator: 'refinery', fabricationCost: { steel_l: 20, silicon: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Recaptures idle heat — hover drain −15%.' },
  cryo_larder: { key: 'cryo_larder', kind: 'accessory', slot: 'accessory', fabricator: 'lab', fabricationCost: { steel_l: 15, silicon: 10, phosphor: 5 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Deep-cold stores — crew provisions capacity +50%.' },
  docking_clamps: { key: 'docking_clamps', kind: 'accessory', slot: 'accessory', fabricator: 'spaceport', fabricationCost: { steel_l: 25, aluminium: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Heavy moorings — foreign dock dwell ×2.' },
  signal_mirror: { key: 'signal_mirror', kind: 'accessory', slot: 'obs', fabricator: 'telescope', fabricationCost: { silicon: 25, gold: 5 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Folded optics — ship scan 20 → 60 pc.' },
  survey_suite: { key: 'survey_suite', kind: 'accessory', slot: 'obs', fabricator: 'research_center', fabricationCost: { silicon: 30, gold: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Field instruments — +1 intel tier while hovering (cap L2).' },
  ballast_shielding: { key: 'ballast_shielding', kind: 'accessory', slot: 'armor', fabricator: 'military_district', fabricationCost: { steel_l: 30 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Kinetic baffles — junk-field damage −50%.' },
  flare_dampers: { key: 'flare_dampers', kind: 'accessory', slot: 'armor', fabricator: 'obs_station', fabricationCost: { steel_l: 20, silicon: 15 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Ablative weave — star-field & flare wear −50% (stacks with morphing).' },
  trim_vanes: { key: 'trim_vanes', kind: 'accessory', slot: 'engine', fabricator: 'shipyard', fabricationCost: { steel_l: 25, aluminium: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Load trim — weight penalty halved.' },
  berth_module: { key: 'berth_module', kind: 'accessory', slot: 'cargo', fabricator: 'residential', fabricationCost: { steel_l: 30, aluminium: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Stacked berths — passenger capacity +25%.' },
  course_optimizer: { key: 'course_optimizer', kind: 'accessory', slot: 'engine', fabricator: 'research_center', fabricationCost: { silicon: 25, gold: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Plotting core — travel burn −10%.' },
  cargo_netting: { key: 'cargo_netting', kind: 'accessory', slot: 'cargo', fabricator: 'warehouse', fabricationCost: { steel_l: 15 }, fabricationHours: 24, installCost: { steel_l: 5 }, installHours: 12, note: 'Rigged webbing — +1 container.' },
  mooring_winch: { key: 'mooring_winch', kind: 'accessory', slot: 'accessory', fabricator: 'warehouse', fabricationCost: { steel_l: 20 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Powered moorings — warehouse redeploy time halved.' },
  bilge_purifier: { key: 'bilge_purifier', kind: 'accessory', slot: 'accessory', fabricator: 'waterworks', fabricationCost: { steel_l: 15, silicon: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Closed-loop recycling — crew survival drain −25%.' },
  stargate_caller: { key: 'stargate_caller', kind: 'accessory', slot: 'accessory', fabricator: 'stargate_yard', fabricationCost: { silicon: 30, gold: 15 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Gate handshake — foreign gate tolls −25%.' },
  salvage_grapnel: { key: 'salvage_grapnel', kind: 'accessory', slot: 'accessory', fabricator: 'workshop', fabricationCost: { steel_l: 25, gold: 5 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Claw and cable — wreck claims in half the time.' },
  haggler_matrix: { key: 'haggler_matrix', kind: 'accessory', slot: 'accessory', fabricator: 'commerce_district', fabricationCost: { silicon: 20, gold: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Trade heuristics — innate prices −10%.' },
  ore_hopper: { key: 'ore_hopper', kind: 'accessory', slot: 'cargo', fabricator: 'smelter', fabricationCost: { steel_l: 25 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Wide intake — junk scooping +50%.' },
  solar_sails: { key: 'solar_sails', kind: 'accessory', slot: 'fuel', fabricator: 'fuelcell_plant', fabricationCost: { silicon: 30, aluminium: 15 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Starlight canvas — free hover within 8 pc of a star.' },
  escape_thrusters: { key: 'escape_thrusters', kind: 'accessory', slot: 'engine', fabricator: 'military_district', fabricationCost: { steel_l: 25, fuel_cells: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Hair-trigger burn — auto-flee alarm at 40%.' },
  // W9e — ACTIFS restants (recettes dans conversions.ts, [TUNE] W9f).
  cell_cracker: { key: 'cell_cracker', kind: 'accessory', slot: 'fuel', fabricator: 'fuelcell_plant', fabricationCost: { steel_l: 25, silicon: 15 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Cracks fuel cells into drive fuel on the move — the cargo-hold reservoir.' },
  arc_furnace: { key: 'arc_furnace', kind: 'accessory', slot: 'accessory', fabricator: 'smelter', fabricationCost: { steel_l: 35, silicon: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Melts junk into light steel while the arc burns fuel.' },
  med_synth: { key: 'med_synth', kind: 'accessory', slot: 'accessory', fabricator: 'lab', fabricationCost: { steel_l: 20, silicon: 15, phosphor: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Brews field medicine from water and phosphor.' },
  fab_bay: { key: 'fab_bay', kind: 'accessory', slot: 'accessory', fabricator: 'workshop', fabricationCost: { steel_l: 40, silicon: 15, gold: 5 }, fabricationHours: 48, installCost: { steel_l: 10 }, installHours: 12, note: 'Onboard fabricators — self-repair from hold steel, burning fuel.' },
  electrolysis_vat: { key: 'electrolysis_vat', kind: 'accessory', slot: 'accessory', fabricator: 'workshop', fabricationCost: { steel_l: 25, silicon: 15 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Batch electrolysis at rest — better yield, no burn.' },
  hydroponic_run: { key: 'hydroponic_run', kind: 'accessory', slot: 'accessory', fabricator: 'farm', fabricationCost: { steel_l: 20, water: 10, phosphor: 5 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'A still garden — batch food from oxygen, no burn.' },
  smelting_run: { key: 'smelting_run', kind: 'accessory', slot: 'accessory', fabricator: 'smelter', fabricationCost: { steel_l: 30 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Batch smelt at rest — junk to steel, better yield.' },
  apothecary_still: { key: 'apothecary_still', kind: 'accessory', slot: 'accessory', fabricator: 'lab', fabricationCost: { steel_l: 20, silicon: 10, phosphor: 10 }, fabricationHours: 24, installCost: { steel_l: 10 }, installHours: 12, note: 'Patient distillation — batch medicine, no burn.' },
  hull_patch_kit: { key: 'hull_patch_kit', kind: 'accessory', slot: 'accessory', fabricator: 'workshop', fabricationCost: { steel_l: 20 }, fabricationHours: 24, installCost: { steel_l: 5 }, installHours: 12, note: 'Plates and sealant — a day of patching restores a quarter of the hull.' },
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

// Grades ENHANCED des actifs W9b (le catalogue passif W9d ajoutera les
// siens) — enregistrés après coup pour rester DRY.
for (const key of [
  'electrolyzer', 'electrolyzer_l2', 'vivarium', 'cell_decompressor',
  'heat_recycler', 'cryo_larder', 'docking_clamps', 'signal_mirror',
  'survey_suite', 'ballast_shielding', 'flare_dampers', 'trim_vanes',
  'berth_module', 'course_optimizer', 'cargo_netting', 'mooring_winch',
  'bilge_purifier', 'stargate_caller', 'salvage_grapnel',
  'haggler_matrix', 'ore_hopper', 'solar_sails', 'escape_thrusters',
  'cell_cracker', 'arc_furnace', 'med_synth', 'fab_bay',
  'electrolysis_vat', 'hydroponic_run', 'smelting_run',
  'apothecary_still', 'hull_patch_kit',
]) {
  GEAR[`${key}_enhanced`] = enhanced(GEAR[key]!);
}

export const ALL_GEAR_KEYS = Object.keys(GEAR);

/** W9a — démontage d'un accessoire (coque entreposée), h-jeu. [TUNE] */
export const UNINSTALL_HOURS = 6;
/** W9a — désassemblage : fraction du coût de fabrication remboursée.
 *  [TUNE-v1 interp annoncée] */
export const DISASSEMBLE_REFUND_FRACTION = 0.5;

/** Capacité d'ITEMS d'un monde : Σ 50 × mult par warehouse ACTIF
 * (chunk AD — réveillée par W6). */
export function itemCapacity(warehouseLevels: number[]): number {
  let cap = 0;
  for (const level of warehouseLevels) {
    cap += 50 * ([1, 2, 3][(level as 1 | 2 | 3) - 1] ?? 0);
  }
  return cap;
}

/**
 * W9c — familles de slots PARTAGÉES (décision responsable 2026-07-22) :
 * upgrades ET accessoires consomment la capacité de LEUR famille
 * (HULLS.slots). Occupation par famille : accessoires montés de la
 * famille + 1 par upgrade installé de la famille.
 */
export function slotFamilyUsage(
  accessories: readonly string[],
  upgrades: Record<string, number> | null | undefined,
): Record<ItemSlot, number> {
  const usage: Record<ItemSlot, number> = {
    accessory: 0,
    engine: 0,
    armor: 0,
    fuel: 0,
    obs: 0,
    weapon: 0,
    cargo: 0,
  };
  for (const key of accessories) {
    const d = GEAR[key];
    usage[(d?.slot ?? 'accessory') as ItemSlot] += 1;
  }
  for (const [fam, lvl] of Object.entries(upgrades ?? {})) {
    if (lvl && fam in usage) usage[fam as ItemSlot] += 1;
  }
  return usage;
}

/**
 * Peut-on monter cet item ? (partage de famille W9c). Pour un upgrade
 * qui REMPLACE un niveau inférieur de sa famille : pas de slot
 * supplémentaire.
 */
export function canFitGear(
  def: GearDef,
  accessories: readonly string[],
  upgrades: Record<string, number> | null | undefined,
  slots: Record<string, number>,
): { ok: boolean; reason: string | null } {
  const family = def.slot as ItemSlot;
  const cap = slots[family] ?? 0;
  if (cap <= 0) return { ok: false, reason: `aucun slot ${family}` };
  const usage = slotFamilyUsage(accessories, upgrades);
  const replacing = def.kind === 'upgrade' && !!(upgrades ?? {})[family];
  const needed = replacing ? 0 : 1;
  if (usage[family] + needed > cap) {
    return { ok: false, reason: `slots ${family} pleins (${usage[family]}/${cap})` };
  }
  return { ok: true, reason: null };
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

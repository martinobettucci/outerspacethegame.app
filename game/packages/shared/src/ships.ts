/**
 * Coques et modules — DESIGN_GUIDE §8 (v0.9.2). COMPLET :
 * 9 coques (Combat/Cargo/Civil × S/M/L) + vaisseau personnel + sonde.
 * Tous les chiffres [TUNE].
 */
import type { CostBundle } from './resources.js';
import type { HullCategory, HullSize, StarFuelType } from './types.js';

export interface SlotLayout {
  engine: number;
  armor: number;
  fuel: number;
  obs: number;
  weapon: number;
  accessory: number;
  cargo: number;
}

export interface HullDef {
  category: HullCategory;
  size: HullSize;
  /** Surnom canon (« bee », « bird », « crusader »). */
  nickname?: string;
  speedPcPerDay: number;
  armorHp: number;
  tankU: number;
  burnUPerPc: number;
  containers: number;
  /** Passagers (coques Civil). */
  pax?: number;
  slots: SlotLayout;
  survivalCrewDays: number;
  buildCost: CostBundle;
}

export const HULLS: Record<`${HullCategory}_${HullSize}`, HullDef> = {
  combat_s: {
    category: 'combat',
    size: 's',
    nickname: 'bee',
    speedPcPerDay: 30,
    armorHp: 60,
    tankU: 40,
    burnUPerPc: 0.2,
    containers: 0,
    slots: { engine: 1, armor: 1, fuel: 2, obs: 0, weapon: 1, accessory: 1, cargo: 0 },
    survivalCrewDays: 2,
    buildCost: { steel_l: 30, fuel_cells: 10 },
  },
  combat_m: {
    category: 'combat',
    size: 'm',
    nickname: 'bird',
    speedPcPerDay: 22,
    armorHp: 180,
    tankU: 90,
    burnUPerPc: 0.4,
    containers: 0,
    slots: { engine: 2, armor: 2, fuel: 2, obs: 2, weapon: 1, accessory: 1, cargo: 0 },
    survivalCrewDays: 14,
    buildCost: { steel_l: 90, steel_h: 20, fuel_cells: 40 },
  },
  combat_l: {
    category: 'combat',
    size: 'l',
    nickname: 'crusader',
    speedPcPerDay: 12,
    armorHp: 700,
    tankU: 400,
    burnUPerPc: 1.0,
    containers: 4,
    slots: { engine: 2, armor: 4, fuel: 4, obs: 4, weapon: 4, accessory: 4, cargo: 4 },
    survivalCrewDays: 60,
    buildCost: { steel_h: 400, fuel_cells: 200 },
  },
  cargo_s: {
    category: 'cargo',
    size: 's',
    speedPcPerDay: 24,
    armorHp: 80,
    tankU: 60,
    burnUPerPc: 0.25,
    containers: 3,
    slots: { engine: 2, armor: 2, fuel: 2, obs: 0, weapon: 0, accessory: 1, cargo: 1 },
    survivalCrewDays: 14,
    buildCost: { steel_l: 40, fuel_cells: 10 },
  },
  cargo_m: {
    category: 'cargo',
    size: 'm',
    speedPcPerDay: 18,
    armorHp: 160,
    tankU: 120,
    burnUPerPc: 0.5,
    containers: 6,
    slots: { engine: 2, armor: 2, fuel: 2, obs: 0, weapon: 0, accessory: 1, cargo: 4 },
    survivalCrewDays: 30,
    buildCost: { steel_l: 120, fuel_cells: 30 },
  },
  cargo_l: {
    category: 'cargo',
    size: 'l',
    speedPcPerDay: 10,
    armorHp: 400,
    tankU: 400,
    burnUPerPc: 1.25,
    containers: 24,
    slots: { engine: 2, armor: 2, fuel: 4, obs: 0, weapon: 0, accessory: 2, cargo: 16 },
    survivalCrewDays: 365,
    buildCost: { steel_h: 300, fuel_cells: 150 },
  },
  civil_s: {
    category: 'civil',
    size: 's',
    speedPcPerDay: 26,
    armorHp: 70,
    tankU: 50,
    burnUPerPc: 0.22,
    containers: 1,
    pax: 200,
    slots: { engine: 2, armor: 1, fuel: 2, obs: 0, weapon: 0, accessory: 1, cargo: 1 },
    survivalCrewDays: 14,
    buildCost: { steel_l: 35, fuel_cells: 10 },
  },
  civil_m: {
    category: 'civil',
    size: 'm',
    speedPcPerDay: 20,
    armorHp: 150,
    tankU: 100,
    burnUPerPc: 0.45,
    containers: 2,
    pax: 800,
    slots: { engine: 2, armor: 2, fuel: 2, obs: 0, weapon: 0, accessory: 1, cargo: 2 },
    survivalCrewDays: 30,
    buildCost: { steel_l: 110, fuel_cells: 30 },
  },
  civil_l: {
    category: 'civil',
    size: 'l',
    speedPcPerDay: 11,
    armorHp: 380,
    tankU: 350,
    burnUPerPc: 1.1,
    containers: 4,
    pax: 3_000,
    slots: { engine: 2, armor: 2, fuel: 4, obs: 0, weapon: 0, accessory: 2, cargo: 4 },
    survivalCrewDays: 180,
    buildCost: { steel_h: 280, fuel_cells: 140 },
  },
};

export const ALL_HULL_KEYS = Object.keys(HULLS) as (keyof typeof HULLS)[];

/** Sonde — seule classe SANS équipage du jeu (DG §8.1). */
export const PROBE = {
  buildCost: { ore: 15, silicon: 10 } as CostBundle,
  speedPcPerDay: 10,
  buildCapPerDayPerPad: 5,
} as const;

/** Équipage minimal par taille de coque. [TUNE] DG §8.5 */
export const MIN_CREW: Record<HullSize, number> = { s: 1, m: 3, l: 8 };

/**
 * Chantier naval (DG §381) : L1 construit S+M ; L2 = M en masse (−25 % de
 * coût) ; L3 construit aussi les L.
 */
export function buildableSizes(shipyardLevel: 1 | 2 | 3): HullSize[] {
  return shipyardLevel >= 3 ? ['s', 'm', 'l'] : ['s', 'm'];
}

/** Remise de production de masse : M à −25 % sur un chantier L2+. */
export const BULK_M_DISCOUNT = 0.25;
export function shipBuildCost(
  hull: HullDef,
  shipyardLevel: 1 | 2 | 3,
): CostBundle {
  if (hull.size !== 'm' || shipyardLevel < 2) return hull.buildCost;
  const out: CostBundle = {};
  for (const [res, qty] of Object.entries(hull.buildCost)) {
    out[res as keyof CostBundle] =
      Math.round((qty as number) * (1 - BULK_M_DISCOUNT) * 100) / 100;
  }
  return out;
}

/**
 * Temps de chantier par taille de coque, en heures. [TUNE-GAP : le guide ne
 * chiffre pas les temps de construction navale — proposition alignée sur le
 * ladder bâtiments 6/24/72 h, en attente d'un tour d'équilibrage.]
 */
export const SHIP_BUILD_HOURS: Record<HullSize, number> = {
  s: 12,
  m: 24,
  l: 72,
};

/** Usure d'atterrissage : 1 % d'armure par atterrissage. [TUNE] DG §8.6 */
export const LANDING_WEAR_RATIO = 0.01;

/**
 * Conteneurs consommés par un manifeste de fret — DG §7 : « 1 conteneur =
 * 1 T d'UN fongible ; les tonnes partielles monopolisent leur conteneur. »
 */
export function containersUsed(cargo: Record<string, number>): number {
  return Object.values(cargo).reduce(
    (n, t) => n + Math.ceil(Math.max(0, t) - 1e-9),
    0,
  );
}

/**
 * Politique d'atterrissage v1 (GB §9 « self / friends / neighbours », liste
 * complète OPEN) : `self` | `everyone` — friends/neighbours arrivent avec
 * les factions (P4). [TUNE-v1]
 */
export type LandingPolicy = 'self' | 'everyone';

/**
 * Droit d'atterrir (GB §9 : « Spaceport → enables landing »).
 * v1 documentée : ses propres mondes accueillent toujours (précédent du
 * spawn : les vaisseaux du starter naissent dockés sans spaceport)
 * [TUNE-v1 interp] ; un monde étranger exige un spaceport ACTIF dont la
 * politique est `everyone`.
 */
export function canLand(input: {
  owned: boolean;
  hasActiveSpaceport: boolean;
  policy: LandingPolicy;
}): boolean {
  if (input.owned) return true;
  return input.hasActiveSpaceport && input.policy === 'everyone';
}

/** Effets d'upgrade (niveau 1 / niveau 2). [TUNE] DG §8.2 */
export const UPGRADE_EFFECTS = {
  engine: { speedMult: [1.15, 1.3] },
  armor: { hpMult: [1.3, 1.6], weightAdd: [0.08, 0.16] },
  fuel: { tankMult: [1.5, 2.0] },
  obs: { accuracyMult: [1.2, 1.4], rangeMult: [1.25, 1.5] },
  cargo: { containersMult: [2, 3] },
} as const;

/** Pénalité de poids. [TUNE] DG §8.2 */
export function speedEff(speed: number, loadFrac: number): number {
  return speed * (1 - 0.15 * Math.min(1, Math.max(0, loadFrac)));
}
export function burnEff(burn: number, loadFrac: number): number {
  return burn * (1 + 0.5 * Math.min(1, Math.max(0, loadFrac)));
}

/** Matrice fuel × tuning moteur (efficacité divisant le burn). [TUNE] DG §8.3 */
export const FUEL_ENGINE_MATRIX: Record<
  StarFuelType,
  Record<StarFuelType, number>
> = {
  cold: { cold: 1.0, hot: 0.6, gas: 0.4 },
  hot: { cold: 0.6, hot: 1.0, gas: 0.55 },
  gas: { cold: 0.45, hot: 0.55, gas: 1.0 },
};

/** range = tank × matrixEff / burnEff (canon §8.4). */
export function derivedRangePc(
  tankU: number,
  matrixEff: number,
  burnUPerPc: number,
): number {
  return (tankU * matrixEff) / burnUPerPc;
}

/** Conso à l'arrêt en survol : 0.2 u/jour × sizeMult {1,2,4}. [TUNE] DG §3.5 */
export const HOVER_IDLE_FUEL_U_PER_DAY = 0.2;
export const HOVER_SIZE_MULT: Record<HullSize, number> = { s: 1, m: 2, l: 4 };
/**
 * Survie en survol : 0.01 T food + 0.01 T water / membre d'équipage / jour.
 * [TUNE-GAP] Exportée mais INERTE en v1 : aucun équipage embarqué en base
 * (0.01 × 0 = 0) — s'active avec le chunk lifecycle NPC/équipages.
 */
export const HOVER_SURVIVAL_T_PER_CREW_PER_DAY = 0.01;

/** Alarme de survie (DG §3.5) : à 25 % restants de la capacité de la
 * coque, auto-flee-home ARMÉE par défaut (anti-extorsion). [TUNE] */
export const SURVIVAL_ALARM_FRACTION = 0.25;

/** Ressources de survie suivies par l'horloge (l'oxygène attend son
 * système de recyclage [TUNE-GAP] — il embarque mais ne draine pas v1). */
export const SURVIVAL_CLOCK_RESOURCES = ['food', 'water'] as const;

/**
 * Capacité de provisions de la coque PAR ressource de survie (T) :
 * survivalCrewDays × 0.01 × équipage — l'ancre déterministe de l'alarme
 * des 25 % [TUNE-v1 interp : le canon dit « 25% remaining » sans ancre].
 */
export function survivalCapacityT(
  survivalCrewDays: number,
  crewCount: number,
): number {
  return survivalCrewDays * HOVER_SURVIVAL_T_PER_CREW_PER_DAY * Math.max(0, crewCount);
}

/**
 * Drain de survie (T/jour PAR ressource food et water) : 0.01 × équipage.
 * Il court PARTOUT où l'équipage vit à bord — survol étranger/sauvage,
 * idle, TRANSIT (c'est l'horloge de mort du vol, GB §6), échoué — mais
 * pas : à quai / en entrepôt (l'hôte nourrit [TUNE-v1]), en survol de SON
 * monde (le stock planétaire paiera comme le fuel — chemin planète à
 * brancher, v1 : exempt [TUNE-v1 annoncé]), colonizing (les provisions du
 * kit sont comptées à part), derelict (plus personne à bord).
 */
export function survivalDrainTPerDay(
  category: HullCategory | string,
  status: string,
  crewCount: number,
  opts: { overOwnWorld?: boolean } = {},
): number {
  if (crewCount <= 0) return 0;
  if (category === 'probe' || category === 'personal') return 0;
  if (['docked', 'warehoused', 'derelict', 'colonizing'].includes(status)) {
    return 0;
  }
  if (status === 'hovering' && opts.overOwnWorld) return 0;
  return HOVER_SURVIVAL_T_PER_CREW_PER_DAY * crewCount;
}

/**
 * Conso de loitering d'une coque (hovering OU idle — GB §7 : « both consume
 * resources » ; le guide ne chiffre qu'un taux, appliqué aux deux).
 * 0 pour probe (sans réservoir) et personal (GB §21 : ne consomme rien).
 */
export function hoverIdleFuelUPerDay(
  category: HullCategory | string,
  size: HullSize | string | null,
): number {
  if (category === 'probe' || category === 'personal') return 0;
  const mult = HOVER_SIZE_MULT[size as HullSize];
  if (!mult) return 0;
  return HOVER_IDLE_FUEL_U_PER_DAY * mult;
}

/**
 * Cible du drain de loitering — table de vérité PURE (GB §7) :
 * - docked / transit / warehoused / derelict / stranded / colonizing → rien
 *   (un échoué ne draine plus : réservoir figé à 0) ;
 * - hovering sur SON monde qui peut servir → le stock planétaire paie
 *   (« as if running resupply round-trips ») ;
 * - hovering sur son monde à sec, hovering étranger/sauvage, idle dans le
 *   vide → le réservoir du vaisseau paie.
 */
export function shipDrainTarget(input: {
  status: string;
  category: HullCategory | string;
  size: HullSize | string | null;
  overOwnPlanet: boolean;
  planetCanServe: boolean;
}): 'planet' | 'tank' | 'none' {
  if (hoverIdleFuelUPerDay(input.category, input.size) <= 0) return 'none';
  if (input.status === 'idle') return 'tank';
  if (input.status !== 'hovering') return 'none';
  if (input.overOwnPlanet && input.planetCanServe) return 'planet';
  return 'tank';
}

/**
 * Rayon de transfert de carburant vaisseau→vaisseau : 1 pc.
 * [TUNE-GAP] Le guide ne chiffre AUCUN rayon — proposition à valider par
 * un tour d'équilibrage avant d'être considérée fiable.
 */
export const FUEL_TRANSFER_RADIUS_PC = 1;

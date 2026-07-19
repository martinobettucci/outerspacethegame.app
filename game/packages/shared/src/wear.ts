/**
 * Usure de coque environnementale (GB §27 SETTLED round 4, DG §8.8) —
 * règles PURES. Un péage déterministe, JAMAIS un blocage ni une mort :
 * opérer en environnement hostile sans le bouclier apparié coûte 5 % des
 * HP max par jour [TUNE], au prorata ; les mondes tempérés n'exigent
 * jamais rien ; les bâtiments jamais rien ; le combat n'est pas concerné.
 * L'usure PLANCHERE à 1 HP [TUNE-v1 interp « a toll, never a kill » — la
 * destruction (junk) arrive avec le combat P5].
 */
import type { Climate } from './types.js';
import type { ResourceId } from './resources.js';

/** Fraction des HP max perdue par JOUR et par source hostile [TUNE]. */
export const HULL_WEAR_FRACTION_PER_DAY = 0.05;
/** Rayon de la zone hostile d'un trou noir ou d'une étoile en flare [TUNE]. */
export const HAZARD_RADIUS_PC = 5;
/** Plancher du péage : l'environnement ne détruit jamais (GB §27). */
export const HULL_WEAR_FLOOR_HP = 1;

export type ShieldKind = 'hot' | 'cold' | 'radio';
export const SHIELD_KINDS: readonly ShieldKind[] = ['hot', 'cold', 'radio'];

/** Coût d'un bouclier (workshop L2, politics-free — DG §8.8) [TUNE].
 * Le cristal apparié du radio est le nox [TUNE interp : le cristal des
 * mondes poison, l'environnement radiatif par excellence]. */
export const SHIELD_COST: Record<ShieldKind, Partial<Record<ResourceId, number>>> = {
  hot: { steel_l: 15, crystal_hot: 5 },
  cold: { steel_l: 15, crystal_cold: 5 },
  radio: { steel_l: 15, crystal_nox: 5 },
};

/** Bouclier exigé par un CLIMAT de monde (null = jamais — tempéré). */
export function shieldForClimate(climate: Climate | string | null): ShieldKind | null {
  if (climate === 'hot') return 'hot';
  if (climate === 'cold') return 'cold';
  // Poison : l'usure ne frappe que la RÉCOLTE de gisement poison (DG §8.8),
  // pas la simple présence — et cette récolte n'existe pas encore
  // (0 tuile constructible) : dormant, annoncé.
  return null;
}

/**
 * Taux d'usure total (HP/jour, ≥ 0) — chaque source hostile NON blindée
 * contribue 5 % des HP max/jour [TUNE-v1 : cumul additif, annoncé] ; les
 * dégâts de proximité du harvest rig (d < d_safe) s'ajoutent tels quels
 * (aucun bouclier ne les atténue [TUNE-v1]).
 */
export function hullWearPerDay(
  maxHp: number,
  opts: {
    hostileClimateUnshielded?: boolean;
    hazardZoneUnshielded?: boolean;
    harvestDamagePerDay?: number;
  },
): number {
  let wear = 0;
  if (opts.hostileClimateUnshielded) wear += HULL_WEAR_FRACTION_PER_DAY * maxHp;
  if (opts.hazardZoneUnshielded) wear += HULL_WEAR_FRACTION_PER_DAY * maxHp;
  wear += Math.max(0, opts.harvestDamagePerDay ?? 0);
  return wear;
}

/** Réparation d'atelier (DG §8.7) : fraction des HP max rendue par HEURE
 * à quai d'un monde à workshop ACTIF [TUNE]. */
export const REPAIR_FRACTION_PER_HOUR = 0.05;
/** Multiplicateur par niveau d'atelier (×1/×2/×4 — DG §8.7) [TUNE]. */
export const REPAIR_LEVEL_MULT: readonly number[] = [1, 2, 4];
/** Acier consommé par HP rendu (« costs steel proportional ») [TUNE-v1]. */
export const REPAIR_STEEL_T_PER_HP = 0.1;

/** Taux de réparation (HP/jour) d'un atelier de niveau donné. */
export function repairHpPerDay(maxHp: number, workshopLevel: number): number {
  const mult = REPAIR_LEVEL_MULT[workshopLevel - 1] ?? 0;
  return REPAIR_FRACTION_PER_HOUR * 24 * maxHp * mult;
}

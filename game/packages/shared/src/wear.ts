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
 * W5 (2026-07-21) — champs climatiques stellaires : une étoile diffuse
 * son climat en openspace sur 0,5 × R_nova [TUNE] (S 20 / M ~31,7 /
 * L ~50,4 pc). Traverser ou stationner dans le champ sans le bouclier
 * apparié = usure standard (5 %/j au prorata, plancher 1 HP).
 */
export const STAR_FIELD_NOVA_FRACTION = 0.5;

/** Rayon du champ climatique d'une étoile (pc) depuis son r_nova. */
export function starFieldRadiusPc(rNovaPc: number): number {
  return Math.max(0, rNovaPc) * STAR_FIELD_NOVA_FRACTION;
}

/** Bouclier exigé par le champ d'une étoile selon son TYPE de carburant.
 *  [TUNE interp annoncée] : hot→hot, cold→cold, gas→radio (le champ
 *  d'une étoile à gaz est l'environnement radiatif par excellence). */
export function shieldForStarField(
  starFuelType: string | null,
): ShieldKind | null {
  if (starFuelType === 'hot') return 'hot';
  if (starFuelType === 'cold') return 'cold';
  if (starFuelType === 'gas') return 'radio';
  return null;
}

/** Durée d'une morphose de coque (adaptation climatique), h-jeu. [TUNE] */
export const SHIELD_MORPH_HOURS = 24;

/**
 * Longueur (pc) de l'intersection d'un SEGMENT [a→b] avec un DISQUE de
 * centre c et rayon r — géométrie pure pour la traversée des champs
 * stellaires (dégâts au prorata du temps passé dedans).
 */
export function segmentCircleCrossingPc(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-12) {
    // Segment dégénéré : dedans ou dehors, longueur nulle.
    return 0;
  }
  // Paramétrage p(t) = a + t·d, t ∈ [0, 1] ; |p(t) − c|² = r².
  const fx = ax - cx;
  const fy = ay - cy;
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (disc <= 0) return 0; // pas d'intersection (ou tangence : longueur 0)
  const sq = Math.sqrt(disc);
  const t1 = Math.max(0, (-B - sq) / (2 * A));
  const t2 = Math.min(1, (-B + sq) / (2 * A));
  if (t2 <= t1) return 0;
  return (t2 - t1) * len;
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
    /** W5 : nombre de CHAMPS stellaires non blindés où la coque baigne. */
    starFieldsUnshielded?: number;
  },
): number {
  let wear = 0;
  if (opts.hostileClimateUnshielded) wear += HULL_WEAR_FRACTION_PER_DAY * maxHp;
  if (opts.hazardZoneUnshielded) wear += HULL_WEAR_FRACTION_PER_DAY * maxHp;
  wear +=
    Math.max(0, opts.starFieldsUnshielded ?? 0) *
    HULL_WEAR_FRACTION_PER_DAY *
    maxHp;
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

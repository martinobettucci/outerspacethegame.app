/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Universe gen” and §P3 “Galaxy map”/“Telescope intel”; GAME_BOOK.md §2/§4/§6/§22; DESIGN_GUIDE.md §2/§9; docs/MASTER_PLAN.md §W4. */
/**
 * Superpositions COSMÉTIQUES de la carte galaxie (décisions responsable
 * 2026-07-20, JOURNAL) — maths pures, testables sans three.js :
 *
 * - halo de portée télescope à la sélection d'une planète équipée
 *   (rayon = ciel du monde : BASE_SKY 60 pc + 200 pc × niveau — miroir
 *   client de server/services/world.ts, purement décoratif : le
 *   brouillard réel reste calculé serveur, union de tous les scopes) ;
 * - cercles d'autonomie du vaisseau sélectionné : pointillés ROUGE =
 *   panne sèche avec 5 % de tolérance (0,95 × autonomie), VERT =
 *   aller-retour (0,45 × autonomie).
 */

/** Miroir de world.ts (BASE_SKY_PC) — cosmétique seulement. [TUNE-GAP] */
export const HALO_BASE_SKY_PC = 60;
export const HALO_PC_PER_LEVEL = 200;

/** Rayon du halo télescope pour un niveau de télescope ACTIF (1–3). */
export function telescopeHaloRadiusPc(level: number): number {
  return HALO_BASE_SKY_PC + HALO_PC_PER_LEVEL * Math.max(1, Math.min(3, level));
}

/** Tolérance de sécurité sur l'autonomie (5 % — canon responsable). */
export const RANGE_TOLERANCE = 0.05;

/**
 * Rayons des cercles d'autonomie (pc) : aller simple 0,95 × autonomie,
 * aller-retour 0,45 × autonomie. `null` si la coque n'a pas d'autonomie
 * mesurable (pas de fuel, pas de conso — personal/probe).
 */
export function shipRangeRadiiPc(
  fuelUnits: number,
  burnUPerPc: number,
): { oneWay: number; roundTrip: number } | null {
  if (!(fuelUnits > 0) || !(burnUPerPc > 0)) return null;
  const rangePc = fuelUnits / burnUPerPc;
  // 95 % = aller simple toléré ; 45 % = aller-retour (50 % − tolérance).
  return { oneWay: 0.95 * rangePc, roundTrip: 0.45 * rangePc };
}

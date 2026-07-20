/**
 * Formules canoniques — DESIGN_GUIDE §3 (v0.9.2).
 * Chaque constante [TUNE] est nommée et centralisée ici.
 */
import type { PlanetSize, Quality } from './types.js';

/* ------------------------------------------------------------------ */
/* §3.4 — Efficacité : la cloche inclinée (THE formula)               */
/* ------------------------------------------------------------------ */

/** Plancher d'efficacité. [TUNE] DG §3.4 */
export const EFFICIENCY_FLOOR = 0.12;
/** Point idéal d'utilisation (~70 %). [TUNE] DG §3.4 */
export const EFFICIENCY_MU = 0.7;
/** Écart-type côté sous-utilisation (indulgent). [TUNE] DG §3.4 */
export const EFFICIENCY_SIGMA_UNDER = 0.35;
/** Écart-type côté surcharge (punitif). [TUNE] DG §3.4 */
export const EFFICIENCY_SIGMA_OVER = 0.15;

/**
 * E(u) = max(0.12, exp(−(u−μ)² / (2σ(u)²))) — cloche asymétrique.
 * `u` = utilisation du domaine (workforce, stock, population…).
 */
export function efficiency(u: number): number {
  if (!Number.isFinite(u) || u < 0) return EFFICIENCY_FLOOR;
  const sigma = u < EFFICIENCY_MU ? EFFICIENCY_SIGMA_UNDER : EFFICIENCY_SIGMA_OVER;
  const d = u - EFFICIENCY_MU;
  return Math.max(EFFICIENCY_FLOOR, Math.exp(-(d * d) / (2 * sigma * sigma)));
}

/* ------------------------------------------------------------------ */
/* §3.3b — Frein de stockage unilatéral (ne jamais punir le stock bas) */
/* ------------------------------------------------------------------ */

/** Seuil au-delà duquel le frein s'applique. [TUNE] DG §3.3b */
export const STORAGE_BRAKE_START = 0.7;

/**
 * Multiplicateur de production selon l'utilisation du stockage :
 * 1 pour u ≤ 0.7 ; branche droite de E(u) au-dessus ; halt à u ≥ 1.
 */
export function storageBrake(u: number): number {
  if (!Number.isFinite(u) || u <= STORAGE_BRAKE_START) return 1;
  if (u >= 1) return 0;
  return efficiency(u);
}

/* ------------------------------------------------------------------ */
/* §3.3b — Franchise de stockage de base (le « plancher »)             */
/* ------------------------------------------------------------------ */

/** Tonnage libre sans bâtiment, par taille de planète. [TUNE] DG §3.3b */
export const BASE_STORAGE_ALLOWANCE_T: Record<PlanetSize, number> = {
  s: 800,
  m: 1_000,
  l: 1_200,
};

/* ------------------------------------------------------------------ */
/* §3.2 — Population                                                   */
/* ------------------------------------------------------------------ */

/** Population de base par taille. [TUNE] DG §3.2 */
export const POP_BASE: Record<PlanetSize, number> = {
  s: 2_000,
  m: 12_000,
  l: 60_000,
};

/** Multiplicateur de qualité. [TUNE] DG §3.2 */
export const POP_QUALITY_MULT: Record<Quality, number> = {
  F: 1.0,
  E: 1.3,
  D: 1.7,
  C: 2.2,
  B: 3.0,
  A: 4.0,
};

export function popCap(size: PlanetSize, quality: Quality): number {
  return Math.round(POP_BASE[size] * POP_QUALITY_MULT[quality]);
}

/** Taux de croissance logistique journalier r. [TUNE] DG §3.2 */
export const POP_GROWTH_R = 0.05;

/**
 * Besoins de base par 1 000 têtes pondérées et par jour (tonnes). Les poids
 * survival/medicine distincts sont appliqués dans la simulation v2. [TUNE]
 */
export const POP_NEEDS_PER_1000_PER_DAY = {
  food: 1,
  water: 1,
  medicine: 0.1,
} as const;

/**
 * Compatibilité v1 : l'habitabilité ne dépend plus que de food/water.
 * La médecine v2 est optionnelle, hors natalité et agit uniquement sur la
 * pression de maladie (DG §3.2-v2 b/h). Le 3e argument reste pour ne pas
 * casser les appelants historiques de cette fonction exportée.
 */
export function habitability(
  foodSat: number,
  waterSat: number,
  _medicineSat: number,
): number {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return Math.min(clamp(foodSat), clamp(waterSat));
}

/** Maladie v1 : dI/jour = 1.5 × max(0, u − 0.9) − 0.05 × I (×2 sans médecine). [TUNE] */
export const ILLNESS_CROWDING_THRESHOLD = 0.9;
export const ILLNESS_GROWTH_COEF = 1.5;
export const ILLNESS_DECAY_COEF = 0.05;
export const ILLNESS_DEATH_COEF = 0.03;

export function illnessDelta(
  u: number,
  illness: number,
  medicineUnavailable: boolean,
): number {
  const growth =
    ILLNESS_GROWTH_COEF *
    Math.max(0, u - ILLNESS_CROWDING_THRESHOLD) *
    (medicineUnavailable ? 2 : 1);
  return growth - ILLNESS_DECAY_COEF * illness;
}

/**
 * Variation journalière de population :
 * ΔP = r × P × (1 − P/popCap) × H − morts de maladie.
 */
export function populationDelta(
  pop: number,
  cap: number,
  h: number,
  illness: number,
): number {
  const growth = POP_GROWTH_R * pop * (1 - pop / cap) * h;
  const deaths = ILLNESS_DEATH_COEF * illness * pop;
  return growth - deaths;
}

/* ------------------------------------------------------------------ */
/* §3.4 — Workforce                                                    */
/* ------------------------------------------------------------------ */

/** Workforce optimale par niveau de bâtiment (mines/industries). [TUNE] */
export const WORKFORCE_OPTIMAL_BY_LEVEL = [50, 120, 250] as const;
/** Part maximale de la population assignable. [TUNE] DG §3.4 */
export const WORKFORCE_ASSIGNABLE_SHARE = 0.6;

/* ------------------------------------------------------------------ */
/* §3.3 — Gisements                                                    */
/* ------------------------------------------------------------------ */

/** Minage de trace (sans gisement) : 2 T/jour, hors efficacité. [TUNE] */
export const TRACE_MINING_T_PER_DAY = 2;

/** Multiplicateur de taille pour le stock initial des gisements. [TUNE] */
export const DEPOSIT_SIZE_MULT: Record<PlanetSize, number> = {
  s: 1,
  m: 3,
  l: 10,
};

/** Stock initial : S0 = 2000 × sizeMult × qMult × U(0.6, 1.4). [TUNE] DG §3.3 */
export const DEPOSIT_BASE_STOCK_T = 2_000;

/* ------------------------------------------------------------------ */
/* §4.1 — Gouvernance                                                  */
/* ------------------------------------------------------------------ */

/** Multiplicateur G d'une grande planète sous-gouvernée. Canon GB §11. */
export const UNDERGOVERNED_LARGE_MULT = 0.5;
/** Bonus G par palier de rareté du gouverneur le plus faible. [TUNE] */
export const G_RARITY_BONUS_PER_TIER = 0.02;

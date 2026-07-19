/**
 * Population & Employment v2 — règles PURES (DESIGN_GUIDE §3.2-v2,
 * canon GB §10 réécrit 2026-07-19 ; équilibré Round 9, guide v0.10).
 *
 * Chunk BA : démographie 3 âges, natalité, rations (oxygène compris),
 * modulateur de croissance, parabole de sur-capacité, horloges de mort.
 * L'emploi universel + popScale + suppression d'E_planet arrivent au
 * chunk BB (dépendance d'ordre : sans emploi universel, la mortalité de
 * chômage tuerait tous les mondes existants).
 */
import type { Climate } from './types.js';

/* ------------------------------------------------------------------ */
/* §a — Âges & vieillissement                                          */
/* ------------------------------------------------------------------ */

/** Époques (jours de jeu). [TUNE] DG §3.2-v2 a */
export const CHILD_DAYS = 20;
export const ACTIVE_DAYS = 60;
export const SENIOR_DAYS = 30;

/** Pyramide stationnaire (découle des époques 20/60/30). */
export const STABLE_PYRAMID = {
  children: CHILD_DAYS / (CHILD_DAYS + ACTIVE_DAYS + SENIOR_DAYS),
  actives: ACTIVE_DAYS / (CHILD_DAYS + ACTIVE_DAYS + SENIOR_DAYS),
  seniors: SENIOR_DAYS / (CHILD_DAYS + ACTIVE_DAYS + SENIOR_DAYS),
} as const;

export interface Pyramid {
  children: number;
  actives: number;
  seniors: number;
}

/** Répartit un total sur la pyramide stationnaire (spawn, défauts). */
export function stableSplit(total: number): Pyramid {
  const children = total * STABLE_PYRAMID.children;
  const seniors = total * STABLE_PYRAMID.seniors;
  return { children, actives: total - children - seniors, seniors };
}

/**
 * Flux de vieillissement sur dt jours (matérialisation quotidienne) :
 * C→A, A→S, S→† — continus, jamais modulés (§3.2-v2 d).
 */
export function agingFlows(
  pyr: Pyramid,
  dtDays: number,
): { toActives: number; toSeniors: number; seniorDeaths: number } {
  return {
    toActives: (pyr.children / CHILD_DAYS) * dtDays,
    toSeniors: (pyr.actives / ACTIVE_DAYS) * dtDays,
    seniorDeaths: (pyr.seniors / SENIOR_DAYS) * dtDays,
  };
}

/* ------------------------------------------------------------------ */
/* §b — Rations                                                        */
/* ------------------------------------------------------------------ */

/** Ration enfants/seniors relative aux actifs. [TUNE] */
export const RATION_CS = 0.6;
/** Oxygène (climats hostiles seulement), T/1000 têtes/j. [TUNE] */
export const OXYGEN_PER_1000_PER_DAY = 0.6;

/** Têtes pondérées pour la consommation (actifs 1×, C/S 0,6×). */
export function weightedHeads(pyr: Pyramid): number {
  return pyr.actives + RATION_CS * (pyr.children + pyr.seniors);
}

/** L'oxygène est-il respiré AU STOCK sur ce climat ? (temperate = ambiant) */
export function breathesFromStock(climate: Climate): boolean {
  return climate !== 'temperate';
}

/* ------------------------------------------------------------------ */
/* §c — Natalité                                                       */
/* ------------------------------------------------------------------ */

/**
 * Naissances par actif et par jour selon le niveau de residential ACTIF
 * (0 = aucun ⇒ natalité NULLE, canon). [TUNE — Round 9 : ×6 vs la spec
 * initiale, la démographie doit boomer (+~4 %/j) pour que la pression
 * d'exode atteigne l'ancre J+35–40.]
 */
export const NATALITY_BY_RESIDENTIAL = [0, 0.12, 0.18, 0.24] as const;

/* ------------------------------------------------------------------ */
/* §d — Modulateur de croissance                                       */
/* ------------------------------------------------------------------ */

/** M_eff = floor + (1 − floor) × Ē. [TUNE] */
export const GROWTH_EFF_FLOOR = 0.5;
/** Ē neutre quand aucun bâtiment n'emploie. [TUNE-interp] */
export const GROWTH_EFF_NEUTRAL = 0.7;
/** M_life par ressource : déficit / normal / abondance ; produit borné. [TUNE] */
export const LIFE_DEFICIT_FACTOR = 0.5;
export const LIFE_ABUNDANCE_FACTOR = 1.15;
export const LIFE_ABUNDANCE_RHO = 1.5;
export const LIFE_CAP = 1.5;

/**
 * M_life à partir des ρ = production locale / consommation par ressource
 * de vie (les imports ne nourrissent JAMAIS la croissance — canon).
 */
export function lifeModulator(rhos: number[]): number {
  let m = 1;
  for (const rho of rhos) {
    if (rho < 1) m *= LIFE_DEFICIT_FACTOR;
    else if (rho >= LIFE_ABUNDANCE_RHO) m *= LIFE_ABUNDANCE_FACTOR;
  }
  return Math.min(LIFE_CAP, m);
}

/** M_growth complet (Ē ∈ [0,1] moyen pondéré par staff, ou neutre). */
export function growthModulator(meanEfficiency: number, rhos: number[]): number {
  const mEff = GROWTH_EFF_FLOOR + (1 - GROWTH_EFF_FLOOR) * meanEfficiency;
  return mEff * lifeModulator(rhos);
}

/* ------------------------------------------------------------------ */
/* §h — Sur-capacité (parabole) & maladie v2                           */
/* ------------------------------------------------------------------ */

/** Pression de maladie parabolique au-delà du cap. [TUNE] */
export const OVERCAP_ILLNESS_COEF = 1.2;
/**
 * Morts paraboliques au-delà du cap. [TUNE — Round 9 : 0,015 → 0,25,
 * sinon le boom dépasse la parabole et les mondes s'installent à
 * 2,3 × cap ; à 0,25 l'équilibre est ≈ 1,31 × cap.]
 */
export const OVERCAP_DEATHS_COEF = 0.25;
/** Réduction d'indice de maladie par niveau de clinique. [TUNE] */
export const CLINIC_REDUCTION = [0, 0.1, 0.2, 0.35] as const;

/** dI/jour v2 : parabole de sur-cap − décroissance (×2 si med < 1). */
export function illnessDeltaV2(
  overRatio: number,
  illness: number,
  medSatBelowOne: boolean,
): number {
  const o = Math.max(0, overRatio);
  const growth = OVERCAP_ILLNESS_COEF * o * o * (medSatBelowOne ? 2 : 1);
  return growth - 0.05 * illness;
}

/** Morts de maladie par jour (indice APRÈS réduction clinique). */
export function illnessDeathsPerDay(
  illness: number,
  clinicLevel: number,
  pop: number,
): number {
  const eff = Math.max(0, illness - (CLINIC_REDUCTION[clinicLevel] ?? 0));
  return 0.03 * eff * pop;
}

/** Morts paraboliques de sur-capacité par jour. */
export function overcapDeathsPerDay(pop: number, cap: number): number {
  const o = Math.max(0, pop / cap - 1);
  return OVERCAP_DEATHS_COEF * o * o * pop;
}

/* ------------------------------------------------------------------ */
/* §i — Horloges de mort planétaires                                   */
/* ------------------------------------------------------------------ */

/** Jours jusqu'à la mort TOTALE une fois le stock à zéro. (canon) */
export const CLOCK_DAYS: Record<'water' | 'food', number> = {
  water: 3,
  food: 10,
};

/**
 * Morts du jour sous horloge : LINÉAIRES vers l'échéance FIXE posée au
 * moment de l'épuisement (Round 9 : un taux P/horizon naïf décroît
 * exponentiellement et ne finit jamais — le canon dit TOUT LE MONDE).
 */
export function clockDeathsPerDay(
  pop: number,
  nowMs: number,
  deadlineMs: number,
): number {
  const leftDays = Math.max((deadlineMs - nowMs) / 86_400_000, 1e-6);
  return pop / leftDays;
}

/* ------------------------------------------------------------------ */
/* Morts proportionnelles (§g pattern — utilisé dès BA pour clocks/cap) */
/* ------------------------------------------------------------------ */

/** Répartit `deaths` proportionnellement sur la pyramide. */
export function applyDeaths(pyr: Pyramid, deaths: number): Pyramid {
  const pop = pyr.children + pyr.actives + pyr.seniors;
  if (deaths <= 0 || pop <= 0) return pyr;
  const frac = Math.min(1, deaths / pop);
  return {
    children: pyr.children * (1 - frac),
    actives: pyr.actives * (1 - frac),
    seniors: pyr.seniors * (1 - frac),
  };
}

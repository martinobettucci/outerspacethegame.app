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

/* ------------------------------------------------------------------ */
/* §e — Emploi universel (chunk BB)                                    */
/* ------------------------------------------------------------------ */

/**
 * Postes de base par type de bâtiment — TOUS les bâtiments emploient
 * (canon GB §10 v2). Table EXHAUSTIVE (règle de complétude) : 28 types
 * du catalogue + la clinique (chunk BC). [TUNE] DG §3.2-v2 e.
 */
export const BASE_JOBS: Record<string, number> = {
  telescope: 10,
  probe_pad: 15,
  depot: 10,
  warehouse: 20,
  mine: 50,
  farm: 50,
  waterworks: 50,
  smelter: 50,
  crystal_extractor: 50,
  refinery: 50,
  fuelcell_plant: 50,
  spaceport: 30,
  workshop: 40,
  market: 30,
  residential: 15,
  lab: 40,
  obs_station: 30,
  shipyard: 60,
  military_district: 60,
  weapon_foundry: 60,
  research_center: 50,
  diplomatic_district: 40,
  casino: 50,
  commerce_district: 50,
  faction_hq: 40,
  stargate_yard: 80,
  terraformer: 60,
  artificial_planet_yard: 100,
  clinic: 30,
};

/** Multiplicateur de postes par niveau (absorber plus ET mieux). [TUNE] */
export const JOBS_LEVEL_MULT = [1, 2.4, 5] as const;

/**
 * popScale : l'optimum de CHAQUE bâtiment dérive avec la population
 * totale — le cœur du « point qui shifte » (érosion par négligence).
 * [TUNE — Round 9 : plancher 1,0, sinon les petits mondes saturaient à
 * J+3 au lieu de J+21.]
 */
export const POP_SCALE_REF = 2_000;
export function popScale(totalPop: number): number {
  const raw = Math.sqrt(Math.max(totalPop, 1) / POP_SCALE_REF);
  return Math.min(2, Math.max(1, raw));
}

/** Postes optimaux d'un bâtiment (type × niveau × population). */
export function jobsOptimal(
  buildingKey: string,
  level: 1 | 2 | 3,
  totalPop: number,
): number {
  const base = BASE_JOBS[buildingKey] ?? 0;
  return base * (JOBS_LEVEL_MULT[level - 1] ?? 1) * popScale(totalPop);
}

/* ------------------------------------------------------------------ */
/* §g — Le chômage tue (chunk BB)                                      */
/* ------------------------------------------------------------------ */

/** Tolérance de chômage sans effet (canon responsable : 7 %). */
export const UNEMP_TOLERANCE = 0.07;
/** Grâce : jours CONSÉCUTIFS au-dessus de la tolérance avant morts. [TUNE] */
export const UNEMP_GRACE_DAYS = 3;
/** γ de mortalité : morts/j = γ × (τ − tolérance) × P. [TUNE] */
export const UNEMP_GAMMA = 0.02;

/** Taux de chômage sur les ACTIFS seuls. */
export function unemploymentRate(staffed: number, actives: number): number {
  if (actives <= 0) return 0;
  return Math.max(0, 1 - staffed / actives);
}

/** Morts quotidiennes de chômage une fois la grâce épuisée. */
export function unemploymentDeathsPerDay(tau: number, pop: number): number {
  return UNEMP_GAMMA * Math.max(0, tau - UNEMP_TOLERANCE) * pop;
}

/**
 * Population de départ du starter. [TUNE — Round 9 : 650 → 350, le
 * starter doit naître SOUS sa capacité d'emploi précoce (saturation
 * J+21, ~15 % de pertes de grâce — « la vie du colonisateur »).]
 */
export const STARTER_POP = 350;

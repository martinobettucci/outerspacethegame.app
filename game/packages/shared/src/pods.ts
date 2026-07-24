/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Recruitment pods”; GAME_BOOK.md §12/§13/§19; DESIGN_GUIDE.md §11.4. */
/**
 * Pods de recrutement (GB §12/§13, DG §11.4) — règles PURES.
 *
 * Canon : paiement dans N'IMPORTE quelle ressource ; prix par ressource
 * dérivé du census global (`price_r = max(5, B × (S_r/S̄)^0.7)`, B = 40
 * [TUNE]) ; les achats comptent dans l'offre IMMÉDIATEMENT (impact de
 * prix dans la fenêtre entre deux census) ; cap 10 pods/jour/compte
 * [TUNE] ; comptes < 45 jours interdits [TUNE] ; 1 PNJ par pod, rareté
 * 62/24/10/3.4/0.6 %, rôle uniforme, peuple 60/30/10 [TUNE] ; rolls
 * individuels À L'OUVERTURE : baseline de rareté × U(0.5, 1.5) par stat
 * (RNG seedé au moment de génération, DG §1) ; PNJ lié au compte 60
 * jours [TUNE] — le recrutement est un PUITS, pas une mint.
 *
 * [TUNE interp] S̄ « trimmed supply-weighted mean » : parmi les offres
 * NON NULLES triées (l'absence n'est pas un outlier — et la pondération
 * par l'offre ignore déjà les zéros), on écarte 10 % des entrées à
 * chaque extrême (floor), puis moyenne PONDÉRÉE PAR L'OFFRE sur le
 * reste (S̄ = Σ s² / Σ s) — à valider en tour d'équilibrage (JOURNAL).
 */
import { ALL_RESOURCE_IDS, type ResourceId } from './resources.js';
import type { NpcRole, People, Rarity } from './types.js';
import type { SeededStream } from './rng.js';

export const POD_PRICE_BASE_T = 40; // B [TUNE]
export const POD_PRICE_FLOOR_T = 5;
export const POD_PRICE_EXPONENT = 0.7; // [TUNE]
export const POD_DAILY_CAP = 10; // [TUNE]
export const POD_MIN_ACCOUNT_AGE_DAYS = 45; // [TUNE]
export const POD_NPC_ACCOUNT_BIND_DAYS = 60; // [TUNE]
/** Fraction écartée à CHAQUE extrême du tri des offres (trim). [TUNE] */
export const POD_TRIM_FRACTION = 0.1;

/** Rareté : Common 62 / Uncommon 24 / Rare 10 / Epic 3.4 / Legendary 0.6. */
export const POD_RARITY_TABLE: readonly { rarity: Rarity; weight: number }[] = [
  { rarity: 'common', weight: 62 },
  { rarity: 'uncommon', weight: 24 },
  { rarity: 'rare', weight: 10 },
  { rarity: 'epic', weight: 3.4 },
  { rarity: 'legendary', weight: 0.6 },
];

/** Peuple : 60/30/10 human/forged/vess. [TUNE] */
export const POD_PEOPLE_TABLE: readonly { people: People; weight: number }[] = [
  { people: 'human', weight: 60 },
  { people: 'forged', weight: 30 },
  { people: 'vess', weight: 10 },
];

/** Rôles — uniformes (canon), catalogue EXHAUSTIF. */
export const POD_ROLES: readonly NpcRole[] = [
  'pilot',
  'engineer',
  'merchant',
  'diplomat',
  'soldier',
  'scientist',
];

/** Baseline de bonus : +4 % par tier de rareté (common=1 … legendary=5). */
export const RARITY_TIER_INDEX: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};
export const RARITY_BASELINE_BONUS = 0.04; // [TUNE]

/**
 * Stat archétype-pertinente par rôle (EXHAUSTIF — règle de complétude).
 * `settler_risk_reduction` est déjà consommée (péage settlers, chunk N) ;
 * les autres clefs sont posées pour leurs futurs consommateurs
 * (équilibrage, marché, intel, industrie, combat, diplomatie) [TUNE-GAP].
 */
export const ROLE_STAT: Record<NpcRole, string> = {
  pilot: 'settler_risk_reduction',
  engineer: 'industry_bonus',
  merchant: 'trade_bonus',
  diplomat: 'diplomacy_bonus',
  soldier: 'combat_bonus',
  scientist: 'intel_bonus',
};

/** Gouverneur possible = Rare et au-delà (canon DG §11.4). */
export function isGovernorGrade(rarity: Rarity): boolean {
  return RARITY_TIER_INDEX[rarity] >= RARITY_TIER_INDEX.rare;
}

/**
 * S̄ : moyenne pondérée par l'offre, après trim de POD_TRIM_FRACTION à
 * chaque extrême (voir en-tête). 0 si l'univers est vide.
 */
export function trimmedSupplyWeightedMean(supplies: number[]): number {
  const nonZero = supplies.filter((v) => v > 0).sort((a, b) => a - b);
  const trim = Math.floor(nonZero.length * POD_TRIM_FRACTION);
  const kept = nonZero.slice(trim, nonZero.length - trim || undefined);
  const total = kept.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return kept.reduce((s, v) => s + v * v, 0) / total;
}

/** Prix d'un pod payé en `r` : max(5, B × (S_r/S̄)^0.7). */
export function podPrice(supplyR: number, meanSupply: number): number {
  if (meanSupply <= 0) return POD_PRICE_FLOOR_T;
  const raw =
    POD_PRICE_BASE_T * (Math.max(0, supplyR) / meanSupply) ** POD_PRICE_EXPONENT;
  return Math.max(POD_PRICE_FLOOR_T, Math.round(raw * 100) / 100);
}

/** Barème EXHAUSTIF (catalogue entier, zéros au plancher). */
export function podPrices(
  supplies: Partial<Record<ResourceId, number>>,
): Record<ResourceId, number> {
  const mean = trimmedSupplyWeightedMean(
    ALL_RESOURCE_IDS.map((r) => Math.max(0, supplies[r] ?? 0)),
  );
  return Object.fromEntries(
    ALL_RESOURCE_IDS.map((r) => [r, podPrice(supplies[r] ?? 0, mean)]),
  ) as Record<ResourceId, number>;
}

export interface PodRoll {
  people: People;
  role: NpcRole;
  rarity: Rarity;
  statRolls: Record<string, number>;
}

/**
 * Contenu d'un pod — DÉTERMINISTE pour un flux seedé donné (le seed est
 * capturé au moment de l'ouverture, DG §1). Ordre des tirages STABLE :
 * rareté, rôle, peuple, roll de stat.
 */
export function rollPodNpc(stream: SeededStream): PodRoll {
  const rarity =
    POD_RARITY_TABLE[stream.weighted(POD_RARITY_TABLE.map((r) => r.weight))]!
      .rarity;
  const role = POD_ROLES[stream.weighted(POD_ROLES.map(() => 1))]!;
  const people =
    POD_PEOPLE_TABLE[stream.weighted(POD_PEOPLE_TABLE.map((p) => p.weight))]!
      .people;
  const baseline = RARITY_BASELINE_BONUS * RARITY_TIER_INDEX[rarity];
  const roll = baseline * stream.uniform(0.5, 1.5);
  return {
    people,
    role,
    rarity,
    statRolls: { [ROLE_STAT[role]]: Math.round(roll * 1e6) / 1e6 },
  };
}

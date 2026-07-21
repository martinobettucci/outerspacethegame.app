/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W8; GAME_BOOK.md §14; DESIGN_GUIDE.md §8. */
/**
 * W8 — le CRUSADER, petite planète volante (MASTER_PLAN W8, décisions
 * responsable 2026-07-21) : le combat_l ne se pose JAMAIS. Il naît en
 * SURVOL avec 25 % de la population de la planète source (proportions
 * d'âges), une infrastructure FIGÉE (non modifiable : ni construire, ni
 * placer, ni upgrader), des stocks fongibles plafonnés à l'équivalent
 * d'une planète S, l'oxygène AU STOCK (cap pop 2 000 [TUNE]).
 */

export const CRUSADER = {
  /** Capacité de stock fongible (équivalent planète S). [TUNE] */
  stockCapT: 800,
  /** Plafond de population à bord. [TUNE] */
  popCap: 2_000,
  /** Fraction de la population source qui migre à la naissance. */
  migrationFraction: 0.25,
  /** Provisions d'amorçage puisées au stock du monde source — l'oxygène
   *  d'abord : à bord on respire AU STOCK (mort instantanée à sec).
   *  [TUNE-v1 interp annoncée] */
  birthStock: { oxygen: 100, food_1: 50, water: 50 } as Record<string, number>,
  /** Emplois FIXES à bord (infra figée : ni construire ni upgrader) —
   *  le chômage se mesure contre CE plafond. [TUNE-v1] */
  fixedJobs: 400,
  /** Infrastructure FIGÉE (descriptive v1 — les effets s'activent par
   *  sous-chunk W8b→W8e) : residential L3, usines L3 (usinage partiel
   *  d'office), 3 spaceports L3, 3 warehouses L3, ADN complet, PAS de
   *  markets. */
  infra: {
    residential: 3,
    factoriesL3: true,
    spaceports: [3, 3, 3],
    warehouses: [3, 3, 3],
    dna: 'full',
    markets: false,
  },
} as const;

/** Le Crusader est LA coque combat L (une seule classe volante). */
export function isCrusader(
  category: string | null | undefined,
  size: string | null | undefined,
): boolean {
  return category === 'combat' && size === 'l';
}

/**
 * Ventile un total de migrants en cohortes PROPORTIONNELLES aux âges de
 * la source (arrondis réparés sur les actifs — jamais de somme fausse).
 */
export function crusaderMigrants(
  source: { children: number; actives: number; seniors: number },
  fraction = CRUSADER.migrationFraction,
  cap = CRUSADER.popCap,
): { children: number; actives: number; seniors: number; total: number } {
  const pop = source.children + source.actives + source.seniors;
  const total = Math.min(Math.floor(pop * fraction), cap);
  if (pop <= 0 || total <= 0) return { children: 0, actives: 0, seniors: 0, total: 0 };
  const children = Math.floor((source.children / pop) * total);
  const seniors = Math.floor((source.seniors / pop) * total);
  const actives = total - children - seniors;
  return { children, actives, seniors, total };
}

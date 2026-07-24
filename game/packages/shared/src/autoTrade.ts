/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Hover auto-trade”; GAME_BOOK.md §7; DESIGN_GUIDE.md §3.5. */
/**
 * Auto-trade du survol étranger (GB §7, DG §3.5) — règles PURES.
 *
 * Canon : « the ship may auto-trade to top up (e.g. if food < 20, buy
 * 200 food best effort — best effort = the first available matching
 * market pair) ». La coque en survol d'un monde d'AUTRUI rachète au
 * marché local quand un réservoir passe sous son seuil ; la borne par
 * défaut refuse les prix abusifs (anti survival-extortion).
 */
import type { ResourceId } from './resources.js';
import { FOOD_RESOURCES } from './resources.js';

/** Nombre maximal de règles par coque [TUNE-v1]. */
export const MAX_AUTO_TRADE_RULES = 3;
/**
 * Borne de prix : coût maximal en tonnes de CONTREPARTIE par tonne
 * reçue. [TUNE-v1 interp du canon « refuses prices > 3× the census
 * median » — la médiane de PRIX census n'existe pas encore (le census
 * publie des totaux) ; en attendant le pricing des pods, la borne vaut
 * un taux d'échange ≤ 3:1, annoncé.]
 */
export const AUTO_TRADE_MAX_COST_PER_T = 3;

export interface AutoTradeRule {
  /** Ressource à racheter (le « give » du slot marché côté monde). */
  resource: ResourceId;
  /** Seuil de déclenchement (T) sur le réservoir de DESTINATION. */
  belowT: number;
  /** Quantité visée par rachat (T, best effort). */
  buyT: number;
}

export type AutoTradeDestination = 'tank' | 'survival_food' | 'survival_water' | 'cargo';

/**
 * Réservoir de DESTINATION d'une ressource rachetée : le carburant du
 * type du réservoir va au TANK, les familles food/water vont aux
 * PROVISIONS de survie (1 T = 1 T [TUNE-v1]), le reste en SOUTE.
 */
export function autoTradeDestination(
  resource: ResourceId,
  tankFuelType: string,
): AutoTradeDestination {
  if (resource === `fuel_${tankFuelType}`) return 'tank';
  if ((FOOD_RESOURCES as readonly string[]).includes(resource)) {
    return 'survival_food';
  }
  if (resource === 'water') return 'survival_water';
  return 'cargo';
}

/** Valide une liste de règles (bornes simples, unicité par ressource). */
export function validateAutoTradeRules(rules: AutoTradeRule[]): string | null {
  if (rules.length > MAX_AUTO_TRADE_RULES) {
    return `Au plus ${MAX_AUTO_TRADE_RULES} règles`;
  }
  const seen = new Set<string>();
  for (const r of rules) {
    if (!Number.isFinite(r.belowT) || r.belowT < 0) return 'Seuil invalide';
    if (!Number.isFinite(r.buyT) || r.buyT <= 0) return 'Quantité invalide';
    if (seen.has(r.resource)) return 'Une règle par ressource';
    seen.add(r.resource);
  }
  return null;
}

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Markets” and “Merchant-planet innate trading”; GAME_BOOK.md §9/§13; DESIGN_GUIDE.md §11.1–§11.2. */
/**
 * Marchés — règles pures (GB §9/§13, DG §11.1).
 * v1 : mode taux fixe uniquement (l'AMM arrive avec les marchés L2).
 * Un slot est DIRECTIONNEL : le marché ACHÈTE `give` et paie en `get` au
 * taux posté (get par 1 give) — le taux est le prix, aucun frais séparé en
 * taux fixe [TUNE-v1 ; les frais en points de base sont un mécanisme AMM].
 */
import { ALL_RESOURCE_IDS, type ResourceId } from './resources.js';

/** Slots d'échange automatisés = niveau du marché (canon GB §9). */
export const MARKET_SLOTS_BY_LEVEL: Record<1 | 2 | 3, number> = {
  1: 1,
  2: 2,
  3: 3,
};

/** Re-tarification d'un slot fixe : au plus 1/min (DG §11.1 [TUNE]). */
export const REPRICE_MIN_INTERVAL_MS = 60_000;

export interface MarketSlot {
  /** Ressource que le marché ACHÈTE (donnée par le visiteur). */
  give: ResourceId;
  /** Ressource que le marché PAIE (reçue par le visiteur). */
  get: ResourceId;
  /** T de `get` payées par tonne de `give`. */
  rate: number;
  /** Limite quotidienne en T de `give` (0 = aucune). [TUNE] */
  dailyLimitT: number;
  /** Limite absolue cumulée en T de `give` (0 = aucune). [TUNE] */
  absoluteLimitT: number;
  /** Whitelist de joueurs (vide = ouvert à quiconque est à quai). */
  whitelist: string[];
  /** Horodatage de la dernière tarification (throttle 1/min). */
  rateUpdatedAtMs: number;
}

export type SlotInput = Omit<MarketSlot, 'rateUpdatedAtMs'>;

/** Valide un slot ; retourne un message d'erreur ou null. */
export function validateMarketSlot(input: {
  give: string;
  get: string;
  rate: number;
  dailyLimitT: number;
  absoluteLimitT: number;
  whitelist: string[];
}): string | null {
  if (!ALL_RESOURCE_IDS.includes(input.give as ResourceId)) {
    return 'Ressource achetée inconnue';
  }
  if (!ALL_RESOURCE_IDS.includes(input.get as ResourceId)) {
    return 'Ressource payée inconnue';
  }
  if (input.give === input.get) return 'Une paire relie deux ressources distinctes';
  if (!Number.isFinite(input.rate) || input.rate <= 0) return 'Taux invalide';
  if (!Number.isFinite(input.dailyLimitT) || input.dailyLimitT < 0) {
    return 'Limite quotidienne invalide';
  }
  if (!Number.isFinite(input.absoluteLimitT) || input.absoluteLimitT < 0) {
    return 'Limite absolue invalide';
  }
  if (!Array.isArray(input.whitelist)) return 'Whitelist invalide';
  return null;
}

/** T de `get` payées pour `giveT` de `give` au taux fixe. */
export function fixedTradeOutput(giveT: number, rate: number): number {
  return giveT * rate;
}

/**
 * Commerce inné du monde marchand (GB §9) : sous gouvernance Mercantile,
 * survie (eau, nourriture, oxygène) ET carburant se vendent SANS bâtiment
 * de marché. Le propriétaire fixe un plancher keep-for-self par ressource ;
 * seul le surplus au-dessus du plancher est négociable.
 */
export const INNATE_TRADABLE: readonly ResourceId[] = [
  'water',
  'oxygen',
  'food_1',
  'food_2',
  'food_3',
  'fuel_cold',
  'fuel_hot',
  'fuel_gas',
];

export interface InnateOffer {
  /** Ressource VENDUE par le monde marchand (∈ INNATE_TRADABLE). */
  sell: ResourceId;
  /** Ressource exigée en paiement. */
  want: ResourceId;
  /** T de `want` exigées par tonne de `sell` vendue. */
  price: number;
  /** Plancher keep-for-self en T : jamais entamé par le commerce. */
  keepFloorT: number;
}

/** Valide une offre innée ; message d'erreur ou null. */
export function validateInnateOffer(input: {
  sell: string;
  want: string;
  price: number;
  keepFloorT: number;
}): string | null {
  if (!INNATE_TRADABLE.includes(input.sell as ResourceId)) {
    return 'Seuls survie et carburant se vendent innément (GB §9)';
  }
  if (!ALL_RESOURCE_IDS.includes(input.want as ResourceId)) {
    return 'Ressource de paiement inconnue';
  }
  if (input.sell === input.want) return 'Vendre contre soi-même n\'est pas un prix';
  if (!Number.isFinite(input.price) || input.price <= 0) return 'Prix invalide';
  if (!Number.isFinite(input.keepFloorT) || input.keepFloorT < 0) {
    return 'Plancher invalide';
  }
  return null;
}

/** Surplus négociable au-dessus du plancher keep-for-self. */
export function tradableAboveFloor(stockT: number, keepFloorT: number): number {
  return Math.max(0, stockT - keepFloorT);
}

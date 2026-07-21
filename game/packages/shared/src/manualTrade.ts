/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §6. */
/**
 * Canal manuel (GB §9 « Markets & manual trade », DG §6 round 7) — règles
 * PURES.
 *
 * Canon : tout joueur À QUAI (commerce dock) peut parcourir les warehouses
 * PUBLICS d'un monde et envoyer une offre d'achat manuelle « à n'importe
 * quel prix » sur ce qui y est visible ; la résolution est manuelle entre
 * joueurs (accepter / décliner — la contre-offre v1 = décliner puis
 * nouvelle offre, annoncé). Limites round 7 : 1 offre OUVERTE par
 * (acheteur, item), 20 créations par 24 h et par compte, expiration
 * automatique 48 h [TUNE].
 *
 * [TUNE-v1 interp, JOURNAL] :
 * - l'« item » v1 = (monde, ressource fongible) — les véhicules/objets en
 *   entrepôt arrivent avec les enchères (P4) ;
 * - « any price » = bundle explicite « je prends X de A, je paie Y de B » ;
 *   une PURCHASE offer paie quelque chose : give > 0 ;
 * - l'expiration court en heures RÉELLES (règle sociale, pas de
 *   simulation — TIME_SCALE n'accélère que les événements).
 */

/** Expiration automatique d'une offre ouverte (heures réelles). [TUNE] */
export const MANUAL_OFFER_TTL_HOURS = 48;
/** Créations d'offres par tranche de 24 h et par compte. [TUNE] */
export const MANUAL_OFFER_DAILY_MAX = 20;
/** Offres ouvertes simultanées par (acheteur, monde, ressource). */
export const MANUAL_OFFER_PER_ITEM_MAX = 1;
/** Garde-fou de saisie (tonnes) — bien au-delà de toute soute v1. */
export const MANUAL_OFFER_MAX_TONS = 1_000_000;

export interface ManualOfferBundle {
  getResource: string;
  getTons: number;
  giveResource: string;
  giveTons: number;
}

/**
 * Validation d'un bundle d'offre. Retourne un message d'erreur, ou null si
 * valide. `isResource` vient du catalogue appelant (pas de dépendance
 * circulaire).
 */
export function validateManualOffer(
  bundle: ManualOfferBundle,
  isResource: (r: string) => boolean,
): string | null {
  if (!isResource(bundle.getResource)) {
    return `Ressource inconnue : ${bundle.getResource}`;
  }
  if (!isResource(bundle.giveResource)) {
    return `Ressource inconnue : ${bundle.giveResource}`;
  }
  if (bundle.getResource === bundle.giveResource) {
    return 'Prendre et payer la même ressource n\'a pas de sens';
  }
  for (const [label, tons] of [
    ['demandée', bundle.getTons],
    ['payée', bundle.giveTons],
  ] as const) {
    if (!Number.isFinite(tons) || tons <= 0) {
      return `Quantité ${label} invalide`;
    }
    if (tons > MANUAL_OFFER_MAX_TONS) {
      return `Quantité ${label} démesurée`;
    }
  }
  return null;
}

/**
 * Les limites round 7 autorisent-elles une nouvelle offre ? Retourne un
 * message d'erreur, ou null si permise.
 */
export function canOpenOffer(input: {
  openForItem: number;
  createdLast24h: number;
}): string | null {
  if (input.openForItem >= MANUAL_OFFER_PER_ITEM_MAX) {
    return 'Une seule offre ouverte par ressource et par monde';
  }
  if (input.createdLast24h >= MANUAL_OFFER_DAILY_MAX) {
    return `Plafond de ${MANUAL_OFFER_DAILY_MAX} offres par 24 h atteint`;
  }
  return null;
}

/** Échéance d'une offre créée à `createdAtMs` (heures réelles). */
export function offerExpiresAtMs(createdAtMs: number): number {
  return createdAtMs + MANUAL_OFFER_TTL_HOURS * 3600 * 1000;
}

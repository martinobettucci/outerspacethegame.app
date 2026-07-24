/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Governance v1”; GAME_BOOK.md §11/§21; DESIGN_GUIDE.md §4.1. */
/**
 * Gouvernance v1 (GB §11/§21, DG §4.1) — règles PURES.
 *
 * Canon : les petits mondes tournent SANS gouverneur ; les moyens en
 * exigent 1 ; les grands 3 — sinon le monde tourne à demi-efficacité.
 * Un gouverneur est un PNJ (grade gouverneur = rareté ≥ rare, chunk R),
 * l'installation est PERMANENTE, le masque effectif = INTERSECTION des
 * archétypes gouvernants, et la préview du masque résultant est une
 * partie OBLIGATOIRE de la mécanique (le choix est irréversible).
 *
 * G (DG §4.1) : pleinement gouverné = 1.0 ; sous l'exigence = 0.5 (canon
 * pour les grands, généralisé aux moyens [TUNE-v1 interp, JOURNAL]) ;
 * +2 % par tier de rareté du gouverneur INSTALLÉ le plus faible [TUNE].
 *
 * Vaisseau personnel parqué (GB §21 « adds governance capability when
 * parked ») [TUNE-v1 interp] : à quai sur SON monde, il compte comme UN
 * gouverneur temporaire (masque = archétype du compte — déjà en place —
 * ET satisfaction de l'exigence) ; il ne porte AUCUN bonus de rareté et
 * ne dilue pas celui des installés.
 */
import type { PlanetSize } from './types.js';

/** Gouverneurs REQUIS par taille (canon GB §11). */
export const GOVERNORS_REQUIRED: Record<PlanetSize, number> = {
  s: 0,
  m: 1,
  l: 3,
};

/** Capacité d'INSTALLATION par taille (= l'exigence — canon : les petits
 * tournent sans gouverneur, un moyen en a UN, un grand TROIS). */
export const GOVERNORS_MAX: Record<PlanetSize, number> = { s: 0, m: 1, l: 3 };

/** Multiplicateur sous l'exigence (canon « half efficiency »). */
export const GOVERNANCE_UNDERSTAFFED_G = 0.5;

/** Bonus par tier de rareté du gouverneur installé le plus faible. [TUNE] */
export const GOVERNANCE_RARITY_BONUS_PER_TIER = 0.02;

export interface GovernanceInput {
  size: PlanetSize;
  /** Tiers de rareté (0 = common … 4 = legendary) des PNJ INSTALLÉS. */
  installedTiers: readonly number[];
  /** Vaisseau personnel du propriétaire À QUAI sur ce monde. */
  personalShipParked: boolean;
}

export interface GovernanceResult {
  g: number;
  required: number;
  /** Installés + (1 si vaisseau personnel parqué). */
  governedCount: number;
  fullyGoverned: boolean;
}

/** Multiplicateur de gouvernance G (quantifié 1e-6). */
export function governanceMultiplier(input: GovernanceInput): GovernanceResult {
  const required = GOVERNORS_REQUIRED[input.size];
  const governedCount =
    input.installedTiers.length + (input.personalShipParked ? 1 : 0);
  const fullyGoverned = governedCount >= required;
  let g = fullyGoverned ? 1 : GOVERNANCE_UNDERSTAFFED_G;
  // Le bonus récompense un ENSEMBLE installé de qualité — il n'existe que
  // pleinement gouverné, sur les mondes qui exigent une gouvernance, et
  // seulement via les PNJ (le vaisseau parqué n'apporte ni ne dilue).
  if (fullyGoverned && required > 0 && input.installedTiers.length > 0) {
    g += GOVERNANCE_RARITY_BONUS_PER_TIER * Math.min(...input.installedTiers);
  }
  return {
    g: Math.round(g * 1e6) / 1e6,
    required,
    governedCount,
    fullyGoverned,
  };
}

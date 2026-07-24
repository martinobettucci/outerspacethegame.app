/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Universe gen” and §P3 “Star harvest”; GAME_BOOK.md §22; DESIGN_GUIDE.md §2.1/§8.8. */
/**
 * Étoiles & récolte (GB §22, DG §2.1/§8.8) — règles PURES.
 *
 * Le stock de carburant d'une étoile est ÉNORME mais fini, et totalement
 * ILLISIBLE (canon : « no way to read how much fuel remains ») — la seule
 * alerte de l'univers est le FLARE sous ~5 % du stock initial, visible de
 * quiconque a l'étoile sous scope. La récolte est un gradient de distance :
 * rendement en s'approchant, dégâts de coque plus près encore (les dégâts
 * arrivent avec l'usure de coque — chunk climate shields, annoncé).
 */
import type { ResourceId } from './resources.js';

/** Portée maximale du rig (au-delà : rendement nul) [TUNE]. */
export const HARVEST_D_MAX_PC = 8;
/** Distance de sécurité (en deçà : dégâts de coque, chunk usure) [TUNE]. */
export const HARVEST_D_SAFE_PC = 5;
/** Rendement maximal au contact (u/jour) [TUNE]. */
export const HARVEST_R_MAX_U_PER_DAY = 120;
/** Dégâts maximaux au contact (HP/jour) [TUNE] — usure : chunk dédié. */
export const HARVEST_D_MAX_HP_PER_DAY = 80;
/** Fraction du stock INITIAL sous laquelle l'étoile flare (canon ~5 %). */
export const STAR_FLARE_FRACTION = 0.05;

/** Coût du harvest rig (accessoire atelier, DG §8.8) [TUNE]. */
export const HARVEST_RIG_COST: Partial<Record<ResourceId, number>> = {
  steel_l: 20,
  crystal_temperate: 5,
  gold: 5,
};

/**
 * Rendement de récolte (u/jour) à la distance d (pc) — R_max × (1 − d/d_max)²
 * (DG §8.8). Nul au-delà de d_max ; jamais négatif.
 */
export function harvestYieldPerDay(dPc: number): number {
  if (dPc >= HARVEST_D_MAX_PC) return 0;
  const x = 1 - Math.max(0, dPc) / HARVEST_D_MAX_PC;
  return HARVEST_R_MAX_U_PER_DAY * x * x;
}

/**
 * Dégâts de coque (HP/jour) à la distance d — D_max × ((d_safe − d)/d_safe)²
 * en deçà de d_safe, 0 sinon (DG §8.8). Exposé dès maintenant pour l'UI
 * (préviewer le risque) ; l'application arrive avec l'usure de coque.
 */
export function harvestHullDamagePerDay(dPc: number): number {
  if (dPc >= HARVEST_D_SAFE_PC) return 0;
  const x = (HARVEST_D_SAFE_PC - Math.max(0, dPc)) / HARVEST_D_SAFE_PC;
  return HARVEST_D_MAX_HP_PER_DAY * x * x;
}

/** L'étoile flare-t-elle ? (stock courant ≤ 5 % du stock initial). */
export function starIsFlaring(currentStockU: number, initialStockU: number): boolean {
  return initialStockU > 0 && currentStockU <= STAR_FLARE_FRACTION * initialStockU;
}

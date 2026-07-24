/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Markets” and “Cells-star routing”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.2. */
/**
 * Pools AMM des marchés L2+ (GB §13, DG §11.2) — maths PURES.
 *
 * Canon :
 * - pool = UN slot de marché = UNE paire physique ; produit constant
 *   x·y = k ; spot = ry/rx (y par unité de x) ;
 * - le RATIO du dépôt initial du seeder EST le prix initial (« seeding is
 *   a pricing decision ») ;
 * - frais en basis points, jamais ambigus : 25 bp/jambe aux LP + 25 bp de
 *   commission maison au propriétaire du marché [TUNE round 4a] ; un
 *   marché L3 abaisse la jambe LP à 20 bp ;
 * - les réserves COMPTENT dans le cap de stockage (stock physique de la
 *   planète — DG §3.3b) ;
 * - ne JAMAIS utiliser le spot comme oracle d'un autre mécanisme (les
 *   pods utilisent le census §11.5).
 *
 * v1 (annoncé, JOURNAL) : LP = propriétaire uniquement (les LP visiteurs,
 * liens de conquête et retrait garanti arrivent avec les shares P4) — la
 * jambe LP s'accumule DANS la réserve d'entrée (k croît, la valeur revient
 * au propriétaire au retrait) ; la commission maison va directement au
 * stock planétaire.
 */
import type { ResourceId } from './resources.js';

/** Jambe LP par défaut (bp). [TUNE] */
export const AMM_FEE_LP_BP = 25;
/** Jambe LP d'un marché L3 (canon : « L3 lowers the LP leg »). */
export const AMM_FEE_LP_BP_L3 = 20;
/** Commission maison (bp), au stock du monde. [TUNE round 4a] */
export const AMM_FEE_HOUSE_BP = 25;
/** Réserve minimale par jambe au seed (garde-fou anti-poussière). [TUNE-v1] */
export const AMM_MIN_RESERVE_T = 1;

export interface AmmPool {
  x: ResourceId;
  y: ResourceId;
  rx: number;
  ry: number;
  seededAtMs: number;
}

/** Jambe LP effective selon le niveau du marché. */
export function ammLpFeeBp(marketLevel: number): number {
  return marketLevel >= 3 ? AMM_FEE_LP_BP_L3 : AMM_FEE_LP_BP;
}

/** Prix spot : T de y par T de x. */
export function ammSpot(pool: Pick<AmmPool, 'rx' | 'ry'>): number {
  return pool.ry / pool.rx;
}

/** Valide un seed de pool ; message d'erreur ou null. */
export function validateAmmSeed(
  input: { x: string; y: string; depositX: number; depositY: number },
  isResource: (r: string) => boolean,
): string | null {
  if (!isResource(input.x)) return `Ressource inconnue : ${input.x}`;
  if (!isResource(input.y)) return `Ressource inconnue : ${input.y}`;
  if (input.x === input.y) return 'Une paire relie deux ressources distinctes';
  for (const [leg, t] of [
    ['x', input.depositX],
    ['y', input.depositY],
  ] as const) {
    if (!Number.isFinite(t) || t < AMM_MIN_RESERVE_T) {
      return `Réserve ${leg} insuffisante (≥ ${AMM_MIN_RESERVE_T} T)`;
    }
  }
  return null;
}

/**
 * Slot de marché en mode AMM (« pool = one market trade SLOT ») — cohabite
 * avec les slots taux fixe dans le même tableau `config.slots`.
 */
export interface AmmSlot {
  mode: 'amm';
  pool: AmmPool;
  /** Limite quotidienne en T DONNÉES par le trader (0 = aucune). [TUNE] */
  dailyLimitT: number;
  /** Limite absolue cumulée en T données (0 = aucune). [TUNE] */
  absoluteLimitT: number;
  /** Whitelist de joueurs (vide = ouvert à quiconque est à quai). */
  whitelist: string[];
}

export function isAmmSlot(slot: unknown): slot is AmmSlot {
  return (
    !!slot && (slot as { mode?: string }).mode === 'amm' &&
    typeof (slot as AmmSlot).pool === 'object'
  );
}

export interface AmmQuote {
  /** T reçues par le trader (jambe de sortie). */
  outT: number;
  /** Jambe LP : reste dans la réserve d'ENTRÉE (k croît). */
  lpFeeT: number;
  /** Commission maison : au stock planétaire du propriétaire. */
  houseFeeT: number;
  /** Réserves de la paire APRÈS l'échange. */
  newRIn: number;
  newROut: number;
  /** Spot sortie/entrée après l'échange (dérive du prix). */
  spotAfter: number;
}

/**
 * Cotation à produit constant, frais sur la jambe d'ENTRÉE :
 * dxEff = give × (1 − (lp + house)/10000) ; out = rOut·dxEff/(rIn + dxEff).
 * La jambe LP rejoint la réserve d'entrée (hors produit : k croît — les
 * frais rémunèrent la liquidité) ; la maison sort du circuit du pool.
 */
export interface AmmRouteQuote {
  /** T reçues au bout de la route. */
  outT: number;
  /** Cotations de chaque jambe, dans l'ordre d'exécution. */
  legs: AmmQuote[];
  /** T de la ressource intermédiaire (0 pour une route directe). */
  midT: number;
}

/**
 * Route à DEUX jambes (GB §13 « double fee ») : la sortie de la jambe 1
 * nourrit la jambe 2 — l'intermédiaire ne touche jamais la soute — et
 * CHAQUE jambe prélève ses propres frais (LP + maison de SON pool).
 */
export function ammRouteQuote(
  leg1: { rIn: number; rOut: number; lpBp: number; houseBp: number },
  leg2: { rIn: number; rOut: number; lpBp: number; houseBp: number },
  giveT: number,
): AmmRouteQuote {
  const q1 = ammQuote(leg1.rIn, leg1.rOut, giveT, leg1.lpBp, leg1.houseBp);
  const q2 = ammQuote(leg2.rIn, leg2.rOut, q1.outT, leg2.lpBp, leg2.houseBp);
  return { outT: q2.outT, legs: [q1, q2], midT: q1.outT };
}

export function ammQuote(
  rIn: number,
  rOut: number,
  giveT: number,
  lpBp: number,
  houseBp: number,
): AmmQuote {
  if (!(rIn > 0) || !(rOut > 0)) {
    throw new Error('Pool non seedé');
  }
  if (!Number.isFinite(giveT) || giveT <= 0) {
    throw new Error('Quantité invalide');
  }
  const lpFeeT = (giveT * lpBp) / 10_000;
  const houseFeeT = (giveT * houseBp) / 10_000;
  const dxEff = giveT - lpFeeT - houseFeeT;
  const outT = (rOut * dxEff) / (rIn + dxEff);
  const newRIn = rIn + dxEff + lpFeeT;
  const newROut = rOut - outT;
  return {
    outT,
    lpFeeT,
    houseFeeT,
    newRIn,
    newROut,
    spotAfter: newROut / newRIn,
  };
}

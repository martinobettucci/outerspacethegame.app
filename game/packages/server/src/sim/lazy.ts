/**
 * Évaluation paresseuse (value, rate, t0) — DESIGN_GUIDE §1.
 * Les quantités continues sont stockées avec leur taux ; la valeur à
 * l'instant t est une fonction PURE (déterminisme canon : re-calcul
 * bit-identique quel que soit le lecteur, API ou worker).
 */
import { GAME_DAY_SECONDS } from '@atg/shared';

export interface LazyQuantity {
  amount: number;
  ratePerDay: number;
  /** Epoch millisecondes de la dernière matérialisation. */
  asOfMs: number;
}

/** Valeur à l'instant t (ms), bornée [min, max]. */
export function evalLazy(
  q: LazyQuantity,
  atMs: number,
  bounds?: { min?: number; max?: number },
): number {
  const elapsedDays = Math.max(0, atMs - q.asOfMs) / (GAME_DAY_SECONDS * 1000);
  let v = q.amount + q.ratePerDay * elapsedDays;
  if (bounds?.min !== undefined) v = Math.max(bounds.min, v);
  if (bounds?.max !== undefined) v = Math.min(bounds.max, v);
  return v;
}

/**
 * Instant (ms) où la quantité atteint `target`, ou null si jamais
 * (taux nul ou dans la mauvaise direction). Sert à planifier les
 * événements de bord : deposit-dry, stock-cap, seuils de frein.
 */
export function whenReaches(q: LazyQuantity, target: number): number | null {
  if (q.ratePerDay === 0) return null;
  const days = (target - q.amount) / q.ratePerDay;
  if (days < 0) return null;
  return q.asOfMs + days * GAME_DAY_SECONDS * 1000;
}

/** Matérialise la quantité à t et applique un nouveau taux. */
export function rebase(
  q: LazyQuantity,
  atMs: number,
  newRatePerDay: number,
  bounds?: { min?: number; max?: number },
): LazyQuantity {
  return {
    amount: evalLazy(q, atMs, bounds),
    ratePerDay: newRatePerDay,
    asOfMs: atMs,
  };
}

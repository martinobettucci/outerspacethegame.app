/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Deterministic sim core” / “Unified game clock”; docs/GAME_BOOK.md §15; docs/DESIGN_GUIDE.md §1. */
/**
 * Évaluation paresseuse (value, rate, t0) — DESIGN_GUIDE §1.
 * Les quantités continues sont stockées avec leur taux ; la valeur à
 * l'instant t est une fonction PURE (déterminisme canon : re-calcul
 * bit-identique quel que soit le lecteur, API ou worker).
 *
 * Horloge de jeu unifiée (JOURNAL 2026-07-24, DG §1) : le temps de JEU
 * s'écoule `timeScale` fois plus vite que le temps réel (game-secondes par
 * seconde réelle ; 1 en production). Les horodatages restent stockés en ms
 * RÉELLES ; l'échelle s'applique à la DURÉE écoulée au calcul, exactement
 * comme les minuteries d'action divisent leur durée réelle par `timeScale`.
 * `timeScale` est explicite (contrat pur) et provient d'UNE constante de
 * déploiement (`config.TIME_SCALE`) partagée par l'API et le worker : à
 * `timeScale` fixé, `evalLazy` reste bit-identique quel que soit le lecteur.
 * À `timeScale = 1`, toutes les formules se réduisent au comportement réel
 * (rétro-compatibilité par construction ; prod inchangée).
 */
import { GAME_DAY_SECONDS } from '@atg/shared';

export interface LazyQuantity {
  amount: number;
  ratePerDay: number;
  /** Epoch millisecondes de la dernière matérialisation. */
  asOfMs: number;
}

const GAME_DAY_MS = GAME_DAY_SECONDS * 1000;

/**
 * Valeur à l'instant réel t (ms), bornée [min, max]. `timeScale` convertit
 * la durée réelle écoulée en durée de JEU (`timeScale` jours-jeu par jour
 * réel).
 */
export function evalLazy(
  q: LazyQuantity,
  atMs: number,
  timeScale: number,
  bounds?: { min?: number; max?: number },
): number {
  const scale = Math.max(timeScale, 1e-9);
  const elapsedGameDays = (Math.max(0, atMs - q.asOfMs) / GAME_DAY_MS) * scale;
  let v = q.amount + q.ratePerDay * elapsedGameDays;
  if (bounds?.min !== undefined) v = Math.max(bounds.min, v);
  if (bounds?.max !== undefined) v = Math.min(bounds.max, v);
  return v;
}

/**
 * Instant RÉEL (ms) où la quantité atteint `target`, ou null si jamais
 * (taux nul ou dans la mauvaise direction). Sert à planifier les
 * événements de bord : deposit-dry, stock-cap, seuils de frein. Le résultat
 * est déjà en temps réel (durée-jeu ÷ `timeScale`) : il se branche
 * directement sur `enqueue(due_at)` sans conversion supplémentaire.
 */
export function whenReaches(
  q: LazyQuantity,
  target: number,
  timeScale: number,
): number | null {
  if (q.ratePerDay === 0) return null;
  const gameDays = (target - q.amount) / q.ratePerDay;
  if (gameDays < 0) return null;
  const scale = Math.max(timeScale, 1e-9);
  return q.asOfMs + (gameDays / scale) * GAME_DAY_MS;
}

/**
 * Durée RÉELLE (ms) d'un intervalle exprimé en jours de JEU, sous l'horloge
 * unifiée : `days` jours-jeu s'écoulent en `days × 86 400 000 ÷ timeScale`
 * ms réelles. Sert à planifier les cadences quotidiennes de la simulation
 * (pop_daily, crusader_daily, horloges de mort eau/vivres) au même rythme
 * que l'économie continue. À `timeScale = 1` : durée réelle inchangée.
 */
export function gameDaysToRealMs(days: number, timeScale: number): number {
  return (days * GAME_DAY_MS) / Math.max(timeScale, 1e-9);
}

/** Matérialise la quantité à t (temps réel) et applique un nouveau taux. */
export function rebase(
  q: LazyQuantity,
  atMs: number,
  newRatePerDay: number,
  timeScale: number,
  bounds?: { min?: number; max?: number },
): LazyQuantity {
  return {
    amount: evalLazy(q, atMs, timeScale, bounds),
    ratePerDay: newRatePerDay,
    asOfMs: atMs,
  };
}

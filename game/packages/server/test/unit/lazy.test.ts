/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Deterministic sim core”; GAME_BOOK.md §15; DESIGN_GUIDE.md §1. */
import { describe, expect, it } from 'vitest';
import { evalLazy, rebase, whenReaches } from '../../src/sim/lazy.js';

const DAY = 86_400_000;

describe('évaluation paresseuse (value, rate, t0) — DG §1', () => {
  it('interpole linéairement au taux journalier', () => {
    const q = { amount: 100, ratePerDay: 10, asOfMs: 0 };
    expect(evalLazy(q, DAY)).toBe(110);
    expect(evalLazy(q, 2.5 * DAY)).toBe(125);
  });

  it('est pure et déterministe : deux lecteurs obtiennent le même bit', () => {
    const q = { amount: 33.7, ratePerDay: -1.21, asOfMs: 12345 };
    expect(evalLazy(q, 987654321)).toBe(evalLazy(q, 987654321));
  });

  it('borne aux limites min/max (gisement à sec, stock au cap)', () => {
    const dep = { amount: 5, ratePerDay: -10, asOfMs: 0 };
    expect(evalLazy(dep, DAY, { min: 0 })).toBe(0);
    const stock = { amount: 990, ratePerDay: 100, asOfMs: 0 };
    expect(evalLazy(stock, DAY, { max: 1_000 })).toBe(1_000);
  });

  it("n'évalue jamais en arrière (t < t0 ⇒ valeur à t0)", () => {
    const q = { amount: 50, ratePerDay: 10, asOfMs: DAY };
    expect(evalLazy(q, 0)).toBe(50);
  });

  it('whenReaches planifie le bord exact (deposit-dry)', () => {
    const dep = { amount: 20, ratePerDay: -10, asOfMs: 0 };
    expect(whenReaches(dep, 0)).toBe(2 * DAY);
    // Jamais atteint : mauvais sens ou taux nul.
    expect(whenReaches({ amount: 20, ratePerDay: 10, asOfMs: 0 }, 0)).toBeNull();
    expect(whenReaches({ amount: 20, ratePerDay: 0, asOfMs: 0 }, 0)).toBeNull();
  });

  it('rebase matérialise puis applique le nouveau taux sans perte', () => {
    const q = { amount: 100, ratePerDay: 10, asOfMs: 0 };
    const r = rebase(q, DAY, -5);
    expect(r).toEqual({ amount: 110, ratePerDay: -5, asOfMs: DAY });
    expect(evalLazy(r, 2 * DAY)).toBe(105);
  });
});

/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Deterministic sim core” / “Unified game clock”; docs/GAME_BOOK.md §15; docs/DESIGN_GUIDE.md §1. */
import { describe, expect, it } from 'vitest';
import {
  evalLazy,
  gameDaysToRealMs,
  rebase,
  whenReaches,
} from '../../src/sim/lazy.js';

const DAY = 86_400_000;

describe('évaluation paresseuse (value, rate, t0) — DG §1', () => {
  it('interpole linéairement au taux journalier (échelle 1 = temps réel)', () => {
    const q = { amount: 100, ratePerDay: 10, asOfMs: 0 };
    expect(evalLazy(q, DAY, 1)).toBe(110);
    expect(evalLazy(q, 2.5 * DAY, 1)).toBe(125);
  });

  it('est pure et déterministe : deux lecteurs obtiennent le même bit', () => {
    const q = { amount: 33.7, ratePerDay: -1.21, asOfMs: 12345 };
    expect(evalLazy(q, 987654321, 1)).toBe(evalLazy(q, 987654321, 1));
    // Déterminisme À échelle donnée : même échelle ⇒ même bit.
    expect(evalLazy(q, 987654321, 3600)).toBe(evalLazy(q, 987654321, 3600));
  });

  it('borne aux limites min/max (gisement à sec, stock au cap)', () => {
    const dep = { amount: 5, ratePerDay: -10, asOfMs: 0 };
    expect(evalLazy(dep, DAY, 1, { min: 0 })).toBe(0);
    const stock = { amount: 990, ratePerDay: 100, asOfMs: 0 };
    expect(evalLazy(stock, DAY, 1, { max: 1_000 })).toBe(1_000);
  });

  it("n'évalue jamais en arrière (t < t0 ⇒ valeur à t0)", () => {
    const q = { amount: 50, ratePerDay: 10, asOfMs: DAY };
    expect(evalLazy(q, 0, 1)).toBe(50);
    expect(evalLazy(q, 0, 3600)).toBe(50);
  });

  it('whenReaches planifie le bord exact (deposit-dry) à échelle 1', () => {
    const dep = { amount: 20, ratePerDay: -10, asOfMs: 0 };
    expect(whenReaches(dep, 0, 1)).toBe(2 * DAY);
    // Jamais atteint : mauvais sens ou taux nul.
    expect(whenReaches({ amount: 20, ratePerDay: 10, asOfMs: 0 }, 0, 1)).toBeNull();
    expect(whenReaches({ amount: 20, ratePerDay: 0, asOfMs: 0 }, 0, 1)).toBeNull();
  });

  it('rebase matérialise puis applique le nouveau taux sans perte', () => {
    const q = { amount: 100, ratePerDay: 10, asOfMs: 0 };
    const r = rebase(q, DAY, -5, 1);
    expect(r).toEqual({ amount: 110, ratePerDay: -5, asOfMs: DAY });
    expect(evalLazy(r, 2 * DAY, 1)).toBe(105);
  });
});

describe('horloge de jeu unifiée — TIME_SCALE accélère la simulation (DG §1, JOURNAL 2026-07-24)', () => {
  it("evalLazy : l'écoulé RÉEL est multiplié par timeScale (jours-jeu)", () => {
    const q = { amount: 100, ratePerDay: 24, asOfMs: 0 };
    // 1 jour réel × échelle 24 = 24 jours-jeu écoulés ⇒ +24×24.
    expect(evalLazy(q, DAY, 24)).toBe(100 + 24 * 24);
    // Dev : timeScale=3600 (1 s réelle = 1 h-jeu). Après 1 s réelle (1000 ms),
    // il s'écoule 1 h-jeu = 1/24 jour-jeu ⇒ +24/24 = +1 unité.
    expect(evalLazy(q, 1_000, 3600)).toBeCloseTo(101, 9);
    // Après 24 s réelles = 1 jour-jeu complet ⇒ +24.
    expect(evalLazy(q, 24_000, 3600)).toBeCloseTo(124, 9);
  });

  it('timeScale=1 se réduit exactement au comportement temps réel (rétro-compat)', () => {
    const q = { amount: 500, ratePerDay: -7.5, asOfMs: 123 };
    const at = 123 + 3.3 * DAY;
    // Référence : formule temps réel explicite.
    const expected = 500 + -7.5 * ((at - 123) / DAY);
    expect(evalLazy(q, at, 1)).toBe(expected);
  });

  it("whenReaches renvoie l'instant RÉEL = durée-jeu ÷ timeScale (prêt pour enqueue)", () => {
    const dep = { amount: 20, ratePerDay: -10, asOfMs: 0 };
    // 2 jours-JEU pour tarir. À échelle 3600 ⇒ 2 jours-jeu / 3600 en temps réel.
    expect(whenReaches(dep, 0, 3600)).toBeCloseTo((2 * DAY) / 3600, 6);
    // 48 s réelles exactement (2×86400/3600 = 48).
    expect(whenReaches(dep, 0, 3600)).toBeCloseTo(48_000, 6);
    // Cohérence boucle : la valeur RETOMBE à la cible à l'instant renvoyé.
    const at = whenReaches(dep, 0, 3600)!;
    expect(evalLazy(dep, at, 3600, { min: 0 })).toBeCloseTo(0, 9);
  });

  it('rebase honore timeScale à la matérialisation', () => {
    const q = { amount: 100, ratePerDay: 240, asOfMs: 0 };
    // 1 s réelle à échelle 3600 = 1 h-jeu ⇒ +240/24 = +10.
    const r = rebase(q, 1_000, -5, 3600);
    expect(r.amount).toBeCloseTo(110, 9);
    expect(r).toMatchObject({ ratePerDay: -5, asOfMs: 1_000 });
  });

  it('gameDaysToRealMs : les cadences quotidiennes se compressent par timeScale', () => {
    // 1 jour-jeu à échelle 1 = 1 jour réel (prod / tests : inchangé).
    expect(gameDaysToRealMs(1, 1)).toBe(DAY);
    // Dev : 1 jour-jeu à échelle 3600 = 24 s réelles.
    expect(gameDaysToRealMs(1, 3600)).toBeCloseTo(24_000, 6);
    // Horloge de mort eau (3 jours-jeu) à échelle 3600 = 72 s réelles.
    expect(gameDaysToRealMs(3, 3600)).toBeCloseTo(72_000, 6);
    // Cohérence avec whenReaches (même conversion durée-jeu → temps réel).
    const dep = { amount: 10, ratePerDay: -5, asOfMs: 0 };
    expect(whenReaches(dep, 0, 3600)).toBeCloseTo(gameDaysToRealMs(2, 3600), 6);
  });
});

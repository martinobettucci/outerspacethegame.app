/** @verifies This test file verifies: docs/MASTER_PLAN.md §W8; GAME_BOOK.md §14; DESIGN_GUIDE.md §8. */
/** W8 — Crusader : ventilation des migrants (proportions d'âges, cap). */
import { describe, expect, it } from 'vitest';
import { CRUSADER, crusaderMigrants, isCrusader } from './crusader.js';

describe('W8 — crusaderMigrants', () => {
  it('25 % proportionnels, somme exacte', () => {
    const m = crusaderMigrants({ children: 200, actives: 600, seniors: 200 });
    expect(m.total).toBe(250);
    expect(m.children + m.actives + m.seniors).toBe(250);
    expect(m.children).toBe(50);
    expect(m.seniors).toBe(50);
    expect(m.actives).toBe(150);
  });

  it('cap 2 000 : une mégapole source ne déborde jamais le pont', () => {
    const m = crusaderMigrants({ children: 4000, actives: 12000, seniors: 4000 });
    expect(m.total).toBe(CRUSADER.popCap);
    expect(m.children + m.actives + m.seniors).toBe(CRUSADER.popCap);
  });

  it('source vide : personne ne monte ; isCrusader = combat L seul', () => {
    expect(crusaderMigrants({ children: 0, actives: 0, seniors: 0 }).total).toBe(0);
    expect(isCrusader('combat', 'l')).toBe(true);
    expect(isCrusader('combat', 'm')).toBe(false);
    expect(isCrusader('cargo', 'l')).toBe(false);
  });
});

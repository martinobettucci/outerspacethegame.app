/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22. */
import { describe, expect, it } from 'vitest';
import { conversionOf, CONVERSIONS, isValidRunPct } from './conversions.js';

describe('W9b — défs de conversion', () => {
  it('électrolyse : 1 eau → 1 O2 + 1 H, 20 T/h à 100 % ; L2 réversible', () => {
    expect(CONVERSIONS.electrolyzer!.output).toEqual({ oxygen: 1, hydrogen: 1 });
    expect(CONVERSIONS.electrolyzer!.ratePerHourAt100).toBe(20);
    expect(CONVERSIONS.electrolyzer!.reversible).toBeUndefined();
    expect(CONVERSIONS.electrolyzer_l2!.reversible).toBe(true);
    expect(CONVERSIONS.vivarium!.mode).toBe('continuous');
  });

  it('grades enhanced : débit ×1,5, résolus par conversionOf', () => {
    expect(conversionOf('electrolyzer_enhanced')!.ratePerHourAt100).toBe(30);
    expect(conversionOf('vivarium_enhanced')!.ratePerHourAt100).toBeCloseTo(7.5, 9);
    expect(conversionOf('inconnu')).toBeNull();
  });

  it('réglage par pas de 5 % (0–100) — décision responsable', () => {
    expect(isValidRunPct(0)).toBe(true);
    expect(isValidRunPct(5)).toBe(true);
    expect(isValidRunPct(100)).toBe(true);
    expect(isValidRunPct(3)).toBe(false);
    expect(isValidRunPct(105)).toBe(false);
    expect(isValidRunPct(-5)).toBe(false);
  });
});

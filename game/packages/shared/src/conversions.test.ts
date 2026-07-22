/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (taxonomie définitive). */
import { describe, expect, it } from 'vitest';
import { conversionOf, CONVERSIONS, isValidRunPct } from './conversions.js';

describe('W9b — taxonomie définitive des actifs', () => {
  it('CONTINUS : électrolyse (corrigée) et vivarium — mobiles, brûlent du fuel', () => {
    expect(CONVERSIONS.electrolyzer!.mode).toBe('continuous');
    expect(CONVERSIONS.electrolyzer_l2!.mode).toBe('continuous');
    expect((CONVERSIONS.electrolyzer_l2 as { reversible?: boolean }).reversible).toBe(true);
    expect(CONVERSIONS.vivarium!.mode).toBe('continuous');
    expect((CONVERSIONS.vivarium as { fuelUPerHourAt100: number }).fuelUPerHourAt100).toBeGreaterThan(0);
  });

  it('BATCH : cell_decompressor — arrêt, 24 h, zéro fuel brûlé, 1 cell → 50 fuel moteur', () => {
    const d = CONVERSIONS.cell_decompressor!;
    expect(d.mode).toBe('batch');
    expect((d as { processHours: number }).processHours).toBe(24);
    expect(d.input).toEqual({ fuel_cells: 1 });
    expect(d.output).toEqual({ fuel: 50 });
  });

  it('grades enhanced : débit ×1,5 (continus), procédé ÷1,5 (batch)', () => {
    expect((conversionOf('electrolyzer_enhanced') as { ratePerHourAt100: number }).ratePerHourAt100).toBe(30);
    expect((conversionOf('cell_decompressor_enhanced') as { processHours: number }).processHours).toBe(16);
    expect(conversionOf('inconnu')).toBeNull();
  });

  it('réglage par pas de 5 % (0–100)', () => {
    expect(isValidRunPct(0)).toBe(true);
    expect(isValidRunPct(55)).toBe(true);
    expect(isValidRunPct(3)).toBe(false);
    expect(isValidRunPct(105)).toBe(false);
  });
});

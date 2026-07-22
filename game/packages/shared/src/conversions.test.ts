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

  it('W9e CONTINUS : cell_cracker (soute-réservoir < décompresseur), arc_furnace 2:1, med_synth bi-intrant, fab_bay hp_pct', () => {
    const cracker = CONVERSIONS.cell_cracker!;
    expect(cracker.mode).toBe('continuous');
    expect(cracker.output).toEqual({ fuel: 40 }); // < 50 du batch
    expect(CONVERSIONS.arc_furnace!.input).toEqual({ junk: 2 });
    expect(CONVERSIONS.arc_furnace!.output).toEqual({ steel_l: 1 });
    expect(CONVERSIONS.med_synth!.input).toEqual({ water: 1, phosphor: 0.5 });
    const bay = CONVERSIONS.fab_bay!;
    expect(bay.mode).toBe('continuous');
    expect(bay.output).toEqual({ hp_pct: 1 }); // 1 %/h à 100 %
    expect(bay.input).toEqual({ steel_l: 0.5 });
    for (const k of ['cell_cracker', 'arc_furnace', 'med_synth', 'fab_bay']) {
      expect(
        (CONVERSIONS[k] as { fuelUPerHourAt100: number }).fuelUPerHourAt100,
      ).toBeGreaterThan(0); // continus : brûlent du carburant
    }
  });

  it('W9e BATCH : contreparties +10 % (vat/hydroponic/smelting/apothecary), hull_patch_kit +25 % HP pour 1 T', () => {
    // Rendement +10 % vs le ratio continu équivalent.
    expect(CONVERSIONS.electrolysis_vat!.input).toEqual({ water: 20 });
    expect(CONVERSIONS.electrolysis_vat!.output).toEqual({ oxygen: 22, hydrogen: 22 });
    expect(CONVERSIONS.hydroponic_run!.output).toEqual({ food_1: 22 });
    expect(CONVERSIONS.smelting_run!.output).toEqual({ steel_l: 11 });
    expect(CONVERSIONS.apothecary_still!.output).toEqual({ med_1: 11 });
    const patch = CONVERSIONS.hull_patch_kit!;
    expect(patch.mode).toBe('batch');
    expect(patch.input).toEqual({ steel_l: 1 }); // 1 T symbolique
    expect(patch.output).toEqual({ hp_pct: 25 });
    for (const k of [
      'electrolysis_vat', 'hydroponic_run', 'smelting_run',
      'apothecary_still', 'hull_patch_kit',
    ]) {
      expect(CONVERSIONS[k]!.mode).toBe('batch'); // zéro fuel brûlé
    }
  });

  it('réglage par pas de 5 % (0–100)', () => {
    expect(isValidRunPct(0)).toBe(true);
    expect(isValidRunPct(55)).toBe(true);
    expect(isValidRunPct(3)).toBe(false);
    expect(isValidRunPct(105)).toBe(false);
  });
});

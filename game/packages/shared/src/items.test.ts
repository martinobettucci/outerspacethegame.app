/** @verifies This test file verifies: docs/MASTER_PLAN.md §W6; docs/BACKLOG.md §P3 “Ship hulls”; GAME_BOOK.md §14; DESIGN_GUIDE.md §8.2/§8.8. */
/**
 * W6 — catalogue d'items non-fongibles : exhaustivité (règle de
 * complétude), multiplicateurs DG §8.2, capacité d'items AD réveillée.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_GEAR_KEYS,
  canFitGear,
  slotFamilyUsage,
  armorHpMult,
  effectiveTankU,
  engineSpeedMult,
  itemCapacity,
  GEAR,
} from './items.js';

describe('W6 — catalogue ITEMS', () => {
  it('EXHAUSTIF : 1 accessoire + 5 familles × 2 niveaux, clés cohérentes', () => {
    expect(ALL_GEAR_KEYS.sort()).toEqual(
      [
        'advanced_refueling_system',
        'harvest_rig',
        'junk_collector',
        'claim_rig',
        'metamorphic_hull',
        'electrolyzer',
        'electrolyzer_l2',
        'vivarium',
        'cell_decompressor',
        'heat_recycler', 'cryo_larder', 'docking_clamps', 'signal_mirror',
        'survey_suite', 'ballast_shielding', 'flare_dampers', 'trim_vanes',
        'berth_module', 'course_optimizer', 'cargo_netting', 'mooring_winch',
        'bilge_purifier', 'stargate_caller', 'salvage_grapnel',
        'haggler_matrix', 'ore_hopper', 'solar_sails', 'escape_thrusters',
        'heat_recycler_enhanced', 'cryo_larder_enhanced', 'docking_clamps_enhanced',
        'signal_mirror_enhanced', 'survey_suite_enhanced', 'ballast_shielding_enhanced',
        'flare_dampers_enhanced', 'trim_vanes_enhanced', 'berth_module_enhanced',
        'course_optimizer_enhanced', 'cargo_netting_enhanced', 'mooring_winch_enhanced',
        'bilge_purifier_enhanced', 'stargate_caller_enhanced', 'salvage_grapnel_enhanced',
        'haggler_matrix_enhanced', 'ore_hopper_enhanced', 'solar_sails_enhanced',
        'escape_thrusters_enhanced',
        'electrolyzer_enhanced',
        'cell_decompressor_enhanced',
        'electrolyzer_l2_enhanced',
        'vivarium_enhanced',
        // W9e — actifs « recette » restants (× grades enhanced).
        'cell_cracker', 'arc_furnace', 'med_synth', 'fab_bay',
        'electrolysis_vat', 'hydroponic_run', 'smelting_run',
        'apothecary_still', 'hull_patch_kit',
        'cell_cracker_enhanced', 'arc_furnace_enhanced', 'med_synth_enhanced',
        'fab_bay_enhanced', 'electrolysis_vat_enhanced',
        'hydroponic_run_enhanced', 'smelting_run_enhanced',
        'apothecary_still_enhanced', 'hull_patch_kit_enhanced',
        // W9e partie 2 — déplacement/temps (× grades enhanced).
        'ram_scoop', 'gravity_sling', 'jump_primer', 'kedge_winch',
        'deep_scan_pulse', 'cryo_stasis_pod',
        'ram_scoop_enhanced', 'gravity_sling_enhanced',
        'jump_primer_enhanced', 'kedge_winch_enhanced',
        'deep_scan_pulse_enhanced', 'cryo_stasis_pod_enhanced',
        'engine_l2',
        'engine_l3',
        'armor_l2',
        'armor_l3',
        'fuel_l2',
        'fuel_l3',
        'obs_l2',
        'obs_l3',
        'weapon_l2',
        'weapon_l3',
      ].sort(),
    );
    for (const key of ALL_GEAR_KEYS) {
      const d = GEAR[key]!;
      expect(d.key).toBe(key);
      expect(d.fabricationHours).toBeGreaterThan(0);
      expect(d.installHours).toBeGreaterThan(0);
      expect(Object.keys(d.fabricationCost).length).toBeGreaterThan(0);
    }
    // Dormants annoncés : obs/weapon (combat P5).
    expect(GEAR.obs_l2!.dormant).toBe(true);
    expect(GEAR.weapon_l3!.dormant).toBe(true);
    expect(GEAR.advanced_refueling_system!.dormant).toBeUndefined();
  });

  it('multiplicateurs DG §8.2 : moteur ×1,15/×1,30 ; armure ×1,3/×1,6 ; réservoir ×1,5/×2', () => {
    expect(engineSpeedMult({ engine: 2 })).toBeCloseTo(1.15, 9);
    expect(engineSpeedMult({ engine: 3 })).toBeCloseTo(1.3, 9);
    expect(engineSpeedMult({})).toBe(1);
    expect(engineSpeedMult(null)).toBe(1);
    expect(armorHpMult({ armor: 2 })).toBeCloseTo(1.3, 9);
    expect(armorHpMult({ armor: 3 })).toBeCloseTo(1.6, 9);
    expect(effectiveTankU(60, { fuel: 2 })).toBeCloseTo(90, 9);
    expect(effectiveTankU(60, { fuel: 3 })).toBeCloseTo(120, 9);
    expect(effectiveTankU(60, undefined)).toBe(60);
  });

  it('capacité d\'items (AD réveillé) : 50 × mult(1/2/3) par warehouse actif', () => {
    expect(itemCapacity([])).toBe(0);
    expect(itemCapacity([1])).toBe(50);
    expect(itemCapacity([2, 3])).toBe(100 + 150);
  });
});

describe('W9c — familles de slots PARTAGÉES', () => {
  const slots = { accessory: 1, engine: 2, armor: 1, fuel: 2, obs: 0, weapon: 0, cargo: 1 };
  it('un upgrade et un accessoire de même famille se disputent la capacité', () => {
    // fuel: 2 — upgrade fuel_l2 (1) + 1 accessoire fuel : plein.
    const u = slotFamilyUsage(['electrolyzer'], { fuel: 2 });
    expect(u.accessory).toBe(1);
    expect(u.fuel).toBe(1);
    expect(canFitGear(GEAR.fuel_l3!, ['electrolyzer'], { fuel: 2 }, slots).ok).toBe(true); // remplace
    expect(canFitGear(GEAR.fuel_l2!, [], {}, slots).ok).toBe(true);
    expect(canFitGear(GEAR.obs_l2!, [], {}, slots).ok).toBe(false); // obs: 0
  });
  it('accessoire refusé quand sa famille est pleine', () => {
    const r = canFitGear(GEAR.cell_decompressor!, ['metamorphic_hull'], {}, slots);
    expect(r.ok).toBe(false); // accessory 1/1
    expect(r.reason).toMatch(/accessory/);
  });
});

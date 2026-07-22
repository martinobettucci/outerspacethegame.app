/** @verifies This test file verifies: docs/MASTER_PLAN.md §W6; docs/BACKLOG.md §P3 “Ship hulls”; GAME_BOOK.md §14; DESIGN_GUIDE.md §8.2/§8.8. */
/**
 * W6 — catalogue d'items non-fongibles : exhaustivité (règle de
 * complétude), multiplicateurs DG §8.2, capacité d'items AD réveillée.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_GEAR_KEYS,
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
        'electrolyzer_enhanced',
        'electrolyzer_l2_enhanced',
        'vivarium_enhanced',
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

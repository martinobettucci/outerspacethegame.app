/** Usure de coque (GB §27, DG §8.8) — cumul, climats, coûts. */
import { describe, expect, it } from 'vitest';
import {
  HULL_WEAR_FLOOR_HP,
  hullWearPerDay,
  repairHpPerDay,
  REPAIR_STEEL_T_PER_HP,
  SHIELD_COST,
  SHIELD_KINDS,
  shieldForClimate,
} from './wear.js';
import { harvestHullDamagePerDay } from './stars.js';

describe('shieldForClimate — tempéré jamais, poison dormant', () => {
  it('hot→hot, cold→cold, temperate/poison → null', () => {
    expect(shieldForClimate('hot')).toBe('hot');
    expect(shieldForClimate('cold')).toBe('cold');
    expect(shieldForClimate('temperate')).toBeNull();
    expect(shieldForClimate('poison')).toBeNull();
    expect(shieldForClimate(null)).toBeNull();
  });
});

describe('hullWearPerDay — 5 %/j par source, cumul additif [TUNE-v1]', () => {
  it('une source = 5 % des HP max ; deux sources = 10 %', () => {
    expect(hullWearPerDay(80, { hostileClimateUnshielded: true })).toBeCloseTo(4, 9);
    expect(
      hullWearPerDay(80, {
        hostileClimateUnshielded: true,
        hazardZoneUnshielded: true,
      }),
    ).toBeCloseTo(8, 9);
    expect(hullWearPerDay(80, {})).toBe(0);
  });

  it('les dégâts de récolte d_safe s\'ajoutent tels quels (D_max×((5−d)/5)²)', () => {
    const dmg = harvestHullDamagePerDay(2.5); // 80 × 0,25 = 20 HP/j
    expect(dmg).toBeCloseTo(20, 9);
    expect(
      hullWearPerDay(80, { hazardZoneUnshielded: true, harvestDamagePerDay: dmg }),
    ).toBeCloseTo(24, 9);
  });

  it('le plancher canon existe et vaut 1 HP (péage, jamais une mort)', () => {
    expect(HULL_WEAR_FLOOR_HP).toBe(1);
  });
});

describe('SHIELD_COST — 15 steelL + 5 cristal apparié [TUNE]', () => {
  it('trois boucliers, radio → crystal_nox [interp]', () => {
    expect(SHIELD_KINDS).toEqual(['hot', 'cold', 'radio']);
    expect(SHIELD_COST.hot).toEqual({ steel_l: 15, crystal_hot: 5 });
    expect(SHIELD_COST.cold).toEqual({ steel_l: 15, crystal_cold: 5 });
    expect(SHIELD_COST.radio).toEqual({ steel_l: 15, crystal_nox: 5 });
  });
});

describe('repairHpPerDay — 5 %/h × mult(1/2/4) [TUNE]', () => {
  it('Cargo S (80 HP) : L1 96, L2 192, L3 384 HP/jour ; niveau inconnu 0', () => {
    expect(repairHpPerDay(80, 1)).toBeCloseTo(96, 9);
    expect(repairHpPerDay(80, 2)).toBeCloseTo(192, 9);
    expect(repairHpPerDay(80, 3)).toBeCloseTo(384, 9);
    expect(repairHpPerDay(80, 0)).toBe(0);
  });

  it('acier proportionnel : 0,1 T/HP [TUNE-v1]', () => {
    expect(REPAIR_STEEL_T_PER_HP).toBe(0.1);
  });
});

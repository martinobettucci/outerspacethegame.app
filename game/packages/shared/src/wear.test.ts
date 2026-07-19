/** Usure de coque (GB §27, DG §8.8) — cumul, climats, coûts. */
import { describe, expect, it } from 'vitest';
import {
  HULL_WEAR_FLOOR_HP,
  hullWearPerDay,
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

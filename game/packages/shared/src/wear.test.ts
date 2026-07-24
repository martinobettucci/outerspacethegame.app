/** @verifies This test file verifies: docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Hull wear & shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.7/§8.8. */
/** Usure de coque (GB §27, DG §8.8) — cumul, climats, coûts. */
import { describe, expect, it } from 'vitest';
import {
  HULL_WEAR_FLOOR_HP,
  hullWearPerDay,
  repairHpPerDay,
  REPAIR_STEEL_T_PER_HP,
  segmentCircleCrossingPc,
  SHIELD_COST,
  SHIELD_KINDS,
  SHIELD_MORPH_HOURS,
  shieldForClimate,
  shieldForStarField,
  STAR_FIELD_NOVA_FRACTION,
  starFieldRadiusPc,
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

describe('W5 — champs climatiques stellaires (0,5 × R_nova)', () => {
  it('rayons : S 20 / M ~31,7 / L ~50,4 pc (r_nova = 40×∛mult)', () => {
    expect(STAR_FIELD_NOVA_FRACTION).toBe(0.5);
    expect(starFieldRadiusPc(40)).toBeCloseTo(20, 9);
    expect(starFieldRadiusPc(40 * Math.cbrt(4))).toBeCloseTo(31.748, 3);
    expect(starFieldRadiusPc(40 * Math.cbrt(16))).toBeCloseTo(50.397, 3);
    expect(starFieldRadiusPc(-5)).toBe(0);
  });

  it('bouclier apparié au TYPE d\'étoile : hot→hot, cold→cold, gas→radio [interp]', () => {
    expect(shieldForStarField('hot')).toBe('hot');
    expect(shieldForStarField('cold')).toBe('cold');
    expect(shieldForStarField('gas')).toBe('radio');
    expect(shieldForStarField(null)).toBeNull();
    expect(shieldForStarField('plasma')).toBeNull();
  });

  it('hullWearPerDay : chaque champ non blindé ajoute 5 %/j (additif)', () => {
    expect(hullWearPerDay(80, { starFieldsUnshielded: 1 })).toBeCloseTo(4, 9);
    expect(hullWearPerDay(80, { starFieldsUnshielded: 2 })).toBeCloseTo(8, 9);
    expect(
      hullWearPerDay(80, { hostileClimateUnshielded: true, starFieldsUnshielded: 1 }),
    ).toBeCloseTo(8, 9);
    expect(hullWearPerDay(80, { starFieldsUnshielded: 0 })).toBe(0);
  });

  it('morphose : 24 h-jeu [TUNE]', () => {
    expect(SHIELD_MORPH_HOURS).toBe(24);
  });
});

describe('W5 — segmentCircleCrossingPc (géométrie pure de traversée)', () => {
  it('diamètre complet : segment traversant le centre = 2r', () => {
    expect(segmentCircleCrossingPc(-100, 0, 100, 0, 0, 0, 20)).toBeCloseTo(40, 9);
  });

  it('corde décalée : |y|=12, r=20 → 2×√(400−144) = 32', () => {
    expect(segmentCircleCrossingPc(-100, 12, 100, 12, 0, 0, 20)).toBeCloseTo(32, 9);
  });

  it('hors du disque / tangent : 0', () => {
    expect(segmentCircleCrossingPc(-100, 25, 100, 25, 0, 0, 20)).toBe(0);
    expect(segmentCircleCrossingPc(-100, 20, 100, 20, 0, 0, 20)).toBe(0);
  });

  it('segment finissant DANS le disque : clampé au bout', () => {
    expect(segmentCircleCrossingPc(-100, 0, 0, 0, 0, 0, 20)).toBeCloseTo(20, 9);
  });

  it('segment entièrement DANS le disque : sa longueur', () => {
    expect(segmentCircleCrossingPc(-5, 0, 5, 0, 0, 0, 20)).toBeCloseTo(10, 9);
  });

  it('segment dégénéré (a = b) : 0', () => {
    expect(segmentCircleCrossingPc(3, 3, 3, 3, 0, 0, 20)).toBe(0);
  });
});

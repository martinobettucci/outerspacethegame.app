/**
 * Unit — pocket luck & mondes bonus (DG §2.2b, directive responsable
 * 2026-07-20) : seuils LITTÉRAUX de luck, gradient ρ_eff borné/monotone,
 * rolls bonus (moitié haute des tuiles, 4–8 gisements enrichis, profil de
 * qualité tiré vers le riche), prédicat de pool des ruines (dérivé du
 * catalogue — le snapshot casse si le catalogue bouge, pour revue), caps
 * maxInstances, et stocks résiduels bornés.
 */
import { describe, expect, it } from 'vitest';
import {
  BASIC_RESOURCES,
  BUILDINGS,
  SeededStream,
  UNIVERSE_SIZE_PC,
  type Quality,
} from '@atg/shared';
import {
  BONUS_RHO_FLOOR,
  bonusRhoEff,
  luckCount,
  QUALITY_WEIGHTS,
  RICH_QUALITY_WEIGHTS,
  rollBonusPlanet,
  rollLeftoverSupply,
  rollPocketLuck,
  rollRuins,
  RUIN_POOL,
  TILE_RANGES,
} from '../../src/gen/rolls.js';

const CENTER = UNIVERSE_SIZE_PC / 2;

describe('luckCount — seuils littéraux de la directive', () => {
  it('0,1 % → +2 ; 1,0 % → +1 ; sinon base (bornes exactes)', () => {
    expect(luckCount(0, 1)).toBe(3);
    expect(luckCount(0.0009999, 1)).toBe(3);
    expect(luckCount(0.001, 1)).toBe(2); // borne : bascule à +1
    expect(luckCount(0.0109999, 1)).toBe(2);
    expect(luckCount(0.011, 1)).toBe(1); // borne : plus de luck
    expect(luckCount(0.5, 1)).toBe(1);
    // Wilds : base 2 → 4 / 3 / 2.
    expect(luckCount(0.0005, 2)).toBe(4);
    expect(luckCount(0.005, 2)).toBe(3);
    expect(luckCount(0.9, 2)).toBe(2);
  });

  it('rollPocketLuck : déterministe, fréquences ≈ 1,1 % sur 30 000 seeds', () => {
    const a = rollPocketLuck(new SeededStream('luck-seed-x', 'pocket:demo'));
    const b = rollPocketLuck(new SeededStream('luck-seed-x', 'pocket:demo'));
    expect(a).toEqual(b);

    let luckyStarters = 0;
    let luckyWilds = 0;
    const N = 30_000;
    for (let i = 0; i < N; i++) {
      const luck = rollPocketLuck(
        new SeededStream('freq-universe', `pocket:player-${i}`),
      );
      if (luck.starters >= 2) luckyStarters++;
      if (luck.wilds >= 3) luckyWilds++;
      expect(luck.starters).toBeGreaterThanOrEqual(1);
      expect(luck.starters).toBeLessThanOrEqual(3);
      expect(luck.wilds).toBeGreaterThanOrEqual(2);
      expect(luck.wilds).toBeLessThanOrEqual(4);
    }
    // P(luck) = 1,1 % ; tolérance ±0,5 pt sur 30 k tirages.
    expect(luckyStarters / N).toBeGreaterThan(0.006);
    expect(luckyStarters / N).toBeLessThan(0.016);
    expect(luckyWilds / N).toBeGreaterThan(0.006);
    expect(luckyWilds / N).toBeLessThan(0.016);
  });
});

describe('bonusRhoEff — gradient spatial borné', () => {
  it('plancher 0,25 au centre, 1 au-delà de 100 k pc, monotone', () => {
    expect(bonusRhoEff(CENTER, CENTER)).toBe(BONUS_RHO_FLOOR);
    expect(bonusRhoEff(CENTER + 20_000, CENTER)).toBe(BONUS_RHO_FLOOR);
    expect(bonusRhoEff(CENTER + 60_000, CENTER)).toBeCloseTo(
      0.25 + 0.75 * 0.5,
      10,
    );
    expect(bonusRhoEff(CENTER + 100_000, CENTER)).toBe(1);
    expect(bonusRhoEff(CENTER, CENTER + 400_000)).toBe(1);
    let prev = 0;
    for (let d = 0; d <= 120_000; d += 5_000) {
      const rho = bonusRhoEff(CENTER + d, CENTER);
      expect(rho).toBeGreaterThanOrEqual(prev);
      prev = rho;
    }
  });
});

describe('rollBonusPlanet — profil riche', () => {
  it('déterministe ; tuiles en moitié haute ; 4–8 gisements enrichis', () => {
    for (let i = 0; i < 300; i++) {
      const seed = `bonus-world-${i}`;
      const roll = rollBonusPlanet(seed, 0.6);
      expect(roll).toEqual(rollBonusPlanet(seed, 0.6));
      if (roll.climate === 'poison') {
        expect(roll.tiles).toBe(0);
      } else {
        const [lo, hi] = TILE_RANGES[roll.size];
        expect(roll.tiles).toBeGreaterThanOrEqual(Math.ceil((lo + hi) / 2));
        expect(roll.tiles).toBeLessThanOrEqual(hi);
      }
      expect(roll.deposits.length).toBeGreaterThanOrEqual(4);
      expect(roll.deposits.length).toBeLessThanOrEqual(8);
      for (const d of roll.deposits) expect(d.initialT).toBeGreaterThan(0);
    }
  });

  it('qualité tirée vers le riche : à ρ=1 le profil suit RICH_QUALITY_WEIGHTS', () => {
    const N = 4_000;
    const count: Record<Quality, number> = { F: 0, E: 0, D: 0, C: 0, B: 0, A: 0 };
    for (let i = 0; i < N; i++) count[rollBonusPlanet(`q-${i}`, 1).quality]++;
    const rich = new Map(RICH_QUALITY_WEIGHTS);
    const std = new Map(QUALITY_WEIGHTS);
    // A+B ≈ 55 % au profil riche (vs 9 % standard) — tolérance large mais
    // discriminante.
    const topShare = (count.A + count.B) / N;
    expect(topShare).toBeGreaterThan(0.45);
    expect(topShare).toBeLessThan(0.65);
    expect(topShare).toBeGreaterThan(
      (std.get('A')! + std.get('B')!) * 3, // >> profil standard
    );
    expect(rich.get('A')! + rich.get('B')!).toBeCloseTo(0.55, 10);
  });
});

describe('RUIN_POOL — prédicat de catalogue (règle de complétude)', () => {
  it('tout le pool est sur tuile, apolitique à tous niveaux, non-industrie', () => {
    expect(RUIN_POOL.length).toBeGreaterThan(0);
    for (const key of RUIN_POOL) {
      const d = BUILDINGS[key];
      expect(d.usesTile).toBe(true);
      expect(d.politics).toBeNull();
      expect(d.politicsFromLevel).toBeUndefined();
      expect(d.batchesPerDayByLevel).toBeUndefined();
    }
  });

  it('snapshot du pool courant — si le catalogue bouge, revue exigée', () => {
    expect([...RUIN_POOL].sort()).toEqual(
      [
        'clinic',
        'depot',
        'obs_station',
        'spaceport',
        'stargate_yard',
        'telescope',
        'warehouse',
        'workshop',
      ].sort(),
    );
  });
});

describe('rollRuins — ruines bornées et légales', () => {
  it('count ≤ min(⌊tuiles/2⌋, tuiles−2), tuiles 0/1 libres, maxInstances respecté', () => {
    for (let i = 0; i < 500; i++) {
      const tiles = i % 21; // 0..20
      const ruins = rollRuins(`ruin-${i}`, 1, tiles);
      expect(ruins.length).toBeLessThanOrEqual(
        Math.max(0, Math.min(Math.floor(tiles / 2), tiles - 2, 4)),
      );
      const perKey = new Map<string, number>();
      for (const r of ruins) {
        expect(RUIN_POOL).toContain(r.key);
        expect(r.level).toBeGreaterThanOrEqual(1);
        expect(r.level).toBeLessThanOrEqual(3);
        expect(r.tileIndex).toBeGreaterThanOrEqual(2);
        expect(r.tileIndex).toBeLessThan(tiles);
        perKey.set(r.key, (perKey.get(r.key) ?? 0) + 1);
      }
      // Pas deux ruines sur la même tuile.
      expect(new Set(ruins.map((r) => r.tileIndex)).size).toBe(ruins.length);
      for (const [key, n] of perKey) {
        const max = BUILDINGS[key as keyof typeof BUILDINGS].maxInstances;
        if (max) expect(n).toBeLessThanOrEqual(max);
      }
    }
  });

  it('ρ_eff bas ⇒ moins de ruines en moyenne que ρ_eff = 1', () => {
    const mean = (rho: number) => {
      let total = 0;
      for (let i = 0; i < 800; i++) total += rollRuins(`m-${i}`, rho, 16).length;
      return total / 800;
    };
    expect(mean(0.25)).toBeLessThan(mean(1));
  });
});

describe('rollLeftoverSupply — stocks résiduels', () => {
  it('2–5 ressources uniques du pool, montants ρ_eff × U(40–200) arrondis', () => {
    const pool = new Set([...BASIC_RESOURCES, 'food_1', 'water']);
    for (let i = 0; i < 300; i++) {
      const rho = 0.25 + (i % 4) * 0.25;
      const supply = rollLeftoverSupply(`supply-${i}`, rho);
      expect(supply.length).toBeGreaterThanOrEqual(2);
      expect(supply.length).toBeLessThanOrEqual(5);
      expect(new Set(supply.map((s) => s.resource)).size).toBe(supply.length);
      for (const s of supply) {
        expect(pool.has(s.resource)).toBe(true);
        expect(s.amountT).toBeGreaterThanOrEqual(Math.round(rho * 40) - 1);
        expect(s.amountT).toBeLessThanOrEqual(Math.round(rho * 200) + 1);
      }
    }
  });
});

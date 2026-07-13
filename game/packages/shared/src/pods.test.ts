/**
 * Pods de recrutement (DG §11.4) : formule de prix (plancher, exposant,
 * moyenne trimée pondérée par l'offre), barème exhaustif, tables de
 * rareté/peuple/rôle, rolls déterministes U(0.5,1.5), governor-grade.
 */
import { describe, expect, it } from 'vitest';
import { ALL_RESOURCE_IDS } from './resources.js';
import { SeededStream } from './rng.js';
import {
  isGovernorGrade,
  POD_PRICE_BASE_T,
  POD_PRICE_FLOOR_T,
  POD_RARITY_TABLE,
  POD_ROLES,
  podPrice,
  podPrices,
  RARITY_BASELINE_BONUS,
  RARITY_TIER_INDEX,
  ROLE_STAT,
  rollPodNpc,
  trimmedSupplyWeightedMean,
} from './pods.js';

describe('prix des pods (DG §11.4)', () => {
  it('price_r = max(5, 40 × (S_r/S̄)^0.7) — offre moyenne ⇒ B exactement', () => {
    expect(podPrice(100, 100)).toBeCloseTo(POD_PRICE_BASE_T, 6);
  });

  it('ressource abondante plus chère, rare moins chère, plancher à 5', () => {
    expect(podPrice(400, 100)).toBeCloseTo(40 * 4 ** 0.7, 1);
    expect(podPrice(10, 100)).toBeLessThan(POD_PRICE_BASE_T);
    expect(podPrice(0, 100)).toBe(POD_PRICE_FLOOR_T);
    expect(podPrice(100, 0)).toBe(POD_PRICE_FLOOR_T); // univers vide
  });

  it('S̄ trimée pondérée par l\'offre : outliers écartés, zéros ignorés', () => {
    // 11 offres non nulles → trim 1 de chaque côté : le 1e6 disparaît ;
    // les zéros (ressources absentes) ne consomment pas le budget de trim.
    const withOutlier = [0, 0, 0, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 1_000_000];
    const kept = trimmedSupplyWeightedMean(withOutlier);
    expect(kept).toBeCloseTo(10, 6); // Σs²/Σs sur des 10 homogènes = 10
  });

  it('barème EXHAUSTIF : une entrée par ressource du catalogue', () => {
    const prices = podPrices({ ore: 1000, water: 500 });
    expect(Object.keys(prices).sort()).toEqual([...ALL_RESOURCE_IDS].sort());
    for (const r of ALL_RESOURCE_IDS) {
      expect(prices[r]).toBeGreaterThanOrEqual(POD_PRICE_FLOOR_T);
    }
    expect(prices.ore).toBeGreaterThan(prices.water);
  });
});

describe('contenu des pods (GB §12)', () => {
  it('tables canon : raretés 62/24/10/3.4/0.6, 6 rôles, tiers 1..5', () => {
    expect(POD_RARITY_TABLE.map((r) => r.weight)).toEqual([62, 24, 10, 3.4, 0.6]);
    expect(POD_ROLES.length).toBe(6);
    expect(Object.keys(ROLE_STAT).sort()).toEqual([...POD_ROLES].sort());
    expect(RARITY_TIER_INDEX.legendary).toBe(5);
  });

  it('déterminisme : même seed ⇒ même PNJ ; seeds ≠ ⇒ variété', () => {
    const a = rollPodNpc(new SeededStream('u', 'pod:p1:1'));
    const b = rollPodNpc(new SeededStream('u', 'pod:p1:1'));
    expect(a).toEqual(b);
    const rolls = Array.from({ length: 200 }, (_, i) =>
      rollPodNpc(new SeededStream('u', `pod:p1:${i}`)),
    );
    expect(new Set(rolls.map((r) => r.role)).size).toBe(6);
    expect(new Set(rolls.map((r) => r.rarity)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(rolls.map((r) => r.people)).size).toBe(3);
  });

  it('roll de stat : baseline × tier × U(0.5,1.5), bornes respectées', () => {
    for (let i = 0; i < 300; i++) {
      const r = rollPodNpc(new SeededStream('u', `pod:bounds:${i}`));
      const baseline = RARITY_BASELINE_BONUS * RARITY_TIER_INDEX[r.rarity];
      const stat = r.statRolls[ROLE_STAT[r.role]]!;
      expect(stat).toBeGreaterThanOrEqual(baseline * 0.5 - 1e-9);
      expect(stat).toBeLessThanOrEqual(baseline * 1.5 + 1e-9);
      expect(Object.keys(r.statRolls)).toEqual([ROLE_STAT[r.role]]);
    }
  });

  it('governor-grade = Rare et au-delà', () => {
    expect(isGovernorGrade('common')).toBe(false);
    expect(isGovernorGrade('uncommon')).toBe(false);
    expect(isGovernorGrade('rare')).toBe(true);
    expect(isGovernorGrade('epic')).toBe(true);
    expect(isGovernorGrade('legendary')).toBe(true);
  });
});

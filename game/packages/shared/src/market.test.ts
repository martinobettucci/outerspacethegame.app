/**
 * Unitaires marché taux fixe (chunk K) — GB §9 (slots = niveau), DG §11.1
 * (re-tarification ≤ 1/min), validation pure d'un slot.
 */
import { describe, expect, it } from 'vitest';
import {
  fixedTradeOutput,
  INNATE_TRADABLE,
  MARKET_SLOTS_BY_LEVEL,
  REPRICE_MIN_INTERVAL_MS,
  tradableAboveFloor,
  validateInnateOffer,
  validateMarketSlot,
} from './market.js';

const base = {
  give: 'ore',
  get: 'water',
  rate: 0.5,
  dailyLimitT: 0,
  absoluteLimitT: 0,
  whitelist: [] as string[],
};

describe('slots = niveau (GB §9)', () => {
  it('L1/L2/L3 → 1/2/3 slots', () => {
    expect(MARKET_SLOTS_BY_LEVEL[1]).toBe(1);
    expect(MARKET_SLOTS_BY_LEVEL[2]).toBe(2);
    expect(MARKET_SLOTS_BY_LEVEL[3]).toBe(3);
  });
});

describe('validateMarketSlot', () => {
  it('slot nominal : valide', () => {
    expect(validateMarketSlot(base)).toBeNull();
  });

  it('ressources inconnues ou identiques : refus', () => {
    expect(validateMarketSlot({ ...base, give: 'unobtainium' })).toContain('achetée');
    expect(validateMarketSlot({ ...base, get: 'unobtainium' })).toContain('payée');
    expect(validateMarketSlot({ ...base, get: 'ore' })).toContain('distinctes');
  });

  it('taux et limites : bornes vérifiées', () => {
    expect(validateMarketSlot({ ...base, rate: 0 })).toContain('Taux');
    expect(validateMarketSlot({ ...base, rate: -1 })).toContain('Taux');
    expect(validateMarketSlot({ ...base, rate: Number.NaN })).toContain('Taux');
    expect(validateMarketSlot({ ...base, dailyLimitT: -1 })).toContain('quotidienne');
    expect(validateMarketSlot({ ...base, absoluteLimitT: -1 })).toContain('absolue');
  });
});

describe('fixedTradeOutput', () => {
  it('le taux est le prix : get = give × rate, sans frais séparé [TUNE-v1]', () => {
    expect(fixedTradeOutput(2, 0.5)).toBe(1);
    expect(fixedTradeOutput(3, 2)).toBe(6);
    expect(fixedTradeOutput(0.4, 1.5)).toBeCloseTo(0.6, 10);
  });
});

describe('re-tarification (DG §11.1)', () => {
  it('throttle constant : 1 minute', () => {
    expect(REPRICE_MIN_INTERVAL_MS).toBe(60_000);
  });
});

describe('commerce inné du monde marchand (GB §9)', () => {
  it('périmètre EXHAUSTIF : survie (eau, oxygène, 3 nourritures) + 3 carburants', () => {
    expect([...INNATE_TRADABLE].sort()).toEqual(
      ['water', 'oxygen', 'food_1', 'food_2', 'food_3', 'fuel_cold', 'fuel_hot', 'fuel_gas'].sort(),
    );
  });

  it('validation : hors périmètre, paiement inconnu, prix/plancher invalides', () => {
    const ok = { sell: 'water', want: 'ore', price: 2, keepFloorT: 10 };
    expect(validateInnateOffer(ok)).toBeNull();
    expect(validateInnateOffer({ ...ok, sell: 'ore' })).toContain('innément');
    expect(validateInnateOffer({ ...ok, want: 'unobtainium' })).toContain('paiement');
    expect(validateInnateOffer({ ...ok, want: 'water' })).toContain('prix');
    expect(validateInnateOffer({ ...ok, price: 0 })).toContain('Prix');
    expect(validateInnateOffer({ ...ok, keepFloorT: -1 })).toContain('Plancher');
  });

  it('plancher keep-for-self : seul le surplus se vend', () => {
    expect(tradableAboveFloor(50, 30)).toBe(20);
    expect(tradableAboveFloor(30, 30)).toBe(0);
    expect(tradableAboveFloor(10, 30)).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { efficiency, TRACE_MINING_T_PER_DAY } from '@atg/shared';
import { computeRates, type RatesInput } from '../../src/sim/production.js';

const base = (over: Partial<RatesInput> = {}): RatesInput => ({
  planetMultiplier: 1,
  population: 0,
  storageCapT: 1_000,
  stocks: {},
  deposits: {},
  industries: [],
  ...over,
});

const mine = (workforce = 35): RatesInput['industries'][number] => ({
  buildingId: 'mine-1',
  key: 'mine',
  level: 1,
  recipe: 'extract:ore',
  baseBatchesPerDay: 10,
  workforce, // optimal L1 = 50 ⇒ u = 0.7 ⇒ E = 1
  runPct: 100,
});

const smelter = (): RatesInput['industries'][number] => ({
  buildingId: 'smelter-1',
  key: 'smelter',
  level: 1,
  recipe: 'steel_l',
  baseBatchesPerDay: 10,
  workforce: 35,
  runPct: 100,
});

describe('computeRates — extraction (DG §3.3)', () => {
  it('mine au point idéal : 10 T/jour vers le stock, −10 T/jour au gisement', () => {
    const r = computeRates(
      base({ deposits: { ore: 5_000 }, industries: [mine()] }),
    );
    expect(r.stockRates.ore).toBeCloseTo(10, 6);
    expect(r.depositRates.ore).toBeCloseTo(-10, 6);
    expect(r.industries[0]!.limiting).toBe('ok');
  });

  it('workforce sous-assignée : débit × E(u), facteur « understaffed »', () => {
    const r = computeRates(
      base({ deposits: { ore: 5_000 }, industries: [mine(5)] }),
    );
    expect(r.stockRates.ore).toBeCloseTo(10 * efficiency(5 / 50), 6);
    expect(r.industries[0]!.limiting).toBe('understaffed');
  });

  it('gisement à sec : extracteur arrêté pour toujours', () => {
    const r = computeRates(
      base({ deposits: { ore: 0 }, industries: [mine()] }),
    );
    expect(r.stockRates.ore ?? 0).toBe(0);
    expect(r.industries[0]!.limiting).toBe('deposit_dry');
  });

  it('minage de trace (aucun gisement) : 2 T/jour plat, EXEMPT d\'efficacité', () => {
    const r = computeRates(base({ industries: [mine(0)] }));
    // workforce 0 ⇒ E ≈ plancher, mais la trace est exempte : 2 T/jour.
    expect(r.stockRates.ore).toBeCloseTo(TRACE_MINING_T_PER_DAY, 6);
  });

  it('monde sauvage : même le minage de trace reste à zéro', () => {
    const r = computeRates(base({ planetMultiplier: 0, industries: [mine(0)] }));
    expect(r.stockRates.ore ?? 0).toBe(0);
  });

  it('runPct throttle délibéré (canon GB §9)', () => {
    const throttled = { ...mine(), runPct: 40 };
    const r = computeRates(
      base({ deposits: { ore: 5_000 }, industries: [throttled] }),
    );
    expect(r.stockRates.ore).toBeCloseTo(4, 6);
  });
});

describe('computeRates — industrie à recette & point fixe des intrants', () => {
  it('smelter alimenté par le stock : consomme 2 ore + 1 carbon par lot', () => {
    const r = computeRates(
      base({
        stocks: { ore: 300, carbon: 200 },
        industries: [smelter()],
      }),
    );
    expect(r.stockRates.steel_l).toBeCloseTo(10, 6);
    expect(r.stockRates.ore).toBeCloseTo(-20, 6);
    expect(r.stockRates.carbon).toBeCloseTo(-10, 6);
  });

  it('intrant à sec sans arrivage : industrie à l\'arrêt, facteur input:<res>', () => {
    const r = computeRates(base({ industries: [smelter()] }));
    expect(r.stockRates.steel_l ?? 0).toBeCloseTo(0, 6);
    expect(r.industries[0]!.limiting).toBe('input:ore');
  });

  it('intrant à sec MAIS alimenté en flux : cadence limitée au ratio d\'arrivage', () => {
    // Mine 10 T/jour d'ore ; smelter demande 20 T/jour ⇒ moitié de cadence.
    const r = computeRates(
      base({
        stocks: { carbon: 500 },
        deposits: { ore: 5_000 },
        industries: [mine(), smelter()],
      }),
    );
    expect(r.industries[1]!.effBatchesPerDay).toBeCloseTo(5, 4);
    expect(r.stockRates.steel_l).toBeCloseTo(5, 4);
    // L'ore entre à 10 et ressort à 10 (2 × 5 lots) : net ≈ 0.
    expect(Math.abs(r.stockRates.ore ?? 0)).toBeLessThan(1e-6);
    expect(r.industries[1]!.limiting).toBe('input:ore');
  });
});

describe('computeRates — frein de stockage §3.3b', () => {
  it('u ≤ 0.7 : jamais de frein (le stock bas n\'est pas puni)', () => {
    const r = computeRates(
      base({
        stocks: { ore: 100 },
        deposits: { ore: 5_000 },
        industries: [mine()],
        storageCapT: 1_000,
      }),
    );
    expect(r.stockRates.ore).toBeCloseTo(10, 6);
  });

  it('0.7 < u < 1 : branche droite de E(u), facteur storage_brake', () => {
    const r = computeRates(
      base({
        stocks: { ore: 850 },
        deposits: { ore: 5_000 },
        industries: [mine()],
        storageCapT: 1_000,
      }),
    );
    expect(r.stockRates.ore).toBeLessThan(10);
    expect(r.stockRates.ore).toBeGreaterThan(0);
    expect(r.industries[0]!.limiting).toBe('storage_brake');
  });

  it('u ≥ 1 : HALT de la production (storage_full)', () => {
    const r = computeRates(
      base({
        stocks: { ore: 1_000 },
        deposits: { ore: 5_000 },
        industries: [mine()],
        storageCapT: 1_000,
      }),
    );
    expect(r.stockRates.ore ?? 0).toBe(0);
    expect(r.industries[0]!.limiting).toBe('storage_full');
  });
});

describe('computeRates — consommation de survie (DG §3.2)', () => {
  it('10 000 habitants : 10 T food + 10 T eau + 1 T médecine par jour', () => {
    const r = computeRates(
      base({
        population: 10_000,
        stocks: { food_1: 100, water: 100, med_1: 10 },
      }),
    );
    expect(r.stockRates.food_1).toBeCloseTo(-10, 6);
    expect(r.stockRates.water).toBeCloseTo(-10, 6);
    expect(r.stockRates.med_1).toBeCloseTo(-1, 6);
    expect(r.popConsumption.food).toBeCloseTo(10, 6);
    expect(r.popNeeds.food).toBeCloseTo(10, 6);
  });

  it('sans nourriture ni arrivage : consommation servie nulle (famine → H = 0 au pop_daily)', () => {
    const r = computeRates(base({ population: 10_000, stocks: { water: 100 } }));
    expect(r.popConsumption.food).toBe(0);
    expect(r.popConsumption.water).toBeCloseTo(10, 6);
  });

  it('la nourriture se consomme par familles en cascade (food_1 puis food_2)', () => {
    const r = computeRates(
      base({ population: 10_000, stocks: { food_1: 4, food_2: 100, water: 50 } }),
    );
    // food_1 en stock : puisé d'abord ; le complément vient de food_2.
    expect(r.stockRates.food_1).toBeCloseTo(-10, 6);
    expect((r.stockRates.food_2 ?? 0)).toBeCloseTo(0, 6);
    expect(r.popConsumption.food).toBeCloseTo(10, 6);
  });
});

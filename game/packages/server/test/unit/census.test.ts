/**
 * Unit : agrégation du census (DG §11.5) — sommes exactes, évaluation
 * lazy à l'instant du snapshot, clamp min 0, soutes tous statuts,
 * clés hors catalogue ignorées, exhaustivité du catalogue (zéros).
 */
import { describe, expect, it } from 'vitest';
import { ALL_RESOURCE_IDS, GAME_DAY_SECONDS } from '@atg/shared';
import { aggregateCensus } from '../../src/sim/census.js';

const DAY_MS = GAME_DAY_SECONDS * 1000;

describe('aggregateCensus (DG §11.5)', () => {
  it('somme stocks multi-planètes + soutes multi-vaisseaux', () => {
    const now = 1_000_000_000;
    const totals = aggregateCensus(
      [
        { resource: 'ore', amountT: 100, ratePerDayT: 0, asOfMs: now },
        { resource: 'ore', amountT: 50, ratePerDayT: 0, asOfMs: now },
        { resource: 'water', amountT: 30, ratePerDayT: 0, asOfMs: now },
      ],
      [{ ore: 10 }, { ore: 5, steel_l: 2.5 }],
      now,
    );
    expect(totals.ore).toEqual({ totalT: 165, planetStockT: 150, shipCargoT: 15 });
    expect(totals.water.totalT).toBe(30);
    expect(totals.steel_l).toEqual({ totalT: 2.5, planetStockT: 0, shipCargoT: 2.5 });
  });

  it('évalue les stocks LAZY au nowMs (amount + rate × Δjours)', () => {
    const asOf = 0;
    const now = 2 * DAY_MS; // 2 jours plus tard
    const totals = aggregateCensus(
      [{ resource: 'ore', amountT: 100, ratePerDayT: 10, asOfMs: asOf }],
      [],
      now,
    );
    expect(totals.ore.planetStockT).toBeCloseTo(120, 9);
  });

  it('clamp min 0 : une ligne à taux négatif passée sous zéro ne retire rien', () => {
    const totals = aggregateCensus(
      [
        { resource: 'water', amountT: 5, ratePerDayT: -10, asOfMs: 0 },
        { resource: 'water', amountT: 40, ratePerDayT: 0, asOfMs: 0 },
      ],
      [],
      3 * DAY_MS,
    );
    expect(totals.water.planetStockT).toBeCloseTo(40, 9);
  });

  it('clé jsonb hors catalogue ignorée (stock ET soute)', () => {
    const totals = aggregateCensus(
      [{ resource: 'pas_une_ressource', amountT: 99, ratePerDayT: 0, asOfMs: 0 }],
      [{ autre_intruse: 42, ore: 1 }],
      0,
    );
    expect(totals.ore.totalT).toBe(1);
    expect(
      Object.values(totals).reduce((s, b) => s + b.totalT, 0),
    ).toBe(1);
  });

  it('univers vide : TOUT le catalogue présent à 0 (exhaustivité)', () => {
    const totals = aggregateCensus([], [], 0);
    expect(Object.keys(totals).sort()).toEqual([...ALL_RESOURCE_IDS].sort());
    for (const id of ALL_RESOURCE_IDS) {
      expect(totals[id]).toEqual({ totalT: 0, planetStockT: 0, shipCargoT: 0 });
    }
  });
});

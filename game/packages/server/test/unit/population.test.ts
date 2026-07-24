/** @verifies This test file verifies: docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BA–§BD; GAME_BOOK.md §10; DESIGN_GUIDE.md §3.2-v2. */
/** Indicateurs/projections de la page stats — purs, sans base. */
import { describe, expect, it } from 'vitest';
import type { ProductionSnapshot } from '../../src/sim/rebase.js';
import {
  populationIndicators,
  survivalForecasts,
} from '../../src/sim/population.js';

function snapshot(
  overrides: Partial<ProductionSnapshot> = {},
): ProductionSnapshot {
  return {
    bodyId: 'body',
    ownerId: 'owner',
    size: 's',
    quality: 'F',
    climate: 'hot',
    population: 1_000,
    pyramid: { children: 180, actives: 550, seniors: 270 },
    clockDeadlines: {},
    demoCounters: {},
    unempOverDays: 0,
    colonizedAtMs: null,
    illness: 0.3,
    popAsOfMs: null,
    storageCapT: 800,
    stocks: { food_1: 20, water: 30, oxygen: 100 },
    pooled: {},
    pooledT: 0,
    deposits: {},
    depositInitial: {},
    industries: [],
    buildings: [
      {
        id: 'clinic',
        key: 'clinic',
        level: 1,
        status: 'active',
        workforce: 21,
        runPct: 100,
        recipe: null,
      },
    ],
    hoverShips: [],
    repairShips: [],
    rates: {
      stockRates: { food_1: -2, water: -3, oxygen: -1 },
      depositRates: {},
      industries: [],
      popConsumption: { food: 2, water: 3, medicine: 0, oxygen: 1 },
      popNeeds: { food: 2, water: 3, medicine: 0, oxygen: 1 },
      hoverConsumption: {},
      hoverSurvivalConsumption: { food: 0, water: 0 },
      repairSteelConsumption: 0,
      storageU: 0.2,
    },
    ...overrides,
  };
}

describe('populationIndicators', () => {
  it('expose emploi universel, clinique et facteurs de natalité cohérents', () => {
    const indicators = populationIndicators(snapshot());
    expect(indicators.employedActives).toBe(21);
    expect(indicators.unemploymentRate).toBeCloseTo(1 - 21 / 550, 9);
    expect(indicators.meanEfficiency).toBeCloseTo(1, 9); // u=0,7
    expect(indicators.clinicLevel).toBe(1);
    expect(indicators.effectiveIllness).toBeCloseTo(0.2, 9);
    expect(indicators.localRhos).toEqual({ food: 0, water: 0, oxygen: 0 });
  });
});

describe('survivalForecasts', () => {
  it('oxygène : alarme projetée dès maintenant, mort exactement à sec', () => {
    const now = Date.UTC(2026, 6, 20);
    const oxygen = survivalForecasts(snapshot(), now).oxygen!;
    expect(oxygen.state).toBe('projected');
    expect(oxygen.instantDeath).toBe(true);
    expect(new Date(oxygen.dryAt!).getTime()).toBe(now + 100 * 86_400_000);
    expect(oxygen.deathAt).toBe(oxygen.dryAt);
  });

  it('horloge eau active : conserve la deadline fixe et retrouve la date sèche', () => {
    const now = Date.UTC(2026, 6, 20);
    const deadline = new Date(now + 2 * 86_400_000).toISOString();
    const water = survivalForecasts(
      snapshot({ clockDeadlines: { water: deadline } }),
      now,
    ).water!;
    expect(water.state).toBe('countdown');
    expect(water.deathAt).toBe(deadline);
    expect(new Date(water.dryAt!).getTime()).toBe(now - 86_400_000);
  });

  it('horloge de jeu unifiée : les échéances RÉELLES se compressent par timeScale (DG §1)', () => {
    const now = Date.UTC(2026, 6, 20);
    // 100 u d'oxygène à −1/jour ⇒ 100 jours-JEU à sec. À échelle 3600,
    // l'échéance RÉELLE = 100 jours réels / 3600 (compte à rebours client
    // aligné sur la simulation accélérée).
    const oxy = survivalForecasts(snapshot(), now, 3600).oxygen!;
    expect(new Date(oxy.dryAt!).getTime()).toBeCloseTo(
      now + (100 * 86_400_000) / 3600,
      3,
    );
    // Échelle 1 : comportement historique inchangé.
    const oxy1 = survivalForecasts(snapshot(), now, 1).oxygen!;
    expect(new Date(oxy1.dryAt!).getTime()).toBe(now + 100 * 86_400_000);
  });
});

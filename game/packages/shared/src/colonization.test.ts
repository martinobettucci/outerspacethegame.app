/**
 * Unitaires colonisation (chunk N) — DG §3.2 (péage déterministe,
 * accumulateur fractionnaire), §10.3 (grâce 14 j), §8.6 (Civil M/L),
 * GB §3 (poison unbuildable).
 */
import { describe, expect, it } from 'vitest';
import {
  allocateSettlerDeaths,
  canColonizeBody,
  canFitColonyKit,
  colonyGraceUntilMs,
  isInColonyGrace,
  SETTLER_TRIP_RISK_BASE,
  settlerManifestTotal,
  settlerLosses,
  settlerTripRisk,
} from './colonization.js';

describe('settlerTripRisk (DG §3.2)', () => {
  it('base 5 % [TUNE] ; les pilotes réduisent, plancher 0', () => {
    expect(settlerTripRisk([])).toBeCloseTo(0.05, 10);
    expect(settlerTripRisk([0.02])).toBeCloseTo(0.03, 10);
    expect(settlerTripRisk([0.04, 0.04])).toBe(0);
    expect(settlerTripRisk([-1])).toBeCloseTo(SETTLER_TRIP_RISK_BASE, 10);
  });
});

describe('settlerLosses — « no free sub-20 cohorts » (accumulateur par route)', () => {
  it('cohorte sous le seuil : 0 mort mais le report S\'ACCUMULE', () => {
    const first = settlerLosses(10, 0.05, 0);
    expect(first.deaths).toBe(0);
    expect(first.carryOut).toBeCloseTo(0.5, 10);
    const second = settlerLosses(10, 0.05, first.carryOut);
    expect(second.deaths).toBe(1); // 0,5 + 0,5 = 1 mort — le péage se paie
    expect(second.carryOut).toBeCloseTo(0, 10);
  });

  it('cohorte pleine : partie entière en morts, reste en report', () => {
    const r = settlerLosses(300, 0.05, 0.3);
    expect(r.deaths).toBe(15); // 15,0 + 0,3 = 15,3
    expect(r.carryOut).toBeCloseTo(0.3, 10);
  });

  it('les morts ne dépassent jamais la cohorte', () => {
    expect(settlerLosses(3, 1, 10).deaths).toBe(3);
  });
});

describe('allocateSettlerDeaths — manifeste C/A/S déterministe (BD)', () => {
  it('ventile au plus fort reste avec départage C→A→S', () => {
    const deaths = allocateSettlerDeaths(
      { children: 60, actives: 180, seniors: 60 },
      9,
    );
    expect(deaths).toEqual({ children: 2, actives: 5, seniors: 2 });
    expect(settlerManifestTotal(deaths)).toBe(9);
  });

  it('conserve les bornes pour zéro et un péage supérieur au total', () => {
    expect(allocateSettlerDeaths({ children: 0, actives: 0, seniors: 0 }, 4))
      .toEqual({ children: 0, actives: 0, seniors: 0 });
    expect(allocateSettlerDeaths({ children: 1, actives: 2, seniors: 0 }, 99))
      .toEqual({ children: 1, actives: 2, seniors: 0 });
    expect(allocateSettlerDeaths({ children: 1, actives: 1, seniors: 1 }, 1))
      .toEqual({ children: 1, actives: 0, seniors: 0 });
  });
});

describe('grâce colonie (DG §10.3)', () => {
  it('14 jours après colonized_at, puis expire', () => {
    const t0 = 1_000_000;
    expect(colonyGraceUntilMs(t0)).toBe(t0 + 14 * 24 * 3600 * 1000);
    expect(isInColonyGrace(t0, t0 + 1)).toBe(true);
    expect(isInColonyGrace(t0, colonyGraceUntilMs(t0))).toBe(false);
  });
});

describe('éligibilités pures', () => {
  it('corps : planète sauvage non-poison seulement (GB §3)', () => {
    expect(canColonizeBody({ bodyType: 'planet', ownerId: null, climate: 'cold' }).ok).toBe(true);
    expect(canColonizeBody({ bodyType: 'star', ownerId: null, climate: null }).ok).toBe(false);
    expect(canColonizeBody({ bodyType: 'planet', ownerId: 'x', climate: 'cold' }).reason).toBe('owned');
    expect(
      canColonizeBody({
        bodyType: 'planet',
        ownerId: null,
        climate: 'cold',
        annihilated: true,
      }).reason,
    ).toBe('annihilated');
    expect(canColonizeBody({ bodyType: 'planet', ownerId: null, climate: 'poison' }).reason).toBe(
      'poison_unbuildable',
    );
  });

  it('coque : Civil M/L uniquement (DG §8.6)', () => {
    expect(canFitColonyKit({ category: 'civil', size: 'm' })).toBe(true);
    expect(canFitColonyKit({ category: 'civil', size: 'l' })).toBe(true);
    expect(canFitColonyKit({ category: 'civil', size: 's' })).toBe(false);
    expect(canFitColonyKit({ category: 'cargo', size: 'm' })).toBe(false);
  });
});

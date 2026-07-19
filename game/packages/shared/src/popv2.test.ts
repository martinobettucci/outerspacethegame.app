/**
 * Population v2 — règles pures (DG §3.2-v2, Round 9 / guide v0.10).
 */
import { describe, expect, it } from 'vitest';
import {
  agingFlows,
  applyDeaths,
  breathesFromStock,
  CLOCK_DAYS,
  clockDeathsPerDay,
  growthModulator,
  lifeModulator,
  NATALITY_BY_RESIDENTIAL,
  overcapDeathsPerDay,
  illnessDeltaV2,
  illnessDeathsPerDay,
  STABLE_PYRAMID,
  stableSplit,
  weightedHeads,
} from './popv2.js';

describe('démographie v2 — pyramide & vieillissement (§a)', () => {
  it('la pyramide stationnaire découle des époques 20/60/30 (ancre 4)', () => {
    expect(STABLE_PYRAMID.children).toBeCloseTo(0.1818, 3);
    expect(STABLE_PYRAMID.actives).toBeCloseTo(0.5455, 3);
    expect(STABLE_PYRAMID.seniors).toBeCloseTo(0.2727, 3);
  });

  it('stableSplit conserve le total', () => {
    const p = stableSplit(350);
    expect(p.children + p.actives + p.seniors).toBeCloseTo(350, 9);
  });

  it('à la pyramide stationnaire, les flux se compensent (hors natalité)', () => {
    const p = stableSplit(1000);
    const f = agingFlows(p, 1);
    // C→A = A→S = S→† : la pyramide est un point fixe du vieillissement.
    expect(f.toActives).toBeCloseTo(f.toSeniors, 6);
    expect(f.toSeniors).toBeCloseTo(f.seniorDeaths, 6);
  });
});

describe('rations & oxygène (§b)', () => {
  it('têtes pondérées : actifs 1×, enfants/seniors 0,6×', () => {
    expect(
      weightedHeads({ children: 100, actives: 100, seniors: 100 }),
    ).toBeCloseTo(100 + 0.6 * 200, 9);
  });

  it("l'oxygène n'est respiré au stock QUE sur climat hostile", () => {
    expect(breathesFromStock('temperate')).toBe(false);
    expect(breathesFromStock('hot')).toBe(true);
    expect(breathesFromStock('cold')).toBe(true);
    expect(breathesFromStock('poison')).toBe(true);
  });
});

describe('natalité & modulateur (§c/§d)', () => {
  it('sans residential : natalité NULLE (canon)', () => {
    expect(NATALITY_BY_RESIDENTIAL[0]).toBe(0);
  });

  it('les imports ne nourrissent pas la croissance : déficit local = frein', () => {
    // ρ < 1 (production locale sous le besoin) même avec du stock plein.
    expect(lifeModulator([0.5])).toBe(0.5);
    expect(lifeModulator([1.0])).toBe(1.0);
    expect(lifeModulator([2.0])).toBeCloseTo(1.15, 9);
    // Produit borné au cap.
    expect(lifeModulator([2, 2, 2])).toBeCloseTo(1.5, 9);
  });

  it('M_growth : plancher 0,5 à Ē = 0, 1,0 à Ē = 1 (flux neutres)', () => {
    expect(growthModulator(0, [1])).toBeCloseTo(0.5, 9);
    expect(growthModulator(1, [1])).toBeCloseTo(1.0, 9);
  });
});

describe('sur-capacité & maladie (§h)', () => {
  it('parabole : nulle sous le cap, 0,25·o²·P au-delà', () => {
    expect(overcapDeathsPerDay(1000, 2000)).toBe(0);
    expect(overcapDeathsPerDay(3000, 2000)).toBeCloseTo(0.25 * 0.25 * 3000, 6);
  });

  it('la clinique décale la mortalité de maladie (plancher 0)', () => {
    const none = illnessDeathsPerDay(0.3, 0, 1000);
    const l3 = illnessDeathsPerDay(0.3, 3, 1000);
    expect(none).toBeCloseTo(0.03 * 0.3 * 1000, 9);
    expect(l3).toBe(0); // 0,3 − 0,35 → plancher 0
  });

  it('la pression de maladie est parabolique en o', () => {
    const d1 = illnessDeltaV2(0.1, 0, false);
    const d2 = illnessDeltaV2(0.2, 0, false);
    expect(d2 / d1).toBeCloseTo(4, 6);
  });
});

describe('horloges de mort (§i)', () => {
  it('canon : eau 3 j, vivres 10 j', () => {
    expect(CLOCK_DAYS.water).toBe(3);
    expect(CLOCK_DAYS.food).toBe(10);
  });

  it('linéaire à échéance FIXE : intégrée, elle tue TOUT LE MONDE', () => {
    // Simule la matérialisation quotidienne sur 3 jours.
    let pyr = stableSplit(900);
    const t0 = 0;
    const deadline = 3 * 86_400_000;
    for (let day = 0; day < 3; day++) {
      const pop = pyr.children + pyr.actives + pyr.seniors;
      const d = Math.min(pop, clockDeathsPerDay(pop, day * 86_400_000, deadline));
      pyr = applyDeaths(pyr, d);
    }
    expect(pyr.children + pyr.actives + pyr.seniors).toBeLessThan(1e-6);
    void t0;
  });

  it('applyDeaths est proportionnel et borné', () => {
    const p = applyDeaths({ children: 10, actives: 20, seniors: 10 }, 20);
    expect(p.children + p.actives + p.seniors).toBeCloseTo(20, 9);
    expect(p.actives / p.children).toBeCloseTo(2, 9);
    const wiped = applyDeaths({ children: 5, actives: 5, seniors: 5 }, 999);
    expect(wiped.children + wiped.actives + wiped.seniors).toBe(0);
  });
});

describe('emploi universel (§e, chunk BB)', () => {
  it('BASE_JOBS est EXHAUSTIF : les 28 bâtiments du catalogue + la clinique', async () => {
    const { ALL_BUILDING_KEYS } = await import('./buildings.js');
    const { BASE_JOBS } = await import('./popv2.js');
    for (const key of ALL_BUILDING_KEYS) {
      expect(BASE_JOBS[key], key).toBeGreaterThan(0);
    }
    expect(BASE_JOBS.clinic).toBeGreaterThan(0);
  });

  it('popScale : plancher 1 (Round 9), √ au-delà de la référence, plafond 2', async () => {
    const { popScale } = await import('./popv2.js');
    expect(popScale(350)).toBe(1);
    expect(popScale(2000)).toBe(1);
    expect(popScale(8000)).toBeCloseTo(2, 9);
    expect(popScale(60000)).toBe(2);
  });

  it("jobsOptimal : l'optimum dérive avec la population (le point qui shifte)", async () => {
    const { jobsOptimal } = await import('./popv2.js');
    expect(jobsOptimal('mine', 1, 350)).toBe(50); // historique préservé
    expect(jobsOptimal('mine', 2, 2000)).toBeCloseTo(120, 9);
    expect(jobsOptimal('mine', 1, 4500)).toBeCloseTo(50 * Math.sqrt(2.25), 6);
  });

  it('chômage : tolérance 7 %, morts γ(τ−7 %)×P', async () => {
    const { unemploymentRate, unemploymentDeathsPerDay } = await import('./popv2.js');
    expect(unemploymentRate(93, 100)).toBeCloseTo(0.07, 9);
    expect(unemploymentDeathsPerDay(0.07, 1000)).toBe(0);
    expect(unemploymentDeathsPerDay(0.57, 1000)).toBeCloseTo(0.02 * 0.5 * 1000, 9);
  });
});

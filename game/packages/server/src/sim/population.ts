/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2.pop; docs/POP_V2_PLAN.md §BA–§BD; GAME_BOOK.md §10; DESIGN_GUIDE.md §3.2-v2. */
/**
 * Indicateurs démographiques dérivés d'un snapshot de production.
 *
 * Cette couche est partagée par le tick autoritaire et le détail planète :
 * l'UI ne réimplémente donc ni l'emploi, ni les facteurs de natalité, ni
 * les projections de survie (CLAUDE.md §2/§10).
 */
import {
  CLINIC_REDUCTION,
  CLOCK_DAYS,
  effectiveIllness,
  efficiency,
  FOOD_RESOURCES,
  GROWTH_EFF_FLOOR,
  GROWTH_EFF_NEUTRAL,
  growthModulator,
  jobsOptimal,
  lifeModulator,
  NATALITY_BY_RESIDENTIAL,
  unemploymentRate,
} from '@atg/shared';
import type { ResourceId } from '@atg/shared';
import type { ProductionSnapshot } from './rebase.js';

export interface PopulationIndicators {
  employedActives: number;
  employmentRate: number;
  unemploymentRate: number;
  consumingIdleShare: number;
  meanEfficiency: number;
  residentialLevel: number;
  clinicLevel: number;
  clinicReduction: number;
  effectiveIllness: number;
  localRhos: { food: number; water: number; oxygen: number | null };
  efficiencyModulator: number;
  lifeModulator: number;
  growthModulator: number;
  birthsPerDay: number;
}

const satisfaction = (served: number, need: number): number =>
  need > 1e-9 ? served / need : 1;

/**
 * Les imports nourrissent la population mais pas sa croissance : le débit
 * net est rendu local en rajoutant uniquement les consommations de vie
 * effectivement servies, exactement comme le tick `pop_daily`.
 */
export function populationIndicators(
  snap: ProductionSnapshot,
): PopulationIndicators {
  let employedActives = 0;
  let weightedEfficiency = 0;
  for (const building of snap.buildings) {
    if (building.status !== 'active' || building.workforce <= 0) continue;
    const optimal = jobsOptimal(
      building.key,
      building.level,
      snap.population,
    );
    if (optimal <= 0) continue;
    employedActives += building.workforce;
    weightedEfficiency +=
      efficiency(building.workforce / optimal) * building.workforce;
  }
  const meanEfficiency =
    employedActives > 0
      ? weightedEfficiency / employedActives
      : GROWTH_EFF_NEUTRAL;

  const rateOf = snap.rates.stockRates as Partial<Record<ResourceId, number>>;
  const gross = (family: readonly ResourceId[], consumed: number): number =>
    family.reduce((sum, resource) => sum + (rateOf[resource] ?? 0), 0) +
    consumed;
  const foodRho = satisfaction(
    gross(
      FOOD_RESOURCES,
      snap.rates.popConsumption.food +
        snap.rates.hoverSurvivalConsumption.food,
    ),
    snap.rates.popNeeds.food,
  );
  const waterRho = satisfaction(
    gross(
      ['water'],
      snap.rates.popConsumption.water +
        snap.rates.hoverSurvivalConsumption.water,
    ),
    snap.rates.popNeeds.water,
  );
  const oxygenRho =
    snap.rates.popNeeds.oxygen > 1e-9
      ? satisfaction(
          gross(['oxygen'], snap.rates.popConsumption.oxygen),
          snap.rates.popNeeds.oxygen,
        )
      : null;
  const rhos = [foodRho, waterRho, ...(oxygenRho === null ? [] : [oxygenRho])];

  const residentialLevel = Math.max(
    0,
    ...snap.buildings
      .filter(
        (building) =>
          building.key === 'residential' && building.status === 'active',
      )
      .map((building) => building.level),
  );
  const clinicLevel = Math.max(
    0,
    ...snap.buildings
      .filter(
        (building) =>
          building.key === 'clinic' && building.status === 'active',
      )
      .map((building) => building.level),
  );
  const mEfficiency =
    GROWTH_EFF_FLOOR + (1 - GROWTH_EFF_FLOOR) * meanEfficiency;
  const mLife = lifeModulator(rhos);
  const mGrowth = growthModulator(meanEfficiency, rhos);
  const actives = snap.pyramid.actives;

  return {
    employedActives,
    employmentRate:
      actives > 0 ? Math.min(1, employedActives / actives) : 0,
    unemploymentRate: unemploymentRate(employedActives, actives),
    consumingIdleShare:
      snap.population > 0
        ? (snap.pyramid.children + snap.pyramid.seniors) / snap.population
        : 0,
    meanEfficiency,
    residentialLevel,
    clinicLevel,
    clinicReduction: CLINIC_REDUCTION[clinicLevel] ?? 0,
    effectiveIllness: effectiveIllness(snap.illness, clinicLevel),
    localRhos: { food: foodRho, water: waterRho, oxygen: oxygenRho },
    efficiencyModulator: mEfficiency,
    lifeModulator: mLife,
    growthModulator: mGrowth,
    birthsPerDay:
      (NATALITY_BY_RESIDENTIAL[residentialLevel] ?? 0) * actives * mGrowth,
  };
}

export type SurvivalFamily = 'water' | 'food' | 'oxygen';
export interface SurvivalForecast {
  family: SurvivalFamily;
  amountT: number;
  ratePerDay: number;
  dryAt: string | null;
  deathAt: string | null;
  state: 'stable' | 'projected' | 'countdown';
  instantDeath: boolean;
}

/** Projection inverse du gisement : stock + débit net → date de zéro. */
export function survivalForecasts(
  snap: ProductionSnapshot,
  nowMs: number,
): Record<SurvivalFamily, SurvivalForecast | null> {
  const amountOf = (family: readonly ResourceId[]): number =>
    family.reduce(
      (sum, resource) => sum + (snap.stocks[resource] ?? 0),
      0,
    );
  const rateOf = (family: readonly ResourceId[]): number =>
    family.reduce(
      (sum, resource) => sum + (snap.rates.stockRates[resource] ?? 0),
      0,
    );

  const forecast = (
    family: SurvivalFamily,
    resources: readonly ResourceId[],
    instantDeath: boolean,
  ): SurvivalForecast => {
    const amountT = amountOf(resources);
    const ratePerDay = rateOf(resources);
    const activeDeadline =
      family === 'oxygen' ? undefined : snap.clockDeadlines[family];
    if (activeDeadline) {
      const deathMs = new Date(activeDeadline).getTime();
      const dryMs = deathMs - CLOCK_DAYS[family as 'water' | 'food'] * 86_400_000;
      return {
        family,
        amountT,
        ratePerDay,
        dryAt: new Date(dryMs).toISOString(),
        deathAt: new Date(deathMs).toISOString(),
        state: 'countdown',
        instantDeath,
      };
    }
    if (ratePerDay < -1e-9) {
      const dryMs =
        amountT <= 1e-9
          ? nowMs
          : nowMs + (amountT / -ratePerDay) * 86_400_000;
      const deathMs = instantDeath
        ? dryMs
        : dryMs + CLOCK_DAYS[family as 'water' | 'food'] * 86_400_000;
      return {
        family,
        amountT,
        ratePerDay,
        dryAt: new Date(dryMs).toISOString(),
        deathAt: new Date(deathMs).toISOString(),
        state: 'projected',
        instantDeath,
      };
    }
    return {
      family,
      amountT,
      ratePerDay,
      dryAt: null,
      deathAt: null,
      state: 'stable',
      instantDeath,
    };
  };

  return {
    water: forecast('water', ['water'], false),
    food: forecast('food', FOOD_RESOURCES, false),
    oxygen:
      snap.rates.popNeeds.oxygen > 1e-9
        ? forecast('oxygen', ['oxygen'], true)
        : null,
  };
}

/**
 * Codex facts — the ONLY numeric surface of the player manual.
 *
 * Anti-drift contract (docs/MANUAL_PLAN.md §2): the Codex owns no numbers of
 * its own. Every value here is imported LIVE from `@atg/shared` — the same
 * constants the simulation runs on — so a balance change flows into the manual
 * automatically and can never leave it stale. Section renderers must read from
 * `CODEX_FACTS` (and the formatters below); they must never inline a literal.
 *
 * `facts.test.ts` asserts each fact still equals its source constant, catching
 * any future regression that replaces an import with a hardcoded value.
 */
import {
  TRACE_MINING_T_PER_DAY,
  EFFICIENCY_FLOOR,
  EFFICIENCY_MU,
  STORAGE_BRAKE_START,
  CHILD_DAYS,
  ACTIVE_DAYS,
  SENIOR_DAYS,
  NATALITY_BY_RESIDENTIAL,
  RATION_CS,
  OXYGEN_PER_1000_PER_DAY,
  CLOCK_DAYS,
  OVERCAP_DEATHS_COEF,
  UNEMP_TOLERANCE,
  UNEMP_GRACE_DAYS,
  STARTER_POP,
} from '@atg/shared';

/** Live values, pulled from the shared canon. No literals — see contract above. */
export const CODEX_FACTS = {
  // Deposits & mining
  traceRatePerDay: TRACE_MINING_T_PER_DAY,
  // Efficiency & employment
  efficiencyPeakU: EFFICIENCY_MU,
  efficiencyFloor: EFFICIENCY_FLOOR,
  storageBrakeStart: STORAGE_BRAKE_START,
  unempTolerance: UNEMP_TOLERANCE,
  unempGraceDays: UNEMP_GRACE_DAYS,
  // Population
  childDays: CHILD_DAYS,
  activeDays: ACTIVE_DAYS,
  seniorDays: SENIOR_DAYS,
  natalityMaxPerActivePerDay: Math.max(...NATALITY_BY_RESIDENTIAL),
  inactiveRation: RATION_CS,
  oxygenPer1000PerDay: OXYGEN_PER_1000_PER_DAY,
  waterClockDays: CLOCK_DAYS.water,
  foodClockDays: CLOCK_DAYS.food,
  overcapDeathsCoef: OVERCAP_DEATHS_COEF,
  starterPop: STARTER_POP,
} as const;

/* ---- Formatters (pure, unit-tested) ---------------------------------- */

/** 0.07 → "7%" (rounded to whole percent). */
export const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** 20 → "20 days", 1 → "1 day". */
export const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`;

/** 2 → "2 T/day". */
export const perDay = (n: number): string => `${n} T/day`;

/** 350 → "350" with a thin thousands separator for readability. */
export const count = (n: number): string => n.toLocaleString('en-US');

/** @verifies This test file verifies: docs/BACKLOG.md §P2.codex; docs/MANUAL_PLAN.md §2–§7. */
/**
 * Anti-drift guard (docs/MANUAL_PLAN.md §2 / §7): every Codex fact must equal
 * its live `@atg/shared` source constant. If a future edit replaces an import
 * with a literal, or a balance change moves a constant, this test fails —
 * forcing the manual and the simulation back into agreement.
 *
 * Pure module test (no DOM): the client has vitest only, no testing-library.
 */
import { describe, expect, it } from 'vitest';
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
  MEDICINE_AGE_WEIGHTS,
  OXYGEN_PER_1000_PER_DAY,
  POP_NEEDS_PER_1000_PER_DAY,
  CLOCK_DAYS,
  CLINIC_REDUCTION,
  OVERCAP_DEATHS_COEF,
  UNEMP_TOLERANCE,
  UNEMP_GRACE_DAYS,
  STARTER_POP,
  UNINSTALL_HOURS,
  DISASSEMBLE_REFUND_FRACTION,
  ENHANCED_FABRICATOR_LEVEL,
  ENHANCED_RATE_MULT,
  RUN_PCT_STEP,
} from '@atg/shared';
import { CODEX_FACTS, count, days, pct, perDay } from './facts.ts';

describe('CODEX_FACTS binds live @atg/shared constants (anti-drift)', () => {
  it('deposits & mining', () => {
    expect(CODEX_FACTS.traceRatePerDay).toBe(TRACE_MINING_T_PER_DAY);
  });

  it('efficiency & employment', () => {
    expect(CODEX_FACTS.efficiencyPeakU).toBe(EFFICIENCY_MU);
    expect(CODEX_FACTS.efficiencyFloor).toBe(EFFICIENCY_FLOOR);
    expect(CODEX_FACTS.storageBrakeStart).toBe(STORAGE_BRAKE_START);
    expect(CODEX_FACTS.unempTolerance).toBe(UNEMP_TOLERANCE);
    expect(CODEX_FACTS.unempGraceDays).toBe(UNEMP_GRACE_DAYS);
  });

  it('population', () => {
    expect(CODEX_FACTS.childDays).toBe(CHILD_DAYS);
    expect(CODEX_FACTS.activeDays).toBe(ACTIVE_DAYS);
    expect(CODEX_FACTS.seniorDays).toBe(SENIOR_DAYS);
    expect(CODEX_FACTS.natalityMaxPerActivePerDay).toBe(
      Math.max(...NATALITY_BY_RESIDENTIAL),
    );
    expect(CODEX_FACTS.inactiveRation).toBe(RATION_CS);
    expect(CODEX_FACTS.oxygenPer1000PerDay).toBe(OXYGEN_PER_1000_PER_DAY);
    expect(CODEX_FACTS.medicineNeedPer1000PerDay).toBe(
      POP_NEEDS_PER_1000_PER_DAY.medicine,
    );
    expect(CODEX_FACTS.medicineAgeWeights).toEqual(MEDICINE_AGE_WEIGHTS);
    expect(CODEX_FACTS.waterClockDays).toBe(CLOCK_DAYS.water);
    expect(CODEX_FACTS.foodClockDays).toBe(CLOCK_DAYS.food);
    expect(CODEX_FACTS.clinicReductionByLevel).toEqual(CLINIC_REDUCTION);
    expect(CODEX_FACTS.overcapDeathsCoef).toBe(OVERCAP_DEATHS_COEF);
    expect(CODEX_FACTS.starterPop).toBe(STARTER_POP);
  });

  it('ship gear (W9d)', () => {
    expect(CODEX_FACTS.gearUninstallHours).toBe(UNINSTALL_HOURS);
    expect(CODEX_FACTS.gearRefundFraction).toBe(DISASSEMBLE_REFUND_FRACTION);
    expect(CODEX_FACTS.gearEnhancedFabricatorLevel).toBe(ENHANCED_FABRICATOR_LEVEL);
    expect(CODEX_FACTS.gearEnhancedRateMult).toBe(ENHANCED_RATE_MULT);
    expect(CODEX_FACTS.gearRunPctStep).toBe(RUN_PCT_STEP);
  });
});

describe('formatters', () => {
  it('pct rounds to whole percent', () => {
    expect(pct(0.07)).toBe('7%');
    expect(pct(0.7)).toBe('70%');
    expect(pct(0.125)).toBe('13%');
  });
  it('days pluralizes', () => {
    expect(days(1)).toBe('1 day');
    expect(days(20)).toBe('20 days');
  });
  it('perDay tags tons', () => {
    expect(perDay(2)).toBe('2 T/day');
  });
  it('count groups thousands', () => {
    expect(count(350)).toBe('350');
    expect(count(2000)).toBe('2,000');
  });
});

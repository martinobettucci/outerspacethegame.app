/**
 * Codex chapter registry — spoiler-free "systems only" content
 * (docs/MANUAL_PLAN.md §1, §6). Each body composes prose from `codexEn` with
 * live numbers from `CODEX_FACTS`; an "Exact rule" disclosure reveals the
 * formulae for optimisers. First slice: three chapters.
 */
import type { ReactNode } from 'react';
import { Gauge, Pickaxe, Users } from 'lucide-react';
import { EfficiencyCurve } from '../components/EfficiencyCurve.tsx';
import type { View } from '../state.tsx';
import { CODEX_FACTS, count, days, pct, perDay } from './facts.ts';
import { codexEn as c } from './strings.ts';
import { AgePyramidDiagram, DepositDepletionDiagram } from './diagrams.tsx';

export type CodexSectionId = 'deposits' | 'population' | 'efficiency';

export interface CodexSection {
  id: CodexSectionId;
  title: string;
  icon: ReactNode;
  Body: () => ReactNode;
}

/** Reusable "Exact rule & formula" disclosure (native <details>, keyboard-safe). */
function ExactRule({ children }: { children: ReactNode }) {
  return (
    <details className="ls-codex-exact">
      <summary>{c.exactRuleToggle}</summary>
      <div className="ls-codex-exact__body">{children}</div>
    </details>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <li className="ls-codex-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  );
}

function DepositsBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.deposits.lead}</p>
      <p>{c.deposits.finite}</p>
      <p>{c.deposits.trace}</p>
      <p className="ls-codex-warn">{c.deposits.trap}</p>
      <p>{c.deposits.crystals}</p>
      <DepositDepletionDiagram />
      <p className="ls-codex-caption">{c.deposits.diagramCaption}</p>
      <ExactRule>
        <p>{c.deposits.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.deposits.exactTrace} value={perDay(f.traceRatePerDay)} />
          <Fact label={c.deposits.exactDeposit} value="efficiency × richness" />
          <Fact label={c.deposits.exactDry} value="0 T/day, permanent" />
        </ul>
      </ExactRule>
    </>
  );
}

function PopulationBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.population.lead}</p>
      <p>{c.population.consumers}</p>
      <p>{c.population.natality}</p>
      <p className="ls-codex-warn">{c.population.lifesupport}</p>
      <p>{c.population.overcap}</p>
      <p>{c.population.health}</p>
      <p>{c.population.clinic}</p>
      <p>{c.population.extinction}</p>
      <AgePyramidDiagram />
      <p className="ls-codex-caption">{c.population.diagramCaption}</p>
      <ExactRule>
        <p>{c.population.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact
            label={c.population.exactAges}
            value={`${days(f.childDays)} / ${days(f.activeDays)} / ${days(f.seniorDays)}`}
          />
          <Fact label={c.population.exactRation} value={pct(f.inactiveRation)} />
          <Fact label={c.population.exactOxygen} value={perDay(f.oxygenPer1000PerDay)} />
          <Fact label={c.population.exactMedicine} value={perDay(f.medicineNeedPer1000PerDay)} />
          <Fact
            label={c.population.exactMedicineWeights}
            value={`${f.medicineAgeWeights.children}× / ${f.medicineAgeWeights.actives}× / ${f.medicineAgeWeights.seniors}×`}
          />
          <Fact
            label={c.population.exactClocks}
            value={`${days(f.waterClockDays)} / ${days(f.foodClockDays)}`}
          />
          <Fact
            label={c.population.exactClinic}
            value={f.clinicReductionByLevel.slice(1).map(pct).join(' / ')}
          />
          <Fact label={c.population.exactStarter} value={count(f.starterPop)} />
        </ul>
      </ExactRule>
    </>
  );
}

function EfficiencyBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.efficiency.lead}</p>
      <p>{c.efficiency.drift}</p>
      <p className="ls-codex-warn">{c.efficiency.unemployment}</p>
      <p>{c.efficiency.storage}</p>
      <EfficiencyCurve u={f.efficiencyPeakU} label="Sweet spot" />
      <p className="ls-codex-caption">{c.efficiency.diagramCaption}</p>
      <ExactRule>
        <p>{c.efficiency.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.efficiency.exactPeak} value={pct(f.efficiencyPeakU)} />
          <Fact label={c.efficiency.exactFloor} value={pct(f.efficiencyFloor)} />
          <Fact
            label={c.efficiency.exactUnemp}
            value={`${pct(f.unempTolerance)} · ${days(f.unempGraceDays)} grace`}
          />
          <Fact label={c.efficiency.exactBrake} value={pct(f.storageBrakeStart)} />
        </ul>
      </ExactRule>
    </>
  );
}

export const CODEX_SECTIONS: CodexSection[] = [
  { id: 'deposits', title: c.deposits.title, icon: <Pickaxe size={16} />, Body: DepositsBody },
  { id: 'population', title: c.population.title, icon: <Users size={16} />, Body: PopulationBody },
  { id: 'efficiency', title: c.efficiency.title, icon: <Gauge size={16} />, Body: EfficiencyBody },
];

/**
 * Contextual deep-link: pick the chapter most relevant to the current screen.
 * Slice 1 chapters are all planet-side, so non-planet screens open on the
 * first chapter; the map extends as later chapters land (travel, economy…).
 */
export function defaultSectionFor(kind: View['kind']): CodexSectionId {
  switch (kind) {
    case 'planet':
      return 'deposits';
    case 'market':
      return 'efficiency';
    case 'galaxy':
    case 'comms':
    default:
      return 'deposits';
  }
}

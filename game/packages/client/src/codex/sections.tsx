/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck”/§P2.codex; docs/MANUAL_PLAN.md §2–§7; docs/DESIGN_SYSTEM.md §5.1. */
/**
 * Codex chapter registry — spoiler-free "systems only" content
 * (docs/MANUAL_PLAN.md §1, §6). Each body composes prose from `codexEn` with
 * live numbers from `CODEX_FACTS`; an "Exact rule" disclosure reveals the
 * formulae for optimisers. First slice: three chapters.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Boxes, Building2, Gauge, Pickaxe, Rocket, Users, Volume2, Wrench } from 'lucide-react';
import { AUDIO_BUS_DEFAULTS } from '@atg/shared';
import { EfficiencyCurve } from '../components/EfficiencyCurve.tsx';
import type { View } from '../state.tsx';
import { CODEX_FACTS, count, days, pct, perDay } from './facts.ts';
import { codexEn as c } from './strings.ts';
import { AgePyramidDiagram, DepositDepletionDiagram } from './diagrams.tsx';
import { api } from '../api.js';
import { BUILDING_CODEX, CODEX_BUILDING_KEYS } from './codexBuildings.ts';

export type CodexSectionId =
  | 'deposits'
  | 'population'
  | 'efficiency'
  | 'buildings'
  | 'cargo'
  | 'gear'
  | 'audio'
  | 'crusader';

/** Contexte de rendu d'un chapitre (planète actuellement ouverte). */
export interface CodexBodyContext {
  planetId: string | null;
}

export interface CodexSection {
  id: CodexSectionId;
  title: string;
  icon: ReactNode;
  Body: (ctx: CodexBodyContext) => ReactNode;
  /** Spoiler-free (MANUAL_PLAN §1/§6) : chapitre GATÉ sur une capacité
   *  déjà découverte par CE joueur (l'écran existe pour lui). */
  requires?: 'crusader';
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


function BuildingsBody({ planetId }: CodexBodyContext) {
  const [available, setAvailable] = useState<
    { kind: 'none' } | { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; keys: string[] }
  >(planetId ? { kind: 'loading' } : { kind: 'none' });
  useEffect(() => {
    if (!planetId) {
      setAvailable({ kind: 'none' });
      return;
    }
    let cancelled = false;
    setAvailable({ kind: 'loading' });
    api
      .planet(planetId)
      .then(
        (d) =>
          !cancelled &&
          setAvailable({ kind: 'ready', keys: d.tech.available }),
      )
      .catch(() => !cancelled && setAvailable({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [planetId]);

  const entries =
    available.kind === 'ready'
      ? CODEX_BUILDING_KEYS.filter((k) => available.keys.includes(k))
      : [];
  return (
    <>
      <p>{c.buildings.lead}</p>
      <p>{c.buildings.partial}</p>
      <p>{c.buildings.warehouse}</p>
      <p>{c.buildings.context}</p>
      {available.kind === 'none' && (
        <p className="ls-codex-warn">{c.buildings.noPlanet}</p>
      )}
      {available.kind === 'error' && (
        <p className="ls-codex-warn">{c.buildings.loadError}</p>
      )}
      {available.kind === 'ready' && (
        <>
          <p className="ls-codex-caption">
            {entries.length} {c.buildings.availableHere}
          </p>
          <ul className="ls-codex-facts">
            {entries.map((key) => {
              const e = BUILDING_CODEX[key]!;
              return (
                <li className="ls-codex-fact" key={key}>
                  <span>
                    <strong style={{ textTransform: 'capitalize' }}>
                      {key.replace(/_/g, ' ')}
                    </strong>{' '}
                    ·{' '}
                    {e.instances === 'single'
                      ? c.buildings.single
                      : c.buildings.multiple}
                    <br />
                    {e.role} {e.note}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

function CargoBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.cargo.lead}</p>
      <p>{c.cargo.fungible}</p>
      <p>{c.cargo.items}</p>
      <p>{c.cargo.capacity}</p>
      <p className="ls-codex-warn">{c.cargo.weight}</p>
      <ExactRule>
        <p>{c.cargo.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.cargo.exactContainer} value="1 T of one resource, or 1 item" />
          <Fact label={c.cargo.exactCeil} value="round up to a full container" />
          <Fact
            label={c.cargo.exactUpgrade}
            value={f.cargoUpgradeMult.map((m) => `×${m}`).join(' / ')}
          />
          <Fact label={c.cargo.exactSpeed} value={`−${pct(f.cargoLoadSpeedPenalty)}`} />
          <Fact label={c.cargo.exactBurn} value={`+${pct(f.cargoLoadBurnPenalty)}`} />
        </ul>
      </ExactRule>
    </>
  );
}

function GearBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.gear.lead}</p>
      <p>{c.gear.fabrication}</p>
      <p>{c.gear.management}</p>
      <p>{c.gear.classes}</p>
      <p className="ls-codex-warn">{c.gear.warnBatch}</p>
      <p>{c.gear.freight}</p>
      <p>{c.gear.removal}</p>
      <ExactRule>
        <p>{c.gear.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.gear.exactUninstall} value={`${f.gearUninstallHours} h`} />
          <Fact label={c.gear.exactRefund} value={pct(f.gearRefundFraction)} />
          <Fact
            label={c.gear.exactEnhanced}
            value={`L${f.gearEnhancedFabricatorLevel}`}
          />
          <Fact
            label={c.gear.exactEnhancedRate}
            value={`×${f.gearEnhancedRateMult}`}
          />
          <Fact label={c.gear.exactStep} value={pct(f.gearRunPctStep / 100)} />
        </ul>
      </ExactRule>
    </>
  );
}

function CrusaderBody() {
  const f = CODEX_FACTS;
  return (
    <>
      <p>{c.crusader.lead}</p>
      <p className="ls-codex-warn">{c.crusader.breath}</p>
      <p>{c.crusader.docks}</p>
      <p>{c.crusader.fabrication}</p>
      <p>{c.crusader.noMarkets}</p>
      <ExactRule>
        <p>{c.crusader.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.crusader.exactPop} value={count(f.crusaderPopCap)} />
          <Fact label={c.crusader.exactStock} value={`${count(f.crusaderStockCapT)} T`} />
          <Fact
            label={c.crusader.exactMigration}
            value={pct(f.crusaderMigrationFraction)}
          />
          <Fact label={c.crusader.exactJobs} value={count(f.crusaderFixedJobs)} />
          <Fact
            label={c.crusader.exactDocks}
            value={`${f.crusaderDocksPerSize.s} / ${f.crusaderDocksPerSize.m} / ${f.crusaderDocksPerSize.l}`}
          />
          <Fact label={c.crusader.exactItems} value={count(f.crusaderItemCap)} />
        </ul>
      </ExactRule>
    </>
  );
}

function AudioBody() {
  // Live from @atg/shared (anti-drift, MANUAL_PLAN §2/§6.11) — never hardcoded.
  const lvl = (v: number) => String(Math.round(v * 100));
  return (
    <>
      <p>{c.audio.lead}</p>
      <p>{c.audio.buses}</p>
      <p>{c.audio.autoplay}</p>
      <p>{c.audio.persistence}</p>
      <ExactRule>
        <p>{c.audio.exactIntro}</p>
        <ul className="ls-codex-facts">
          <Fact label={c.audio.exactMaster} value={lvl(AUDIO_BUS_DEFAULTS.master)} />
          <Fact label={c.audio.exactMusic} value={lvl(AUDIO_BUS_DEFAULTS.music)} />
          <Fact label={c.audio.exactAmbience} value={lvl(AUDIO_BUS_DEFAULTS.ambience)} />
          <Fact label={c.audio.exactSfx} value={lvl(AUDIO_BUS_DEFAULTS.sfx)} />
        </ul>
      </ExactRule>
    </>
  );
}

export const CODEX_SECTIONS: CodexSection[] = [
  { id: 'deposits', title: c.deposits.title, icon: <Pickaxe size={16} />, Body: DepositsBody },
  { id: 'population', title: c.population.title, icon: <Users size={16} />, Body: PopulationBody },
  { id: 'efficiency', title: c.efficiency.title, icon: <Gauge size={16} />, Body: EfficiencyBody },
  { id: 'buildings', title: c.buildings.title, icon: <Building2 size={16} />, Body: BuildingsBody },
  { id: 'cargo', title: c.cargo.title, icon: <Boxes size={16} />, Body: CargoBody },
  { id: 'gear', title: c.gear.title, icon: <Wrench size={16} />, Body: GearBody },
  { id: 'audio', title: c.audio.title, icon: <Volume2 size={16} />, Body: AudioBody },
  { id: 'crusader', title: c.crusader.title, icon: <Rocket size={16} />, Body: CrusaderBody, requires: 'crusader' },
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
      return 'cargo';
    case 'comms':
    default:
      return 'deposits';
  }
}

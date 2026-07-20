/**
 * Planet operations ledger — demographic pyramid, employment, natality,
 * survival alarms, net resource flows and per-unit efficiency (GB §10).
 * Every value is projected by the authoritative server.
 */
import {
  Activity,
  AlertTriangle,
  Baby,
  Database,
  HeartPulse,
  TrendingDown,
  Users,
  X,
} from 'lucide-react';
import { efficiency } from '@atg/shared';
import { createPortal } from 'react-dom';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { resourceArt, spriteUrl } from '../scenes/assets.ts';
import { useDialogFocus } from './useDialogFocus.ts';
import '../styles/planet-panels.css';

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function dateLabel(value: string | null): string {
  return value ? DATE.format(new Date(value)) : t.planet.statsStable;
}

function signed(value: number): string {
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? '+' : ''}${NUMBER.format(rounded)}`;
}

function limitingLabel(limiting: string | null): string {
  if (!limiting) return '—';
  if (limiting.startsWith('input:')) {
    return `${t.planet.inputStarved} ${limiting.slice(6).replace('_', ' ')}`;
  }
  return t.planet.limiting[limiting] ?? limiting;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'active') return 'success';
  if (status === 'demolishing') return 'danger';
  return 'warning';
}

type Forecast = NonNullable<
  PlanetDetail['survivalForecasts']['water']
>;

function forecastTone(
  forecast: Forecast,
): 'success' | 'warning' | 'danger' {
  if (forecast.state === 'stable') return 'success';
  if (forecast.state === 'countdown' || forecast.instantDeath) return 'danger';
  return 'warning';
}

export function PlanetStats({
  planet,
  onClose,
}: {
  planet: PlanetDetail;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const populationPct = Math.min(
    100,
    Math.max(0, (planet.population / planet.popCap) * 100),
  );
  const storagePct = Math.min(100, Math.max(0, planet.storageU * 100));
  const pyramid = [
    {
      key: 'children',
      label: t.planet.statsChildren,
      value: planet.pyramid.children,
    },
    {
      key: 'actives',
      label: t.planet.statsActives,
      value: planet.pyramid.actives,
    },
    {
      key: 'seniors',
      label: t.planet.statsSeniors,
      value: planet.pyramid.seniors,
    },
  ] as const;
  const forecasts = Object.values(planet.survivalForecasts).filter(
    (entry): entry is Forecast => entry !== null,
  );
  const netRows = Object.entries(planet.stock).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={t.planet.statsPage}
      aria-modal="true"
      tabIndex={-1}
      className="ls-modal-layer"
    >
      <div className="ls-command-panel ls-stats-modal">
        <header className="ls-modal-header">
          <div className="ls-modal-heading">
            <span className="ls-panel-kicker">
              {t.planet.statsLedgerKicker}
            </span>
            <h3 className="ls-modal-title">
              {t.planet.statsPage} — {planet.name}
            </h3>
            <p className="ls-muted-copy">{t.planet.statsLedgerHint}</p>
          </div>
          <button
            type="button"
            className="ls-icon-button"
            onClick={onClose}
            aria-label={t.planet.close}
          >
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="ls-stats-content">
          <section
            className="ls-survival-grid"
            aria-label={t.planet.statsSurvivalAlarms}
            data-testid="survival-alarms"
          >
            {forecasts.map((forecast) => (
              <article
                key={forecast.family}
                className="ls-survival-alert"
                data-tone={forecastTone(forecast)}
              >
                <AlertTriangle size={16} aria-hidden />
                <span className="ls-survival-alert__body">
                  <strong>
                    {t.planet.statsSurvival[forecast.family]} ·{' '}
                    {forecast.state === 'countdown'
                      ? t.planet.statsCountdown
                      : forecast.state === 'projected'
                        ? t.planet.statsProjected
                        : t.planet.statsStable}
                  </strong>
                  <span>
                    {NUMBER.format(forecast.amountT)} T ·{' '}
                    {signed(forecast.ratePerDay)} {t.planet.perDay}
                  </span>
                  {forecast.dryAt && (
                    <span>
                      {t.planet.statsDryAt} {dateLabel(forecast.dryAt)}
                    </span>
                  )}
                  {forecast.deathAt && (
                    <span className="ls-survival-alert__deadline">
                      {forecast.instantDeath
                        ? t.planet.statsInstantDeath
                        : t.planet.statsTotalLoss}{' '}
                      {dateLabel(forecast.deathAt)}
                    </span>
                  )}
                </span>
              </article>
            ))}
          </section>

          <section className="ls-stats-summary">
            <article className="ls-stat-tile">
              <span className="ls-stat-tile__label">
                <Users size={14} aria-hidden /> {t.planet.population}
              </span>
              <strong className="ls-stat-tile__value">
                {NUMBER.format(planet.population)}
              </strong>
              <span className="ls-stat-tile__meta">
                {NUMBER.format(planet.popCap)} {t.planet.statsCapacity}
              </span>
              <span className="ls-stat-meter" aria-hidden="true">
                <span style={{ width: `${populationPct}%` }} />
              </span>
            </article>

            <article className="ls-section" data-testid="population-pyramid">
              <div className="ls-section-heading">
                <Baby size={14} aria-hidden /> {t.planet.statsPyramid}
              </div>
              <div className="ls-pyramid">
                {pyramid.map((row) => {
                  const share =
                    planet.population > 0 ? row.value / planet.population : 0;
                  return (
                    <div className="ls-pyramid__row" key={row.key}>
                      <span>{row.label}</span>
                      <span className="ls-pyramid__bar" aria-hidden="true">
                        <span style={{ width: `${share * 100}%` }} />
                      </span>
                      <strong>{NUMBER.format(row.value)}</strong>
                      <small>{percent(share)}</small>
                    </div>
                  );
                })}
              </div>
              <p className="ls-section-subtitle">
                {t.planet.statsConsumingIdle}:{' '}
                <strong>
                  {percent(planet.demographics.consumingIdleShare, 1)}
                </strong>
              </p>
            </article>

            <article className="ls-stat-tile">
              <span className="ls-stat-tile__label">
                <Database size={14} aria-hidden /> {t.planet.storage}
              </span>
              <strong className="ls-stat-tile__value">
                {NUMBER.format(planet.storageUsedT)} T
              </strong>
              <span className="ls-stat-tile__meta">
                {NUMBER.format(planet.storageCapT)} T {t.planet.statsCapacity}
              </span>
              <span className="ls-stat-meter" aria-hidden="true">
                <span style={{ width: `${storagePct}%` }} />
              </span>
            </article>
          </section>

          <section className="ls-demographic-grid">
            <article className="ls-section" data-testid="employment-stats">
              <div className="ls-section-heading">
                <Activity size={14} aria-hidden /> {t.planet.statsEmployment}
              </div>
              <dl className="ls-factor-list">
                <div>
                  <dt>{t.planet.statsEmployed}</dt>
                  <dd>
                    {NUMBER.format(planet.demographics.employedActives)} /{' '}
                    {NUMBER.format(planet.pyramid.actives)} ·{' '}
                    {percent(planet.demographics.employmentRate, 1)}
                  </dd>
                </div>
                <div
                  data-tone={
                    planet.demographics.unemploymentRate > 0.07
                      ? 'danger'
                      : 'success'
                  }
                >
                  <dt>{t.planet.statsUnemployment}</dt>
                  <dd>{percent(planet.demographics.unemploymentRate, 1)}</dd>
                </div>
                <div>
                  <dt>{t.planet.statsMeanEfficiency}</dt>
                  <dd>{percent(planet.demographics.meanEfficiency, 1)}</dd>
                </div>
              </dl>
            </article>

            <article className="ls-section" data-testid="clinic-effect">
              <div className="ls-section-heading">
                <HeartPulse size={14} aria-hidden /> {t.planet.statsHealth}
              </div>
              <dl className="ls-factor-list">
                <div>
                  <dt>{t.planet.statsIllnessRaw}</dt>
                  <dd>{percent(planet.illness, 1)}</dd>
                </div>
                <div>
                  <dt>{t.planet.statsClinic}</dt>
                  <dd>
                    L{planet.demographics.clinicLevel} · −
                    {percent(planet.demographics.clinicReduction, 0)}
                  </dd>
                </div>
                <div>
                  <dt>{t.planet.statsIllnessEffective}</dt>
                  <dd>{percent(planet.demographics.effectiveIllness, 1)}</dd>
                </div>
              </dl>
            </article>

            <article className="ls-section">
              <div className="ls-section-heading">
                <Baby size={14} aria-hidden /> {t.planet.statsNatality}
              </div>
              <dl className="ls-factor-list">
                <div>
                  <dt>{t.planet.statsResidential}</dt>
                  <dd>L{planet.demographics.residentialLevel}</dd>
                </div>
                <div>
                  <dt>Ē / M_eff</dt>
                  <dd>
                    {planet.demographics.meanEfficiency.toFixed(3)} /{' '}
                    {planet.demographics.efficiencyModulator.toFixed(3)}
                  </dd>
                </div>
                <div>
                  <dt>M_life / M_growth</dt>
                  <dd>
                    {planet.demographics.lifeModulator.toFixed(3)} /{' '}
                    {planet.demographics.growthModulator.toFixed(3)}
                  </dd>
                </div>
                <div>
                  <dt>{t.planet.statsBirths}</dt>
                  <dd>
                    {NUMBER.format(planet.demographics.birthsPerDay)}{' '}
                    {t.planet.perDay}
                  </dd>
                </div>
              </dl>
            </article>
          </section>

          <section className="ls-section" data-testid="net-production">
            <div className="ls-section-heading">
              <TrendingDown size={14} aria-hidden />{' '}
              {t.planet.statsNetProduction}
            </div>
            <p className="ls-section-subtitle">
              {t.planet.statsNetProductionHint}
            </p>
            <div className="ls-net-grid">
              {netRows.map(([resource, flow]) => (
                <div className="ls-net-row" key={resource}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      minWidth: 0,
                    }}
                  >
                    <img
                      src={spriteUrl(resourceArt(resource))}
                      alt=""
                      width={18}
                      height={18}
                      loading="lazy"
                      style={{
                        flex: '0 0 auto',
                        imageRendering: 'pixelated',
                        borderRadius: 3,
                      }}
                    />
                    {resource.replace(/_/g, ' ')}
                  </span>
                  <span>{NUMBER.format(flow.amount)} T</span>
                  <strong data-tone={flow.ratePerDay < 0 ? 'danger' : 'success'}>
                    {signed(flow.ratePerDay)} {t.planet.perDay}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="ls-section">
            <div className="ls-section-heading">
              <Activity size={14} aria-hidden /> {t.planet.statsUnits}
            </div>
            <div className="ls-table-shell">
              <table className="ls-data-table">
                <thead>
                  <tr>
                    <th scope="col">{t.planet.statsUnit}</th>
                    <th scope="col">{t.planet.statsLevel}</th>
                    <th scope="col">{t.planet.statsStatus}</th>
                    <th scope="col" className="ls-data-table__number">
                      {t.planet.statsJobs}
                    </th>
                    <th scope="col" className="ls-data-table__number">
                      {t.planet.statsU}
                    </th>
                    <th scope="col" className="ls-data-table__number">
                      {t.planet.statsE}
                    </th>
                    <th scope="col" className="ls-data-table__number">
                      {t.planet.statsRate}
                    </th>
                    <th scope="col">{t.planet.statsLimiting}</th>
                  </tr>
                </thead>
                <tbody>
                  {planet.buildings.map((building) => (
                    <tr key={building.id}>
                      <td className="ls-data-table__unit">
                        {building.key.replace(/_/g, ' ')}
                        {building.recipe
                          ? ` · ${
                              building.recipe.startsWith('extract:')
                                ? building.recipe.slice(8).replace('_', ' ')
                                : building.recipe.replace(/_/g, ' ')
                            }`
                          : ''}
                      </td>
                      <td>L{building.level}</td>
                      <td>
                        <span
                          className="ls-table-status"
                          data-tone={statusTone(building.status)}
                        >
                          {building.status}
                        </span>
                      </td>
                      <td className="ls-data-table__number">
                        {NUMBER.format(building.workforce)} /{' '}
                        {NUMBER.format(building.workforceOptimal)}
                      </td>
                      <td className="ls-data-table__number">
                        {building.workforceU !== null
                          ? percent(building.workforceU)
                          : '—'}
                      </td>
                      <td className="ls-data-table__number">
                        {building.workforceU !== null
                          ? percent(efficiency(building.workforceU))
                          : '—'}
                      </td>
                      <td className="ls-data-table__number">
                        {building.effBatchesPerDay !== null
                          ? `${NUMBER.format(building.effBatchesPerDay)}${t.planet.perDay}`
                          : t.planet.statsService}
                      </td>
                      <td className="ls-data-table__muted">
                        {limitingLabel(building.limiting)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

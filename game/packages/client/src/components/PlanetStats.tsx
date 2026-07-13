/**
 * Planet operations ledger — every unit, utilization, efficiency and
 * dominant limiting factor required by canon, presented as a command-deck
 * diagnostic rather than a generic table modal.
 */
import { Activity, Database, Users, X } from 'lucide-react';
import { efficiency } from '@atg/shared';
import { createPortal } from 'react-dom';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { EfficiencyCurve } from './EfficiencyCurve.tsx';
import { useDialogFocus } from './useDialogFocus.ts';
import '../styles/planet-panels.css';

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

export function PlanetStats({
  planet,
  onClose,
}: {
  planet: PlanetDetail;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const popU = planet.population / planet.popCap;
  const populationPct = Math.min(100, Math.max(0, popU * 100));
  const storagePct = Math.min(100, Math.max(0, planet.storageU * 100));

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
            <span className="ls-panel-kicker">Planetary operations ledger</span>
            <h3 className="ls-modal-title">
              {t.planet.statsPage} — {planet.name}
            </h3>
            <p className="ls-muted-copy">
              Live utilization, output and limiting factors across every unit.
            </p>
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
          <section className="ls-stats-summary" aria-label={t.planet.efficiency}>
            <div className="ls-section ls-stats-curve">
              <div className="ls-section-heading">
                <Activity size={14} aria-hidden />
                {t.planet.efficiency}
              </div>
              <EfficiencyCurve
                u={popU}
                label={t.planet.statsPlanetRow}
              />
            </div>

            <article className="ls-stat-tile">
              <span className="ls-stat-tile__label">
                <Users size={14} aria-hidden /> {t.planet.population}
              </span>
              <strong className="ls-stat-tile__value">
                {Math.round(planet.population).toLocaleString('en-US')}
              </strong>
              <span className="ls-stat-tile__meta">
                {planet.popCap.toLocaleString('en-US')} capacity
              </span>
              <span className="ls-stat-meter" aria-hidden="true">
                <span style={{ width: `${populationPct}%` }} />
              </span>
            </article>

            <article className="ls-stat-tile">
              <span className="ls-stat-tile__label">
                <Database size={14} aria-hidden /> {t.planet.storage}
              </span>
              <strong className="ls-stat-tile__value">
                {Math.round(planet.storageUsedT).toLocaleString('en-US')} T
              </strong>
              <span className="ls-stat-tile__meta">
                {planet.storageCapT.toLocaleString('en-US')} T capacity
              </span>
              <span className="ls-stat-meter" aria-hidden="true">
                <span style={{ width: `${storagePct}%` }} />
              </span>
            </article>
          </section>

          <div className="ls-table-shell">
            <table className="ls-data-table">
              <thead>
                <tr>
                  <th scope="col">{t.planet.statsUnit}</th>
                  <th scope="col">{t.planet.statsLevel}</th>
                  <th scope="col">{t.planet.statsStatus}</th>
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
                <tr>
                  <td className="ls-data-table__unit">
                    {t.planet.statsPlanetRow}
                  </td>
                  <td className="ls-data-table__muted">—</td>
                  <td className="ls-data-table__muted">—</td>
                  <td className="ls-data-table__number">
                    {(popU * 100).toFixed(0)}%
                  </td>
                  <td className="ls-data-table__number">
                    {(planet.planetEfficiency * 100).toFixed(0)}%
                  </td>
                  <td className="ls-data-table__number">
                    {Math.round(planet.population).toLocaleString('en-US')} /{' '}
                    {planet.popCap.toLocaleString('en-US')}
                  </td>
                  <td className="ls-data-table__muted">
                    {popU > 0.9 ? 'Overcrowding risk' : '—'}
                  </td>
                </tr>
                <tr>
                  <td className="ls-data-table__unit">
                    {t.planet.statsStorageRow}
                  </td>
                  <td className="ls-data-table__muted">—</td>
                  <td className="ls-data-table__muted">—</td>
                  <td className="ls-data-table__number">
                    {(planet.storageU * 100).toFixed(0)}%
                  </td>
                  <td className="ls-data-table__number">—</td>
                  <td className="ls-data-table__number">
                    {Math.round(planet.storageUsedT)} / {planet.storageCapT} T
                  </td>
                  <td className="ls-data-table__muted">
                    {planet.storageU >= 1
                      ? t.planet.limiting.storage_full
                      : planet.storageU > 0.7
                        ? t.planet.limiting.storage_brake
                        : '—'}
                  </td>
                </tr>
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
                      {building.workforceU !== null
                        ? `${(building.workforceU * 100).toFixed(0)}%`
                        : '—'}
                    </td>
                    <td className="ls-data-table__number">
                      {building.workforceU !== null
                        ? `${(efficiency(building.workforceU) * 100).toFixed(0)}%`
                        : '—'}
                    </td>
                    <td className="ls-data-table__number">
                      {building.effBatchesPerDay !== null
                        ? `${building.effBatchesPerDay}${t.planet.perDay}`
                        : '—'}
                    </td>
                    <td className="ls-data-table__muted">
                      {limitingLabel(building.limiting)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

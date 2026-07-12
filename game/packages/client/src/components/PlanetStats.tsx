/**
 * Page stats planète — exigence canon GB §10 : « chaque planète a une page
 * stats listant chaque unité avec sa courbe d'efficacité » — chaque unité,
 * son u, son E et le facteur limitant dominant.
 */
import { X } from 'lucide-react';
import { efficiency } from '@atg/shared';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';

const cell: React.CSSProperties = {
  padding: '4px 10px',
  borderBottom: '1px solid var(--stroke-subtle)',
};
const num: React.CSSProperties = {
  ...cell,
  fontFamily: 'var(--font-mono)',
  textAlign: 'right',
};

function limitingLabel(limiting: string | null): string {
  if (!limiting) return '—';
  if (limiting.startsWith('input:')) {
    return `${t.planet.inputStarved} ${limiting.slice(6).replace('_', ' ')}`;
  }
  return t.planet.limiting[limiting] ?? limiting;
}

export function PlanetStats({
  planet,
  onClose,
}: {
  planet: PlanetDetail;
  onClose: () => void;
}) {
  const popU = planet.population / planet.popCap;
  return (
    <div
      role="dialog"
      aria-label={t.planet.statsPage}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(6,8,16,.75)',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 'min(760px, 92%)',
          maxHeight: '80%',
          background: 'var(--bg-overlay)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--elevation-raised)',
          padding: 'var(--space-4)',
          display: 'grid',
          gap: 'var(--space-3)',
          gridTemplateRows: 'auto 1fr',
        }}
      >
        <header
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h3 style={{ fontSize: 15 }}>
            {t.planet.statsPage} — {planet.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.planet.close}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div style={{ overflowY: 'auto' }}>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
          >
            <thead>
              <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                <th style={cell}>{t.planet.statsUnit}</th>
                <th style={cell}>{t.planet.statsLevel}</th>
                <th style={cell}>{t.planet.statsStatus}</th>
                <th style={{ ...num, fontFamily: 'var(--font-body)' }}>{t.planet.statsU}</th>
                <th style={{ ...num, fontFamily: 'var(--font-body)' }}>{t.planet.statsE}</th>
                <th style={{ ...num, fontFamily: 'var(--font-body)' }}>{t.planet.statsRate}</th>
                <th style={cell}>{t.planet.statsLimiting}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={cell}>{t.planet.statsPlanetRow}</td>
                <td style={cell}>—</td>
                <td style={cell}>—</td>
                <td style={num}>{(popU * 100).toFixed(0)}%</td>
                <td style={num}>{(planet.planetEfficiency * 100).toFixed(0)}%</td>
                <td style={num}>
                  {Math.round(planet.population).toLocaleString('en-US')} /{' '}
                  {planet.popCap.toLocaleString('en-US')}
                </td>
                <td style={cell}>
                  {popU > 0.9
                    ? t.planet.limiting.storage_brake && 'Overcrowding risk'
                    : '—'}
                </td>
              </tr>
              <tr>
                <td style={cell}>{t.planet.statsStorageRow}</td>
                <td style={cell}>—</td>
                <td style={cell}>—</td>
                <td style={num}>{(planet.storageU * 100).toFixed(0)}%</td>
                <td style={num}>—</td>
                <td style={num}>
                  {Math.round(planet.storageUsedT)} / {planet.storageCapT} T
                </td>
                <td style={cell}>
                  {planet.storageU >= 1
                    ? t.planet.limiting.storage_full
                    : planet.storageU > 0.7
                      ? t.planet.limiting.storage_brake
                      : '—'}
                </td>
              </tr>
              {planet.buildings.map((b) => (
                <tr key={b.id}>
                  <td style={cell}>
                    {b.key.replace(/_/g, ' ')}
                    {b.recipe
                      ? ` · ${b.recipe.startsWith('extract:') ? b.recipe.slice(8).replace('_', ' ') : b.recipe.replace(/_/g, ' ')}`
                      : ''}
                  </td>
                  <td style={cell}>L{b.level}</td>
                  <td
                    style={{
                      ...cell,
                      color:
                        b.status === 'active'
                          ? 'var(--success-500)'
                          : b.status === 'demolishing'
                            ? 'var(--danger-500)'
                            : 'var(--warning-500)',
                    }}
                  >
                    {b.status}
                  </td>
                  <td style={num}>
                    {b.workforceU !== null ? `${(b.workforceU * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td style={num}>
                    {b.workforceU !== null
                      ? `${(efficiency(b.workforceU) * 100).toFixed(0)}%`
                      : '—'}
                  </td>
                  <td style={num}>
                    {b.effBatchesPerDay !== null
                      ? `${b.effBatchesPerDay}${t.planet.perDay}`
                      : '—'}
                  </td>
                  <td style={cell}>{limitingLabel(b.limiting)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

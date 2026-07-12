/**
 * Panneau de réglages d'un bâtiment (GB §9/§10) : workforce, % de cadence,
 * courbe d'efficacité de l'unité et FACTEUR LIMITANT explicite (exigence
 * UI canon §10 : « la page stats liste chaque unité, son u, son E et le
 * facteur dominant »).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { BUILDINGS } from '@atg/shared';
import type { PlanetBuilding } from '../api.js';
import { t } from '../i18n/en.js';
import { EfficiencyCurve } from './EfficiencyCurve.tsx';

export function BuildingPanel({
  building,
  workforceAssignable,
  workforceAssigned,
  onApply,
  onClose,
}: {
  building: PlanetBuilding;
  workforceAssignable: number;
  workforceAssigned: number;
  onApply: (settings: { workforce: number; runPct: number }) => void;
  onClose: () => void;
}) {
  const [workforce, setWorkforce] = useState(building.workforce);
  const [runPct, setRunPct] = useState(building.runPct);
  const def = BUILDINGS[building.key];
  const isIndustry = !!def.batchesPerDayByLevel;

  const limitingText = building.limiting
    ? building.limiting.startsWith('input:')
      ? `${t.planet.inputStarved} ${building.limiting.slice(6).replace('_', ' ')}`
      : (t.planet.limiting[building.limiting] ?? building.limiting)
    : null;

  return (
    <section
      aria-label={t.planet.buildingSettings}
      style={{
        position: 'absolute',
        left: 16,
        bottom: 12,
        width: 300,
        background: 'var(--bg-raised)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--elevation-raised)',
        padding: 'var(--space-4)',
        display: 'grid',
        gap: 'var(--space-3)',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 14 }}>
          {building.key.replace(/_/g, ' ')} · L{building.level}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.planet.cancel}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex' }}
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      {building.recipe && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          {building.recipe.startsWith('extract:')
            ? `Extracting ${building.recipe.slice(8).replace('_', ' ')}`
            : `Minting ${building.recipe.replace(/_/g, ' ')}`}
          {building.effBatchesPerDay !== null &&
            ` — ${building.effBatchesPerDay} ${t.planet.perDay}`}
        </p>
      )}

      {limitingText && (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color:
              building.limiting === 'ok'
                ? 'var(--success-500)'
                : building.limiting === 'storage_full' ||
                    building.limiting === 'deposit_dry'
                  ? 'var(--danger-500)'
                  : 'var(--warning-500)',
          }}
        >
          {limitingText}
        </p>
      )}

      {isIndustry && building.workforceU !== null && (
        <EfficiencyCurve u={building.workforceU} label={building.key.replace(/_/g, ' ')} />
      )}

      {isIndustry && (
        <>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span>
              {t.planet.workforce} ({workforceAssigned}/{workforceAssignable}{' '}
              assigned planet-wide)
            </span>
            <input
              type="number"
              min={0}
              value={workforce}
              onChange={(e) => setWorkforce(Math.max(0, Number(e.target.value)))}
              style={{
                background: 'var(--bg-overlay)',
                border: '1px solid var(--stroke-subtle)',
                borderRadius: 'var(--radius-button)',
                color: 'var(--text-primary)',
                padding: '6px 10px',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            <span>
              {t.planet.runPct} {runPct}%
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={runPct}
              onChange={(e) => setRunPct(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => onApply({ workforce, runPct })}
            style={{
              background: 'var(--primary-400)',
              color: 'var(--text-primary)',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              padding: '6px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {t.planet.apply}
          </button>
        </>
      )}
    </section>
  );
}

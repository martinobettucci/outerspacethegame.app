/**
 * Panneau de réglages d'un bâtiment (GB §9/§10) : workforce, % de cadence,
 * courbe d'efficacité de l'unité et FACTEUR LIMITANT explicite (exigence
 * UI canon §10 : « la page stats liste chaque unité, son u, son E et le
 * facteur dominant »).
 */
import { useState } from 'react';
import { ChevronsUp, Trash2, X } from 'lucide-react';
import { BUILDINGS, type CostBundle } from '@atg/shared';
import type { PlanetBuilding } from '../api.js';
import { t } from '../i18n/en.js';
import { EfficiencyCurve } from './EfficiencyCurve.tsx';

function costText(cost: CostBundle): string {
  return Object.entries(cost)
    .map(([res, qty]) => `${qty} ${res === 'crystal_any' ? 'crystal' : res.replace('_', ' ')}`)
    .join(' + ');
}

export function BuildingPanel({
  building,
  workforceAssignable,
  workforceAssigned,
  maxLevelBySeed,
  onApply,
  onLevelUp,
  onDemolish,
  onClose,
}: {
  building: PlanetBuilding;
  workforceAssignable: number;
  workforceAssigned: number;
  maxLevelBySeed: number;
  onApply: (settings: {
    workforce?: number;
    runPct?: number;
    landing?: 'self' | 'everyone';
  }) => void;
  onLevelUp: () => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const [workforce, setWorkforce] = useState(building.workforce);
  const [runPct, setRunPct] = useState(building.runPct);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const def = BUILDINGS[building.key];
  const isIndustry = !!def.batchesPerDayByLevel;
  const levelCap = Math.min(3, maxLevelBySeed);
  const canLevelUp = building.status === 'active' && building.level < levelCap;
  const levelUpCost =
    building.level < 3 ? def.levelUpCost[(building.level - 1) as 0 | 1] : null;

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

      {building.key === 'spaceport' && building.landing && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>
          <span>{t.planet.landingPolicy}</span>
          <select
            value={building.landing}
            onChange={(e) =>
              onApply({ landing: e.target.value as 'self' | 'everyone' })
            }
            style={{
              background: 'var(--bg-overlay)',
              border: '1px solid var(--stroke-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              padding: '6px 10px',
            }}
          >
            <option value="self">{t.planet.landingSelf}</option>
            <option value="everyone">{t.planet.landingEveryone}</option>
          </select>
        </label>
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

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onLevelUp}
          disabled={!canLevelUp}
          title={
            !canLevelUp
              ? building.level >= levelCap
                ? `${t.planet.maxLevelReached} (L${levelCap})`
                : t.planet.constructing
              : levelUpCost
                ? costText(levelUpCost)
                : undefined
          }
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            background: canLevelUp ? 'var(--violet-500)' : 'var(--bg-overlay)',
            color: canLevelUp ? 'var(--text-primary)' : 'var(--text-disabled)',
            border: 'none',
            borderRadius: 'var(--radius-button)',
            padding: '6px 10px',
            fontSize: 12,
            cursor: canLevelUp ? 'pointer' : 'not-allowed',
          }}
        >
          <ChevronsUp size={12} aria-hidden />
          {building.level >= levelCap
            ? `${t.planet.maxLevelReached} L${levelCap}`
            : `${t.planet.levelUp} → L${building.level + 1}`}
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirmDemolish) onDemolish();
            else setConfirmDemolish(true);
          }}
          disabled={building.status === 'demolishing'}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'center',
            background: confirmDemolish ? 'var(--danger-500)' : 'var(--danger-700)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: 'var(--radius-button)',
            padding: '6px 10px',
            fontSize: 12,
            cursor: building.status === 'demolishing' ? 'not-allowed' : 'pointer',
            opacity: building.status === 'demolishing' ? 0.5 : 1,
          }}
        >
          <Trash2 size={12} aria-hidden />
          {confirmDemolish ? t.planet.demolishConfirm : t.planet.demolish}
        </button>
      </div>
    </section>
  );
}

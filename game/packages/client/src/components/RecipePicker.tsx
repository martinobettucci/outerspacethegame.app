/**
 * Choix de recette à la construction — canon GB §9 : « une industrie mint
 * exactement une chose », choisie en posant la carte.
 */
import {
  BASIC_RESOURCES,
  CLIMATE_CRYSTAL,
  recipesForBuilding,
  TRACE_MINING_T_PER_DAY,
  type BuildingKey,
} from '@atg/shared';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';

export function RecipePicker({
  planet,
  building,
  onPick,
  onCancel,
}: {
  planet: PlanetDetail;
  building: BuildingKey;
  onPick: (recipe: string) => void;
  onCancel: () => void;
}) {
  const options: { recipe: string; label: string; hint: string }[] = [];

  if (building === 'mine' || building === 'crystal_extractor') {
    const depositByRes = new Map(planet.deposits.map((d) => [d.resource, d]));
    if (building === 'mine') {
      for (const res of BASIC_RESOURCES) {
        const dep = depositByRes.get(res);
        options.push({
          recipe: `extract:${res}`,
          label: `Extract ${res.replace('_', ' ')}`,
          hint: dep
            ? `${t.planet.recipeDeposit} ${Math.round(dep.remainingT).toLocaleString('en-US')} T`
            : `${t.planet.recipeTrace.replace('2', String(TRACE_MINING_T_PER_DAY))}`,
        });
      }
      // Gisements d'abord (les plus rentables), puis la trace.
      options.sort((a, b) => {
        const da = a.hint.startsWith(t.planet.recipeDeposit) ? 0 : 1;
        const db = b.hint.startsWith(t.planet.recipeDeposit) ? 0 : 1;
        return da - db;
      });
    } else {
      const crystal = CLIMATE_CRYSTAL[planet.climate];
      const dep = depositByRes.get(crystal);
      if (dep) {
        options.push({
          recipe: `extract:${crystal}`,
          label: `Extract ${crystal.replace('_', ' ')}`,
          hint: `${t.planet.recipeDeposit} ${Math.round(dep.remainingT).toLocaleString('en-US')} T`,
        });
      }
    }
  } else {
    for (const r of recipesForBuilding(building)) {
      if (r.extraction) continue;
      const ins = Object.entries(r.inputs)
        .map(([res, q]) => `${q} ${res.replace('_', ' ')}`)
        .join(' + ');
      const outs = Object.entries(r.outputs)
        .map(([res, q]) => `${q} ${res.replace('_', ' ')}`)
        .join(' + ');
      options.push({ recipe: r.id, label: outs, hint: `${ins} → ${outs}` });
    }
  }

  return (
    <div
      role="dialog"
      aria-label={t.planet.chooseRecipe}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(6,8,16,.7)',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 460,
          maxHeight: '70%',
          overflowY: 'auto',
          background: 'var(--bg-overlay)',
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--elevation-raised)',
          padding: 'var(--space-4)',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        <h3 style={{ fontSize: 14 }}>{building.replace(/_/g, ' ')}</h3>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
          {t.planet.chooseRecipe}
        </p>
        {options.map((o) => (
          <button
            key={o.recipe}
            type="button"
            onClick={() => onPick(o.recipe)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              background: 'var(--bg-raised)',
              border: '1px solid var(--stroke-subtle)',
              borderRadius: 'var(--radius-button)',
              color: 'var(--text-primary)',
              padding: '8px 12px',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span>{o.label}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {o.hint}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onCancel}
          style={{
            justifySelf: 'end',
            background: 'none',
            border: 'none',
            color: 'var(--primary-300)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {t.planet.cancel}
        </button>
      </div>
    </div>
  );
}

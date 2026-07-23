/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck” and §P2 “Industry”; GAME_BOOK.md §9; DESIGN_GUIDE.md §3.3/§5.1/§6; docs/DESIGN_SYSTEM.md §5.1. */
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
import { ArrowRight, Factory, Pickaxe, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { ResourceIcon } from './InventoryVisuals.tsx';
import { useDialogFocus } from './useDialogFocus.ts';
import '../styles/planet-panels.css';

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
  const dialogRef = useDialogFocus(onCancel);
  const options: {
    recipe: string;
    label: string;
    hint: string;
    inputs: string[];
    outputs: string[];
  }[] = [];

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
          inputs: [],
          outputs: [res],
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
          inputs: [],
          outputs: [crystal],
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
      options.push({
        recipe: r.id,
        label: outs,
        hint: `${ins} → ${outs}`,
        inputs: Object.keys(r.inputs),
        outputs: Object.keys(r.outputs),
      });
    }
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={t.planet.chooseRecipe}
      aria-modal="true"
      tabIndex={-1}
      className="ls-modal-layer"
    >
      <div className="ls-command-panel ls-recipe-modal">
        <header className="ls-modal-header">
          <div className="ls-modal-heading">
            <span className="ls-panel-kicker">Production routing</span>
            <h3 className="ls-modal-title">{building.replace(/_/g, ' ')}</h3>
            <p className="ls-muted-copy">{t.planet.chooseRecipe}</p>
          </div>
          <button
            type="button"
            className="ls-icon-button"
            onClick={onCancel}
            aria-label={t.planet.cancel}
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div className="ls-recipe-list">
          {options.map((o) => (
            <button
              key={o.recipe}
              type="button"
              className="ls-recipe-option"
              onClick={() => onPick(o.recipe)}
            >
              <span className="ls-recipe-option__icon" aria-hidden="true">
                {o.recipe.startsWith('extract:') ? (
                  <Pickaxe size={17} />
                ) : (
                  <Factory size={17} />
                )}
              </span>
              <span className="ls-recipe-option__copy">
                <span className="ls-recipe-option__label">{o.label}</span>
                <span className="cmd-recipe-flow" aria-hidden="true">
                  {o.inputs.map((resource) => (
                    <ResourceIcon key={`in:${resource}`} resource={resource} size={22} />
                  ))}
                  {o.inputs.length > 0 && <ArrowRight size={12} />}
                  {o.outputs.map((resource) => (
                    <ResourceIcon key={`out:${resource}`} resource={resource} size={22} />
                  ))}
                </span>
                <span className="ls-recipe-option__hint">{o.hint}</span>
              </span>
              <ArrowRight
                className="ls-recipe-option__arrow"
                size={15}
                aria-hidden
              />
            </button>
          ))}
        </div>

        <footer className="ls-modal-footer">
          <button
            type="button"
            className="ls-button ls-button--neutral"
            onClick={onCancel}
          >
            {t.planet.cancel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck”, §P2 “Building catalog”/“Industry” and §P4 “Markets”/“Docks”/“Manual channel”; docs/MASTER_PLAN.md §W2/§W6/§W7; GAME_BOOK.md §9/§13/§14/§25; DESIGN_GUIDE.md §5.1/§6/§8/§11; docs/DESIGN_SYSTEM.md §5.1. */
/**
 * Building command inspector. Every simulation control and payload remains
 * unchanged; the presentation groups them into readable instrument modules
 * with the unit's efficiency and limiting factor kept in the foreground.
 */
import { useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Orbit,
  ChevronsUp,
  Gauge,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_RESOURCE_IDS,
  ammLpFeeBp,
  buildableSizes,
  BUILDINGS,
  ENGINE_TYPES,
  engineRecipe,
  GEAR,
  HULLS,
  RECIPES,
  recipeEngine,
  shipBuildCost,
  type CostBundle,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type { PlanetBuilding, PlanetDocks } from '../api.js';
import { t } from '../i18n/en.js';
import { EfficiencyCurve } from './EfficiencyCurve.tsx';
import {
  ItemTile,
  ResourceCost,
  ResourceIcon,
  ResourceInline,
} from './InventoryVisuals.tsx';
import { OperationTimer } from './OperationTimer.tsx';
import { WarehouseModal } from './WarehouseModal.tsx';
import '../styles/planet-panels.css';

function costText(cost: CostBundle): string {
  return Object.entries(cost)
    .map(
      ([res, qty]) =>
        `${qty} ${
          res === 'crystal_any' ? 'crystal' : res.replace('_', ' ')
        }`,
    )
    .join(' + ');
}

export function routeResources(recipe: string): string[] {
  if (recipe.startsWith('extract:')) return [recipe.slice(8)];
  if (recipe.startsWith('engine_')) return [`fuel_${recipe.slice(7)}`];
  const definition = RECIPES[recipe as keyof typeof RECIPES];
  if (!definition) return [];
  return [...new Set([
    ...Object.keys(definition.inputs),
    ...Object.keys(definition.outputs),
  ])];
}

export function BuildingPanel({
  building,
  docks,
  vehicles,
  stargateContext,
  triadNudge,
  workforceAssignable,
  workforceAssigned,
  maxLevelBySeed,
  onApply,
  onSaveMarketSlot,
  onSeedAmm,
  onAmmLiquidity,
  onBuildShip,
  onRetoolRecipe,
  onFabricate,
  onDisassemble,
  gearInventory,
  shipBuilds,
  onRetool,
  onLevelUp,
  onDemolish,
  onClose,
}: {
  building: PlanetBuilding;
  /** Résumé planète des docks (spaceports actifs) — null si aucun. */
  docks?: PlanetDocks | null;
  /** Balances de véhicules de la planète (GB §9) — entrepôt + tampon. */
  vehicles?: { capacity: Record<'s' | 'm' | 'l', number>; stored: Record<'s' | 'm' | 'l', number> } | null;
  /** Contexte stargate_yard (chunk AK) : mondes possédés + gates du monde. */
  stargateContext?: {
    bodyId: string;
    myPlanets: { id: string; name: string }[];
    foreignPlanets: { id: string; name: string; ownerName: string | null }[];
    onPropose: (destId: string) => void;
    gates: {
      id: string;
      aBodyId: string;
      bBodyId: string;
      status: string;
      tollResource: string | null;
      tollAmount: number;
    }[];
    bodyName: (id: string) => string;
    onBuild: (destId: string) => void;
    onSetToll: (gateId: string, resource: string | null, amount: number) => void;
  };
  /** Nudge triade (DG §11.2) — aucun pair FOOD dans la portée télescope. */
  triadNudge?: boolean | null;
  workforceAssignable: number;
  workforceAssigned: number;
  maxLevelBySeed: number;
  onApply: (settings: {
    workforce?: number;
    runPct?: number;
    landing?: 'self' | 'everyone';
    dwellHours?: number;
    reservedForSelf?: number;
    visibility?: 'public' | 'private';
  }) => void;
  onSaveMarketSlot?: (input: {
    slotIndex: number;
    give: string;
    get: string;
    rate: number;
    dailyLimitT: number;
  }) => void;
  onSeedAmm?: (input: {
    slotIndex: number;
    x: string;
    y: string;
    depositX: number;
    depositY: number;
  }) => void;
  onAmmLiquidity?: (
    input:
      | { action: 'add'; slotIndex: number; tonsX: number }
      | { action: 'remove'; slotIndex: number; pct: number },
  ) => void;
  onBuildShip?: (input: {
    category: 'combat' | 'cargo' | 'civil';
    size: 's' | 'm' | 'l';
    name: string;
    /** W2 : moteur de CE chantier (outillage courant). */
    engine?: 'cold' | 'hot' | 'gas';
  }) => void;
  /** W2 : rééquipage direct du chantier naval (recipe `engine_<type>`). */
  onRetoolRecipe?: (recipe: string) => void;
  /** W6 : fabrication d'items (bâtiments hôtes : workshop/shipyard/foundry). */
  onFabricate?: (itemKey: string) => void;
  /** W9a : désassemblage depuis le command deck du warehouse. */
  onDisassemble?: (itemKey: string) => Promise<void> | void;
  gearInventory?: {
    items: { itemKey: string; count: number }[];
    capacity: number;
    fabricating: { itemKey: string; completesAt: string }[];
  } | null;
  shipBuilds?: {
    name: string;
    category: string;
    size: string;
    completesAt: string;
  }[];
  /** Ouvre le sélecteur de recette en mode retool (industries actives). */
  onRetool?: () => void;
  onLevelUp: () => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const [workforce, setWorkforce] = useState(building.workforce);
  const [runPct, setRunPct] = useState(building.runPct);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const slot0raw = building.marketSlots?.[0];
  const slot0 =
    slot0raw && !('mode' in slot0raw) ? slot0raw : undefined;
  const [slotGive, setSlotGive] = useState(slot0?.give ?? 'ore');
  const [slotGet, setSlotGet] = useState(slot0?.get ?? 'water');
  const [slotRate, setSlotRate] = useState(String(slot0?.rate ?? '0.5'));
  const [slotDaily, setSlotDaily] = useState(
    String(slot0?.dailyLimitT ?? '0'),
  );
  const [dwellHours, setDwellHours] = useState(
    String(building.dwellHours ?? 24),
  );
  const [reservedForSelf, setReservedForSelf] = useState(
    building.reservedForSelf ?? 0,
  );
  const [ammX, setAmmX] = useState('ore');
  const [ammY, setAmmY] = useState('water');
  const [ammDepX, setAmmDepX] = useState('50');
  const [ammDepY, setAmmDepY] = useState('25');
  const [ammAddT, setAmmAddT] = useState('10');
  const [ammPct, setAmmPct] = useState('100');
  const [yardCategory, setYardCategory] = useState<
    'combat' | 'cargo' | 'civil'
  >('cargo');
  const [yardSize, setYardSize] = useState<'s' | 'm' | 'l'>('s');
  const [yardName, setYardName] = useState('');
  // W2 : outillage moteur du chantier (recipe engine_<type>, NULL = natal).
  const yardEngine = recipeEngine(building.recipe);
  const [yardEngineSel, setYardEngineSel] = useState<'cold' | 'hot' | 'gas'>(
    yardEngine ?? 'cold',
  );
  const def = BUILDINGS[building.key];
  const isIndustry = !!def.batchesPerDayByLevel;
  const levelCap = Math.min(3, maxLevelBySeed);
  const canLevelUp =
    building.status === 'active' && building.level < levelCap;
  const levelUpCost =
    building.level < 3
      ? def.levelUpCost[(building.level - 1) as 0 | 1]
      : null;

  const limitingText = building.limiting
    ? building.limiting.startsWith('input:')
      ? `${t.planet.inputStarved} ${building.limiting.slice(6).replace('_', ' ')}`
      : (t.planet.limiting[building.limiting] ?? building.limiting)
    : null;
  const limitingTone =
    building.limiting === 'ok'
      ? 'success'
      : building.limiting === 'storage_full' ||
          building.limiting === 'deposit_dry'
        ? 'danger'
        : 'warning';

  return (
    <section
      aria-label={t.planet.buildingSettings}
      className="ls-command-panel ls-building-panel"
    >
      <header className="ls-inspector-header">
        <div className="ls-inspector-heading">
          <span className="ls-panel-kicker">
            Surface unit / {building.key.replace(/_/g, ' ')} · L{building.level}
          </span>
          <h3 className="ls-panel-title cmd-building-title">
            <span>{building.key.replace(/_/g, ' ')}</span>
            {building.recipe && (
              <span
                className="cmd-building-title__resources"
                aria-label={`Resources handled: ${routeResources(building.recipe).join(', ')}`}
              >
                {routeResources(building.recipe).map((resource) => (
                  <ResourceIcon key={resource} resource={resource} size={19} />
                ))}
              </span>
            )}
          </h3>
          <span
            className="ls-status-pill"
            data-tone={
              building.status === 'active'
                ? 'success'
                : building.status === 'demolishing'
                  ? 'danger'
                  : 'warning'
            }
          >
            {building.status}
          </span>
        </div>
        <button
          type="button"
          className="ls-icon-button"
          onClick={onClose}
          aria-label={t.planet.cancel}
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {building.completesAt && building.status !== 'active' && (
        <OperationTimer
          completesAt={building.completesAt}
          label={
            building.status === 'demolishing'
              ? `${t.planet.demolish} · L${building.level}`
              : building.status === 'retooling'
                ? `${t.planet.retooling} · ${(building.recipe ?? '').replace(/_/g, ' ')}`
                : `${t.planet.constructing} · L${building.level}`
          }
          tone={building.status === 'demolishing' ? 'danger' : 'warning'}
        />
      )}

      {building.recipe && (
        <p className="ls-production-route">
          <span>Production route</span>
          <span className="ls-production-route__icons" aria-hidden="true">
            {routeResources(building.recipe).map((resource) => (
              <ResourceIcon key={resource} resource={resource} size={25} />
            ))}
          </span>
          <strong>
            {building.recipe.startsWith('extract:')
              ? `Extracting ${building.recipe.slice(8).replace('_', ' ')}`
              : building.key === 'shipyard'
                ? // W2 : la recette d'un chantier est un OUTILLAGE moteur.
                  `${t.planet.yardEngine}: ${recipeEngine(building.recipe) ?? building.recipe}`
                : `Minting ${building.recipe.replace(/_/g, ' ')}`}
            {building.effBatchesPerDay !== null
              ? ` — ${building.effBatchesPerDay} ${t.planet.perDay}`
              : ''}
          </strong>
        </p>
      )}

      {limitingText && (
        <p className="ls-limiting-line" data-tone={limitingTone}>
          <AlertTriangle size={13} aria-hidden />
          {building.limiting?.startsWith('input:') ? (
            <span className="cmd-limiting-resource">
              <span>{t.planet.inputStarved}</span>
              <ResourceInline
                resource={building.limiting.slice(6)}
                size={20}
              />
            </span>
          ) : (
            <span>{limitingText}</span>
          )}
        </p>
      )}

      {building.key === 'spaceport' && building.landing && (
        <section aria-label={t.planet.landingPolicy} className="ls-section">
          <div className="ls-section-heading">
            <Anchor size={14} aria-hidden /> {t.planet.landingPolicy}
          </div>
          {docks && (
            <p className="ls-mono-line" data-testid="docks-usage">
              {t.planet.docksTitle}{' '}
              {(['s', 'm', 'l'] as const)
                .filter((size) => docks.total[size] > 0)
                .map(
                  (size) =>
                    `${size.toUpperCase()} ${docks.occupied[size]}/${docks.total[size]}`,
                )
                .join(' · ')}{' '}
              · {docks.visitors} {t.planet.docksVisitors}
              {docks.reservedForSelf > 0
                ? ` · ${docks.reservedForSelf} ${t.planet.docksReserved}`
                : ''}{' '}
              · {t.planet.docksDwell} {docks.dwellHours}{' '}
              {t.planet.docksGameHours}
            </p>
          )}
          <label className="ls-field">
            <span>{t.planet.landingPolicy}</span>
            <select
              className="ls-select"
              value={building.landing}
              onChange={(event) =>
                onApply({
                  landing: event.target.value as 'self' | 'everyone',
                })
              }
            >
              <option value="self">{t.planet.landingSelf}</option>
              <option value="everyone">{t.planet.landingEveryone}</option>
            </select>
          </label>
          <div className="ls-inline-fields">
            <label className="ls-field">
              <span>{t.planet.dwellHoursLabel}</span>
              <input
                className="ls-input"
                type="number"
                min={1}
                max={720}
                step={1}
                value={dwellHours}
                onChange={(event) => setDwellHours(event.target.value)}
              />
            </label>
            <label className="ls-field">
              <span>{t.planet.reservedForSelfLabel}</span>
              <select
                aria-label={t.planet.reservedForSelfLabel}
                className="ls-select"
                value={String(reservedForSelf)}
                onChange={(event) =>
                  setReservedForSelf(Number(event.target.value))
                }
              >
                {[0, 1, 2].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="ls-button ls-button--block"
            onClick={() =>
              onApply({
                dwellHours: Math.round(Number(dwellHours)),
                reservedForSelf,
              })
            }
          >
            {t.planet.apply}
          </button>
        </section>
      )}

      {building.key === 'warehouse' && building.visibility && (
        <section aria-label={t.planet.warehouseVisibility} className="ls-section">
          <div className="ls-section-heading">
            <Store size={14} aria-hidden /> {t.planet.warehouseVisibility}
          </div>
          {vehicles && (
            <p className="ls-mono-line" data-testid="vehicles-usage">
              {t.planet.vehiclesTitle}{' '}
              {(['s', 'm', 'l'] as const)
                .map(
                  (size) =>
                    `${size.toUpperCase()} ${vehicles.stored[size]}/${vehicles.capacity[size]}`,
                )
                .join(' · ')}
            </p>
          )}
          <p className="ls-section-subtitle">{t.planet.vehiclesHint}</p>
          <button
            type="button"
            className="ls-button ls-button--accent ls-button--block"
            aria-haspopup="dialog"
            onClick={() => setWarehouseOpen(true)}
          >
            <Store size={14} aria-hidden /> Open warehouse
          </button>
          <p className="ls-section-subtitle">{t.planet.warehouseVisibilityHint}</p>
          <label className="ls-field">
            <span>{t.planet.warehouseVisibility}</span>
            <select
              className="ls-select"
              value={building.visibility}
              onChange={(event) =>
                onApply({
                  visibility: event.target.value as 'public' | 'private',
                })
              }
            >
              <option value="private">{t.planet.warehousePrivate}</option>
              <option value="public">{t.planet.warehousePublic}</option>
            </select>
          </label>
        </section>
      )}

      {warehouseOpen && building.key === 'warehouse' && (
        <WarehouseModal
          warehouseLevel={building.level}
          items={gearInventory?.items ?? []}
          capacity={gearInventory?.capacity ?? 0}
          fabricating={gearInventory?.fabricating ?? []}
          vehicles={vehicles}
          docks={docks}
          onDisassemble={onDisassemble}
          onClose={() => setWarehouseOpen(false)}
        />
      )}

      {building.key === 'stargate_yard' && stargateContext && (
        <section aria-label={t.planet.stargateTitle} className="ls-section">
          <div className="ls-section-heading">
            <Orbit size={14} aria-hidden /> {t.planet.stargateTitle}
          </div>
          <p className="ls-section-subtitle">{t.planet.stargateHint}</p>
          {stargateContext.gates.map((gate) => (
            <div key={gate.id} className="ls-mono-line" style={{ display: 'grid', gap: 4 }}>
              <span>
                → {stargateContext.bodyName(
                  gate.aBodyId === stargateContext.bodyId ? gate.bBodyId : gate.aBodyId,
                )}{' '}
                · {gate.status === 'active' ? t.planet.stargateActive : t.planet.stargateBuilding}
                {gate.tollResource
                  ? ` · ${t.galaxy.gateToll} ${gate.tollAmount} ${gate.tollResource.replace('_', ' ')}`
                  : ''}
              </span>
              {gate.status === 'active' && (
                <form
                  style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const res = String(data.get('tollRes') ?? '');
                    const amount = Number(data.get('tollAmount') ?? 0);
                    stargateContext.onSetToll(gate.id, res || null, amount);
                  }}
                >
                  <input
                    aria-label={t.planet.stargateTollLabel}
                    name="tollRes"
                    defaultValue={gate.tollResource ?? ''}
                    placeholder="resource"
                    className="ls-select"
                    style={{ maxWidth: 110 }}
                  />
                  <input
                    aria-label="Toll amount"
                    name="tollAmount"
                    type="number"
                    min={0}
                    step={0.1}
                    defaultValue={gate.tollAmount}
                    className="ls-select"
                    style={{ width: 70 }}
                  />
                  <button type="submit" className="ls-button">
                    Apply toll
                  </button>
                </form>
              )}
            </div>
          ))}
          <form
            style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const dest = String(data.get('gateDest') ?? '');
              if (dest) stargateContext.onBuild(dest);
            }}
          >
            <label className="ls-field" style={{ flex: 1 }}>
              <span>{t.planet.stargateDest}</span>
              <select name="gateDest" className="ls-select" defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {stargateContext.myPlanets
                  .filter((pl) => pl.id !== stargateContext.bodyId)
                  .map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                    </option>
                  ))}
              </select>
            </label>
            <button type="submit" className="ls-button">
              {t.planet.stargateBuild}
            </button>
          </form>
          {stargateContext.foreignPlanets.length > 0 && (
            <form
              style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const dest = String(data.get('gatePropose') ?? '');
                if (dest) stargateContext.onPropose(dest);
              }}
            >
              <label className="ls-field" style={{ flex: 1 }}>
                <span>{t.planet.stargateProposeDest}</span>
                <select name="gatePropose" className="ls-select" defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {stargateContext.foreignPlanets.map((pl) => (
                    <option key={pl.id} value={pl.id}>
                      {pl.name}
                      {pl.ownerName ? ` — ${pl.ownerName}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="ls-button">
                {t.planet.stargatePropose}
              </button>
            </form>
          )}
        </section>
      )}

      {building.key === 'shipyard' &&
        building.status === 'active' &&
        onBuildShip && (
          <section aria-label={t.planet.yardTitle} className="ls-section">
            <div className="ls-section-heading">
              <Anchor size={14} aria-hidden /> {t.planet.yardTitle}
            </div>
            <p className="ls-section-subtitle">
              Configure a hull and commit its build cost to this yard.
            </p>

            {shipBuilds && shipBuilds.length > 0 && (
              <div className="ls-queue">
                <span className="ls-panel-kicker">{t.planet.yardPending}</span>
                {shipBuilds.map((build) => (
                  <div
                    key={`${build.name}-${build.completesAt}`}
                    className="ls-queue-item"
                  >
                    <span className="ls-queue-item__identity">
                      <strong>{build.name}</strong>
                      <span>
                        {build.category} {build.size.toUpperCase()}
                      </span>
                    </span>
                    <OperationTimer
                      completesAt={build.completesAt}
                      label="Hull assembly"
                      tone="violet"
                      compact
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="ls-inline-fields">
              <label className="ls-field">
                <span>{t.planet.yardCategory}</span>
                <select
                  aria-label={t.planet.yardCategory}
                  className="ls-select"
                  value={yardCategory}
                  onChange={(event) =>
                    setYardCategory(event.target.value as typeof yardCategory)
                  }
                >
                  {(['cargo', 'civil', 'combat'] as const).map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ls-field">
                <span>{t.planet.yardSize}</span>
                <select
                  aria-label={t.planet.yardSize}
                  className="ls-select"
                  value={yardSize}
                  onChange={(event) =>
                    setYardSize(event.target.value as typeof yardSize)
                  }
                >
                  {(['s', 'm', 'l'] as const).map((size) => (
                    <option
                      key={size}
                      value={size}
                      disabled={
                        !buildableSizes(
                          building.level as 1 | 2 | 3,
                        ).includes(size)
                      }
                    >
                      {size.toUpperCase()}
                      {!buildableSizes(
                        building.level as 1 | 2 | 3,
                      ).includes(size)
                        ? ` — ${t.planet.yardSizeLocked}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* W2 : moteurs figés au build — outillage courant + retool. */}
            <div className="ls-section-heading">
              <Gauge size={13} aria-hidden /> {t.planet.yardEngine}
              {' — '}
              <span className="ls-mono-line">
                {yardEngine ?? t.planet.yardEngineNatal}
              </span>
            </div>
            <p className="ls-section-subtitle">{t.planet.yardEngineHint}</p>
            {onRetoolRecipe && (
              <div className="ls-inline-fields">
                <label className="ls-field">
                  <span>{t.planet.yardRetool}</span>
                  <select
                    aria-label={t.planet.yardRetool}
                    className="ls-select"
                    value={yardEngineSel}
                    onChange={(event) =>
                      setYardEngineSel(
                        event.target.value as typeof yardEngineSel,
                      )
                    }
                  >
                    {ENGINE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="ls-button ls-button--violet"
                  disabled={yardEngineSel === yardEngine}
                  onClick={() => onRetoolRecipe(engineRecipe(yardEngineSel))}
                >
                  <Gauge size={13} aria-hidden /> {t.planet.yardRetool}
                </button>
              </div>
            )}

            <ResourceCost
              cost={shipBuildCost(
                HULLS[
                  `${yardCategory}_${yardSize}` as `${HullCategory}_${HullSize}`
                ],
                building.level as 1 | 2 | 3,
              )}
            />

            <label className="ls-field">
              <span>{t.planet.yardName}</span>
              <input
                aria-label={t.planet.yardName}
                className="ls-input"
                placeholder={t.planet.yardName}
                value={yardName}
                onChange={(event) => setYardName(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="ls-button ls-button--block"
              onClick={() =>
                onBuildShip({
                  category: yardCategory,
                  size: yardSize,
                  name: yardName,
                  // W2 : la coque naît avec l'outillage de CE chantier
                  // (undefined = natal, le serveur résout).
                  engine: yardEngine ?? undefined,
                })
              }
            >
              <Anchor size={13} aria-hidden /> {t.planet.yardBuild}
            </button>
          </section>
        )}

      {/* W6 : fabrication d'items non-fongibles (bâtiment hôte). */}
      {['workshop', 'shipyard', 'weapon_foundry'].includes(building.key) &&
        building.status === 'active' &&
        onFabricate && (
          <section aria-label={t.planet.gearTitle} className="ls-section">
            <div className="ls-section-heading">
              <Store size={14} aria-hidden /> {t.planet.gearTitle}
            </div>
            <p className="ls-section-subtitle">{t.planet.gearHint}</p>
            {gearInventory && (
              <div className="cmd-fabrication-balance">
                <header>
                  <span>{t.planet.gearInventory}</span>
                  <strong>
                    {gearInventory.items.reduce((s, i) => s + i.count, 0)}/
                    {gearInventory.capacity}
                  </strong>
                </header>
                <div className="cmd-cell-grid">
                  {gearInventory.items.length === 0 ? (
                    <span className="ls-muted-copy">No completed items.</span>
                  ) : gearInventory.items.map((item) => (
                    <ItemTile
                      key={item.itemKey}
                      itemKey={item.itemKey}
                      count={item.count}
                    />
                  ))}
                </div>
              </div>
            )}
            {gearInventory && gearInventory.fabricating.length > 0 && (
              <div className="cmd-fabrication-balance">
                <header>
                  <span>{t.planet.gearFabricating}</span>
                  <strong>{gearInventory.fabricating.length}</strong>
                </header>
                <div className="cmd-cell-grid">
                  {gearInventory.fabricating.map((item, index) => (
                    <ItemTile
                      key={`${item.itemKey}:${item.completesAt}:${index}`}
                      itemKey={item.itemKey}
                      state="fabricating"
                      footer={
                        <small className="cmd-item-eta">
                          ETA {new Date(item.completesAt).toLocaleTimeString('en-US')}
                        </small>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            <div className="cmd-fabrication-catalog">
              {Object.values(GEAR)
                .filter((d) => d.fabricator === building.key)
                .map((d) => (
                  <article key={d.key} className="cmd-fabrication-recipe">
                    <ItemTile itemKey={d.key} />
                    <div className="cmd-fabrication-recipe__copy">
                      <strong>{d.key.replace(/_/g, ' ')}</strong>
                      <small>{d.slot} · {d.fabricationHours} h{d.dormant ? ' · dormant' : ''}</small>
                      <ResourceCost cost={d.fabricationCost} size={22} />
                    </div>
                  <button
                    type="button"
                    className="ls-button"
                    onClick={() => onFabricate(d.key)}
                  >
                    {t.planet.gearFabricate}
                  </button>
                  </article>
                ))}
            </div>
          </section>
        )}

      {building.key === 'market' &&
        building.level >= 2 &&
        building.marketSlots &&
        onSeedAmm &&
        onAmmLiquidity && (
          <section aria-label={t.planet.ammTitle} className="ls-section">
            <div className="ls-section-heading">
              <Store size={14} aria-hidden /> {t.planet.ammTitle}
            </div>
            <p className="ls-section-subtitle">{t.planet.ammHint}</p>
            {triadNudge && (
              <p className="ls-limiting-line" data-tone="warning" data-testid="triad-nudge">
                <AlertTriangle size={13} aria-hidden />
                <span>{t.planet.triadNudge}</span>
              </p>
            )}
            {building.marketSlots
              .map((s, i) => ({ s, i }))
              .filter(
                (
                  e,
                ): e is { s: import('../api.js').AmmSlotRaw; i: number } =>
                  !!e.s && typeof e.s === 'object' && 'mode' in e.s,
              )
              .map(({ s, i }) => (
                <div key={i} className="ls-queue-item" style={{ display: 'grid', gap: 6 }}>
                  <span className="ls-mono-line" data-testid="amm-pool-line">
                    #{i} · {s.pool.x.replace('_', ' ')} ⇄{' '}
                    {s.pool.y.replace('_', ' ')} ·{' '}
                    {Math.floor(s.pool.rx * 10) / 10}/
                    {Math.floor(s.pool.ry * 10) / 10} T · spot{' '}
                    {Math.round((s.pool.ry / s.pool.rx) * 10_000) / 10_000} ·{' '}
                    {ammLpFeeBp(building.level)}+25 bp
                  </span>
                  <div className="ls-inline-fields">
                    <label className="ls-field">
                      <span>
                        {t.planet.ammAddLabel} ({s.pool.x.replace('_', ' ')})
                      </span>
                      <input
                        className="ls-input"
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={ammAddT}
                        onChange={(e) => setAmmAddT(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="ls-button"
                      onClick={() =>
                        onAmmLiquidity({
                          action: 'add',
                          slotIndex: i,
                          tonsX: Number(ammAddT),
                        })
                      }
                    >
                      {t.planet.ammAdd}
                    </button>
                  </div>
                  <div className="ls-inline-fields">
                    <label className="ls-field">
                      <span>{t.planet.ammPctLabel}</span>
                      <input
                        className="ls-input"
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={ammPct}
                        onChange={(e) => setAmmPct(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="ls-button ls-button--danger"
                      onClick={() =>
                        onAmmLiquidity({
                          action: 'remove',
                          slotIndex: i,
                          pct: Number(ammPct),
                        })
                      }
                    >
                      {t.planet.ammWithdraw}
                    </button>
                  </div>
                </div>
              ))}
            {(() => {
              const slots = building.marketSlots ?? [];
              let free: number | null = null;
              for (let i = 0; i < Math.min(3, building.level); i++) {
                if (!slots[i]) {
                  free = i;
                  break;
                }
              }
              if (free === null) return null;
              const impliedSpot =
                Number(ammDepX) > 0
                  ? Math.round((Number(ammDepY) / Number(ammDepX)) * 10_000) /
                    10_000
                  : 0;
              return (
                <>
                  <div className="ls-inline-fields">
                    <label className="ls-field">
                      <span>{t.planet.ammLegX}</span>
                      <select
                        aria-label={t.planet.ammLegX}
                        className="ls-select"
                        value={ammX}
                        onChange={(e) => setAmmX(e.target.value)}
                      >
                        {ALL_RESOURCE_IDS.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ls-field">
                      <span>{t.planet.ammLegY}</span>
                      <select
                        aria-label={t.planet.ammLegY}
                        className="ls-select"
                        value={ammY}
                        onChange={(e) => setAmmY(e.target.value)}
                      >
                        {ALL_RESOURCE_IDS.map((r) => (
                          <option key={r} value={r}>
                            {r.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="ls-inline-fields">
                    <label className="ls-field">
                      <span>{t.planet.ammDepositX}</span>
                      <input
                        className="ls-input"
                        type="number"
                        min={1}
                        step={0.1}
                        value={ammDepX}
                        onChange={(e) => setAmmDepX(e.target.value)}
                      />
                    </label>
                    <label className="ls-field">
                      <span>{t.planet.ammDepositY}</span>
                      <input
                        className="ls-input"
                        type="number"
                        min={1}
                        step={0.1}
                        value={ammDepY}
                        onChange={(e) => setAmmDepY(e.target.value)}
                      />
                    </label>
                  </div>
                  <span className="ls-mono-line" data-testid="amm-implied-price">
                    {t.planet.ammImpliedPrice} {impliedSpot}{' '}
                    {ammY.replace('_', ' ')}/{ammX.replace('_', ' ')}
                  </span>
                  <button
                    type="button"
                    className="ls-button ls-button--accent ls-button--block"
                    onClick={() =>
                      onSeedAmm({
                        slotIndex: free!,
                        x: ammX,
                        y: ammY,
                        depositX: Number(ammDepX),
                        depositY: Number(ammDepY),
                      })
                    }
                  >
                    <Store size={13} aria-hidden /> {t.planet.ammSeed}
                  </button>
                </>
              );
            })()}
          </section>
        )}

      {building.key === 'market' &&
        building.marketSlots &&
        onSaveMarketSlot && (
          <section aria-label={t.planet.marketSlot} className="ls-section">
            <div className="ls-section-heading">
              <Store size={14} aria-hidden /> {t.planet.marketSlot}
            </div>
            <p className="ls-section-subtitle">
              L{building.level} = {building.level} slot
              {building.level > 1 ? 's' : ''}
            </p>
            {!slot0 && (
              <span className="ls-muted-copy">{t.planet.marketNoSlot}</span>
            )}

            <div className="ls-inline-fields">
              <label className="ls-field">
                <span>{t.planet.marketBuys}</span>
                <select
                  aria-label={t.planet.marketBuys}
                  className="ls-select"
                  value={slotGive}
                  onChange={(event) => setSlotGive(event.target.value)}
                >
                  {ALL_RESOURCE_IDS.map((resource) => (
                    <option key={resource} value={resource}>
                      {resource.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ls-field">
                <span>{t.planet.marketPays}</span>
                <select
                  aria-label={t.planet.marketPays}
                  className="ls-select"
                  value={slotGet}
                  onChange={(event) => setSlotGet(event.target.value)}
                >
                  {ALL_RESOURCE_IDS.map((resource) => (
                    <option key={resource} value={resource}>
                      {resource.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ls-inline-fields">
              <label className="ls-field">
                <span>
                  {t.planet.marketRate} ({slotGet}/T {slotGive})
                </span>
                <input
                  className="ls-input"
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={slotRate}
                  onChange={(event) => setSlotRate(event.target.value)}
                />
              </label>
              <label className="ls-field">
                <span>{t.planet.marketDailyLimit}</span>
                <input
                  className="ls-input"
                  type="number"
                  min={0}
                  step={1}
                  value={slotDaily}
                  onChange={(event) => setSlotDaily(event.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="ls-button ls-button--accent ls-button--block"
              onClick={() =>
                onSaveMarketSlot({
                  slotIndex: 0,
                  give: slotGive,
                  get: slotGet,
                  rate: Number(slotRate),
                  dailyLimitT: Number(slotDaily),
                })
              }
            >
              <Store size={13} aria-hidden /> {t.planet.marketSaveSlot}
            </button>
          </section>
        )}

      {isIndustry && (
        <section className="ls-section">
          <div className="ls-section-heading">
            <Gauge size={14} aria-hidden /> Production tuning
          </div>
          {building.workforceU !== null && (
            <EfficiencyCurve
              u={building.workforceU}
              label={building.key.replace(/_/g, ' ')}
            />
          )}
          <label className="ls-field">
            <span>
              {t.planet.workforce} ({workforceAssigned}/
              {workforceAssignable} assigned planet-wide)
            </span>
            <input
              className="ls-input"
              type="number"
              min={0}
              value={workforce}
              onChange={(event) =>
                setWorkforce(Math.max(0, Number(event.target.value)))
              }
            />
          </label>
          <label className="ls-field">
            <span>
              {t.planet.runPct} {runPct}%
            </span>
            <input
              className="ls-range"
              type="range"
              min={0}
              max={100}
              step={5}
              value={runPct}
              onChange={(event) => setRunPct(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            className="ls-button ls-button--block"
            onClick={() => onApply({ workforce, runPct })}
          >
            {t.planet.apply}
          </button>
          {building.status === 'active' && onRetool && (
            <button
              type="button"
              className="ls-button ls-button--violet ls-button--block"
              onClick={onRetool}
            >
              <Gauge size={13} aria-hidden /> {t.planet.retool}
            </button>
          )}
        </section>
      )}

      {canLevelUp && levelUpCost && (
        <div className="cmd-level-cost">
          <span>Level-up matter</span>
          <ResourceCost cost={levelUpCost} size={22} />
        </div>
      )}

      <div className="ls-building-actions">
        <button
          type="button"
          className="ls-button ls-button--violet"
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
        >
          <ChevronsUp size={13} aria-hidden />
          {building.level >= levelCap
            ? `${t.planet.maxLevelReached} L${levelCap}`
            : `${t.planet.levelUp} → L${building.level + 1}`}
        </button>
        <button
          type="button"
          className="ls-button ls-button--danger"
          data-confirm={confirmDemolish ? 'true' : 'false'}
          onClick={() => {
            if (confirmDemolish) onDemolish();
            else setConfirmDemolish(true);
          }}
          disabled={building.status === 'demolishing'}
        >
          <Trash2 size={13} aria-hidden />
          {confirmDemolish ? t.planet.demolishConfirm : t.planet.demolish}
        </button>
      </div>
    </section>
  );
}

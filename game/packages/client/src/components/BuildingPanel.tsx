/**
 * Building command inspector. Every simulation control and payload remains
 * unchanged; the presentation groups them into readable instrument modules
 * with the unit's efficiency and limiting factor kept in the foreground.
 */
import { useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  ChevronsUp,
  Gauge,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import {
  ALL_RESOURCE_IDS,
  buildableSizes,
  BUILDINGS,
  HULLS,
  shipBuildCost,
  type CostBundle,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type { PlanetBuilding, PlanetDocks } from '../api.js';
import { t } from '../i18n/en.js';
import { EfficiencyCurve } from './EfficiencyCurve.tsx';
import { OperationTimer } from './OperationTimer.tsx';
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

export function BuildingPanel({
  building,
  docks,
  workforceAssignable,
  workforceAssigned,
  maxLevelBySeed,
  onApply,
  onSaveMarketSlot,
  onBuildShip,
  shipBuilds,
  onLevelUp,
  onDemolish,
  onClose,
}: {
  building: PlanetBuilding;
  /** Résumé planète des docks (spaceports actifs) — null si aucun. */
  docks?: PlanetDocks | null;
  workforceAssignable: number;
  workforceAssigned: number;
  maxLevelBySeed: number;
  onApply: (settings: {
    workforce?: number;
    runPct?: number;
    landing?: 'self' | 'everyone';
    dwellHours?: number;
    reservedForSelf?: number;
  }) => void;
  onSaveMarketSlot?: (input: {
    slotIndex: number;
    give: string;
    get: string;
    rate: number;
    dailyLimitT: number;
  }) => void;
  onBuildShip?: (input: {
    category: 'combat' | 'cargo' | 'civil';
    size: 's' | 'm' | 'l';
    name: string;
  }) => void;
  shipBuilds?: {
    name: string;
    category: string;
    size: string;
    completesAt: string;
  }[];
  onLevelUp: () => void;
  onDemolish: () => void;
  onClose: () => void;
}) {
  const [workforce, setWorkforce] = useState(building.workforce);
  const [runPct, setRunPct] = useState(building.runPct);
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const slot0 = building.marketSlots?.[0];
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
  const [yardCategory, setYardCategory] = useState<
    'combat' | 'cargo' | 'civil'
  >('cargo');
  const [yardSize, setYardSize] = useState<'s' | 'm' | 'l'>('s');
  const [yardName, setYardName] = useState('');
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
          <h3 className="ls-panel-title">
            {building.key.replace(/_/g, ' ')}
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
              : `${t.planet.constructing} · L${building.level}`
          }
          tone={building.status === 'demolishing' ? 'danger' : 'warning'}
        />
      )}

      {building.recipe && (
        <p className="ls-production-route">
          <span>Production route</span>
          <strong>
            {building.recipe.startsWith('extract:')
              ? `Extracting ${building.recipe.slice(8).replace('_', ' ')}`
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
          <span>{limitingText}</span>
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

            <span className="ls-mono-line">
              {costText(
                shipBuildCost(
                  HULLS[
                    `${yardCategory}_${yardSize}` as `${HullCategory}_${HullSize}`
                  ],
                  building.level as 1 | 2 | 3,
                ),
              )}
            </span>

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
                })
              }
            >
              <Anchor size={13} aria-hidden /> {t.planet.yardBuild}
            </button>
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
        </section>
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

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck” and §P3 “Ship hulls”; GAME_BOOK.md §14/§26; DESIGN_GUIDE.md §7–§8.8; docs/DESIGN_SYSTEM.md §5.1/§8/§9. */
import { useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  Gauge,
  PackageOpen,
  Rocket,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  conversionOf,
  containersUsedTotal,
  GEAR,
  HULLS,
  type ItemSlot,
} from '@atg/shared';
import type { ShipView } from '../api.js';
import { shipSprite, spriteUrl } from '../scenes/assets.ts';
import {
  EmptyGridCell,
  ItemIcon,
  ItemTile,
  ResourceCost,
  ResourceIcon,
  ResourceInline,
  displayKey,
} from './InventoryVisuals.tsx';
import { useDialogFocus } from './useDialogFocus.ts';
import '../styles/command-deck.css';

const SLOT_FAMILIES: readonly ItemSlot[] = [
  'engine',
  'armor',
  'fuel',
  'obs',
  'weapon',
  'cargo',
  'accessory',
];

type Selection =
  | { kind: 'installed'; key: string }
  | { kind: 'available'; key: string }
  | { kind: 'cargo-item'; key: string; index: number }
  | { kind: 'cargo-resource'; key: string }
  | null;

type ConversionInput = {
  itemKey: string;
  runPct: number;
  direction?: 'forward' | 'reverse';
  hours?: number;
  target?: { x: number; y: number };
};

export function ShipCommandDeck({
  ship,
  availableItems,
  onInstall,
  onUninstall,
  onLoadItem,
  onUnloadItem,
  onUnloadResource,
  onSetConversion,
  onClose,
}: {
  ship: ShipView;
  availableItems: { itemKey: string; count: number }[];
  onInstall: (itemKey: string) => Promise<void> | void;
  onUninstall: (itemKey: string) => Promise<void> | void;
  onLoadItem: (itemKey: string) => Promise<void> | void;
  onUnloadItem: (itemKey: string) => Promise<void> | void;
  onUnloadResource: (resource: string, tons: number) => Promise<void> | void;
  onSetConversion: (input: ConversionInput) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const hullKey =
    ship.hullSize && ['combat', 'cargo', 'civil'].includes(ship.hullCategory)
      ? `${ship.hullCategory}_${ship.hullSize}` as keyof typeof HULLS
      : null;
  const hull = hullKey ? HULLS[hullKey] : null;
  const installed = useMemo(
    () => [
      ...Object.entries(ship.upgrades).map(([family, level]) => ({
        key: `${family}_l${level}`,
        family: family as ItemSlot,
      })),
      ...ship.accessories.map((key) => ({
        key,
        family: GEAR[key]?.slot ?? 'accessory' as ItemSlot,
      })),
    ],
    [ship.accessories, ship.upgrades],
  );
  const [selection, setSelection] = useState<Selection>(
    installed[0] ? { kind: 'installed', key: installed[0].key } : null,
  );
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [runPct, setRunPct] = useState<Record<string, number>>({});
  const [reverse, setReverse] = useState<Record<string, boolean>>({});
  const [hours, setHours] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<Record<string, { x: number; y: number }>>({});
  const usedContainers = containersUsedTotal(ship.cargo, ship.itemCargo);
  const selectedDefinition = selection && selection.kind !== 'cargo-resource'
    ? GEAR[selection.key]
    : null;

  const select = (next: Selection) => {
    setSelection(next);
    setConfirmRemove(false);
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Open hull ${ship.name}`}
      tabIndex={-1}
      className="ls-modal-layer"
    >
      <section className="cmd-modal cmd-ship-modal">
        <header className="cmd-modal__header">
          <span className="cmd-modal__mark" aria-hidden><Rocket size={22} /></span>
          <div>
            <span className="ls-panel-kicker">Open hull / {ship.status}</span>
            <h2>{ship.name}</h2>
            <p>
              {ship.hullCategory}{ship.hullSize ? ` ${ship.hullSize.toUpperCase()}` : ''} ·
              select installed gear, reserve items or cargo to reveal its controls
            </p>
          </div>
          <button type="button" className="ls-icon-button" onClick={onClose} aria-label="Close hull">
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="cmd-ship-layout">
          <div className="cmd-ship-workbench">
            <section className="cmd-hull-bay" aria-label="Installed ship equipment">
              <div className="cmd-hull-bay__visual">
                <div className="cmd-hull-scan" aria-hidden />
                <img
                  src={spriteUrl(shipSprite(ship.hullCategory, ship.hullSize))}
                  alt={`${ship.name} — ${ship.hullCategory}${ship.hullSize ? ` ${ship.hullSize.toUpperCase()}` : ''} hull`}
                  className="cmd-hull-sprite"
                  data-hull-sprite={`${ship.hullCategory}:${ship.hullSize ?? 'none'}`}
                />
                <span className="cmd-hull-callout cmd-hull-callout--fuel">
                  <Gauge size={12} aria-hidden />
                  {(ship.fuel[ship.fuelType] ?? 0).toFixed(1)}/{ship.tankU} u
                </span>
                <span className="cmd-hull-callout cmd-hull-callout--hp">
                  <Activity size={12} aria-hidden />
                  {ship.hull.hp.toFixed(0)}/{ship.hull.maxHp} HP
                </span>
              </div>

              <div className="cmd-slot-banks">
                {SLOT_FAMILIES.filter((family) => (hull?.slots[family] ?? 0) > 0).map((family) => {
                  const capacity = hull?.slots[family] ?? 0;
                  const fitted = installed.filter((item) => item.family === family);
                  return (
                    <article className="cmd-slot-bank" key={family}>
                      <header>
                        <span>{family}</span>
                        <strong>{fitted.length}/{capacity}</strong>
                      </header>
                      <div className="cmd-slot-grid" data-family={family}>
                        {fitted.map((item) => {
                          const conversion = ship.conversions[item.key];
                          const active = !!conversion && (
                            conversion.runPct > 0 || !!conversion.processEndsAtMs
                          );
                          return (
                            <button
                              type="button"
                              className="cmd-slot-cell"
                              data-selected={selection?.kind === 'installed' && selection.key === item.key ? 'true' : 'false'}
                              onClick={() => select({ kind: 'installed', key: item.key })}
                              aria-pressed={selection?.kind === 'installed' && selection.key === item.key}
                              key={item.key}
                            >
                              <ItemIcon itemKey={item.key} size={48} state={active ? 'active' : 'installed'} />
                              <span>{displayKey(item.key)}</span>
                            </button>
                          );
                        })}
                        {Array.from({ length: Math.max(0, capacity - fitted.length) }, (_, index) => (
                          <EmptyGridCell key={index} label={`Empty ${family} slot`} />
                        ))}
                      </div>
                    </article>
                  );
                })}
                {!hull && (
                  <div className="cmd-no-slots">
                    <Rocket size={24} aria-hidden />
                    <span>This craft has no configurable hull grid.</span>
                  </div>
                )}
              </div>
            </section>

            <section className="cmd-deck-bank" aria-label="Cargo containers">
              <header>
                <span><PackageOpen size={14} aria-hidden /> Cargo hold</span>
                <strong>{usedContainers}/{ship.containers} containers</strong>
              </header>
              <div className="cmd-cargo-grid">
                {Object.entries(ship.cargo).flatMap(([resource, amount]) =>
                  Array.from({ length: Math.ceil(Math.max(0, amount)) }, (_, index) => {
                    const inCell = Math.min(1, Math.max(0, amount - index));
                    return (
                      <button
                        type="button"
                        className="cmd-cargo-cell"
                        data-selected={selection?.kind === 'cargo-resource' && selection.key === resource ? 'true' : 'false'}
                        onClick={() => select({ kind: 'cargo-resource', key: resource })}
                        aria-pressed={selection?.kind === 'cargo-resource' && selection.key === resource}
                        key={`${resource}:${index}`}
                      >
                        <ResourceIcon resource={resource} size={38} />
                        <span>{inCell.toFixed(inCell < 1 ? 1 : 0)} T</span>
                        <small>{displayKey(resource)}</small>
                      </button>
                    );
                  }),
                )}
                {ship.itemCargo.map((itemKey, index) => (
                  <button
                    type="button"
                    className="cmd-cargo-cell"
                    data-selected={selection?.kind === 'cargo-item' && selection.index === index ? 'true' : 'false'}
                    onClick={() => select({ kind: 'cargo-item', key: itemKey, index })}
                    aria-pressed={selection?.kind === 'cargo-item' && selection.index === index}
                    key={`${itemKey}:${index}`}
                  >
                    <ItemIcon itemKey={itemKey} size={44} />
                    <small>{displayKey(itemKey)}</small>
                  </button>
                ))}
                {Array.from({ length: Math.max(0, ship.containers - usedContainers) }, (_, index) => (
                  <EmptyGridCell key={`empty:${index}`} label={`Empty container ${usedContainers + index + 1}`} />
                ))}
                {ship.containers === 0 && <EmptyGridCell label="No cargo capacity" />}
              </div>
            </section>

            {availableItems.length > 0 && ['docked', 'warehoused'].includes(ship.status) && (
              <section className="cmd-deck-bank" aria-label="Available fabricated items">
                <header>
                  <span><Boxes size={14} aria-hidden /> Planet item reserve</span>
                  <small>{ship.status === 'warehoused' ? 'install to compatible slot' : 'load as freight'}</small>
                </header>
                <div className="cmd-cell-grid">
                  {availableItems.map((item) => (
                    <ItemTile
                      key={item.itemKey}
                      itemKey={item.itemKey}
                      count={item.count}
                      selected={selection?.kind === 'available' && selection.key === item.itemKey}
                      onSelect={() => select({ kind: 'available', key: item.itemKey })}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="cmd-dossier cmd-ship-dossier" aria-live="polite">
            <span className="ls-panel-kicker">Object dossier</span>
            {selection ? (
              <>
                {selection.kind === 'cargo-resource' ? (
                  <>
                    <ResourceIcon resource={selection.key} size={74} />
                    <h3>{displayKey(selection.key)}</h3>
                    <ResourceInline resource={selection.key} amount={ship.cargo[selection.key] ?? 0} suffix=" T aboard" size={25} />
                    <p>Fungible matter occupies one container per started tonne.</p>
                    {ship.status === 'docked' && (
                      <button
                        type="button"
                        className="ls-button ls-button--block"
                        onClick={() => onUnloadResource(selection.key, Math.min(1, ship.cargo[selection.key] ?? 0))}
                      >
                        Unload 1 T
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <ItemTile
                      itemKey={selection.key}
                      state={
                        selection.kind === 'installed' &&
                        ship.conversions[selection.key] &&
                        (ship.conversions[selection.key]!.runPct > 0 || ship.conversions[selection.key]!.processEndsAtMs)
                          ? 'active'
                          : selection.kind === 'installed' ? 'installed' : 'stored'
                      }
                    />
                    <h3>{displayKey(selection.key)}</h3>
                    {selectedDefinition ? (
                      <>
                        <dl>
                          <div><dt>Location</dt><dd>{displayKey(selection.kind)}</dd></div>
                          <div><dt>Slot family</dt><dd>{selectedDefinition.slot}</dd></div>
                          <div><dt>Class</dt><dd>{selectedDefinition.kind}</dd></div>
                        </dl>
                        <p>{selectedDefinition.note}</p>
                      </>
                    ) : (
                      <p>Portable fabricated item.</p>
                    )}

                    {selection.kind === 'installed' && selectedDefinition && (() => {
                      const conversion = conversionOf(selection.key);
                      const state = ship.conversions[selection.key];
                      if (!conversion) return null;
                      const pct = runPct[selection.key] ?? state?.runPct ?? 0;
                      const chosenHours = conversion.mode === 'batch'
                        ? hours[selection.key] ?? conversion.charge?.minHours ?? conversion.processHours
                        : 0;
                      return (
                        <section className="cmd-object-controls">
                          <header>
                            <Activity size={13} aria-hidden />
                            {conversion.mode === 'continuous' ? 'Active system' : 'Batch system'}
                          </header>
                          {conversion.mode === 'continuous' ? (
                            <>
                              <label>
                                <span>Output throttle — {pct}%</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={pct}
                                  onChange={(event) => setRunPct((current) => ({
                                    ...current,
                                    [selection.key]: Number(event.target.value),
                                  }))}
                                />
                              </label>
                              {conversion.reversible && (
                                <label className="cmd-check">
                                  <input
                                    type="checkbox"
                                    checked={reverse[selection.key] ?? false}
                                    onChange={(event) => setReverse((current) => ({
                                      ...current,
                                      [selection.key]: event.target.checked,
                                    }))}
                                  />
                                  <span>Reverse conversion</span>
                                </label>
                              )}
                              <button
                                type="button"
                                className="ls-button ls-button--accent ls-button--block"
                                onClick={() => onSetConversion({
                                  itemKey: selection.key,
                                  runPct: pct,
                                  ...(reverse[selection.key] ? { direction: 'reverse' as const } : {}),
                                })}
                              >
                                {pct === 0 ? 'Deactivate system' : state?.runPct ? 'Apply throttle' : 'Activate system'}
                              </button>
                            </>
                          ) : (
                            <>
                              {(conversion.charge || (conversion.stasis && selection.key.endsWith('_enhanced'))) && !state?.processEndsAtMs && (
                                <label>
                                  <span>Duration (game hours)</span>
                                  <input
                                    className="ls-input"
                                    type="number"
                                    min={conversion.charge?.minHours ?? 1}
                                    max={conversion.charge?.maxHours ?? conversion.stasis?.maxHours ?? 240}
                                    value={chosenHours}
                                    onChange={(event) => setHours((current) => ({
                                      ...current,
                                      [selection.key]: Number(event.target.value),
                                    }))}
                                  />
                                </label>
                              )}
                              {conversion.kedge && !state?.processEndsAtMs && (
                                <div className="cmd-target-fields">
                                  {(['x', 'y'] as const).map((axis) => (
                                    <label key={axis}>
                                      <span>Target {axis.toUpperCase()}</span>
                                      <input
                                        className="ls-input"
                                        type="number"
                                        value={target[selection.key]?.[axis] ?? ''}
                                        onChange={(event) => setTarget((current) => ({
                                          ...current,
                                          [selection.key]: {
                                            x: axis === 'x' ? Number(event.target.value) : (current[selection.key]?.x ?? 0),
                                            y: axis === 'y' ? Number(event.target.value) : (current[selection.key]?.y ?? 0),
                                          },
                                        }))}
                                      />
                                    </label>
                                  ))}
                                </div>
                              )}
                              <button
                                type="button"
                                className="ls-button ls-button--accent ls-button--block"
                                onClick={() => onSetConversion({
                                  itemKey: selection.key,
                                  runPct: state?.processEndsAtMs ? 0 : 100,
                                  ...((conversion.charge || (conversion.stasis && selection.key.endsWith('_enhanced'))) && !state?.processEndsAtMs
                                    ? { hours: chosenHours }
                                    : {}),
                                  ...(conversion.kedge && target[selection.key] && !state?.processEndsAtMs
                                    ? { target: target[selection.key] }
                                    : {}),
                                })}
                              >
                                {state?.processEndsAtMs ? 'Abort / wake' : 'Use selected system'}
                              </button>
                            </>
                          )}
                        </section>
                      );
                    })()}

                    {selection.kind === 'available' && selectedDefinition && (
                      <>
                        <div>
                          <small>{ship.status === 'warehoused' ? 'Installation matter' : 'Freight object'}</small>
                          {ship.status === 'warehoused' && <ResourceCost cost={selectedDefinition.installCost} size={21} />}
                        </div>
                        <button
                          type="button"
                          className="ls-button ls-button--accent ls-button--block"
                          onClick={() => ship.status === 'warehoused'
                            ? onInstall(selection.key)
                            : onLoadItem(selection.key)}
                        >
                          {ship.status === 'warehoused' ? `Install in ${selectedDefinition.slot} bay` : 'Load into cargo box'}
                        </button>
                      </>
                    )}

                    {selection.kind === 'cargo-item' && ship.status === 'docked' && (
                      <button
                        type="button"
                        className="ls-button ls-button--block"
                        onClick={() => onUnloadItem(selection.key)}
                      >
                        Unload selected item
                      </button>
                    )}

                    {selection.kind === 'installed' && ship.status === 'warehoused' && (
                      <button
                        type="button"
                        className="ls-button ls-button--danger ls-button--block"
                        data-confirm={confirmRemove ? 'true' : 'false'}
                        onClick={() => {
                          if (!confirmRemove) {
                            setConfirmRemove(true);
                            return;
                          }
                          Promise.resolve(onUninstall(selection.key)).then(() => {
                            setConfirmRemove(false);
                            setSelection(null);
                          });
                        }}
                      >
                        <Trash2 size={14} aria-hidden />
                        {confirmRemove ? 'Confirm removal' : 'Remove from hull'}
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="cmd-dossier__empty">
                <Boxes size={30} aria-hidden />
                <p>Select a box or installed system to reveal its controls.</p>
              </div>
            )}

            <section className="cmd-instruments" aria-label="Ship statistics">
              <header><Gauge size={13} aria-hidden /> Hull instruments</header>
              <dl>
                <div><dt>Fuel flow</dt><dd>{ship.fuelRatePerDay > 0 ? '+' : ''}{ship.fuelRatePerDay.toFixed(2)} u/day</dd></div>
                <div><dt>Hull flow</dt><dd>{ship.hull.wearPerDay > 0 ? '−' : ship.hull.wearPerDay < 0 ? '+' : ''}{Math.abs(ship.hull.wearPerDay).toFixed(2)} HP/day</dd></div>
                <div><dt>Containers</dt><dd>{usedContainers}/{ship.containers}</dd></div>
                <div><dt>Crew</dt><dd>{ship.crewCount}</dd></div>
                {hull && <div><dt>Base speed</dt><dd>{hull.speedPcPerDay} pc/day</dd></div>}
                {hull && <div><dt>Base burn</dt><dd>{hull.burnUPerPc} u/pc</dd></div>}
                <div><dt>Position</dt><dd>{ship.x.toFixed(0)}, {ship.y.toFixed(0)}</dd></div>
              </dl>
              {ship.crewCount > 0 && (
                <span className="cmd-crew-line"><Users size={12} aria-hidden /> {ship.survival.food.toFixed(1)} T food · {ship.survival.water.toFixed(1)} T water</span>
              )}
            </section>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

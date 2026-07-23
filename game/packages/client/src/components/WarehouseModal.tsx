/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck” and §P2 “Warehouse”; GAME_BOOK.md §9; DESIGN_GUIDE.md §6; docs/DESIGN_SYSTEM.md §5.1/§8/§9. */
import { useMemo, useState } from 'react';
import { Boxes, Rocket, Trash2, Warehouse, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { GEAR, type ItemSlot } from '@atg/shared';
import type { PlanetDocks } from '../api.js';
import { EmptyGridCell, ItemTile, ResourceCost, displayKey } from './InventoryVisuals.tsx';
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

export function WarehouseModal({
  warehouseLevel,
  items,
  capacity,
  fabricating,
  vehicles,
  docks,
  onDisassemble,
  onClose,
}: {
  warehouseLevel: number;
  items: { itemKey: string; count: number }[];
  capacity: number;
  fabricating: { itemKey: string; completesAt: string }[];
  vehicles: {
    capacity: Record<'s' | 'm' | 'l', number>;
    stored: Record<'s' | 'm' | 'l', number>;
  } | null | undefined;
  docks?: PlanetDocks | null;
  onDisassemble?: (itemKey: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const [selectedItem, setSelectedItem] = useState<string | null>(items[0]?.itemKey ?? null);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const used = items.reduce((sum, item) => sum + item.count, 0);
  const selected = selectedItem ? GEAR[selectedItem] : null;
  const itemsByFamily = useMemo(
    () =>
      Object.fromEntries(
        SLOT_FAMILIES.map((family) => [
          family,
          items.filter((item) => (GEAR[item.itemKey]?.slot ?? 'accessory') === family),
        ]),
      ) as Record<ItemSlot, { itemKey: string; count: number }[]>,
    [items],
  );

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Warehouse command deck"
      tabIndex={-1}
      className="ls-modal-layer"
    >
      <section className="cmd-modal cmd-warehouse-modal">
        <header className="cmd-modal__header">
          <span className="cmd-modal__mark" aria-hidden><Warehouse size={22} /></span>
          <div>
            <span className="ls-panel-kicker">Physical reserve / Level {warehouseLevel}</span>
            <h2>Warehouse command deck</h2>
            <p>Separate balances. Select a stored object to inspect or act on it.</p>
          </div>
          <button type="button" className="ls-icon-button" onClick={onClose} aria-label="Close warehouse">
            <X size={17} aria-hidden />
          </button>
        </header>

        <div className="cmd-warehouse-layout">
          <div className="cmd-warehouse-banks">
            <section className="cmd-deck-bank" aria-label="Fabricated item balance">
              <header>
                <span><Boxes size={14} aria-hidden /> Fabricated items</span>
                <strong>{used}/{capacity}</strong>
              </header>
              <div className="cmd-family-banks">
                {SLOT_FAMILIES.map((family) => {
                  const familyItems = itemsByFamily[family];
                  const visibleEmptyCells = Math.max(1, 3 - familyItems.length);
                  return (
                    <div className="cmd-family-bank" key={family}>
                      <div className="cmd-family-bank__label">
                        <span>{family}</span>
                        <small>{familyItems.reduce((sum, item) => sum + item.count, 0)} stored</small>
                      </div>
                      <div className="cmd-cell-grid" data-family={family}>
                        {familyItems.map((item) => (
                          <ItemTile
                            key={item.itemKey}
                            itemKey={item.itemKey}
                            count={item.count}
                            selected={selectedItem === item.itemKey}
                            onSelect={() => {
                              setSelectedItem(item.itemKey);
                              setConfirmTrash(false);
                            }}
                          />
                        ))}
                        {Array.from({ length: visibleEmptyCells }, (_, index) => (
                          <EmptyGridCell key={`empty-${index}`} label={`Empty ${family} bay ${index + 1}`} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {capacity > used && (
                <div className="cmd-reserve-strip" aria-label={`${capacity - used} free item cells`}>
                  {Array.from({ length: Math.min(6, Math.max(1, capacity - used)) }, (_, index) => (
                    <EmptyGridCell key={index} label="Free item cell" />
                  ))}
                  {capacity - used > 6 && <strong>+{capacity - used - 6} reserve cells</strong>}
                </div>
              )}
            </section>

            {fabricating.length > 0 && (
              <section className="cmd-deck-bank" aria-label="Fabrication queue">
                <header>
                  <span>Fabrication line</span>
                  <strong>{fabricating.length} active</strong>
                </header>
                <div className="cmd-cell-grid cmd-cell-grid--queue">
                  {fabricating.map((item, index) => (
                    <ItemTile
                      key={`${item.itemKey}:${item.completesAt}:${index}`}
                      itemKey={item.itemKey}
                      state="fabricating"
                      footer={<small className="cmd-item-eta">ETA {new Date(item.completesAt).toLocaleTimeString('en-US')}</small>}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="cmd-deck-bank" aria-label="Vehicle balances">
              <header>
                <span><Rocket size={14} aria-hidden /> Vehicle vaults</span>
                <small>Docks ready {docks ? Object.values(docks.total).reduce((a, b) => a + b, 0) : 0}</small>
              </header>
              <div className="cmd-vehicle-banks">
                {(['s', 'm', 'l'] as const).map((size) => {
                  const cap = vehicles?.capacity[size] ?? 0;
                  const stored = vehicles?.stored[size] ?? 0;
                  return (
                    <article className="cmd-vehicle-bank" key={size}>
                      <header>
                        <span>{size.toUpperCase()} hulls</span>
                        <strong>{stored}/{cap}</strong>
                      </header>
                      <div className="cmd-cell-grid">
                        {Array.from({ length: Math.min(stored, 8) }, (_, index) => (
                          <span className="cmd-hull-cell" key={`used-${index}`}>
                            <Rocket size={26} aria-hidden />
                            <strong>{size.toUpperCase()}</strong>
                            <small>stored hull</small>
                          </span>
                        ))}
                        {Array.from({ length: Math.min(Math.max(0, cap - stored), Math.max(1, 8 - stored)) }, (_, index) => (
                          <EmptyGridCell key={`free-${index}`} label={`Free ${size.toUpperCase()} berth`} />
                        ))}
                        {cap === 0 && <EmptyGridCell label={`No ${size.toUpperCase()} capacity`} />}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="cmd-dossier" aria-live="polite">
            <span className="ls-panel-kicker">Selected object</span>
            {selectedItem && selected ? (
              <>
                <ItemTile itemKey={selectedItem} count={items.find((item) => item.itemKey === selectedItem)?.count} />
                <h3>{displayKey(selectedItem)}</h3>
                <dl>
                  <div><dt>Class</dt><dd>{selected.kind}</dd></div>
                  <div><dt>Slot family</dt><dd>{selected.slot}</dd></div>
                  <div><dt>Fabricator</dt><dd>{displayKey(selected.fabricator)}</dd></div>
                  <div><dt>Install time</dt><dd>{selected.installHours} h</dd></div>
                </dl>
                <p>{selected.note}</p>
                <div>
                  <small>Fabrication matter</small>
                  <ResourceCost cost={selected.fabricationCost} size={21} />
                </div>
                {onDisassemble && (
                  <button
                    type="button"
                    className="ls-button ls-button--danger ls-button--block"
                    data-confirm={confirmTrash ? 'true' : 'false'}
                    onClick={() => {
                      if (!confirmTrash) {
                        setConfirmTrash(true);
                        return;
                      }
                      Promise.resolve(onDisassemble(selectedItem)).then(() => {
                        setConfirmTrash(false);
                        setSelectedItem(null);
                      });
                    }}
                  >
                    <Trash2 size={14} aria-hidden />
                    {confirmTrash ? 'Confirm disassembly' : 'Disassemble selected item'}
                  </button>
                )}
              </>
            ) : (
              <div className="cmd-dossier__empty">
                <Boxes size={30} aria-hidden />
                <p>Select an item cell. Its legal actions will appear here.</p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P0.3 “Icon-first command deck”; GAME_BOOK.md §8/§9/§26; DESIGN_GUIDE.md §6–§8.8; docs/DESIGN_SYSTEM.md §5.1/§9. */
import type { CSSProperties, ReactNode } from 'react';
import {
  Boxes,
  Crosshair,
  Cpu,
  Fuel,
  Package,
  Radar,
  Shield,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  ALL_RESOURCE_IDS,
  GEAR,
  RESOURCES,
  type CostBundle,
  type ItemSlot,
  type ResourceTier,
} from '@atg/shared';
import { resourceArt, spriteUrl } from '../scenes/assets.ts';
import '../styles/command-deck.css';

const TIER_ORDER: readonly ResourceTier[] = [
  'basic',
  'crystal',
  'refined',
  'propulsion',
  'salvage',
];

const SLOT_ICON: Record<ItemSlot, LucideIcon> = {
  engine: Cpu,
  armor: Shield,
  fuel: Fuel,
  obs: Radar,
  weapon: Crosshair,
  cargo: Package,
  accessory: Wrench,
};

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const RESOURCE_GLYPHS: Partial<Record<keyof typeof RESOURCES, string>> = {
  oxygen: 'O₂',
  carbon: 'C',
  hydrogen: 'H',
  ore: 'OR',
  lithium: 'Li',
  sulfur: 'S',
  gold: 'Au',
  uranium: 'U',
  deuterium: 'D',
  aluminium: 'Al',
  phosphor: 'P',
  silicon: 'Si',
  crystal_hot: 'IH',
  crystal_cold: 'GC',
  crystal_temperate: 'VC',
  crystal_nox: 'NC',
  steel_l: 'SL',
  steel_h: 'SH',
  water: 'H₂O',
  heavy_water: 'D₂O',
  food_1: 'F1',
  food_2: 'F2',
  food_3: 'F3',
  med_1: 'M1',
  med_2: 'M2',
  med_3: 'M3',
  fuel_cells: 'FC',
  fuel_cold: 'CF',
  fuel_hot: 'HF',
  fuel_gas: 'GF',
  junk: 'J',
};

export function displayKey(key: string): string {
  return key.replace(/_/g, ' ');
}

export function ResourceIcon({
  resource,
  size = 32,
  className = '',
}: {
  resource: string;
  size?: number;
  className?: string;
}) {
  const definition = RESOURCES[resource as keyof typeof RESOURCES];
  const name = definition?.name ?? displayKey(resource);
  return (
    <span
      className={`cmd-resource-icon ${className}`}
      data-tier={definition?.tier ?? 'basic'}
      style={{ '--resource-icon-size': `${size}px` } as CSSProperties}
      title={name}
      role="img"
      aria-label={name}
    >
      <img
        src={spriteUrl(resourceArt(resource))}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        loading="lazy"
      />
      <strong aria-hidden="true">
        {RESOURCE_GLYPHS[resource as keyof typeof RESOURCES] ?? resource.slice(0, 2).toUpperCase()}
      </strong>
    </span>
  );
}

export function ResourceInline({
  resource,
  amount,
  suffix = '',
  size = 22,
}: {
  resource: string;
  amount?: number;
  suffix?: string;
  size?: number;
}) {
  const name = RESOURCES[resource as keyof typeof RESOURCES]?.name ?? displayKey(resource);
  return (
    <span className="cmd-resource-inline">
      <ResourceIcon resource={resource} size={size} />
      <span>{name}</span>
      {amount !== undefined && <strong>{NUMBER.format(amount)}{suffix}</strong>}
    </span>
  );
}

export function ResourceCost({
  cost,
  size = 24,
  className = '',
}: {
  cost: CostBundle;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`cmd-cost ${className}`} aria-label="Resource cost">
      {Object.entries(cost).map(([resource, amount]) => (
        <span className="cmd-cost__token" key={resource}>
          {resource === 'crystal_any' ? (
            <span className="cmd-resource-icon cmd-resource-icon--any" aria-hidden="true">
              ◇
            </span>
          ) : (
            <ResourceIcon resource={resource} size={size} />
          )}
          <span>{resource === 'crystal_any' ? 'Climate crystal' : (RESOURCES[resource as keyof typeof RESOURCES]?.name ?? displayKey(resource))}</span>
          <strong>{NUMBER.format(amount as number)}</strong>
        </span>
      ))}
    </span>
  );
}

function initials(key: string): string {
  const parts = key
    .replace(/_enhanced$/, '')
    .replace(/_l[23]$/, '')
    .split('_')
    .filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

export function ItemIcon({
  itemKey,
  size = 56,
  state = 'stored',
}: {
  itemKey: string;
  size?: number;
  state?: 'stored' | 'fabricating' | 'installed' | 'active' | 'disabled';
}) {
  const definition = GEAR[itemKey];
  const slot = definition?.slot ?? 'accessory';
  const SlotIcon = SLOT_ICON[slot];
  const enhanced = itemKey.endsWith('_enhanced');
  return (
    <span
      className="cmd-item-icon"
      data-slot={slot}
      data-state={state}
      style={{ '--item-icon-size': `${size}px` } as CSSProperties}
      role="img"
      aria-label={`${displayKey(itemKey)}${enhanced ? ', enhanced' : ''}, ${state}`}
    >
      <SlotIcon size={Math.max(15, Math.round(size * 0.38))} aria-hidden />
      <strong aria-hidden="true">{initials(itemKey)}</strong>
      <small aria-hidden="true">STUB</small>
      {enhanced && <i aria-hidden="true">E</i>}
    </span>
  );
}

export function ItemTile({
  itemKey,
  count,
  state = 'stored',
  selected = false,
  onSelect,
  footer,
}: {
  itemKey: string;
  count?: number;
  state?: 'stored' | 'fabricating' | 'installed' | 'active' | 'disabled';
  selected?: boolean;
  onSelect?: () => void;
  footer?: ReactNode;
}) {
  const content = (
    <>
      <ItemIcon itemKey={itemKey} state={state} />
      <span className="cmd-item-tile__name">{displayKey(itemKey)}</span>
      {count !== undefined && <strong className="cmd-item-tile__count">×{count}</strong>}
      {footer}
    </>
  );

  return onSelect ? (
    <button
      type="button"
      className="cmd-item-tile"
      data-selected={selected ? 'true' : 'false'}
      data-state={state}
      onClick={onSelect}
      aria-pressed={selected}
      title={displayKey(itemKey)}
    >
      {content}
    </button>
  ) : (
    <span className="cmd-item-tile" data-state={state}>
      {content}
    </span>
  );
}

export function ResourceStockDeck({
  stock,
  compact = false,
}: {
  stock: Record<string, { amount: number; ratePerDay: number } | undefined>;
  compact?: boolean;
}) {
  return (
    <div className="cmd-resource-deck" data-compact={compact ? 'true' : 'false'}>
      {TIER_ORDER.map((tier) => (
        <section className="cmd-resource-group" key={tier} aria-label={`${tier} resources`}>
          <header>{tier}</header>
          <div className="cmd-resource-grid">
            {ALL_RESOURCE_IDS.filter((id) => RESOURCES[id].tier === tier).map((resource) => {
              const value = stock[resource] ?? { amount: 0, ratePerDay: 0 };
              const roundedRate = Math.abs(value.ratePerDay) < 0.05 ? 0 : value.ratePerDay;
              return (
                <article className="cmd-resource-cell" key={resource} data-empty={value.amount <= 0 ? 'true' : 'false'}>
                  <ResourceIcon resource={resource} size={compact ? 15 : 30} />
                  <span>
                    <small>{RESOURCES[resource].name}</small>
                    <strong>{NUMBER.format(value.amount)} T</strong>
                  </span>
                  <em data-tone={roundedRate < 0 ? 'danger' : roundedRate > 0 ? 'success' : 'idle'}>
                    {roundedRate > 0 ? '+' : ''}{NUMBER.format(roundedRate)}/d
                  </em>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function EmptyGridCell({ label = 'Empty' }: { label?: string }) {
  return (
    <span className="cmd-empty-cell" aria-label={label}>
      <Boxes size={18} aria-hidden />
      <small>{label}</small>
    </span>
  );
}

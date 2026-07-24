/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2 “Tech tree runtime”; GAME_BOOK.md §18; DESIGN_GUIDE.md §5. */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  Check,
  CircleDot,
  Coins,
  Factory,
  FlaskConical,
  GitBranch,
  LockKeyhole,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ALL_TECH_KEYS,
  BUILDINGS,
  TECH_NODES,
  UNITS,
  type TechNodeKey,
  type UnitKey,
} from '@atg/shared';
import type { PlanetDetail } from '../api.js';
import { useDialogFocus } from './useDialogFocus.ts';
import '../styles/tech-tree.css';

type TechState =
  | 'unlocked'
  | 'unlockable'
  | 'resource-blocked'
  | 'prereq-blocked'
  | 'governance-blocked'
  | 'dna-absent';

interface NodePosition {
  key: TechNodeKey;
  x: number;
  y: number;
}

const GRAPH_WIDTH = 1_180;
const GRAPH_HEIGHT = 780;
const NODE_WIDTH = 156;
const NODE_HEIGHT = 48;
const GRAPH_PAD_X = 28;
const GRAPH_PAD_TOP = 64;
const GRAPH_PAD_BOTTOM = 18;
const TIER_COUNT = 6;

const STATE_COPY: Record<
  TechState,
  { short: string; title: string; description: string }
> = {
  unlocked: {
    short: 'Unlocked',
    title: 'Permanent Knowledge',
    description: 'This protocol is permanently known on this world.',
  },
  unlockable: {
    short: 'Ready',
    title: 'Ready to Unlock',
    description: 'Every active requirement is satisfied.',
  },
  'resource-blocked': {
    short: 'Resources',
    title: 'Resources Required',
    description: 'The protocol is reachable, but this world cannot pay the unlock cost yet.',
  },
  'prereq-blocked': {
    short: 'Prerequisite',
    title: 'Prerequisite Required',
    description: 'Unlock the preceding protocols to energize this branch.',
  },
  'governance-blocked': {
    short: 'Governance',
    title: 'Governance Conflict',
    description: 'This world\'s effective political mask denies the protocol.',
  },
  'dna-absent': {
    short: 'No DNA',
    title: 'Absent From World DNA',
    description: 'This branch does not exist in this planet\'s deterministic technology DNA.',
  },
};

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

function displayName(key: TechNodeKey): string {
  return key
    .replace(/^unit_/, '')
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function layoutNodes(): NodePosition[] {
  const tierWidth = (GRAPH_WIDTH - 2 * GRAPH_PAD_X - NODE_WIDTH) / (TIER_COUNT - 1);
  const availableHeight = GRAPH_HEIGHT - GRAPH_PAD_TOP - GRAPH_PAD_BOTTOM;
  const out: NodePosition[] = [];

  for (let tier = 0; tier < TIER_COUNT; tier++) {
    const keys = ALL_TECH_KEYS.filter((key) => TECH_NODES[key].tier === tier);
    const gap = Math.max(5, (availableHeight - keys.length * NODE_HEIGHT) / (keys.length + 1));
    keys.forEach((key, index) => {
      out.push({
        key,
        x: GRAPH_PAD_X + tier * tierWidth,
        y: GRAPH_PAD_TOP + gap * (index + 1) + NODE_HEIGHT * index,
      });
    });
  }
  return out;
}

const NODE_POSITIONS = layoutNodes();
const POSITION_BY_KEY = new Map(NODE_POSITIONS.map((position) => [position.key, position]));
const CHILDREN_BY_KEY = new Map<TechNodeKey, TechNodeKey[]>(
  ALL_TECH_KEYS.map((key) => [
    key,
    ALL_TECH_KEYS.filter((candidate) => TECH_NODES[candidate].prerequisites.includes(key)),
  ]),
);

function resolvedResource(resource: string, planet: PlanetDetail): string {
  return resource === 'crystal_any' ? `crystal_${planet.climate}` : resource;
}

function ownedResource(planet: PlanetDetail, resource: string): number {
  return planet.stock[resolvedResource(resource, planet)]?.amount ?? 0;
}

function canPay(planet: PlanetDetail, node: TechNodeKey): boolean {
  return Object.entries(TECH_NODES[node].unlockCost).every(
    ([resource, amount]) => ownedResource(planet, resource) >= (amount ?? 0),
  );
}

function nodeState(planet: PlanetDetail, key: TechNodeKey): TechState {
  if (!planet.tech.available.includes(key)) return 'dna-absent';
  if (planet.tech.unlocked.includes(key)) return 'unlocked';
  if (!planet.tech.maskAllowed.includes(key)) return 'governance-blocked';
  if (
    TECH_NODES[key].prerequisites.some(
      (prerequisite) => !planet.tech.unlocked.includes(prerequisite),
    )
  ) {
    return 'prereq-blocked';
  }
  return canPay(planet, key) ? 'unlockable' : 'resource-blocked';
}

function NodeGlyph({ kind }: { kind: (typeof TECH_NODES)[TechNodeKey]['kind'] }) {
  if (kind === 'unit_card') return <Shield size={13} aria-hidden />;
  if (kind === 'program') return <FlaskConical size={13} aria-hidden />;
  return <Factory size={13} aria-hidden />;
}

function StateGlyph({ state }: { state: TechState }) {
  if (state === 'unlocked') return <Check size={12} aria-hidden />;
  if (state === 'unlockable') return <Sparkles size={12} aria-hidden />;
  if (state === 'resource-blocked') return <Coins size={12} aria-hidden />;
  if (state === 'prereq-blocked') return <GitBranch size={12} aria-hidden />;
  if (state === 'governance-blocked') return <LockKeyhole size={12} aria-hidden />;
  return <Ban size={12} aria-hidden />;
}

function nodeDescription(key: TechNodeKey): string {
  const node = TECH_NODES[key];
  if (node.kind === 'building') return BUILDINGS[key as keyof typeof BUILDINGS].effects;
  if (node.kind === 'unit_card') {
    return UNITS[key.replace(/^unit_/, '') as UnitKey].notes;
  }
  return 'Authorizes colony fittings and the establishment of a new inhabited world.';
}

function actionLabel(state: TechState, unlocking: boolean): string {
  if (unlocking) return 'Unlocking…';
  if (state === 'unlocked') return 'Protocol Unlocked';
  if (state === 'unlockable') return 'Unlock Protocol';
  if (state === 'resource-blocked') return 'Resources Required';
  if (state === 'prereq-blocked') return 'Complete Prerequisites';
  if (state === 'governance-blocked') return 'Denied by Governance';
  return 'Absent From World DNA';
}

export function TechTree({
  planet,
  onUnlock,
  onClose,
}: {
  planet: PlanetDetail;
  onUnlock: (node: TechNodeKey) => Promise<void> | void;
  onClose: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const states = useMemo(
    () => new Map(ALL_TECH_KEYS.map((key) => [key, nodeState(planet, key)])),
    [planet],
  );
  const [selectedKey, setSelectedKey] = useState<TechNodeKey>(() => {
    return (
      ALL_TECH_KEYS.find((key) => states.get(key) === 'unlockable') ??
      planet.tech.unlocked.at(-1) ??
      planet.tech.available[0] ??
      ALL_TECH_KEYS[0]!
    );
  });
  const [unlocking, setUnlocking] = useState<TechNodeKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectedNode = TECH_NODES[selectedKey];
  const selectedState = states.get(selectedKey) ?? 'dna-absent';
  const selectedChildren = CHILDREN_BY_KEY.get(selectedKey) ?? [];
  const relatedKeys = new Set<TechNodeKey>([
    selectedKey,
    ...selectedNode.prerequisites,
    ...selectedChildren,
  ]);
  const unlockedCount = ALL_TECH_KEYS.filter(
    (key) => states.get(key) === 'unlocked',
  ).length;
  const dnaCount = planet.tech.available.length;

  const submitUnlock = async () => {
    if (selectedState !== 'unlockable' || unlocking) return;
    setUnlocking(selectedKey);
    setMessage(null);
    try {
      await onUnlock(selectedKey);
      setMessage(`${displayName(selectedKey)} unlock command accepted.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The unlock command was refused. Review this world\'s requirements.',
      );
    } finally {
      setUnlocking(null);
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tech-tree-title"
      tabIndex={-1}
      className="tech-tree-layer"
    >
      <section className="tech-tree-shell">
        <header className="tech-tree-header">
          <div className="tech-tree-header__identity">
            <span className="tech-tree-header__sigil" aria-hidden="true">
              <CircleDot size={23} />
            </span>
            <div>
              <span className="tech-tree-eyebrow">Research Vault / {planet.name}</span>
              <h2 id="tech-tree-title">Technology Constellation</h2>
              <p>
                A deterministic map of this world’s knowledge, politics and unrealized branches.
              </p>
            </div>
          </div>

          <div className="tech-tree-header__telemetry">
            <span>
              <strong>{unlockedCount}</strong>
              Unlocked
            </span>
            <span>
              <strong>{dnaCount}</strong>
              In DNA
            </span>
            <span>
              <strong>{ALL_TECH_KEYS.length}</strong>
              Global
            </span>
          </div>

          <button
            type="button"
            className="tech-tree-close"
            onClick={onClose}
            aria-label="Close technology constellation"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="tech-tree-workspace">
          <section className="tech-tree-map" aria-label="Technology prerequisite graph">
            <div className="tech-tree-map__toolbar">
              <div>
                <span>World seed topology</span>
                <strong>T0 roots → T5 singularities</strong>
              </div>
              <ul className="tech-tree-legend" aria-label="Technology states">
                {(Object.keys(STATE_COPY) as TechState[]).map((state) => (
                  <li key={state} data-state={state}>
                    <StateGlyph state={state} />
                    {STATE_COPY[state].short}
                  </li>
                ))}
              </ul>
            </div>

            <div className="tech-tree-map__viewport">
              <div
                className="tech-tree-canvas"
                style={{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }}
              >
                {Array.from({ length: TIER_COUNT }, (_, tier) => {
                  const x = POSITION_BY_KEY.get(
                    ALL_TECH_KEYS.find((key) => TECH_NODES[key].tier === tier)!,
                  )?.x;
                  if (x === undefined) return null;
                  return (
                    <div
                      key={tier}
                      className="tech-tree-tier"
                      style={{ left: x + NODE_WIDTH / 2 }}
                      aria-hidden="true"
                    >
                      <span>T{tier}</span>
                      <i />
                    </div>
                  );
                })}

                <svg
                  className="tech-tree-edges"
                  width={GRAPH_WIDTH}
                  height={GRAPH_HEIGHT}
                  viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="tech-edge-energy" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="var(--primary-400)" />
                      <stop offset="1" stopColor="var(--accent-300)" />
                    </linearGradient>
                    <marker
                      id="tech-edge-arrow"
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="5"
                      markerHeight="5"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                    </marker>
                  </defs>
                  {ALL_TECH_KEYS.flatMap((childKey) =>
                    TECH_NODES[childKey].prerequisites.map((parentKey) => {
                      const parent = POSITION_BY_KEY.get(parentKey)!;
                      const child = POSITION_BY_KEY.get(childKey)!;
                      const startX = parent.x + NODE_WIDTH;
                      const startY = parent.y + NODE_HEIGHT / 2;
                      const endX = child.x;
                      const endY = child.y + NODE_HEIGHT / 2;
                      const bend = Math.max(28, (endX - startX) * 0.46);
                      const isRelated =
                        selectedKey === childKey || selectedKey === parentKey;
                      const isEnergized = planet.tech.unlocked.includes(parentKey);
                      return (
                        <path
                          key={`${parentKey}:${childKey}`}
                          d={`M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`}
                          className={`tech-tree-edge${isRelated ? ' is-related' : ''}${
                            isEnergized ? ' is-energized' : ''
                          }`}
                          markerEnd="url(#tech-edge-arrow)"
                        />
                      );
                    }),
                  )}
                </svg>

                {NODE_POSITIONS.map(({ key, x, y }) => {
                  const node = TECH_NODES[key];
                  const state = states.get(key) ?? 'dna-absent';
                  return (
                    <button
                      key={key}
                      type="button"
                      className="tech-tree-node"
                      data-state={state}
                      data-selected={selectedKey === key || undefined}
                      data-related={relatedKeys.has(key) || undefined}
                      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                      onClick={() => {
                        setSelectedKey(key);
                        setMessage(null);
                      }}
                      aria-pressed={selectedKey === key}
                      aria-label={`${displayName(key)}, tier ${node.tier}, ${STATE_COPY[state].short}`}
                    >
                      <span className="tech-tree-node__glyph" aria-hidden="true">
                        <NodeGlyph kind={node.kind} />
                      </span>
                      <span className="tech-tree-node__copy">
                        <strong>{displayName(key)}</strong>
                        <span>
                          T{node.tier} · {STATE_COPY[state].short}
                        </span>
                      </span>
                      <span className="tech-tree-node__state" aria-hidden="true">
                        <StateGlyph state={state} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="tech-dossier" aria-label={`${displayName(selectedKey)} details`}>
            <header className="tech-dossier__header">
              <span className="tech-dossier__glyph" aria-hidden="true">
                <NodeGlyph kind={selectedNode.kind} />
              </span>
              <div>
                <span>
                  Tier {selectedNode.tier} · {selectedNode.kind.replace('_', ' ')}
                </span>
                <h3>{displayName(selectedKey)}</h3>
              </div>
            </header>

            <section className="tech-dossier__status" data-state={selectedState}>
              <StateGlyph state={selectedState} />
              <div>
                <strong>{STATE_COPY[selectedState].title}</strong>
                <p>{STATE_COPY[selectedState].description}</p>
              </div>
            </section>

            <section className="tech-dossier__section">
              <span className="tech-dossier__label">Capability</span>
              <p className="tech-dossier__description">{nodeDescription(selectedKey)}</p>
              <dl className="tech-dossier__facts">
                <div>
                  <dt>Protocol</dt>
                  <dd>{selectedNode.politics ?? 'Common'}</dd>
                </div>
                <div>
                  <dt>World depth</dt>
                  <dd>
                    {selectedNode.kind === 'building'
                      ? `L${planet.tech.maxLevel[selectedKey] ?? 0}`
                      : 'Permanent'}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="tech-dossier__section">
              <span className="tech-dossier__label">Prerequisite Signal</span>
              {selectedNode.prerequisites.length === 0 ? (
                <p className="tech-dossier__empty">Root protocol — no prerequisite nodes.</p>
              ) : (
                <div className="tech-dossier__links">
                  {selectedNode.prerequisites.map((key) => {
                    const satisfied = planet.tech.unlocked.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        data-satisfied={satisfied || undefined}
                        onClick={() => {
                          setSelectedKey(key);
                          setMessage(null);
                        }}
                      >
                        {satisfied ? <Check size={12} aria-hidden /> : <LockKeyhole size={12} aria-hidden />}
                        <span>{displayName(key)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="tech-dossier__section">
              <span className="tech-dossier__label">Unlock Cost</span>
              <div className="tech-dossier__costs">
                {Object.entries(selectedNode.unlockCost).map(([resource, amount]) => {
                  const owned = ownedResource(planet, resource);
                  const required = amount ?? 0;
                  const enough = owned >= required;
                  return (
                    <div key={resource} data-enough={enough || undefined}>
                      <span>{resolvedResource(resource, planet).replace(/_/g, ' ')}</span>
                      <strong>
                        {NUMBER.format(owned)} / {NUMBER.format(required)}
                      </strong>
                      {enough ? <Check size={12} aria-hidden /> : <Coins size={12} aria-hidden />}
                    </div>
                  );
                })}
              </div>
            </section>

            {selectedNode.kind === 'building' && (
              <section className="tech-dossier__section">
                <span className="tech-dossier__label">After Unlock</span>
                <dl className="tech-dossier__facts">
                  <div>
                    <dt>Placement cost</dt>
                    <dd>
                      {Object.entries(BUILDINGS[selectedKey as keyof typeof BUILDINGS].placementCost)
                        .map(([resource, amount]) => `${amount} ${resource.replace(/_/g, ' ')}`)
                        .join(' · ')}
                    </dd>
                  </div>
                  <div>
                    <dt>Surface tile</dt>
                    <dd>
                      {BUILDINGS[selectedKey as keyof typeof BUILDINGS].usesTile
                        ? '1 required'
                        : 'Infrastructure'}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {selectedChildren.length > 0 && (
              <section className="tech-dossier__section">
                <span className="tech-dossier__label">Downstream Protocols</span>
                <div className="tech-dossier__children">
                  {selectedChildren.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(key);
                        setMessage(null);
                      }}
                    >
                      {displayName(key)}
                      <span>T{TECH_NODES[key].tier}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="tech-dossier__commit">
              {message && (
                <p role="status" aria-live="polite">
                  {message}
                </p>
              )}
              <button
                type="button"
                className="tech-dossier__unlock"
                data-ready={selectedState === 'unlockable' || undefined}
                disabled={selectedState !== 'unlockable' || unlocking !== null}
                onClick={() => void submitUnlock()}
              >
                <Sparkles size={15} aria-hidden />
                {actionLabel(selectedState, unlocking === selectedKey)}
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>,
    document.body,
  );
}

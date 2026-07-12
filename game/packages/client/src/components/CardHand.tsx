/**
 * La main de cartes de construction (GB §17, DESIGN_SYSTEM §5) :
 * ancrée en bas, art des cartes + chips de coût + badge de politique,
 * états désactivés AVEC raison (jamais un simple grisé muet).
 * L'UI n'est qu'une aide : chaque commande est re-vérifiée serveur.
 */
import { useMemo } from 'react';
import { Lock, Hammer, FlaskConical } from 'lucide-react';
import {
  BUILDINGS,
  TECH_NODES,
  type BuildingKey,
  type CostBundle,
  type TechNodeKey,
} from '@atg/shared';
import type { PlanetDetail } from '../api.js';
import { t } from '../i18n/en.js';
import { cardArt, spriteUrl } from '../scenes/assets.ts';

export type CardAction =
  | { kind: 'unlock'; node: TechNodeKey }
  | { kind: 'select-place'; building: BuildingKey };

export interface CardState {
  key: BuildingKey;
  status: 'placeable' | 'unlockable' | 'blocked';
  reason?: string;
  cost: CostBundle;
}

function costChips(cost: CostBundle) {
  return Object.entries(cost).map(([res, qty]) => (
    <span
      key={res}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        background: 'var(--bg-overlay)',
        borderRadius: 'var(--radius-chip)',
        padding: '1px 7px',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--accent-200)',
      }}
    >
      {qty}
      <span style={{ color: 'var(--text-secondary)' }}>
        {res === 'crystal_any' ? 'crystal' : res.replace('_', ' ')}
      </span>
    </span>
  ));
}

export function computeCardStates(planet: PlanetDetail): CardState[] {
  const available = new Set(planet.tech.available);
  const unlocked = new Set(planet.tech.unlocked);
  const mask = new Set(planet.tech.maskAllowed);
  const usedTiles = new Set(
    planet.buildings.filter((b) => b.tileIndex !== null).map((b) => b.tileIndex),
  );
  const freeTiles = planet.tiles - usedTiles.size;

  const enough = (cost: CostBundle) =>
    Object.entries(cost).every(([res, qty]) => {
      const key = res === 'crystal_any' ? `crystal_${planet.climate}` : res;
      return (planet.stock[key] ?? 0) >= (qty ?? 0);
    });

  return (Object.keys(BUILDINGS) as BuildingKey[]).map((key) => {
    const def = BUILDINGS[key];
    const node = TECH_NODES[key];
    if (!available.has(key)) {
      return { key, status: 'blocked', reason: t.planet.notInDna, cost: def.unlockCost };
    }
    if (!mask.has(key)) {
      return { key, status: 'blocked', reason: t.planet.maskDenied, cost: def.unlockCost };
    }
    if (!unlocked.has(key)) {
      const missing = node.prerequisites.find((p) => !unlocked.has(p));
      if (missing) {
        return {
          key,
          status: 'blocked',
          reason: `${t.planet.needPrereq} : ${missing}`,
          cost: def.unlockCost,
        };
      }
      if (!enough(def.unlockCost)) {
        return { key, status: 'blocked', reason: t.planet.tooExpensive, cost: def.unlockCost };
      }
      return { key, status: 'unlockable', cost: def.unlockCost };
    }
    // Déverrouillée → plaçable ?
    if (def.usesTile && freeTiles <= 0) {
      return { key, status: 'blocked', reason: t.planet.noFreeTile, cost: def.placementCost };
    }
    const count = planet.buildings.filter((b) => b.key === key).length;
    if (def.maxInstances && count >= def.maxInstances) {
      return {
        key,
        status: 'blocked',
        reason: `max ${def.maxInstances}`,
        cost: def.placementCost,
      };
    }
    if (!enough(def.placementCost)) {
      return { key, status: 'blocked', reason: t.planet.tooExpensive, cost: def.placementCost };
    }
    return { key, status: 'placeable', cost: def.placementCost };
  });
}

export function CardHand({
  planet,
  selectedCard,
  onAction,
}: {
  planet: PlanetDetail;
  selectedCard: BuildingKey | null;
  onAction: (a: CardAction) => void;
}) {
  const cards = useMemo(() => computeCardStates(planet), [planet]);
  // Tri : plaçables, déverrouillables, bloquées — la main reste EXHAUSTIVE
  // (28 cartes, règle de complétude) mais lisible.
  const order = { placeable: 0, unlockable: 1, blocked: 2 } as const;
  const sorted = [...cards].sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      BUILDINGS[a.key].tier - BUILDINGS[b.key].tier,
  );

  return (
    <section
      aria-label={t.planet.cardHand}
      style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        padding: '10px 14px',
        background:
          'linear-gradient(180deg, rgba(6,8,16,0) 0%, rgba(6,8,16,.85) 30%)',
      }}
    >
      {sorted.map((card) => {
        const def = BUILDINGS[card.key];
        const isSelected = selectedCard === card.key;
        const dimmed = card.status === 'blocked';
        return (
          <article
            key={card.key}
            title={card.reason}
            style={{
              minWidth: 128,
              width: 128,
              background: 'var(--bg-raised)',
              borderRadius: 'var(--radius-game-card)',
              border: isSelected
                ? '1px solid var(--accent-400)'
                : '1px solid var(--stroke-subtle)',
              boxShadow: isSelected ? 'var(--glow-accent)' : undefined,
              opacity: dimmed ? 0.55 : 1,
              display: 'grid',
              gap: 6,
              padding: 8,
            }}
          >
            <img
              src={spriteUrl(cardArt(card.key))}
              alt=""
              width={112}
              height={112}
              style={{ borderRadius: 8, imageRendering: 'pixelated' }}
            />
            <strong style={{ fontSize: 11, lineHeight: 1.2 }}>
              {card.key.replace(/_/g, ' ')}
              {def.politics && (
                <span
                  style={{
                    marginLeft: 4,
                    color: 'var(--violet-500)',
                    fontSize: 10,
                  }}
                >
                  [{t.archetypes[def.politics]}]
                </span>
              )}
            </strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {costChips(card.cost)}
            </div>
            {card.status === 'unlockable' && (
              <button
                type="button"
                onClick={() => onAction({ kind: 'unlock', node: card.key })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  justifyContent: 'center',
                  background: 'var(--violet-500)',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <FlaskConical size={11} aria-hidden /> {t.planet.unlockFirst}
              </button>
            )}
            {card.status === 'placeable' && (
              <button
                type="button"
                onClick={() => onAction({ kind: 'select-place', building: card.key })}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  justifyContent: 'center',
                  background: isSelected ? 'var(--accent-400)' : 'var(--primary-400)',
                  color: isSelected ? '#0D0D0D' : 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <Hammer size={11} aria-hidden /> {t.planet.place}
              </button>
            )}
            {card.status === 'blocked' && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  justifyContent: 'center',
                  color: 'var(--text-disabled)',
                  fontSize: 10,
                  textAlign: 'center',
                }}
              >
                <Lock size={10} aria-hidden /> {card.reason ?? t.planet.locked}
              </span>
            )}
          </article>
        );
      })}
    </section>
  );
}

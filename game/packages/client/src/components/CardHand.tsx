/**
 * La main de cartes de construction (GB §17, DESIGN_SYSTEM §5) :
 * ancrée en bas, art des cartes + chips de coût + badge de politique,
 * états désactivés AVEC raison (jamais un simple grisé muet).
 * L'UI n'est qu'une aide : chaque commande est re-vérifiée serveur.
 */
import { useMemo } from 'react';
import { Hammer, FlaskConical, TriangleAlert } from 'lucide-react';
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
import '../styles/planet-panels.css';

export type CardAction =
  | { kind: 'unlock'; node: TechNodeKey }
  | { kind: 'select-place'; building: BuildingKey };

export interface CardState {
  key: BuildingKey;
  status: 'placeable' | 'unlockable' | 'blocked';
  /**
   * Le nœud tech est-il déjà déverrouillé ? Distingue un blocage
   * PRÉ-unlock (hors-ADN, masque, prérequis, unlock trop cher → vit dans
   * l'arbre tech) d'un blocage POST-unlock (pas de tuile, max, placement
   * trop cher → la carte DOIT rester dans la main, désactivée avec sa
   * raison, sinon un bâtiment déverrouillé devient introuvable — bug probe).
   */
  unlocked: boolean;
  reason?: string;
  cost: CostBundle;
}

function costChips(cost: CostBundle) {
  return Object.entries(cost).map(([res, qty]) => (
    <span key={res} className="ls-cost-chip">
      {qty}
      <span>
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
      return (planet.stock[key]?.amount ?? 0) >= (qty ?? 0);
    });

  return (Object.keys(BUILDINGS) as BuildingKey[]).map((key) => {
    const def = BUILDINGS[key];
    const node = TECH_NODES[key];
    if (!available.has(key)) {
      return { key, status: 'blocked', unlocked: false, reason: t.planet.notInDna, cost: def.unlockCost };
    }
    if (!mask.has(key)) {
      return { key, status: 'blocked', unlocked: false, reason: t.planet.maskDenied, cost: def.unlockCost };
    }
    if (!unlocked.has(key)) {
      const missing = node.prerequisites.find((p) => !unlocked.has(p));
      if (missing) {
        return {
          key,
          status: 'blocked',
          unlocked: false,
          reason: `${t.planet.needPrereq} : ${missing}`,
          cost: def.unlockCost,
        };
      }
      if (!enough(def.unlockCost)) {
        return { key, status: 'blocked', unlocked: false, reason: t.planet.tooExpensive, cost: def.unlockCost };
      }
      return { key, status: 'unlockable', unlocked: false, cost: def.unlockCost };
    }
    // Déverrouillée → plaçable ? Les blocages ci-dessous sont POST-unlock :
    // la carte reste dans la main (unlocked: true), désactivée avec sa raison.
    const count = planet.buildings.filter((b) => b.key === key).length;
    if (def.maxInstances && count >= def.maxInstances) {
      return {
        key,
        status: 'blocked',
        unlocked: true,
        reason: `max ${def.maxInstances}`,
        cost: def.placementCost,
      };
    }
    if (def.usesTile && freeTiles <= 0) {
      return { key, status: 'blocked', unlocked: true, reason: t.planet.noFreeTile, cost: def.placementCost };
    }
    if (!enough(def.placementCost)) {
      return { key, status: 'blocked', unlocked: true, reason: t.planet.tooExpensive, cost: def.placementCost };
    }
    return { key, status: 'placeable', unlocked: true, cost: def.placementCost };
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
  // AO (directive responsable 2026-07-19) : la main est FILTRÉE — le
  // catalogue PRÉ-unlock (hors-ADN, masque, prérequis, unlock trop cher)
  // vit dans l'arbre « Technology DNA ». Mais toute carte DÉVERROUILLÉE
  // reste dans la main, même momentanément bloquée (pas de tuile, max,
  // placement trop cher) : sinon un bâtiment déverrouillé devient
  // introuvable et impossible à construire (bug probe, 2026-07-20).
  // Tri : posables, puis déverrouillables, puis déverrouillées-bloquées.
  const order = { placeable: 0, unlockable: 1, blocked: 2 } as const;
  const hand = useMemo(
    () =>
      cards
        .filter(
          (c) =>
            c.status === 'placeable' ||
            c.status === 'unlockable' ||
            (c.status === 'blocked' && c.unlocked),
        )
        .sort(
          (a, b) =>
            order[a.status] - order[b.status] ||
            BUILDINGS[a.key].tier - BUILDINGS[b.key].tier,
        ),
    [cards],
  );

  return (
    <section aria-label={t.planet.cardHand} className="ls-card-dock" data-fan="true">
      {hand.length === 0 && (
        <p className="ls-card-dock-empty">{t.planet.cardHandEmpty}</p>
      )}
      {hand.map((card, i) => {
        const def = BUILDINGS[card.key];
        const isSelected = selectedCard === card.key;
        return (
          <article
            key={card.key}
            title={card.reason ? `${card.reason} — ${def.effects}` : def.effects}
            tabIndex={0}
            className="ls-construction-card"
            style={{ '--card-i': i } as React.CSSProperties}
            data-selected={isSelected ? 'true' : 'false'}
            data-blocked={card.status === 'blocked' ? 'true' : undefined}
          >
            <span className="ls-card-spine" aria-hidden="true">
              <span>{card.key.replace(/_/g, ' ')}</span>
            </span>
            <div className="ls-card-body">
              <strong className="ls-card-title">
                {card.key.replace(/_/g, ' ')}
                {def.politics && (
                  <span className="ls-card-politics">
                    {t.archetypes[def.politics]} protocol
                  </span>
                )}
              </strong>
              <div className="ls-card-costs">{costChips(card.cost)}</div>
            </div>

            <div className="ls-card-viewport" aria-hidden="true">
              <img
                className="ls-card-art"
                src={spriteUrl(cardArt(card.key))}
                alt=""
                width={512}
                height={512}
              />
              <span className="ls-card-tier">
                T{def.tier} · {card.status}
              </span>
            </div>

            <div className="ls-card-action-zone">
              {card.status === 'unlockable' && (
                <button
                  type="button"
                  className="ls-button ls-button--violet ls-button--block"
                  onClick={() => onAction({ kind: 'unlock', node: card.key })}
                >
                  <FlaskConical size={12} aria-hidden /> {t.planet.unlockFirst}
                </button>
              )}
              {card.status === 'placeable' && (
                <button
                  type="button"
                  className={`ls-button ls-button--block ${
                    isSelected ? 'ls-button--accent' : ''
                  }`}
                  onClick={() =>
                    onAction({ kind: 'select-place', building: card.key })
                  }
                  aria-pressed={isSelected}
                >
                  <Hammer size={12} aria-hidden /> {t.planet.place}
                </button>
              )}
              {card.status === 'blocked' && card.unlocked && (
                // Déverrouillée mais temporairement impossible à poser (pas
                // de tuile, max atteint, placement trop cher) : la carte RESTE
                // dans la main, avec sa raison VISIBLE (jamais un grisé muet).
                // Dès que la contrainte se lève, le bouton « Place » revient.
                <p className="ls-card-blocked">
                  <TriangleAlert size={12} aria-hidden />
                  <span>{card.reason}</span>
                </p>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}

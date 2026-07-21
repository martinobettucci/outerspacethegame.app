/**
 * Régression « probe invisible » (2026-07-20) : une carte DÉVERROUILLÉE mais
 * momentanément impossible à poser (placement trop cher, pas de tuile, max
 * atteint) doit rester dans la main, désactivée — jamais filtrée. Avant le
 * correctif, tout blocage collapsait en `status: 'blocked'` et le filtre de la
 * main jetait ces cartes, rendant `probe_pad` introuvable après unlock.
 *
 * Test de module pur (pas de DOM) : le client n'a que vitest.
 */
import { describe, expect, it } from 'vitest';
import { BUILDINGS, type BuildingKey } from '@atg/shared';
import type { PlanetDetail } from '../api.js';
import { computeCardStates } from './CardHand.tsx';

/** Planète minimale : on ne renseigne que ce que lit computeCardStates. */
function planet(over: {
  available: BuildingKey[];
  unlocked: BuildingKey[];
  maskAllowed: BuildingKey[];
  stock?: Record<string, number>;
  tiles?: number;
  buildings?: { key: BuildingKey; tileIndex: number | null }[];
}): PlanetDetail {
  const stock: PlanetDetail['stock'] = {};
  for (const [k, amount] of Object.entries(over.stock ?? {})) {
    stock[k] = { amount, ratePerDay: 0 };
  }
  return {
    climate: 'temperate',
    tiles: over.tiles ?? 12,
    stock,
    buildings: (over.buildings ?? []).map((b) => ({
      key: b.key,
      tileIndex: b.tileIndex,
    })),
    tech: {
      available: over.available,
      unlocked: over.unlocked,
      maskAllowed: over.maskAllowed,
      maxLevel: {},
      governingArchetypes: [],
    },
  } as unknown as PlanetDetail;
}

/** Le filtre de la main, tel qu'appliqué par le composant CardHand. */
const inHand = (c: { status: string; unlocked: boolean }) =>
  c.status === 'placeable' ||
  c.status === 'unlockable' ||
  (c.status === 'blocked' && c.unlocked);

describe('computeCardStates — probe déverrouillée mais bloquée', () => {
  const KEY: BuildingKey = 'probe_pad';
  const meta = { available: [KEY], unlocked: [KEY], maskAllowed: [KEY] };

  it('placement finançable → placeable et dans la main', () => {
    const p = planet({ ...meta, stock: { ore: 999, carbon: 999 } });
    const card = computeCardStates(p).find((c) => c.key === KEY)!;
    expect(card.status).toBe('placeable');
    expect(card.unlocked).toBe(true);
    expect(inHand(card)).toBe(true);
  });

  it('déverrouillée mais trop chère → blocked+unlocked, RESTE dans la main', () => {
    const p = planet({ ...meta, stock: { ore: 0, carbon: 0 } });
    const card = computeCardStates(p).find((c) => c.key === KEY)!;
    expect(card.status).toBe('blocked');
    expect(card.unlocked).toBe(true);
    // Le cœur de la régression : la carte n'est PAS jetée par la main.
    expect(inHand(card)).toBe(true);
    expect(card.reason).toBeDefined();
  });

  it('non déverrouillée → blocked+unlocked=false, filtrée hors de la main', () => {
    const p = planet({
      available: [KEY],
      unlocked: [],
      maskAllowed: [KEY],
      stock: { ore: 0, carbon: 0 },
    });
    const card = computeCardStates(p).find((c) => c.key === KEY)!;
    expect(card.status).toBe('blocked');
    expect(card.unlocked).toBe(false);
    // Pré-unlock trop cher : appartient à l'arbre tech, pas à la main.
    expect(inHand(card)).toBe(false);
  });
});

describe('computeCardStates — blocages POST-unlock à tuile', () => {
  it('bâtiment à tuile déverrouillé sans tuile libre → reste dans la main', () => {
    const KEY: BuildingKey = 'mine';
    expect(BUILDINGS[KEY].usesTile).toBe(true);
    const p = planet({
      available: [KEY],
      unlocked: [KEY],
      maskAllowed: [KEY],
      stock: { ore: 999, silicon: 999, carbon: 999 },
      tiles: 1,
      buildings: [{ key: KEY, tileIndex: 0 }], // seule tuile occupée
    });
    const card = computeCardStates(p).find((c) => c.key === KEY)!;
    expect(card.status).toBe('blocked');
    expect(card.unlocked).toBe(true);
    expect(inHand(card)).toBe(true);
  });

  it('télescope unique sur tuile : sans tuile libre puis au plafond, il reste visible', () => {
    const KEY: BuildingKey = 'telescope';
    expect(BUILDINGS[KEY].usesTile).toBe(true);
    expect(BUILDINGS[KEY].maxInstances).toBe(1);
    const common = {
      available: [KEY],
      unlocked: [KEY],
      maskAllowed: [KEY],
      stock: { ore: 999, silicon: 999 },
      tiles: 1,
    };

    const noTile = computeCardStates(
      planet({
        ...common,
        buildings: [{ key: 'mine', tileIndex: 0 }],
      }),
    ).find((card) => card.key === KEY)!;
    expect(noTile).toMatchObject({
      status: 'blocked',
      unlocked: true,
    });
    expect(noTile.reason).toMatch(/tile/i);
    expect(inHand(noTile)).toBe(true);

    const maxed = computeCardStates(
      planet({
        ...common,
        buildings: [{ key: KEY, tileIndex: 0 }],
      }),
    ).find((card) => card.key === KEY)!;
    expect(maxed).toMatchObject({
      status: 'blocked',
      unlocked: true,
      reason: 'max 1',
    });
    expect(inHand(maxed)).toBe(true);
  });
});

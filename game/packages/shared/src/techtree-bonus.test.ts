/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Tech tree runtime”; GAME_BOOK.md §18; DESIGN_GUIDE.md §5. */
/**
 * ADN enrichi des mondes bonus (DG §2.2b, directive responsable 2026-07-20).
 *
 * Invariants prouvés ici :
 * 1. STABILITÉ OCTET : richness = 0 (défaut) produit un résultat strictement
 *    identique à l'appel historique — aucun monde standard ne change.
 * 2. SUPERSET par seed : à richness > 0, l'ensemble disponible CONTIENT
 *    l'ensemble standard du même seed, et chaque plafond est ≥ au standard
 *    (les seuils montent, les tirages sont identiques, l'élagage préserve
 *    l'inclusion).
 * 3. Monotonie statistique : la taille moyenne de l'ADN croît avec ρ.
 * 4. Bornes : plafonds ∈ {1,2,3} ; nœuds jamais-masqués toujours à 3.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_TECH_KEYS,
  planetTechAvailability,
  TECH_NODES,
} from './techtree.js';

const SEEDS = Array.from({ length: 200 }, (_, i) => `bonus-dna-seed-${i}`);

describe('planetTechAvailability — richesse (DG §2.2b)', () => {
  it('richness 0 = chemin historique, octet pour octet', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const legacy = planetTechAvailability(seed);
      const explicit = planetTechAvailability(seed, 0);
      expect([...explicit.available].sort()).toEqual(
        [...legacy.available].sort(),
      );
      expect([...explicit.maxLevel.entries()].sort()).toEqual(
        [...legacy.maxLevel.entries()].sort(),
      );
    }
  });

  it('superset garanti par seed : disponible ⊇ standard, plafonds ≥', () => {
    for (const seed of SEEDS) {
      const std = planetTechAvailability(seed);
      for (const rho of [0.25, 0.6, 1]) {
        const rich = planetTechAvailability(seed, rho);
        for (const key of std.available) {
          expect(rich.available.has(key)).toBe(true);
          expect(rich.maxLevel.get(key)!).toBeGreaterThanOrEqual(
            std.maxLevel.get(key)!,
          );
        }
      }
    }
  });

  it('monotonie statistique : plus riche ⇒ ADN moyen plus large et plus profond', () => {
    const meanSize = (rho: number) =>
      SEEDS.reduce(
        (acc, seed) => acc + planetTechAvailability(seed, rho).available.size,
        0,
      ) / SEEDS.length;
    const meanCap = (rho: number) =>
      SEEDS.reduce((acc, seed) => {
        const a = planetTechAvailability(seed, rho);
        return (
          acc +
          [...a.maxLevel.values()].reduce((s, v) => s + v, 0) /
            Math.max(1, a.maxLevel.size)
        );
      }, 0) / SEEDS.length;
    expect(meanSize(0.25)).toBeGreaterThan(meanSize(0));
    expect(meanSize(1)).toBeGreaterThan(meanSize(0.25));
    expect(meanCap(1)).toBeGreaterThan(meanCap(0));
  });

  it('bornes : plafonds ∈ [1,3], jamais-masqués toujours 3, ADN ⊆ catalogue', () => {
    for (const seed of SEEDS.slice(0, 50)) {
      const rich = planetTechAvailability(seed, 1);
      for (const [key, cap] of rich.maxLevel) {
        expect(cap).toBeGreaterThanOrEqual(1);
        expect(cap).toBeLessThanOrEqual(3);
        expect(ALL_TECH_KEYS.includes(key)).toBe(true);
        // Réforme 2026-07-24 : le spaceport est jamais-masqué mais DEPTH-CAPPÉ
        // (L1 garanti, L2/L3 = chance de seed, GB §19.3) ; les autres
        // jamais-masqués gardent L3 garanti.
        if (TECH_NODES[key].neverMasked && key !== 'spaceport') expect(cap).toBe(3);
      }
    }
  });
});

/** @verifies This test file verifies: docs/BACKLOG.md §P1 "Auth + account lifecycle" (role explanation on the Awaken screen); docs/GAME_BOOK.md §11; docs/DESIGN_GUIDE.md §4.1. */
/**
 * Règle d'exhaustivité (CLAUDE.md — livrables jamais « à moitié ») : l'écran
 * d'éveil affiche une explication par politique. Chacune des six politiques
 * canoniques DOIT donc posséder une devise (`motto`) et un corps (`body`) non
 * vides, sans quoi le panneau de détail rendrait « undefined » à la sélection
 * ou au survol. Test de module pur (le client n'a que vitest, pas de DOM).
 */
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '@atg/shared';
import { t } from '../i18n/en.js';

describe('Awaken screen — role explanations', () => {
  it('couvre exhaustivement les six politiques', () => {
    expect(Object.keys(t.archetypeDescriptions).sort()).toEqual([...ARCHETYPES].sort());
  });

  for (const a of ARCHETYPES) {
    it(`fournit une devise et un corps non vides pour « ${a} »`, () => {
      const detail = t.archetypeDescriptions[a];
      expect(detail).toBeDefined();
      expect(detail.motto.trim().length).toBeGreaterThan(0);
      expect(detail.body.trim().length).toBeGreaterThan(0);
      // Corps assez substantiel pour être une vraie explication, pas un label.
      expect(detail.body.trim().length).toBeGreaterThan(40);
    });

    it(`fournit un libellé lisible pour « ${a} »`, () => {
      expect(t.archetypes[a]?.trim().length ?? 0).toBeGreaterThan(0);
    });
  }
});

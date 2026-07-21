/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Seed contract” and §P2 “Starter spawn”; GAME_BOOK.md §19/§22; DESIGN_GUIDE.md §2.2. */
/**
 * Invariant anti-softlock du démarrage (GB §19 « starter knowledge »,
 * décision responsable 2026-07-19) : la dotation de départ doit couvrir
 * l'OUVERTURE COMPLÈTE avec marge — pose des quatre savoirs de départ
 * (telescope, probe_pad, depot, mine) PLUS unlock + pose de la chaîne de
 * survie (farm, waterworks) — même au roll de dotation minimal (×1.0).
 * Si un [TUNE] futur casse cette marge, ce test casse AVANT le joueur.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_STORAGE_ALLOWANCE_T,
  BUILDINGS,
  STARTER_PRE_UNLOCKED,
  STORAGE_BRAKE_START,
  type BuildingKey,
  type CostBundle,
} from '@atg/shared';
import { STARTER_FUEL_U, STARTER_STOCK } from '../../src/gen/spawn.js';

const MARGIN = 1.5; // marge exigée sur chaque ressource [TUNE-v1]

function addInto(total: Record<string, number>, cost: CostBundle) {
  for (const [res, qty] of Object.entries(cost)) {
    total[res] = (total[res] ?? 0) + (qty ?? 0);
  }
}

describe('dotation starter vs coût de l’ouverture (anti-softlock)', () => {
  it('stock ≥ 1,5 × (pose des savoirs de départ + unlock+pose farm/waterworks)', () => {
    const needs: Record<string, number> = {};
    for (const key of STARTER_PRE_UNLOCKED) {
      // Savoir offert : seule la POSE se paie.
      const def = BUILDINGS[key as BuildingKey];
      if (def) addInto(needs, def.placementCost);
    }
    for (const key of ['farm', 'waterworks'] as BuildingKey[]) {
      addInto(needs, BUILDINGS[key].unlockCost);
      addInto(needs, BUILDINGS[key].placementCost);
    }
    for (const [res, qty] of Object.entries(needs)) {
      const granted = (STARTER_STOCK as Record<string, number>)[res] ?? 0;
      expect(granted, `${res} : dotation ${granted} < ${MARGIN} × besoin ${qty}`)
        .toBeGreaterThanOrEqual(MARGIN * qty);
    }
  });

  it('plafond : roll max (×1.3) + fuel NETTEMENT sous le frein 0.7 × cap S (jamais pré-freiné)', () => {
    const sum = Object.values(STARTER_STOCK).reduce((s, v) => s + (v ?? 0), 0);
    const worstCase = sum * 1.3 + STARTER_FUEL_U;
    const brakeAt = STORAGE_BRAKE_START * BASE_STORAGE_ALLOWANCE_T.s;
    // Marge ≥ 40 T ≈ 4 jours de mine L1 avant d'effleurer le frein.
    expect(worstCase).toBeLessThanOrEqual(brakeAt - 40);
  });
});

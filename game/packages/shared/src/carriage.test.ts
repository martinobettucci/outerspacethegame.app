/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Docks” (chunk J: atterrissage & fret); GAME_BOOK.md §9/§13; DESIGN_GUIDE.md §7. */
/**
 * Unitaires fret & atterrissage (chunk J) — DG §7 (conteneurs) et GB §9
 * (droit d'atterrir, v1 self|everyone).
 */
import { describe, expect, it } from 'vitest';
import {
  buildableSizes,
  canLand,
  containersUsed,
  HULLS,
  shipBuildCost,
  SHIP_BUILD_HOURS,
} from './ships.js';

describe('containersUsed (DG §7)', () => {
  it('1 conteneur = 1 T d\'un fongible', () => {
    expect(containersUsed({ ore: 3 })).toBe(3);
    expect(containersUsed({})).toBe(0);
  });

  it('les tonnes partielles monopolisent leur conteneur', () => {
    expect(containersUsed({ ore: 0.1 })).toBe(1);
    expect(containersUsed({ ore: 2.5 })).toBe(3);
  });

  it('chaque fongible occupe ses propres conteneurs (pas de mélange)', () => {
    expect(containersUsed({ ore: 1.2, water: 0.3 })).toBe(2 + 1);
  });

  it('quantités nulles ou négatives : aucun conteneur', () => {
    expect(containersUsed({ ore: 0 })).toBe(0);
    expect(containersUsed({ ore: -2 })).toBe(0);
  });

  it('cohérence avec les coques : un Cargo S (3 conteneurs) sature à 3 T', () => {
    expect(containersUsed({ ore: 3 })).toBeLessThanOrEqual(HULLS.cargo_s.containers);
    expect(containersUsed({ ore: 3.1 })).toBeGreaterThan(HULLS.cargo_s.containers);
  });
});

describe('canLand (GB §9, v1)', () => {
  it('ses propres mondes accueillent toujours [TUNE-v1 interp]', () => {
    expect(canLand({ owned: true, hasActiveSpaceport: false, policy: 'self' })).toBe(true);
  });

  it('monde étranger : spaceport actif ET politique everyone exigés', () => {
    expect(canLand({ owned: false, hasActiveSpaceport: false, policy: 'everyone' })).toBe(false);
    expect(canLand({ owned: false, hasActiveSpaceport: true, policy: 'self' })).toBe(false);
    expect(canLand({ owned: false, hasActiveSpaceport: true, policy: 'everyone' })).toBe(true);
  });
});

describe('chantier naval (DG §381)', () => {
  it('gate par niveau : L1/L2 = S+M ; L3 = S+M+L', () => {
    expect(buildableSizes(1)).toEqual(['s', 'm']);
    expect(buildableSizes(2)).toEqual(['s', 'm']);
    expect(buildableSizes(3)).toEqual(['s', 'm', 'l']);
  });

  it('remise de masse : M à −25 % sur chantier L2+, jamais S ni L', () => {
    expect(shipBuildCost(HULLS.cargo_m, 1)).toEqual(HULLS.cargo_m.buildCost);
    expect(shipBuildCost(HULLS.cargo_m, 2)).toEqual({ steel_l: 90, fuel_cells: 22.5 });
    expect(shipBuildCost(HULLS.cargo_s, 3)).toEqual(HULLS.cargo_s.buildCost);
    expect(shipBuildCost(HULLS.cargo_l, 3)).toEqual(HULLS.cargo_l.buildCost);
  });

  it('temps de chantier [TUNE-GAP] : couvre les trois tailles', () => {
    expect(Object.keys(SHIP_BUILD_HOURS).sort()).toEqual(['l', 'm', 's']);
    expect(SHIP_BUILD_HOURS.s).toBeLessThan(SHIP_BUILD_HOURS.m);
    expect(SHIP_BUILD_HOURS.m).toBeLessThan(SHIP_BUILD_HOURS.l);
  });
});

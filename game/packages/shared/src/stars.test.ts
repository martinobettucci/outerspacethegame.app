/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Universe gen” and §P3 “Star harvest”; GAME_BOOK.md §22; DESIGN_GUIDE.md §2.1/§8.8. */
/** Récolte stellaire (GB §22, DG §8.8) — gradient, flare, bornes. */
import { describe, expect, it } from 'vitest';
import {
  HARVEST_D_MAX_PC,
  HARVEST_D_SAFE_PC,
  HARVEST_R_MAX_U_PER_DAY,
  harvestHullDamagePerDay,
  harvestYieldPerDay,
  starIsFlaring,
} from './stars.js';

describe('harvestYieldPerDay — R_max × (1 − d/d_max)²', () => {
  it('au contact : R_max plein ; à d_max et au-delà : nul', () => {
    expect(harvestYieldPerDay(0)).toBe(HARVEST_R_MAX_U_PER_DAY);
    expect(harvestYieldPerDay(HARVEST_D_MAX_PC)).toBe(0);
    expect(harvestYieldPerDay(HARVEST_D_MAX_PC + 3)).toBe(0);
  });

  it('gradient quadratique : à mi-portée, R_max/4 ; monotone décroissant', () => {
    expect(harvestYieldPerDay(HARVEST_D_MAX_PC / 2)).toBeCloseTo(
      HARVEST_R_MAX_U_PER_DAY / 4,
      9,
    );
    expect(harvestYieldPerDay(2)).toBeGreaterThan(harvestYieldPerDay(5));
    expect(harvestYieldPerDay(-1)).toBe(HARVEST_R_MAX_U_PER_DAY); // clamp
  });
});

describe('harvestHullDamagePerDay — le prix de la proximité (préview)', () => {
  it('nul dès d_safe ; maximal au contact ; quadratique entre les deux', () => {
    expect(harvestHullDamagePerDay(HARVEST_D_SAFE_PC)).toBe(0);
    expect(harvestHullDamagePerDay(7)).toBe(0);
    expect(harvestHullDamagePerDay(0)).toBe(80);
    expect(harvestHullDamagePerDay(HARVEST_D_SAFE_PC / 2)).toBeCloseTo(20, 9);
  });
});

describe('starIsFlaring — la seule jauge de l\'univers (canon ≤ 5 %)', () => {
  it('flare à 5 % du stock INITIAL, pas avant ; jamais sur stock initial nul', () => {
    expect(starIsFlaring(0.051e6, 1e6)).toBe(false);
    expect(starIsFlaring(0.05e6, 1e6)).toBe(true);
    expect(starIsFlaring(0, 1e6)).toBe(true);
    expect(starIsFlaring(0, 0)).toBe(false);
  });
});

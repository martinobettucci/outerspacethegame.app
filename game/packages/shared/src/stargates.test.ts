/** Stargates (GB §6, DG §9.3) — scatter seedé, constantes. */
import { describe, expect, it } from 'vitest';
import {
  STARGATE_BUILD_HOURS,
  STARGATE_COST,
  STARGATE_EXIT_SCATTER_MAX_PC,
  stargateExitOffset,
} from './stargates.js';

describe('stargateExitOffset — U(0–15) pc, seedé (shipId, tick)', () => {
  it('déterministe : mêmes entrées, même sortie ; entrées ≠, sorties ≠', () => {
    const a = stargateExitOffset('ship-1', 42);
    expect(stargateExitOffset('ship-1', 42)).toEqual(a);
    expect(stargateExitOffset('ship-1', 43)).not.toEqual(a);
    expect(stargateExitOffset('ship-2', 42)).not.toEqual(a);
  });

  it('borné : ‖offset‖ ≤ 15 pc sur un échantillon large', () => {
    for (let i = 0; i < 200; i++) {
      const { dx, dy } = stargateExitOffset(`s-${i}`, i * 7);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(
        STARGATE_EXIT_SCATTER_MAX_PC + 1e-9,
      );
    }
  });
});

describe('constantes canon [TUNE]', () => {
  it('coût 250 cells + 400 steelH + 100 crystals ; chantier 48 h [TUNE-v1]', () => {
    expect(STARGATE_COST).toEqual({
      fuel_cells: 250,
      steel_h: 400,
      crystal_any: 100,
    });
    expect(STARGATE_BUILD_HOURS).toBe(48);
  });
});

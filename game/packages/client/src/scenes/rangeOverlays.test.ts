/**
 * Superpositions cosmétiques de la carte (décisions responsable
 * 2026-07-20) — maths pures.
 */
import { describe, expect, it } from 'vitest';
import {
  HALO_BASE_SKY_PC,
  shipRangeRadiiPc,
  telescopeHaloRadiusPc,
} from './rangeOverlays.ts';

describe('halo télescope (cosmétique)', () => {
  it('rayon = ciel du monde : 60 + 200 × niveau (borné 1–3)', () => {
    expect(telescopeHaloRadiusPc(1)).toBe(HALO_BASE_SKY_PC + 200);
    expect(telescopeHaloRadiusPc(2)).toBe(HALO_BASE_SKY_PC + 400);
    expect(telescopeHaloRadiusPc(3)).toBe(HALO_BASE_SKY_PC + 600);
    expect(telescopeHaloRadiusPc(7)).toBe(HALO_BASE_SKY_PC + 600); // borné
  });
});

describe("cercles d'autonomie (95 % / 45 %)", () => {
  it('rouge = 0,95 × autonomie, vert = 0,45 × (aller-retour toléré)', () => {
    // Cargo S : burn 0,25 u/pc — 100 u ⇒ autonomie 400 pc.
    const r = shipRangeRadiiPc(100, 0.25)!;
    expect(r.oneWay).toBeCloseTo(380, 9);
    expect(r.roundTrip).toBeCloseTo(180, 9);
    // Le vert reste STRICTEMENT sous la moitié du rouge (marge du retour).
    expect(r.roundTrip).toBeLessThan(r.oneWay / 2);
  });

  it('sans fuel ou sans conso (personal/probe) : pas de cercle', () => {
    expect(shipRangeRadiiPc(0, 0.25)).toBeNull();
    expect(shipRangeRadiiPc(100, 0)).toBeNull();
  });
});

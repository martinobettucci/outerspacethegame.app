import { describe, expect, it } from 'vitest';
import {
  EFFICIENCY_FLOOR,
  EFFICIENCY_MU,
  efficiency,
  habitability,
  illnessDelta,
  popCap,
  populationDelta,
  storageBrake,
} from './formulas.js';

describe('E(u) — la cloche inclinée (DG §3.4)', () => {
  it('vaut 1 exactement au point idéal μ = 0.7', () => {
    expect(efficiency(EFFICIENCY_MU)).toBe(1);
  });

  it('est asymétrique : la surcharge punit plus que la sous-utilisation', () => {
    const under = efficiency(EFFICIENCY_MU - 0.2);
    const over = efficiency(EFFICIENCY_MU + 0.2);
    expect(over).toBeLessThan(under);
  });

  it('ne descend jamais sous le plancher 0.12', () => {
    for (const u of [0, 0.1, 1, 1.5, 3, 100]) {
      expect(efficiency(u)).toBeGreaterThanOrEqual(EFFICIENCY_FLOOR);
    }
  });

  it('gère les entrées invalides sans NaN', () => {
    expect(efficiency(-1)).toBe(EFFICIENCY_FLOOR);
    expect(efficiency(Number.NaN)).toBe(EFFICIENCY_FLOOR);
  });
});

describe('Frein de stockage unilatéral (DG §3.3b)', () => {
  it('ne punit JAMAIS le stock bas : 1 pour u ≤ 0.7', () => {
    for (const u of [0, 0.2, 0.5, 0.7]) expect(storageBrake(u)).toBe(1);
  });

  it('suit la branche droite de E(u) entre 0.7 et 1', () => {
    expect(storageBrake(0.85)).toBeLessThan(1);
    expect(storageBrake(0.85)).toBe(efficiency(0.85));
  });

  it('stoppe net à u ≥ 1 (halt au cap)', () => {
    expect(storageBrake(1)).toBe(0);
    expect(storageBrake(1.2)).toBe(0);
  });
});

describe('Population (DG §3.2)', () => {
  it('popCap : petite F = 2 000 ; grande A = 240 000', () => {
    expect(popCap('s', 'F')).toBe(2_000);
    expect(popCap('l', 'A')).toBe(240_000);
  });

  it('la cloche historique vaut ≈ 0,95 à u = 0,6', () => {
    const u = 0.6;
    expect(efficiency(u)).toBeGreaterThan(0.93);
    expect(efficiency(u)).toBeLessThan(0.97);
  });

  it('habitabilité : nourriture/eau en porte dure, médecine en boost', () => {
    expect(habitability(0, 1, 1)).toBe(0);
    expect(habitability(1, 0, 1)).toBe(0);
    expect(habitability(1, 1, 0)).toBeCloseTo(0.8);
    expect(habitability(1, 1, 1)).toBe(1);
  });

  it('croissance logistique : nulle au cap, négative avec maladie', () => {
    expect(populationDelta(10_000, 10_000, 1, 0)).toBe(0);
    expect(populationDelta(10_000, 10_000, 1, 0.5)).toBeLessThan(0);
  });

  it("maladie : croît au-delà de 90 % d'occupation, décroît sinon", () => {
    expect(illnessDelta(0.95, 0, false)).toBeGreaterThan(0);
    expect(illnessDelta(0.5, 0.4, false)).toBeLessThan(0);
    // medSat < 1 double la croissance.
    expect(illnessDelta(0.95, 0, true)).toBeCloseTo(
      2 * illnessDelta(0.95, 0, false),
    );
  });
});

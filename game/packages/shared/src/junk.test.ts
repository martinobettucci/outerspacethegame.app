/** Champs de junk (GB §22, DG §10.4) — cellule, décroissance, hasard. */
import { describe, expect, it } from 'vitest';
import {
  CLAIM_HOURS,
  CLAIM_RADIUS_PC,
  CLAIM_RIG_COST,
  evalJunkAmount,
  JUNK_DUMPS_PER_DAY,
  JUNK_NO_DUMP_STARTER_PC,
  junkCellOf,
  junkHazardHpPerDay,
} from './junk.js';

describe('junkCellOf — grille fixe de 0,5 pc', () => {
  it('mappe les coordonnées à leur cellule (négatifs compris)', () => {
    expect(junkCellOf(0)).toBe(0);
    expect(junkCellOf(0.49)).toBe(0);
    expect(junkCellOf(0.5)).toBe(1);
    expect(junkCellOf(1234.74)).toBe(2469);
    expect(junkCellOf(-0.2)).toBe(-1);
  });
});

describe('evalJunkAmount — décroissance exponentielle 10 %/jour', () => {
  it('0,9^jours : 30 T → 27 T à J+1, 30×0,9¹⁰ ≈ 10,46 à J+10 ; jamais négatif', () => {
    const day = 86_400_000;
    expect(evalJunkAmount(30, 0, 0)).toBe(30);
    expect(evalJunkAmount(30, 0, day)).toBeCloseTo(27, 9);
    expect(evalJunkAmount(30, 0, 10 * day)).toBeCloseTo(30 * 0.9 ** 10, 9);
    expect(evalJunkAmount(0, 0, day)).toBe(0);
    expect(evalJunkAmount(30, day, 0)).toBe(30); // pas d'anti-décroissance
  });
});

describe('junkHazardHpPerDay — 15 HP par 30 T (0,5 HP/T/jour)', () => {
  it('30 T = 15 HP/j ; 60 T = 30 HP/j ; nul à 0', () => {
    expect(junkHazardHpPerDay(30)).toBeCloseTo(15, 9);
    expect(junkHazardHpPerDay(60)).toBeCloseTo(30, 9);
    expect(junkHazardHpPerDay(0)).toBe(0);
  });
});

describe('constantes canon [TUNE]', () => {
  it('5 dumps/jour, zone interdite 50 pc starters', () => {
    expect(JUNK_DUMPS_PER_DAY).toBe(5);
    expect(JUNK_NO_DUMP_STARTER_PC).toBe(50);
  });
});

describe('claim rig (GB §6, DG §8.8) — constantes [TUNE]', () => {
  it('25 steelL + 5 gold, 2 h, proximité 1 pc [TUNE-v1]', () => {
    expect(CLAIM_RIG_COST).toEqual({ steel_l: 25, gold: 5 });
    expect(CLAIM_HOURS).toBe(2);
    expect(CLAIM_RADIUS_PC).toBe(1);
  });
});

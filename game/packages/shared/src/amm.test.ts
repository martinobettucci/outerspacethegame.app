/**
 * AMM (GB §13, DG §11.2) : produit constant, frais 25 bp LP + 25 bp
 * maison (L3 : LP 20 bp), seed = prix initial, croissance de k par la
 * jambe LP, validation de seed.
 */
import { describe, expect, it } from 'vitest';
import { ALL_RESOURCE_IDS } from './resources.js';
import {
  AMM_FEE_HOUSE_BP,
  AMM_FEE_LP_BP,
  AMM_FEE_LP_BP_L3,
  ammLpFeeBp,
  ammQuote,
  ammRouteQuote,
  ammSpot,
  validateAmmSeed,
} from './amm.js';

const isRes = (r: string) => (ALL_RESOURCE_IDS as readonly string[]).includes(r);

describe('ammSpot & seed (le ratio du dépôt EST le prix)', () => {
  it('spot = ry/rx — seeder 100 ore / 50 water ⇒ 0,5 water par ore', () => {
    expect(ammSpot({ rx: 100, ry: 50 })).toBe(0.5);
  });

  it('validation : ressources, paire distincte, réserves ≥ 1 T', () => {
    const base = { x: 'ore', y: 'water', depositX: 100, depositY: 50 };
    expect(validateAmmSeed(base, isRes)).toBeNull();
    expect(validateAmmSeed({ ...base, x: 'unobtainium' }, isRes)).toMatch(/inconnue/);
    expect(validateAmmSeed({ ...base, y: 'ore' }, isRes)).toMatch(/distinctes/);
    expect(validateAmmSeed({ ...base, depositX: 0.5 }, isRes)).toMatch(/insuffisante/);
    expect(
      validateAmmSeed({ ...base, depositY: Number.NaN }, isRes),
    ).toMatch(/insuffisante/);
  });
});

describe('ammQuote — produit constant avec frais sur la jambe d\'entrée', () => {
  it('sans frais (0 bp) : conservation EXACTE de k', () => {
    const q = ammQuote(100, 50, 10, 0, 0);
    expect(q.lpFeeT).toBe(0);
    expect(q.houseFeeT).toBe(0);
    // out = 50·10/110 = 4.5454…
    expect(q.outT).toBeCloseTo((50 * 10) / 110, 12);
    expect(q.newRIn * q.newROut).toBeCloseTo(100 * 50, 9);
  });

  it('frais canon 25+25 bp : la jambe LP fait CROÎTRE k, la maison en sort', () => {
    const give = 10;
    const q = ammQuote(100, 50, give, AMM_FEE_LP_BP, AMM_FEE_HOUSE_BP);
    expect(q.lpFeeT).toBeCloseTo(give * 0.0025, 12);
    expect(q.houseFeeT).toBeCloseTo(give * 0.0025, 12);
    const dxEff = give - q.lpFeeT - q.houseFeeT;
    expect(q.outT).toBeCloseTo((50 * dxEff) / (100 + dxEff), 12);
    // k après > k avant (la jambe LP reste en réserve, hors produit).
    expect(q.newRIn * q.newROut).toBeGreaterThan(100 * 50);
    // Matière conservée : entrée = réserve effective + LP + maison.
    expect(q.newRIn).toBeCloseTo(100 + dxEff + q.lpFeeT, 12);
    expect(q.newROut).toBeCloseTo(50 - q.outT, 12);
  });

  it('le spot DÉRIVE dans le sens du skew (acheter y renchérit y)', () => {
    const before = ammSpot({ rx: 100, ry: 50 });
    const q = ammQuote(100, 50, 20, AMM_FEE_LP_BP, AMM_FEE_HOUSE_BP);
    expect(q.spotAfter).toBeLessThan(before); // moins de y par x après l'achat de y
  });

  it('L3 abaisse la jambe LP seule : 20 bp LP, maison inchangée', () => {
    expect(ammLpFeeBp(1)).toBe(AMM_FEE_LP_BP);
    expect(ammLpFeeBp(2)).toBe(AMM_FEE_LP_BP);
    expect(ammLpFeeBp(3)).toBe(AMM_FEE_LP_BP_L3);
    const q2 = ammQuote(100, 50, 10, ammLpFeeBp(2), AMM_FEE_HOUSE_BP);
    const q3 = ammQuote(100, 50, 10, ammLpFeeBp(3), AMM_FEE_HOUSE_BP);
    expect(q3.outT).toBeGreaterThan(q2.outT); // moins de frais ⇒ plus de sortie
  });

  it('garde-fous : pool vide ou quantité invalide', () => {
    expect(() => ammQuote(0, 50, 1, 25, 25)).toThrow(/seedé/);
    expect(() => ammQuote(100, 50, 0, 25, 25)).toThrow(/invalide/);
    expect(() => ammQuote(100, 50, -3, 25, 25)).toThrow(/invalide/);
  });
});

describe('ammRouteQuote — deux jambes, double frais (GB §13)', () => {
  it('composition exacte : la sortie de la jambe 1 nourrit la jambe 2', () => {
    const r = ammRouteQuote(
      { rIn: 100, rOut: 50, lpBp: 25, houseBp: 25 },
      { rIn: 80, rOut: 40, lpBp: 25, houseBp: 25 },
      10,
    );
    const q1 = ammQuote(100, 50, 10, 25, 25);
    const q2 = ammQuote(80, 40, q1.outT, 25, 25);
    expect(r.midT).toBeCloseTo(q1.outT, 12);
    expect(r.outT).toBeCloseTo(q2.outT, 12);
    expect(r.legs).toHaveLength(2);
  });

  it('le double frais mord : router A→X→B rend MOINS qu\'un pool direct équivalent', () => {
    // Pools calibrés pour un même prix bout-en-bout (A→B à 0,25) :
    // direct 100/25 vs route 100/50 puis 50/25.
    const direct = ammQuote(100, 25, 10, 25, 25);
    const routed = ammRouteQuote(
      { rIn: 100, rOut: 50, lpBp: 25, houseBp: 25 },
      { rIn: 50, rOut: 25, lpBp: 25, houseBp: 25 },
      10,
    );
    expect(routed.outT).toBeLessThan(direct.outT);
  });
});

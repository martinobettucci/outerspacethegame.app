import { describe, expect, it } from 'vitest';
import { SeededStream, seededFloat } from './rng.js';

describe('SeededStream (RNG de génération, DG §1)', () => {
  it('est déterministe : même (seed, label) ⇒ même séquence', () => {
    const a = new SeededStream('universe-1', 'planet:42');
    const b = new SeededStream('universe-1', 'planet:42');
    for (let i = 0; i < 100; i++) {
      expect(a.float()).toBe(b.float());
    }
  });

  it('sépare les flux par label', () => {
    const a = new SeededStream('universe-1', 'planet:42');
    const b = new SeededStream('universe-1', 'planet:43');
    const seqA = Array.from({ length: 8 }, () => a.float());
    const seqB = Array.from({ length: 8 }, () => b.float());
    expect(seqA).not.toEqual(seqB);
  });

  it('produit des valeurs dans [0, 1) uniformément réparties (lissage grossier)', () => {
    const s = new SeededStream('u', 'uniformity');
    let sum = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      const v = s.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / n).toBeGreaterThan(0.48);
    expect(sum / n).toBeLessThan(0.52);
  });

  it('int(min,max) couvre les bornes incluses', () => {
    const s = new SeededStream('u', 'int-bounds');
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) seen.add(s.int(4, 8));
    expect([...seen].sort()).toEqual([4, 5, 6, 7, 8]);
  });

  it('weighted respecte approximativement les poids', () => {
    const s = new SeededStream('u', 'weights');
    const counts = [0, 0, 0];
    for (let i = 0; i < 9_000; i++) counts[s.weighted([1, 2, 6])]!++;
    expect(counts[2]!).toBeGreaterThan(counts[1]!);
    expect(counts[1]!).toBeGreaterThan(counts[0]!);
  });

  it('seededFloat est une fonction pure', () => {
    expect(seededFloat('s', 'gate:ship1:tick9')).toBe(
      seededFloat('s', 'gate:ship1:tick9'),
    );
  });
});

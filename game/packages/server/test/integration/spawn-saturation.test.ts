/** @verifies This test file verifies: docs/MASTER_PLAN.md §R4 (cas « univers saturé »); DESIGN_GUIDE.md §2.2b; JOURNAL 2026-07-22. */
/**
 * Intégration R4 — le cas « UNIVERS SATURÉ » : quand le placement de
 * spawn n'a plus de place valide, l'inscription échoue PROPREMENT —
 * erreur TYPÉE `universe_saturated` (RegistrationError) et AUCUN
 * joueur fantôme (la transaction est annulée).
 *
 * MOCK DOCUMENTÉ (CLAUDE.md §15) : une vraie saturation exigerait de
 * remplir des centaines de milliers de pc² d'actifs — inexécutable
 * localement. Le contrat simulé est EXACT : `spawnStarterSystem` lève
 * `SpawnSaturationError` (la vraie classe, réexportée du vrai module),
 * comme le font les trois branches d'épuisement réelles de
 * `gen/spawn.ts`. Tout le reste (BEGIN/INSERT joueur/ROLLBACK, vraie
 * base) est réel.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';

vi.mock('../../src/gen/spawn.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/gen/spawn.js')>();
  return {
    ...actual,
    spawnStarterSystem: vi.fn(async () => {
      throw new actual.SpawnSaturationError(
        'Spawn : impossible de trouver une poche de Fermi satisfaisant les contraintes (univers saturé)',
      );
    }),
  };
});

// Import APRÈS le mock (vitest hisse le vi.mock avant les imports).
import { registerPlayer, RegistrationError } from '../../src/services/players.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

describe('R4 — univers saturé', () => {
  it('inscription refusée avec le code TYPÉ universe_saturated, aucun joueur fantôme', async () => {
    const email = `sat-${run}@test.local`;
    let caught: unknown = null;
    try {
      await registerPlayer(pool, {
        email,
        password: 'motdepasse-solide-1',
        displayName: 'Latecomer',
        politics: 'scientific',
        universeSeed: `sat-universe-${run}`,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RegistrationError);
    expect((caught as RegistrationError).code).toBe('universe_saturated');
    // ROLLBACK prouvé : le joueur inséré avant le spawn n'existe PLUS.
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM players WHERE email = $1`,
      [email],
    );
    expect(rows[0].n).toBe(0);
  });
});

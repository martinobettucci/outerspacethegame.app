/** @verifies This test file verifies: docs/BACKLOG.md §P1 "Seed contract" (idempotence sur base simulée); docs/DESIGN_GUIDE.md §3.2-v2; docs/GAME_BOOK.md §19; CLAUDE.md §8/§18. */
/**
 * Régression : le garde de cohérence de la pyramide du seed (logDemoPyramid)
 * ne doit pas avorter un seed idempotent quand la base a DÉJÀ été simulée.
 *
 * Bug d'origine : `logDemoPyramid` exigeait `somme_pyramide === population` à
 * 1e-6 près pour TOUT starter. Après un tick, `population` devient continue
 * (ex. 346,834) alors que les cohortes affichées sont arrondies (somme 347) :
 * le garde levait « Seed incohérent », `pnpm seed` sortait en erreur, et
 * comme `runDev.sh` est en `set -e`, l'API/worker/client ne démarraient
 * jamais — d'où « impossible de se connecter ».
 *
 * Correctif : l'égalité stricte n'est exigée que sur un starter FRAIS ; sinon
 * on borne l'écart (< 1,5 = trois arrondis de ±0,5) pour tolérer la dérive
 * normale tout en détectant une vraie corruption.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import { logDemoPyramid } from '../../src/db/seed.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

describe('logDemoPyramid — seed idempotent sur base simulée (§18)', () => {
  it('tolère une population fractionnaire (starter non frais) mais garde le contrat frais', async () => {
    const account = await registerPlayer(pool, {
      email: `bd-seed-pyramid-${run}@test.local`,
      password: 'motdepasse-solide-bd',
      displayName: 'Idempotent',
      politics: 'industrialist',
      universeSeed: `bd-seed-pyramid-universe-${run}`,
    });
    const playerId = account.playerId;
    const bodyId = account.spawn.starterPlanetId;

    // Starter frais : la pyramide entière égale la population entière.
    const fresh = await planetDetail(pool, playerId, bodyId);
    expect(Number.isInteger(fresh.population)).toBe(true);
    await expect(logDemoPyramid(pool, playerId, bodyId, true)).resolves.toBeUndefined();

    // Simule la dérive d'une base déjà tickée : population continue, décalée
    // de 0,166 de la somme entière des cohortes (comme 347 vs 346,834).
    const drifted = fresh.population - 0.166;
    await pool.query('UPDATE bodies SET population = $2 WHERE id = $1', [bodyId, drifted]);

    const after = await planetDetail(pool, playerId, bodyId);
    // Pré-condition : la population est bien devenue fractionnaire.
    expect(Number.isInteger(after.population)).toBe(false);
    const sum = after.pyramid.children + after.pyramid.actives + after.pyramid.seniors;
    expect(Math.abs(sum - after.population)).toBeGreaterThan(1e-6); // aurait fait échouer l'ancien garde
    expect(Math.abs(sum - after.population)).toBeLessThan(1.5);

    // Correctif : un starter NON frais ne lève plus (seed idempotent OK).
    await expect(logDemoPyramid(pool, playerId, bodyId, false)).resolves.toBeUndefined();

    // Garde-fou : sur un starter déclaré FRAIS, l'écart fractionnaire lève
    // toujours (on n'a pas simplement désactivé le contrôle).
    await expect(logDemoPyramid(pool, playerId, bodyId, true)).rejects.toThrow(
      /Seed incohérent/,
    );
  });
});

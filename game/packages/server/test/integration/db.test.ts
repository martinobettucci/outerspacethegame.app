/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Migrations framework”; docs/SCHEMA.md §Conventions; CLAUDE.md §15/§24. */
/**
 * Intégration : vraie base locale (docker-compose.dev.yml) — CLAUDE.md §15.
 * Prérequis : `pnpm runDev:db` (ou la CI) a démarré Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;

const config = loadConfig(process.env);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

describe('migrations', () => {
  it('s\'appliquent puis sont idempotentes', async () => {
    await runMigrations(pool);
    const second = await runMigrations(pool);
    expect(second).toEqual([]);
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM schema_migrations',
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(0);
  });
});

describe('/ready', () => {
  it('répond ready quand la base est joignable', async () => {
    const app = await buildServer({ pool, config });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready', db: 'ok' });
    await app.close();
  });
});

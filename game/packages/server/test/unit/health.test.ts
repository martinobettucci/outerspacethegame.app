/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Observability baseline”; CLAUDE.md §15/§20; docs/DAT.md §4. */
import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config.js';

const config = loadConfig({});

describe('/health', () => {
  it('répond ok sans dépendre de la base', async () => {
    const pool = {
      query: async () => {
        throw new Error('base coupée');
      },
    } as unknown as pg.Pool;
    const app = await buildServer({ pool, config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('/ready signale 503 quand la base est injoignable (état d\'erreur explicite)', async () => {
    const pool = {
      query: async () => {
        throw new Error('base coupée');
      },
    } as unknown as pg.Pool;
    const app = await buildServer({ pool, config });
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'not-ready', db: 'down' });
    await app.close();
  });
});

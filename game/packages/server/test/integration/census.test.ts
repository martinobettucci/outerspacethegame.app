/**
 * Intégration : census global (GB §13, DG §11.5) sur vraie base —
 * agrégation exacte (delta lazy compris), méta des sources, récurrence
 * auto-replanifiée dédoublonnée, exactement-une-fois, publication API
 * SANS ventilation (autorisation §10 par requêtes directes : 401 sans
 * session, aucune clé de ventilation dans le JSON).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { GAME_DAY_SECONDS } from '@atg/shared';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers, censusRun } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
let app: FastifyInstance;
const run = randomUUID().slice(0, 8);
const INTERVAL_MS = 4_000;
let starter = '';
let cookie = '';

const handlers = { ...baseHandlers(), census_run: censusRun(INTERVAL_MS) };

beforeAll(async () => {
  pool = await createTestPool();
  app = await buildServer({
    pool,
    config: { ...loadConfig(process.env), UNIVERSE_SEED: `census-${run}` },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `census-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'Recenseur',
      politics: 'industrialist',
    },
  });
  expect(res.statusCode).toBe(201);
  const setCookie = res.headers['set-cookie'];
  cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0]!;
  starter = res.json().starterPlanetId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('census_run (DG §11.5)', () => {
  it('agrège stocks (lazy) + soutes, méta honnête, replanifie dédoublonné', async () => {
    // État contrôlé : une ligne de stock avec un TAUX et un as_of passé
    // (le delta lazy doit compter), plus une soute en transit.
    const dayAgo = Date.now() - GAME_DAY_SECONDS * 1000;
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, rate_t_per_day, as_of)
       VALUES ($1, 'gold', 10, 2, to_timestamp($2 / 1000.0))
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = 10, rate_t_per_day = 2,
                     as_of = to_timestamp($2 / 1000.0)`,
      [starter, dayAgo],
    );
    await pool.query(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, cargo, fuel)
       SELECT owner_id, 'cargo', 's', 'Census freighter', x, y, 'idle',
              '{"gold": 7}', '{"cold": 1}'
       FROM bodies WHERE id = $1`,
      [starter],
    );
    // Deux census_run en attente (doublon volontaire) : le handler doit
    // n'en laisser qu'UN après traitement.
    await pool.query(
      `INSERT INTO events (due_at, kind, payload)
       VALUES (now() - interval '1 second', 'census_run', '{}'),
              (now() - interval '1 second', 'census_run', '{}')`,
    );
    await processDueEvents(pool, handlers);

    const { rows: snaps } = await pool.query(
      `SELECT taken_at, totals, meta FROM census_snapshots
       ORDER BY taken_at DESC LIMIT 1`,
    );
    expect(snaps.length).toBe(1);
    const gold = snaps[0].totals.gold;
    // 10 + 2 T/j × 1 j (lazy) + 7 en soute = 19.
    expect(gold.planetStockT).toBeCloseTo(12, 1);
    expect(gold.shipCargoT).toBeCloseTo(7, 6);
    expect(gold.totalT).toBeCloseTo(19, 1);
    expect(snaps[0].meta.sources).toEqual(['planet_stock', 'ship_cargo', 'amm_pools']);
    expect(snaps[0].meta.shipCount).toBeGreaterThanOrEqual(1);

    const { rows: pending } = await pool.query(
      `SELECT due_at FROM events
       WHERE processed_at IS NULL AND kind = 'census_run'`,
    );
    expect(pending.length).toBe(1);
    const dueIn = new Date(pending[0].due_at).getTime() - Date.now();
    expect(dueIn).toBeGreaterThan(INTERVAL_MS - 2_000);
    expect(dueIn).toBeLessThan(INTERVAL_MS + 2_000);

    // Exactement-une-fois : un re-passage immédiat ne traite rien (le
    // prochain census est daté dans le futur).
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBe(0);
  });

  it('API : 401 sans session ; totaux GLOBAUX sans AUCUNE ventilation', async () => {
    const anon = await app.inject({ method: 'GET', url: '/census/latest' });
    expect(anon.statusCode).toBe(401);

    const res = await app.inject({
      method: 'GET',
      url: '/census/latest',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      perDay: number;
      census: { takenAt: string; totals: Record<string, number> } | null;
    };
    expect(body.perDay).toBeGreaterThan(0);
    expect(body.census).toBeTruthy();
    expect(body.census!.totals.gold).toBeCloseTo(19, 1);
    // Assertion NÉGATIVE (DG §11.5) : aucune clé de ventilation ne sort.
    const serialized = res.body;
    for (const banned of [
      'planetStockT',
      'shipCargoT',
      'planet_stock_t',
      'ship_cargo_t',
      'body_id',
      'bodyId',
      'warehouse',
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('migration : la table existe et UN census_run non traité subsiste', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'census_run'`,
    );
    expect(rows[0].n).toBe(1);
  });
});

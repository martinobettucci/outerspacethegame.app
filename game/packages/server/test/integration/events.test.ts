/**
 * Intégration file d'événements : vraie base locale, vraies migrations
 * (CLAUDE.md §15). Vérifie : enchaînement enqueue → claim → handler →
 * processed, l'exactement-une-fois sous concurrence (SKIP LOCKED), et
 * l'idempotence du handler construction_complete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { enqueue, processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;

beforeAll(async () => {
  pool = await createTestPool();
  await pool.query('DELETE FROM events');
});

afterAll(async () => {
  await pool.end();
});

async function makePlanetWithConstruction(): Promise<{
  bodyId: string;
  buildingId: string;
}> {
  const seed = `test-${randomUUID()}`;
  const { rows: bodyRows } = await pool.query<{ id: string }>(
    `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality, tiles)
     VALUES ('planet', 'Testworld', 100, 100, $1, 's', 'temperate', 'E', 8)
     RETURNING id`,
    [seed],
  );
  const bodyId = bodyRows[0]!.id;
  const { rows: bRows } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, tile_index, status, completes_at)
     VALUES ($1, 'mine', 0, 'constructing', now() - interval '1 minute')
     RETURNING id`,
    [bodyId],
  );
  return { bodyId, buildingId: bRows[0]!.id };
}

describe("file d'événements (DG §1)", () => {
  it('traite un événement échu et le marque processed exactement une fois', async () => {
    const { buildingId } = await makePlanetWithConstruction();
    await enqueue(pool, 'construction_complete', new Date(Date.now() - 1000), {
      buildingId,
    });

    const r1 = await processDueEvents(pool, baseHandlers());
    expect(r1.processed).toBeGreaterThanOrEqual(1);

    const { rows } = await pool.query(
      'SELECT status, completes_at FROM buildings WHERE id = $1',
      [buildingId],
    );
    expect(rows[0].status).toBe('active');
    expect(rows[0].completes_at).toBeNull();

    // Re-passage : plus rien d'échu.
    const r2 = await processDueEvents(pool, baseHandlers());
    expect(r2.processed).toBe(0);
  });

  it("un événement futur n'est pas traité", async () => {
    const { buildingId } = await makePlanetWithConstruction();
    await enqueue(
      pool,
      'construction_complete',
      new Date(Date.now() + 3_600_000),
      { buildingId },
    );
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      'SELECT status FROM buildings WHERE id = $1',
      [buildingId],
    );
    expect(rows[0].status).toBe('constructing');
    await pool.query('DELETE FROM events WHERE processed_at IS NULL');
  });

  it('handler idempotent : rejouer construction_complete ne casse rien', async () => {
    const { buildingId } = await makePlanetWithConstruction();
    await enqueue(pool, 'construction_complete', new Date(Date.now() - 1000), {
      buildingId,
    });
    await enqueue(pool, 'construction_complete', new Date(Date.now() - 900), {
      buildingId,
    });
    const r = await processDueEvents(pool, baseHandlers());
    expect(r.processed).toBe(2);
    const { rows } = await pool.query(
      'SELECT status FROM buildings WHERE id = $1',
      [buildingId],
    );
    expect(rows[0].status).toBe('active');
  });

  it('deux processeurs concurrents ne traitent jamais deux fois le même événement', async () => {
    const { buildingId } = await makePlanetWithConstruction();
    const ids = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        enqueue(pool, 'noop', new Date(Date.now() - 1000 - i), { buildingId }),
      ),
    );
    const [a, b] = await Promise.all([
      processDueEvents(pool, baseHandlers(), { batchSize: 3 }),
      processDueEvents(pool, baseHandlers(), { batchSize: 3 }),
    ]);
    expect(a.processed + b.processed).toBe(20);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE id = ANY($1::bigint[]) AND processed_at IS NOT NULL`,
      [ids],
    );
    expect(rows[0].n).toBe(20);
  });

  it('un kind sans handler reste en file et est signalé en échec', async () => {
    await pool.query('DELETE FROM events WHERE processed_at IS NULL');
    await enqueue(
      pool,
      'unknown_kind' as Parameters<typeof enqueue>[1],
      new Date(Date.now() - 1000),
      {},
    );
    const r = await processDueEvents(pool, baseHandlers());
    expect(r.failed).toBe(1);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events WHERE processed_at IS NULL`,
    );
    expect(rows[0].n).toBe(1);
    await pool.query('DELETE FROM events WHERE processed_at IS NULL');
  });
});

/**
 * Intégration : la boucle colonie vivante (DG §3.2/§3.3/§6) sur vraie
 * base — construction → activation par événement → débits écrits →
 * évaluation lazy dans le temps → tarissement définitif → population
 * quotidienne → cohérence du rattrapage hors-ligne (GB §15).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { evalLazy } from '../../src/sim/lazy.js';
import { enqueue, processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { recomputePlanetRates } from '../../src/sim/rebase.js';
import { registerPlayer } from '../../src/services/players.js';
import { placeBuilding, setBuildingSettings } from '../../src/services/planets.js';
import { createTestPool } from './helpers.js';

const DAY = 86_400_000;
let pool: pg.Pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

const toMs = (d: Date | string) => new Date(d).getTime();

async function stockRow(bodyId: string, resource: string) {
  const { rows } = await pool.query(
    'SELECT amount_t, rate_t_per_day, as_of FROM planet_stock WHERE body_id = $1 AND resource = $2',
    [bodyId, resource],
  );
  return rows[0];
}

describe('boucle colonie', () => {
  it('mine construite → activée par événement → l\'ore coule et le gisement se vide', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-a-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'Loop',
      politics: 'industrialist',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;

    const { buildingId } = await placeBuilding(
      pool,
      playerId,
      planetId,
      'mine',
      0,
      { nowMs: t0, timeScale: 3600 * 6, recipe: 'extract:ore' }, // 6 h → 1 s
    );

    // Avant activation : aucun débit.
    expect((await stockRow(planetId, 'ore')).rate_t_per_day).toBe(0);

    // L'événement d'activation est traité à son échéance.
    await new Promise((r) => setTimeout(r, 1_100));
    const res = await processDueEvents(pool, baseHandlers());
    expect(res.processed).toBeGreaterThanOrEqual(1);

    const after = await stockRow(planetId, 'ore');
    // Workforce par défaut 35 ⇒ E = 1 ; E_planet ≈ 0.95 ⇒ ~9,5 T/jour.
    expect(after.rate_t_per_day).toBeGreaterThan(8);
    expect(after.rate_t_per_day).toBeLessThanOrEqual(10);
    const { rows: dep } = await pool.query(
      'SELECT rate_t_per_day FROM deposits WHERE body_id = $1 AND resource = $2',
      [planetId, 'ore'],
    );
    expect(dep[0].rate_t_per_day).toBeCloseTo(-after.rate_t_per_day, 6);

    // Évaluation lazy 3 jours plus tard : le stock a poussé linéairement.
    const now = toMs(after.as_of);
    const in3d = evalLazy(
      {
        amount: after.amount_t,
        ratePerDay: after.rate_t_per_day,
        asOfMs: now,
      },
      now + 3 * DAY,
    );
    expect(in3d).toBeCloseTo(after.amount_t + 3 * after.rate_t_per_day, 6);

    // runPct 0 : la mine s'arrête, le débit retombe à zéro.
    await setBuildingSettings(pool, playerId, planetId, buildingId, { runPct: 0 });
    expect((await stockRow(planetId, 'ore')).rate_t_per_day).toBe(0);
    await setBuildingSettings(pool, playerId, planetId, buildingId, { runPct: 100 });
  });

  it('workforce > 60 % de la population : refus explicite', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-b-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopB',
      politics: 'civic',
      universeSeed: `loop-universe-${run}`,
    });
    const { buildingId } = await placeBuilding(
      pool,
      playerId,
      spawn.starterPlanetId,
      'mine',
      0,
      { nowMs: t0, timeScale: 100_000, recipe: 'extract:ore' },
    );
    await expect(
      setBuildingSettings(pool, playerId, spawn.starterPlanetId, buildingId, {
        workforce: 10_000_000,
      }),
    ).rejects.toMatchObject({ code: 'workforce_invalid' });
  });

  it('max 1 extracteur par gisement ; recette obligatoire pour une industrie', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-c-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopC',
      politics: 'mercantile',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;
    await placeBuilding(pool, playerId, planetId, 'mine', 0, {
      nowMs: t0,
      timeScale: 100_000,
      recipe: 'extract:ore',
    });
    await expect(
      placeBuilding(pool, playerId, planetId, 'mine', 1, {
        nowMs: t0,
        timeScale: 100_000,
        recipe: 'extract:ore',
      }),
    ).rejects.toMatchObject({ code: 'deposit_taken' });
    await expect(
      placeBuilding(pool, playerId, planetId, 'mine', 1, {
        nowMs: t0,
        timeScale: 100_000,
      }),
    ).rejects.toMatchObject({ code: 'recipe_invalid' });
  });

  it('gisement à sec : événement deposit_dry → 0 pour toujours, extracteur arrêté', async () => {
    // Planète artisanale avec un minuscule gisement pour un tarissement court.
    const t0 = Date.now();
    const seed = `dry-${run}`;
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, population, pop_as_of)
       VALUES ('planet', 'Dryworld', 900001, 900001, $1, 's', 'temperate', 'F',
          8, 1200, to_timestamp($2 / 1000.0)) RETURNING id`,
      [seed, t0],
    );
    const bodyId = b[0]!.id;
    await pool.query(
      `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
       VALUES ($1, 'ore', 5, 5, to_timestamp($2 / 1000.0))`,
      [bodyId, t0],
    );
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'mine', 1, 0, 'active', 'extract:ore', 35)`,
      [bodyId],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recomputePlanetRates(client, bodyId, t0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const { rows: pending } = await pool.query(
      `SELECT due_at FROM events WHERE processed_at IS NULL AND kind = 'deposit_dry'
       AND payload->>'bodyId' = $1`,
      [bodyId],
    );
    expect(pending).toHaveLength(1);
    const dryAt = toMs(pending[0].due_at);
    // ~5 T à ~9,5 T/jour ⇒ ~0,53 jour.
    expect(dryAt - t0).toBeGreaterThan(0.4 * DAY);
    expect(dryAt - t0).toBeLessThan(0.7 * DAY);

    // Rattrapage : on traite la file « au futur » (nowMs = après le dry).
    await processDueEvents(pool, baseHandlers(), { nowMs: dryAt + 1000 });
    const { rows: dep } = await pool.query(
      'SELECT amount_t, rate_t_per_day FROM deposits WHERE body_id = $1',
      [bodyId],
    );
    expect(dep[0].amount_t).toBe(0);
    expect(dep[0].rate_t_per_day).toBe(0);
    const ore = await stockRow(bodyId, 'ore');
    // Le stock extrait ≈ le gisement initial (5 T), et il ne pousse plus.
    expect(ore.amount_t).toBeGreaterThan(4.5);
    expect(ore.amount_t).toBeLessThanOrEqual(5.01);
    expect(ore.rate_t_per_day).toBe(0);
  });

  it('pop_daily : croissance saine avec vivres, famine sans vivres', async () => {
    const t0 = Date.now();
    const mk = async (name: string, stocks: [string, number][]) => {
      const { rows: b } = await pool.query<{ id: string }>(
        `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
            quality, tiles, owner_id, population, pop_as_of)
         SELECT 'planet', $1, 900100, 900100, $2, 's', 'temperate', 'F', 8,
                p.id, 1200, to_timestamp($3 / 1000.0)
         FROM players p LIMIT 1 RETURNING id`,
        [name, `pop-${name}-${run}`, t0],
      );
      for (const [res, qty] of stocks) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
          [b[0]!.id, res, qty, t0],
        );
      }
      await enqueue(pool, 'pop_daily', new Date(t0 + DAY), { bodyId: b[0]!.id });
      return b[0]!.id;
    };
    const fed = await mk('Fedworld', [
      ['food_1', 100],
      ['water', 100],
      ['med_1', 10],
    ]);
    const starving = await mk('Hungerworld', [['water', 100]]);

    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });

    const pop = async (id: string) =>
      (await pool.query('SELECT population, illness FROM bodies WHERE id = $1', [id]))
        .rows[0];
    const fedPop = await pop(fed);
    const hungryPop = await pop(starving);
    // Nourri : ΔP = 0.05 × 1200 × (1 − 0.6) × 1 = +24.
    expect(Number(fedPop.population)).toBe(1224);
    // Affamé : H = 0 ⇒ aucune croissance.
    expect(Number(hungryPop.population)).toBeLessThanOrEqual(1200);
    // Le pop_daily suivant est replanifié.
    const { rows: next } = await pool.query(
      `SELECT count(*)::int AS n FROM events WHERE processed_at IS NULL
       AND kind = 'pop_daily' AND payload->>'bodyId' IN ($1, $2)`,
      [fed, starving],
    );
    expect(next[0].n).toBe(2);
  });

  it('rattrapage hors-ligne : évaluer à t+N = matérialiser à t+k puis évaluer (zéro dérive)', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-d-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopD',
      politics: 'scientific',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;
    await placeBuilding(pool, playerId, planetId, 'mine', 0, {
      nowMs: t0,
      timeScale: 3600 * 6,
      recipe: 'extract:ore',
    });
    await new Promise((r) => setTimeout(r, 1_100));
    await processDueEvents(pool, baseHandlers());
    const row = await stockRow(planetId, 'ore');
    const q = {
      amount: row.amount_t,
      ratePerDay: row.rate_t_per_day,
      asOfMs: toMs(row.as_of),
    };
    const direct = evalLazy(q, q.asOfMs + 2 * DAY);
    // Chemin « spectateur » : matérialisation intermédiaire à J+1 puis J+2.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recomputePlanetRates(client, planetId, q.asOfMs + DAY);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const mid = await stockRow(planetId, 'ore');
    const stepped = evalLazy(
      {
        amount: mid.amount_t,
        ratePerDay: mid.rate_t_per_day,
        asOfMs: toMs(mid.as_of),
      },
      q.asOfMs + 2 * DAY,
    );
    expect(stepped).toBeCloseTo(direct, 6);
  });
});

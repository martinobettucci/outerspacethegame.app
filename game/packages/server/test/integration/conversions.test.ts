/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (taxonomie définitive : continus mobiles/gourmands, batch immobiles/efficaces). */
/**
 * Intégration W9b (taxonomie définitive) : ÉLECTROLYSE CONTINUE (eau
 * tirée de la soute au fil de l'eau, carburant brûlé, starvation → 0 %),
 * vivarium continu, BATCH cell_decompressor (intrants à l'activation,
 * arrêt exigé, immobilisation moveShip, ZÉRO carburant brûlé, +50 fuel
 * moteur au terme borné au réservoir), grades enhanced (fabrication L3).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { setConversion } from '../../src/services/conversions.js';
import { fabricateGear } from '../../src/services/gear.js';
import { moveShip } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let bigId = '';

const FAST = { timeScale: 1_000_000 };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function drainEdges(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers(1_000_000));
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'conversion_edge'`,
    );
    if (rows[0].n === 0) return;
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `conv-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Alchemist',
    politics: 'scientific',
    universeSeed: `conv-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo)
     VALUES ($1, 'cargo', 'l', 'Alembic',
        (SELECT x FROM bodies WHERE id = $2),
        (SELECT y FROM bodies WHERE id = $2),
        'idle', '{"cold": 100}', 'cold',
        '["electrolyzer", "vivarium", "cell_decompressor"]'::jsonb,
        '{"water": 8, "fuel_cells": 2}'::jsonb)
     RETURNING id`,
    [owner, starter],
  );
  bigId = rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('W9b — électrolyse CONTINUE (correction 2026-07-22)', () => {
  it('gardes : pas de 5 %, accessoire monté, reverse interdit au L1', async () => {
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'electrolyzer', runPct: 33 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'phlogiston_coil' as string, runPct: 50 }, FAST),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      setConversion(
        pool,
        owner,
        bigId,
        { itemKey: 'electrolyzer', runPct: 50, direction: 'reverse' },
        FAST,
      ),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('continue : l\'eau de soute se convertit AU FIL DE L\'EAU, carburant brûlé, starvation → 0 %', async () => {
    const before = await ship(bigId);
    const fuelBefore = Number(before.fuel.cold);
    await setConversion(pool, owner, bigId, { itemKey: 'electrolyzer', runPct: 50 }, FAST);
    // 8 T d'eau à 10 T/h : starvation à ~0,8 h-jeu — le bord la règle.
    await drainEdges();
    const after = await ship(bigId);
    expect(after.cargo.water ?? 0).toBeLessThan(0.1);
    expect(after.cargo.oxygen).toBeCloseTo(8, 1);
    expect(after.cargo.hydrogen).toBeCloseTo(8, 1);
    expect(after.conversions.electrolyzer.runPct).toBe(0); // starvation
    // Carburant brûlé : 0,8 h × 0,5 u/h = 0,4 u.
    expect(fuelBefore - Number(after.fuel.cold)).toBeCloseTo(0.4, 1);
  });
});

describe('W9b — BATCH cell_decompressor (immobile, efficace, zéro fuel)', () => {
  it('intrants À L\'ACTIVATION, moveShip refusé pendant, +50 fuel moteur au terme, aucun fuel brûlé', async () => {
    const before = await ship(bigId);
    const fuelBefore = Number(before.fuel.cold);
    expect(Number(before.cargo.fuel_cells)).toBe(2);
    // timeScale 1 : le procédé dure 24 h réelles — on observe l'état.
    await setConversion(
      pool,
      owner,
      bigId,
      { itemKey: 'cell_decompressor', runPct: 100 },
      { timeScale: 1 },
    );
    const mid = await ship(bigId);
    expect(Number(mid.cargo.fuel_cells ?? 0)).toBe(1); // consommé à l'activation
    expect(mid.conversions.cell_decompressor.processEndsAtMs).toBeTruthy();
    await expect(
      moveShip(pool, owner, bigId, { x: 0, y: 0 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' }); // immobilisée
    // Second lancement pendant le procédé : refusé.
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'cell_decompressor', runPct: 100 }, { timeScale: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Fixture §15 : on avance le TERME à maintenant puis on traite.
    await pool.query(
      `UPDATE ships SET conversions = jsonb_set(conversions,
         '{cell_decompressor,processEndsAtMs}', to_jsonb($2::bigint))
       WHERE id = $1`,
      [bigId, Date.now() - 1000],
    );
    await pool.query(
      `UPDATE events SET due_at = now() - interval '1 second'
       WHERE processed_at IS NULL AND kind = 'conversion_edge'
         AND payload->>'shipId' = $1`,
      [bigId],
    );
    await processDueEvents(pool, baseHandlers(1));
    const after = await ship(bigId);
    expect(after.conversions.cell_decompressor).toBeUndefined();
    // +50 u de fuel MOTEUR (cold), rien brûlé par le procédé.
    expect(Number(after.fuel.cold)).toBeCloseTo(
      Math.min(400 * 1, fuelBefore + 50),
      0,
    );
    // La coque repart (destination distincte : elle est déjà au starter).
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    const r = await moveShip(
      pool,
      owner,
      bigId,
      { x: Number(pos[0].x) + 8, y: Number(pos[0].y) },
      FAST,
    );
    expect(r.arrivesAt).toBeTruthy();
  });

  it('abandon (runPct 0) : intrants PERDUS, immobilisation levée', async () => {
    // Re-park à l'arrêt.
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 60));
      await processDueEvents(pool, baseHandlers(1_000_000));
      if ((await ship(bigId)).status !== 'transit') break;
    }
    await setConversion(
      pool,
      owner,
      bigId,
      { itemKey: 'cell_decompressor', runPct: 100 },
      { timeScale: 1 },
    );
    const mid = await ship(bigId);
    expect(mid.cargo.fuel_cells ?? 0).toBe(0);
    await setConversion(pool, owner, bigId, { itemKey: 'cell_decompressor', runPct: 0 }, { timeScale: 1 });
    const after = await ship(bigId);
    expect(after.conversions.cell_decompressor).toBeUndefined();
    expect(after.cargo.fuel_cells ?? 0).toBe(0); // perdus (annoncé)
  });
});

describe('W9b — vivarium continu + §10 + enhanced', () => {
  it('vivarium : O2 de soute + fuel → nourriture ; O2 épuisé → 0 %', async () => {
    await setConversion(pool, owner, bigId, { itemKey: 'vivarium', runPct: 100 }, FAST);
    await drainEdges();
    const after = await ship(bigId);
    expect(after.cargo.food_1 ?? 0).toBeGreaterThan(4);
    expect(after.cargo.oxygen ?? 0).toBeLessThan(0.2);
    expect(after.conversions.vivarium.runPct).toBe(0);
  });

  it('§10 : autrui ne règle pas MES actifs', async () => {
    const b = await registerPlayer(pool, {
      email: `conv-x-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Intruder',
      politics: 'militarist',
      universeSeed: `conv-universe-${run}`,
    });
    await expect(
      setConversion(pool, b.playerId, bigId, { itemKey: 'vivarium', runPct: 50 }, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('enhanced : fabrication refusée au workshop L1, acceptée au L3', async () => {
    for (const [key, tile] of [
      ['workshop', 0],
      ['warehouse', 1],
    ] as const) {
      await pool.query(
        `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
         VALUES ($1, $2, 1, $3, 'active', 0)`,
        [starter, key, tile],
      );
    }
    for (const [res, qty] of [
      ['steel_l', 300],
      ['silicon', 120],
      ['gold', 40],
    ] as const) {
      await pool.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
        [starter, res, qty],
      );
    }
    await expect(
      fabricateGear(pool, owner, starter, 'electrolyzer_enhanced', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    await pool.query(
      `UPDATE buildings SET level = 3 WHERE body_id = $1 AND key = 'workshop'`,
      [starter],
    );
    const r = await fabricateGear(pool, owner, starter, 'electrolyzer_enhanced', FAST);
    expect(r.completesAt).toBeTruthy();
  });
});

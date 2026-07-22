/** @verifies This test file verifies: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (actifs partout, starvation→0 %, pas de 5 %, batch/continu). */
/**
 * Intégration W9b : actifs de conversion sur vraie base — électrolyse
 * BATCH (eau sacrifiée au lancement, sorties au bord, refus si la soute
 * ne couvre pas la production, pas de 5 %, accessoire monté exigé,
 * carburant brûlé, starvation → 0 %), vivarium CONTINU (O2+fuel →
 * nourriture, starvation d'O2 → 0 % automatique), grades enhanced
 * (fabrication L3 exigée).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { setConversion } from '../../src/services/conversions.js';
import { fabricateGear } from '../../src/services/gear.js';
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
  // Les continus se replanifient à l'horizon : on n'exige pas le vide.
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
  // Une coque L (24 conteneurs) avec électrolyseur + vivarium montés
  // (fixture §15 — l'acquisition pipeline est couverte par gear.test).
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo)
     VALUES ($1, 'cargo', 'l', 'Alembic',
        (SELECT x FROM bodies WHERE id = $2),
        (SELECT y FROM bodies WHERE id = $2),
        'idle', '{"cold": 100}', 'cold',
        '["electrolyzer", "vivarium"]'::jsonb,
        '{"water": 8}'::jsonb)
     RETURNING id`,
    [owner, starter],
  );
  bigId = rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('W9b — électrolyse (BATCH)', () => {
  it('gardes : pas de 5 %, accessoire monté, batch exigé, soute couvrante', async () => {
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'electrolyzer', runPct: 33, batchT: 4 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' }); // pas de 5 %
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'arc_furnace' as string, runPct: 50 }, FAST),
    ).rejects.toMatchObject({ code: 'not_found' }); // pas encore au catalogue
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'electrolyzer', runPct: 50 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' }); // aucun batch engagé
    await expect(
      setConversion(pool, owner, bigId, { itemKey: 'electrolyzer', runPct: 50, batchT: 100 }, FAST),
    ).rejects.toMatchObject({ code: 'insufficient_resources' }); // 100 eau absents
    // reverse interdit au L1.
    await expect(
      setConversion(
        pool,
        owner,
        bigId,
        { itemKey: 'electrolyzer', runPct: 50, batchT: 4, direction: 'reverse' },
        FAST,
      ),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('nominal : 4 eau sacrifiées, au bord 4 O2 + 4 H en soute, carburant brûlé', async () => {
    const before = await ship(bigId);
    const fuelBefore = Number(before.fuel.cold);
    const r = await setConversion(
      pool,
      owner,
      bigId,
      { itemKey: 'electrolyzer', runPct: 50, batchT: 4 },
      FAST,
    );
    expect(r.state!.batchLeftT).toBeCloseTo(4, 6);
    // L'eau est SACRIFIÉE au lancement.
    const mid = await ship(bigId);
    expect(mid.cargo.water ?? 0).toBeCloseTo(4, 6);
    // 4 T à 10 T/h (50 %) = 0,4 h-jeu → bord quasi immédiat en FAST.
    await drainEdges();
    const after = await ship(bigId);
    expect(after.cargo.oxygen).toBeCloseTo(4, 1);
    expect(after.cargo.hydrogen).toBeCloseTo(4, 1);
    expect(after.conversions.electrolyzer).toBeUndefined(); // batch fini
    // Carburant de fonctionnement brûlé : 0,4 h × 0,5 u/h = 0,2 u.
    expect(fuelBefore - Number((await ship(bigId)).fuel.cold)).toBeCloseTo(0.2, 1);
  });
});

describe('W9b — vivarium (CONTINU) et starvation', () => {
  it("tourne PARTOUT, consomme O2+fuel, produit de la nourriture ; l'O2 épuisé → 0 % automatique", async () => {
    // L'O2 en soute vient de l'électrolyse (≈ 4 T) : à 100 % le vivarium
    // (5 T réf/h, 0,5 T O2/réf) tient ~1,6 h-jeu puis STARVE.
    await setConversion(
      pool,
      owner,
      bigId,
      { itemKey: 'vivarium', runPct: 100 },
      FAST,
    );
    await drainEdges();
    const after = await ship(bigId);
    // Nourriture produite (≈ 8 T réf), O2 épuisé, réglage retombé à 0.
    expect(after.cargo.food_1 ?? 0).toBeGreaterThan(6);
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
});

describe('W9b — grades enhanced (fabrication L3)', () => {
  it('electrolyzer_enhanced : refusé au workshop L1, accepté au L3', async () => {
    for (const [key, tile, level] of [
      ['workshop', 0, 1],
      ['warehouse', 1, 1],
    ] as const) {
      await pool.query(
        `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
         VALUES ($1, $2, $3, $4, 'active', 0)`,
        [starter, key, level, tile],
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
    ).rejects.toMatchObject({ code: 'not_available' }); // L1 < L3
    await pool.query(
      `UPDATE buildings SET level = 3 WHERE body_id = $1 AND key = 'workshop'`,
      [starter],
    );
    const r = await fabricateGear(pool, owner, starter, 'electrolyzer_enhanced', FAST);
    expect(r.completesAt).toBeTruthy();
  });
});

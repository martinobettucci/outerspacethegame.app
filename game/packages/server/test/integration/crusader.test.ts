/** @verifies This test file verifies: docs/MASTER_PLAN.md §W8 (W8a) ; GAME_BOOK.md §14 (amendé 2026-07-21) ; DESIGN_GUIDE.md §8.1. */
/**
 * Intégration W8a : naissance du CRUSADER (MASTER_PLAN W8, JOURNAL
 * 2026-07-21) sur vraie base — le combat_l naît EN SURVOL (jamais à
 * quai), 25 % de la population source migre à bord (proportions d'âges,
 * compteurs décrémentés), l'oxygène/vivres d'amorçage sont puisés au
 * stock (partiel annoncé), l'infrastructure est FIGÉE ; atterrissage et
 * entrepôt REFUSÉS ; il vole comme une coque normale.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { CRUSADER } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { buildShip, fleet, landShip, moveShip, warehouseShip } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let crusaderId = '';

const FAST = { timeScale: 1_000_000 };

async function pump(loops: number): Promise<void> {
  for (let i = 0; i < loops; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers());
  }
}

async function planetPop(): Promise<{ population: number; children: number; seniors: number }> {
  const { rows } = await pool.query(
    `SELECT population, pop_children, pop_seniors FROM bodies WHERE id = $1`,
    [starter],
  );
  return {
    population: Number(rows[0].population),
    children: Number(rows[0].pop_children),
    seniors: Number(rows[0].pop_seniors),
  };
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `cru-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Admiral',
    politics: 'scientific',
    universeSeed: `cru-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Chantier L3 (coques L) + trésorerie + provisions d'amorçage.
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'shipyard', 3, 0, 'active', 0)`,
    [starter],
  );
  for (const [res, qty] of [
    ['steel_h', 800],
    ['steel_l', 400],
    ['fuel_cells', 400],
    ['oxygen', 300],
    ['food_1', 200],
    ['water', 200],
    ['fuel_cold', 300],
    ['fuel_hot', 300],
    ['fuel_gas', 300],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
      [starter, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('W8a — naissance du Crusader', () => {
  it('naît EN SURVOL avec 25 % de la population source (proportions d\'âges) et l\'oxygène au stock', async () => {
    const before = await planetPop();
    expect(before.population).toBeGreaterThan(0);
    const { rows: oxyBefore } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'oxygen'`,
      [starter],
    );
    await buildShip(
      pool,
      owner,
      starter,
      { category: 'combat', size: 'l', name: 'Le Croisé' },
      FAST,
    );
    await pump(15);
    const ships = await fleet(pool, owner);
    const cru = ships.find((s) => s.name === 'Le Croisé')!;
    expect(cru).toBeTruthy();
    crusaderId = cru.id;
    // JAMAIS à quai : né en survol de son monde.
    expect(cru.status).toBe('hovering');
    expect(cru.hoverBodyId).toBe(starter);
    const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [
      crusaderId,
    ]);
    const row = rows[0];
    // 25 % embarqués, proportions d'âges, somme exacte.
    const expectedTotal = Math.floor(before.population * CRUSADER.migrationFraction);
    const pop = row.crusader_pop;
    expect(pop.children + pop.actives + pop.seniors).toBe(expectedTotal);
    const after = await planetPop();
    expect(before.population - after.population).toBe(expectedTotal);
    expect(before.children - after.children).toBe(pop.children);
    expect(before.seniors - after.seniors).toBe(pop.seniors);
    // Oxygène d'amorçage puisé au stock (on respire AU STOCK à bord).
    expect(Number(row.crusader_stock.oxygen)).toBeCloseTo(
      CRUSADER.birthStock.oxygen!,
      3,
    );
    const { rows: oxyAfter } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'oxygen'`,
      [starter],
    );
    expect(
      Number(oxyBefore[0].amount_t) - Number(oxyAfter[0].amount_t),
    ).toBeCloseTo(CRUSADER.birthStock.oxygen!, 2);
    // Infrastructure FIGÉE écrite (descriptive v1).
    expect(row.crusader_infra.residential).toBe(3);
    expect(row.crusader_infra.markets).toBe(false);
    // Plein de naissance 25 % du réservoir (coque L : 400 u → 100 u).
    expect(Number(cru.fuel[cru.fuelType])).toBeCloseTo(100, 1);
  });

  it('ne se pose JAMAIS : atterrissage et entrepôt refusés, mais il VOLE', async () => {
    await expect(landShip(pool, owner, crusaderId, FAST)).rejects.toMatchObject({
      code: 'not_available',
    });
    await expect(
      warehouseShip(pool, owner, crusaderId),
    ).rejects.toMatchObject({ code: 'not_available' });
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    const r = await moveShip(
      pool,
      owner,
      crusaderId,
      { x: Number(pos[0].x) + 8, y: Number(pos[0].y) },
      FAST,
    );
    expect(r.arrivesAt).toBeTruthy();
  });
});

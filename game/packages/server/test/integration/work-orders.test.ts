/**
 * Intégration W7 : usinage partiel des usines L3 (MASTER_PLAN W7,
 * JOURNAL 2026-07-21) sur vraie base — dès qu'une industrie L3 active
 * existe : AUCUN paiement à la commande, 20 paliers de 5 %, starved à
 * sec + reprise AUTO au retour du stock, total débité = coût exact,
 * naissance par la voie EXISTANTE (ship_built / item_fabricated) ;
 * sans usine L3 : chemin historique (paiement à la commande).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HULLS } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { fabricateGear, listPlanetGear } from '../../src/services/gear.js';
import { buildShip, fleet } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';

const FAST = { timeScale: 1_000_000 };

async function stock(resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [starter, resource],
  );
  return Number(rows[0]?.amount_t ?? 0);
}

async function setStock(resource: string, tons: number): Promise<void> {
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (body_id, resource)
     DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
    [starter, resource, tons],
  );
}

/** Draine les paliers/naissances pendant maxLoops × 60 ms. */
async function pump(loops: number): Promise<void> {
  for (let i = 0; i < loops; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers());
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `wo-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Foreman',
    politics: 'scientific',
    universeSeed: `wo-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Chantier + hôtes + warehouse (balance d'items) — l'usine L3 arrive
  // dans les tests (c'est LE déclencheur).
  for (const [key, tile] of [
    ['shipyard', 0],
    ['workshop', 1],
    ['warehouse', 2],
  ] as const) {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, $2, 1, $3, 'active', 0)`,
      [starter, key, tile],
    );
  }
  await setStock('steel_l', 500);
  await setStock('fuel_cells', 200);
  await setStock('silicon', 100);
  await setStock('gold', 40);
  await setStock('fuel_cold', 100);
  await setStock('fuel_hot', 100);
  await setStock('fuel_gas', 100);
});

afterAll(async () => {
  await pool.end();
});

describe('W7 — usinage partiel (usines L3)', () => {
  it('SANS usine L3 : paiement à la commande (chemin historique intact)', async () => {
    const before = await stock('steel_l');
    await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 's', name: 'Classic Mule' },
      FAST,
    );
    expect(before - (await stock('steel_l'))).toBeCloseTo(
      HULLS.cargo_s.buildCost.steel_l!,
      3,
    );
    await pump(10);
    const ships = await fleet(pool, owner);
    expect(ships.some((s) => s.name === 'Classic Mule')).toBe(true);
  });

  it('AVEC usine L3 : rien d\'avance, 20 paliers de 5 %, naissance à la voie existante, total = coût exact', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'smelter', 3, 3, 'active', 0)`,
      [starter],
    );
    await setStock('steel_l', 500);
    await setStock('fuel_cells', 200);
    const s0 = await stock('steel_l');
    const c0 = await stock('fuel_cells');
    await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 's', name: 'Staged Mule' },
      FAST,
    );
    // RIEN débité à la commande.
    expect(await stock('steel_l')).toBeCloseTo(s0, 6);
    expect(await stock('fuel_cells')).toBeCloseTo(c0, 6);
    // L'ordre est visible avec ses paliers.
    const { rows: orders } = await pool.query(
      `SELECT steps_done, status FROM work_orders WHERE body_id = $1`,
      [starter],
    );
    expect(orders).toHaveLength(1);
    await pump(30);
    // Naissance par ship_built (voie existante), total débité exact.
    const ships = await fleet(pool, owner);
    expect(ships.some((s) => s.name === 'Staged Mule')).toBe(true);
    expect(s0 - (await stock('steel_l'))).toBeCloseTo(
      HULLS.cargo_s.buildCost.steel_l!,
      2,
    );
    expect(c0 - (await stock('fuel_cells'))).toBeCloseTo(
      HULLS.cargo_s.buildCost.fuel_cells!,
      2,
    );
    const { rows: left } = await pool.query(
      `SELECT 1 FROM work_orders WHERE body_id = $1`,
      [starter],
    );
    expect(left).toHaveLength(0);
  });

  it('STARVED à sec, reprise AUTO au retour du stock (item)', async () => {
    await setStock('steel_l', 3); // 30 requis → ~2 paliers payables (1,5/palier)
    await setStock('silicon', 100);
    await setStock('gold', 40);
    await fabricateGear(pool, owner, starter, 'advanced_refueling_system', FAST);
    await pump(10);
    const { rows: starved } = await pool.query(
      `SELECT status, steps_done FROM work_orders WHERE body_id = $1 AND kind = 'item'`,
      [starter],
    );
    expect(starved).toHaveLength(1);
    expect(starved[0].status).toBe('starved');
    expect(Number(starved[0].steps_done)).toBeLessThan(20);
    const doneSoFar = Number(starved[0].steps_done);
    // Le stock revient : reprise AUTO, l'item naît.
    await setStock('steel_l', 100);
    await pump(30);
    const inv = await listPlanetGear(pool, owner, starter);
    expect(inv.items).toEqual([{ itemKey: 'advanced_refueling_system', count: 1 }]);
    expect(doneSoFar).toBeGreaterThanOrEqual(1);
    const { rows: left } = await pool.query(
      `SELECT 1 FROM work_orders WHERE body_id = $1`,
      [starter],
    );
    expect(left).toHaveLength(0);
  });
});

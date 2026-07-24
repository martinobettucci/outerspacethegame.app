/** @verifies This test file verifies: docs/MASTER_PLAN.md §W7 (reste : bâtiments en usinage partiel); JOURNAL 2026-07-22 (plan W7-bâtiments persisté); docs/SCHEMA.md (migration 040). */
/**
 * Intégration W7-bâtiments — usinage partiel du PLACEMENT et de la
 * MONTÉE de niveau : sur un monde à industrie L3 active, rien n'est
 * payé d'avance ; 20 paliers de 5 % débitent le stock, chaque palier
 * CUMULE investedPaid (PATCH 10-4) ; starved à sec, reprise auto ;
 * activation au 20e par construction_complete (voie existante) ;
 * démolition en cours d'ordre = ordre annulé, remboursement 50 % du
 * DÉJÀ-payé seulement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { BUILDINGS } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { demolishBuilding, placeBuilding } from '../../src/services/planets.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';

const FAST = { timeScale: 1_000_000 };
const handlers = baseHandlers(1_000_000);

async function stock(resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
     WHERE body_id = $1 AND resource = $2`,
    [starter, resource],
  );
  if (!rows[0]) return 0;
  return (
    Number(rows[0].amount_t) +
    (Number(rows[0].rate_t_per_day) * (Date.now() - new Date(rows[0].as_of).getTime())) /
      86_400_000
  );
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

async function drainSteps(maxLoops = 80): Promise<void> {
  for (let i = 0; i < maxLoops; i++) {
    await new Promise((r) => setTimeout(r, 40));
    await processDueEvents(pool, handlers);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL
         AND kind IN ('work_step', 'construction_complete')`,
    );
    if (rows[0].n === 0) return;
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `bp-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Foreman',
    politics: 'industrialist',
    universeSeed: `bp-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Industrie L3 ACTIVE (fixture §15) + unlock du depot.
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce, recipe)
     VALUES ($1, 'smelter', 3, 0, 'active', 0, 'steel_l')`,
    [starter],
  );
  await pool.query(
    `INSERT INTO tech_unlocks (body_id, node_key) VALUES ($1, 'depot')
     ON CONFLICT DO NOTHING`,
    [starter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('W7-bâtiments — usinage partiel', () => {
  it('placement : rien d\'avance, paliers débités, investedPaid cumulé, actif au 20e', async () => {
    const cost = BUILDINGS.depot.placementCost as Record<string, number>;
    const res = Object.keys(cost)[0]!;
    await setStock(res, (cost[res] ?? 0) + 100);
    const before = await stock(res);
    const r = await placeBuilding(pool, owner, starter, 'depot', 1, FAST);
    // Rien d'avance : le stock n'a pas bougé à la commande.
    expect(before - (await stock(res))).toBeLessThan(0.5);
    const { rows: order } = await pool.query(
      `SELECT id FROM work_orders WHERE kind = 'building'
         AND payload->>'buildingId' = $1`,
      [r.buildingId],
    );
    expect(order[0]).toBeTruthy();
    await drainSteps();
    const { rows: b } = await pool.query(
      `SELECT status, config FROM buildings WHERE id = $1`,
      [r.buildingId],
    );
    expect(b[0].status).toBe('active');
    // investedPaid = coût INTÉGRAL cumulé par les 20 paliers.
    expect(Number(b[0].config.investedPaid[res])).toBeCloseTo(cost[res]!, 6);
    expect(before - (await stock(res))).toBeCloseTo(cost[res]!, 1);
  });

  it('starved à sec, reprise ; démolition EN COURS d\'ordre : annulé, 50 % du déjà-payé', async () => {
    const cost = BUILDINGS.depot.placementCost as Record<string, number>;
    const res = Object.keys(cost)[0]!;
    // Détruit le depot précédent pour libérer maxInstances/tuile ? depot
    // est MULTIPLE — on en pose un second, à sec.
    await setStock(res, 0);
    const r = await placeBuilding(pool, owner, starter, 'depot', 2, FAST);
    await drainSteps(15); // retries à vide
    const { rows: o1 } = await pool.query(
      `SELECT status, steps_done FROM work_orders
       WHERE kind = 'building' AND payload->>'buildingId' = $1`,
      [r.buildingId],
    );
    expect(o1[0].status).toBe('starved');
    expect(Number(o1[0].steps_done)).toBe(0);
    // Réapprovisionne JUSTE 5 paliers, laisse tourner, puis démolit.
    await setStock(res, (cost[res]! / 20) * 5 + 0.01);
    await drainSteps(20);
    const { rows: b1 } = await pool.query(
      `SELECT config, status FROM buildings WHERE id = $1`,
      [r.buildingId],
    );
    expect(b1[0].status).toBe('constructing');
    const paidSoFar = Number(b1[0].config.investedPaid?.[res] ?? 0);
    expect(paidSoFar).toBeGreaterThan(0);
    expect(paidSoFar).toBeLessThan(cost[res]!);
    const d = await demolishBuilding(pool, owner, starter, r.buildingId, FAST);
    // Remboursement : 50 % du DÉJÀ-payé uniquement (PATCH 10-4).
    expect(Number(d.refunded[res] ?? 0)).toBeCloseTo(paidSoFar * 0.5, 3);
    const { rows: o2 } = await pool.query(
      `SELECT 1 FROM work_orders WHERE kind = 'building'
         AND payload->>'buildingId' = $1`,
      [r.buildingId],
    );
    expect(o2.length).toBe(0); // ordre annulé
  });
});

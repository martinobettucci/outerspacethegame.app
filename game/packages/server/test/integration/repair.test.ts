/** @verifies This test file verifies: docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Hull wear & shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.7/§8.8. */
/**
 * Intégration réparation d'atelier (DG §8.7) sur vraie base : 5 % HP/h ×
 * mult(1/2/4) à quai de SON monde à workshop ACTIF, acier facturé au
 * stock proportionnellement (0,1 T/HP [TUNE-v1], tout-ou-rien famille),
 * bord hull_repaired au plein (l'acier cesse), acier à sec → réparation
 * stoppée au recompute, monde d'AUTRUI → aucun service (politique P4),
 * usure et réparation se COMPENSENT (net) sur monde hostile.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { setShipHullForTest } from '../../src/services/ships.js';
import { recomputePlanetRates } from '../../src/sim/rebase.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let other = '';
let otherStarter = '';

const handlers = baseHandlers();

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function steelRate(bodyId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT rate_t_per_day FROM planet_stock
     WHERE body_id = $1 AND resource = 'steel_l'`,
    [bodyId],
  );
  return rows[0] ? Number(rows[0].rate_t_per_day) : 0;
}

async function setStock(bodyId: string, resource: string, tons: number) {
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
    [bodyId, resource, tons],
  );
}

async function recompute(bodyId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await recomputePlanetRates(client, bodyId, Date.now());
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `rp-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Wright',
    politics: 'industrialist',
    universeSeed: `rp-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `rp-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Foreign',
    politics: 'mercantile',
    universeSeed: `rp-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  otherStarter = b.spawn.starterPlanetId;
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 1, 0, 'active', 0)`,
    [ownerStarter],
  );
  await setStock(ownerStarter, 'steel_l', 50);
});

afterAll(async () => {
  await pool.end();
});

describe('atelier L1 puis L2 : 96 puis 192 HP/j, acier proportionnel', () => {
  it('coque endommagée à quai : +96 HP/j, acier −9,6 T/j, bord de plein posé', async () => {
    await setShipHullForTest(pool, owner, cargo, 40);
    const s = await ship(cargo);
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(96, 6);
    expect(await steelRate(ownerStarter)).toBeCloseTo(-9.6, 6);
    const { rows: ev } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND kind = 'hull_repaired' AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(ev.length).toBe(1);
  });

  it('workshop L2 : ×2 — +192 HP/j, acier −19,2 T/j', async () => {
    await pool.query(
      `UPDATE buildings SET level = 2 WHERE body_id = $1 AND key = 'workshop'`,
      [ownerStarter],
    );
    await recompute(ownerStarter);
    const s = await ship(cargo);
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(192, 6);
    expect(await steelRate(ownerStarter)).toBeCloseTo(-19.2, 6);
  });
});

describe('acier à sec : la réparation s\'arrête (tout-ou-rien famille)', () => {
  it('stock steel_l vidé → taux 0 au recompute ; restauré → repart', async () => {
    await setStock(ownerStarter, 'steel_l', 0);
    await recompute(ownerStarter);
    expect(Number((await ship(cargo)).hull_wear_hp_per_day)).toBe(0);
    await setStock(ownerStarter, 'steel_l', 50);
    await recompute(ownerStarter);
    expect(Number((await ship(cargo)).hull_wear_hp_per_day)).toBeCloseTo(192, 6);
  });
});

describe('W9g : payable en acier LOURD (léger d\'abord, lourd au barème dense)', () => {
  it('steel_l à sec mais steel_h en stock → la réparation SERT, lourd débité à 0,05 T/HP', async () => {
    await setShipHullForTest(pool, owner, cargo, 40);
    await setStock(ownerStarter, 'steel_l', 0);
    await setStock(ownerStarter, 'steel_h', 20);
    await recompute(ownerStarter);
    // L2 : 192 HP/j servis par le LOURD seul : −192 × 0,05 = −9,6 T/j.
    expect(Number((await ship(cargo)).hull_wear_hp_per_day)).toBeCloseTo(192, 6);
    const { rows: h } = await pool.query(
      `SELECT rate_t_per_day FROM planet_stock
       WHERE body_id = $1 AND resource = 'steel_h'`,
      [ownerStarter],
    );
    expect(Number(h[0].rate_t_per_day)).toBeCloseTo(-9.6, 6);
    expect(await steelRate(ownerStarter)).toBe(0); // le léger n'est pas touché
    // Les DEUX à sec → la réparation s'arrête.
    await setStock(ownerStarter, 'steel_h', 0);
    await recompute(ownerStarter);
    expect(Number((await ship(cargo)).hull_wear_hp_per_day)).toBe(0);
    // Restauration pour les cas suivants.
    await setStock(ownerStarter, 'steel_l', 50);
    await recompute(ownerStarter);
    expect(Number((await ship(cargo)).hull_wear_hp_per_day)).toBeCloseTo(192, 6);
  });
});

describe('plein : hull_repaired coupe l\'acier', () => {
  it('à ~100 ms du plein, l\'événement matérialise 80/80 et le besoin tombe', async () => {
    // 80 − 192 × (0,1 s / 86 400 s) ≈ 79,99978 — bord à ~100 ms.
    await setShipHullForTest(pool, owner, cargo, 80 - 192 * (0.1 / 86_400));
    await new Promise((r) => setTimeout(r, 300));
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const s = await ship(cargo);
    expect(Number(s.hull_hp)).toBeCloseTo(80, 4);
    expect(Number(s.hull_wear_hp_per_day)).toBe(0);
    expect(await steelRate(ownerStarter)).toBe(0);
  });
});

describe('monde d\'AUTRUI : aucun service (politique whom-to-serve P4)', () => {
  it('coque endommagée à quai chez autrui (atelier actif) : taux 0', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'workshop', 1, 0, 'active', 0)`,
      [otherStarter],
    );
    await setStock(otherStarter, 'steel_l', 50);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, docked_body_id, docked_at, fuel, hull_hp, hull_as_of)
       VALUES ($1, 'cargo', 's', $2,
          (SELECT x FROM bodies WHERE id = $3),
          (SELECT y FROM bodies WHERE id = $3),
          'docked', $3, now(), '{"cold": 5}', 40, now()) RETURNING id`,
      [owner, `rp-guest-${run}`, otherStarter],
    );
    await recompute(otherStarter);
    expect(Number((await ship(rows[0]!.id)).hull_wear_hp_per_day)).toBe(0);
  });
});

describe('monde hostile + atelier : usure et réparation se compensent', () => {
  it('monde CHAUD possédé, atelier L1, sans bouclier : net = 96 − 4 = 92', async () => {
    // Monde chaud possédé par fixture (l'acquisition de mondes non-starter
    // est couverte par la colonisation ; ici la règle de NET est le sujet).
    const { rows: hw } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles, owner_id, population)
       VALUES ('planet', $1,
          (SELECT x + 50 FROM bodies WHERE id = $2),
          (SELECT y FROM bodies WHERE id = $2),
          $1, 's', 'hot', 'F', 6, $3, 100) RETURNING id`,
      [`rp-hot-${run}`, ownerStarter, owner],
    );
    const hotId = hw[0]!.id;
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'workshop', 1, 0, 'active', 0)`,
      [hotId],
    );
    await setStock(hotId, 'steel_l', 50);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, docked_body_id, docked_at, fuel, hull_hp, hull_as_of)
       VALUES ($1, 'cargo', 's', $2,
          (SELECT x FROM bodies WHERE id = $3),
          (SELECT y FROM bodies WHERE id = $3),
          'docked', $3, now(), '{"cold": 5}', 40, now()) RETURNING id`,
      [owner, `rp-hotdock-${run}`, hotId],
    );
    await recompute(hotId);
    const s = await ship(rows[0]!.id);
    // +96 (atelier L1) − 4 (climat chaud sans bouclier) = +92 HP/j.
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(92, 6);
  });
});

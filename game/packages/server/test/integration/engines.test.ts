/**
 * Intégration W2 : moteurs typés à l'usinage (MASTER_PLAN W2, JOURNAL
 * 2026-07-21) sur vraie base — outillage du chantier (recipe
 * engine_<type>, retool 24 h patron industrie), moteur FIGÉ au build
 * (défaut étoile natale), plein de naissance du type MOTEUR, refuel et
 * transferts contraints au type moteur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { retoolBuilding } from '../../src/services/planets.js';
import { buildShip, fleet, refuelShip, transferFuel } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let haulerId = '';
let yardId = '';
let natal: 'cold' | 'hot' | 'gas' = 'cold';
let other: 'cold' | 'hot' | 'gas' = 'gas';

const FAST = { timeScale: 1_000_000 };

/**
 * Draine les événements du chantier (retool_complete, ship_built…) —
 * on attend les NON TRAITÉS, dus ou pas : à cette échelle un retool
 * « 24 h » n'est dû que ~86 ms après l'enqueue, et une garde `due_at <=
 * now()` sortirait avant qu'il le devienne (flake observé).
 */
async function processAll(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL
         AND kind IN ('ship_built', 'retool_complete')`,
    );
    if (rows[0].n === 0) return;
  }
  throw new Error('événements de chantier jamais tous traités');
}

beforeAll(async () => {
  pool = await createTestPool();
  // Politics 'scientific' : PAS de retool instantané Industrialist — le
  // chemin standard 24 h [TUNE] est celui testé ici.
  const a = await registerPlayer(pool, {
    email: `engine-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Enginewright',
    politics: 'scientific',
    universeSeed: `engine-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  haulerId = a.spawn.cargoShipId;
  // Type NATAL (étoile la plus proche du starter) et type CIBLE du retool.
  const { rows: coords } = await pool.query(
    `SELECT x, y FROM bodies WHERE id = $1`,
    [starter],
  );
  const { rows: star } = await pool.query(
    `SELECT star_fuel_type FROM bodies
     WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
     ORDER BY (x - $1)^2 + (y - $2)^2 LIMIT 1`,
    [coords[0].x, coords[0].y],
  );
  natal = star[0].star_fuel_type;
  other = natal === 'gas' ? 'hot' : 'gas';
  // Chantier actif + trésorerie (on teste les COMMANDES, pas la rareté) :
  // deux Cargo S (40 steel_l + 10 fuel_cells chacun) + pleins de naissance.
  const { rows: yard } = await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'shipyard', 1, 0, 'active', 0) RETURNING id`,
    [starter],
  );
  yardId = yard[0].id;
  for (const [res, qty] of [
    ['steel_l', 200],
    ['fuel_cells', 60],
    [`fuel_${natal}`, 100],
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

describe('W2 — moteurs typés à l\'usinage', () => {
  it('défaut : la coque naît au moteur NATAL, plein 25 % du type moteur', async () => {
    const r = await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 's', name: 'Natal Mule' },
      FAST,
    );
    expect(r.engine).toBe(natal);
    await processAll();
    const ships = await fleet(pool, owner);
    const mule = ships.find((s) => s.name === 'Natal Mule')!;
    expect(mule.engineType).toBe(natal);
    // Cargo S : 60 u × 0,25 = 15 u puisées au stock fuel_<natal>.
    expect(mule.fuel).toEqual({ [natal]: 15 });
  });

  it('moteur ≠ outillage : refus explicite (rééquiper d\'abord)', async () => {
    await expect(
      buildShip(
        pool,
        owner,
        starter,
        { category: 'cargo', size: 's', name: 'Refusée', engine: other },
        FAST,
      ),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('retool moteur : outillage inconnu refusé, chantier ARRÊTÉ pendant le retool, puis usine le nouveau type', async () => {
    await expect(
      retoolBuilding(pool, owner, starter, yardId, 'engine_plasma', FAST),
    ).rejects.toMatchObject({ code: 'recipe_invalid' });

    const r = await retoolBuilding(pool, owner, starter, yardId, `engine_${other}`, FAST);
    expect(r.instant).toBe(false);
    expect(r.completesAt).toBeTruthy();
    // Pendant le retool : le chantier n'est plus actif, AUCUNE quille.
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 's', name: 'Pendant' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });

    await processAll();
    const { rows: b } = await pool.query(
      `SELECT status, recipe FROM buildings WHERE id = $1`,
      [yardId],
    );
    expect(b[0]).toMatchObject({ status: 'active', recipe: `engine_${other}` });

    // Le défaut (natal) n'est PLUS outillé ici ; le nouveau type l'est.
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 's', name: 'Natale 2' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Pas de fuel_<other> en stock : naissance à SEC (partiel annoncé).
    const r2 = await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 's', name: 'Retooled Mule', engine: other },
      FAST,
    );
    expect(r2.engine).toBe(other);
    await processAll();
    const ships = await fleet(pool, owner);
    const mule = ships.find((s) => s.name === 'Retooled Mule')!;
    expect(mule.engineType).toBe(other);
    expect(mule.fuel).toEqual({ [other]: 0 });
    expect(mule.fuelType).toBe(other);
  });

  it('refuel contraint au moteur : refusé sans fuel_<moteur> au stock, servi quand il y en a', async () => {
    const ships = await fleet(pool, owner);
    const mule = ships.find((s) => s.name === 'Retooled Mule')!;
    // Le monde n'a QUE du fuel_<natal> : la coque <other> repart bredouille.
    await expect(
      refuelShip(pool, owner, mule.id, { units: 10 }),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, 50, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = 50, rate_t_per_day = 0, as_of = now()`,
      [starter, `fuel_${other}`],
    );
    const r = await refuelShip(pool, owner, mule.id, { units: 10 });
    expect(r.fuelType).toBe(other);
    expect(r.loaded).toBeCloseTo(10, 6);
  });

  it('transfert refusé entre moteurs différents (même à couple, même monde)', async () => {
    const ships = await fleet(pool, owner);
    const mule = ships.find((s) => s.name === 'Retooled Mule')!;
    const hauler = ships.find((s) => s.id === haulerId)!;
    expect(hauler.engineType).toBe(natal);
    await expect(
      transferFuel(pool, owner, mule.id, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

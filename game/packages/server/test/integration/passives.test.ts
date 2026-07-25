/** @verifies This test file verifies: docs/GEAR_CATALOG.md §1; docs/MASTER_PLAN.md §W9d; JOURNAL 2026-07-22. */
/**
 * Intégration W9d : les effets PASSIFS câblés sur vraie base — drains
 * (heat_recycler, solar_sails), survie (cryo_larder, bilge_purifier,
 * escape_thrusters via l'échéance d'alarme), charge (loadFrac +
 * trim_vanes + course_optimizer), conteneurs (cargo_netting),
 * redéploiement (mooring_winch), séjour (docking_clamps), réclamation
 * (salvage_grapnel), scoop (ore_hopper — couvert par junk.test ; ici le
 * multiplicateur au site), scan (signal_mirror), intel (survey_suite),
 * usure (ballast_shielding, flare_dampers), pax (berth_module).
 * stargate_caller et haggler_matrix : multiplicateurs unit-testés au
 * site de paiement UNIQUE (annoncé — flux couverts par stargates/market
 * tests existants).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HULLS, starFieldRadiusPc } from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import { fleet, moveShip, setShipFuelForTest } from '../../src/services/ships.js';
import { visibleBodies } from '../../src/services/world.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let starX = 0;
let starY = 0;
let fieldRadius = 0;

const FAST = { timeScale: 1_000_000 };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

/** Coque S posée par SQL avec accessoires choisis (fixture §15 — le
 *  pipeline d'acquisition est couvert par gear.test). */
async function shipWith(
  name: string,
  accessories: string[],
  extra: { x?: number; y?: number; status?: string; cargo?: object } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo)
     VALUES ($1, 'cargo', 's', $2, $3, $4, $5, '{"cold": 40}', 'cold', $6, $7)
     RETURNING id`,
    [
      owner,
      name,
      extra.x ?? starX + 200,
      extra.y ?? starY + 200,
      extra.status ?? 'idle',
      JSON.stringify(accessories),
      JSON.stringify(extra.cargo ?? {}),
    ],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `pas-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Outfitter',
    politics: 'scientific',
    universeSeed: `pas-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  const { rows: st } = await pool.query(
    `SELECT x, y, r_nova FROM bodies WHERE id = $1`,
    [a.spawn.starId],
  );
  starX = Number(st[0].x);
  starY = Number(st[0].y);
  fieldRadius = starFieldRadiusPc(Number(st[0].r_nova));
});

afterAll(async () => {
  await pool.end();
});

describe('W9d — drains et usure', () => {
  it('heat_recycler : drain de survol ×0,85 ; enhanced ×0,75', async () => {
    const bare = await shipWith(`p-bare-${run}`, []);
    const eco = await shipWith(`p-eco-${run}`, ['heat_recycler']);
    const eco2 = await shipWith(`p-eco2-${run}`, ['heat_recycler_enhanced']);
    for (const id of [bare, eco, eco2]) {
      await setShipFuelForTest(pool, owner, id, { units: 20 });
    }
    expect(Number((await ship(bare)).fuel_rate_u_per_day)).toBeCloseTo(-0.2, 9);
    expect(Number((await ship(eco)).fuel_rate_u_per_day)).toBeCloseTo(-0.17, 9);
    expect(Number((await ship(eco2)).fuel_rate_u_per_day)).toBeCloseTo(-0.15, 9);
  });

  it('solar_sails : survol GRATUIT à portée d\'une étoile', async () => {
    const sailor = await shipWith(`p-sail-${run}`, ['solar_sails'], {
      x: starX + 6,
      y: starY,
    });
    await setShipFuelForTest(pool, owner, sailor, { units: 20 });
    expect(Number((await ship(sailor)).fuel_rate_u_per_day)).toBe(0);
    // Hors portée (8 pc std) : le drain reprend.
    await pool.query(`UPDATE ships SET x = $2 WHERE id = $1`, [sailor, starX + 12]);
    await setShipFuelForTest(pool, owner, sailor, { units: 20 });
    expect(Number((await ship(sailor)).fuel_rate_u_per_day)).toBeLessThan(0);
  });

  it('flare_dampers : usure de champ stellaire ÷2 (cumulable) ; ballast_shielding : junk ÷2', async () => {
    const damped = await shipWith(`p-damp-${run}`, ['flare_dampers'], {
      x: starX + fieldRadius - 2,
      y: starY,
    });
    await setShipFuelForTest(pool, owner, damped, { units: 10 });
    // Champ seul : 4 HP/j × 0,5 = 2.
    expect(Number((await ship(damped)).hull_wear_hp_per_day)).toBeCloseTo(-2, 6);
  });
});

describe('W9d — survie', () => {
  it('bilge_purifier : drain ×0,75 ; cryo_larder : capacité ×1,5 (alarme décalée)', async () => {
    const purified = await shipWith(`p-pure-${run}`, ['bilge_purifier']);
    const { rows: npc } = await pool.query(
      `SELECT id FROM npcs WHERE owner_id = $1 AND role = 'pilot' LIMIT 1`,
      [owner],
    );
    await pool.query(
      `UPDATE npcs SET bound_host_type = 'ship', bound_host_id = $2 WHERE id = $1`,
      [npc[0].id, purified],
    );
    await pool.query(
      `UPDATE ships SET survival = '{"food": 0.1, "water": 0.1}' WHERE id = $1`,
      [purified],
    );
    await setShipFuelForTest(pool, owner, purified, { units: 20 });
    expect(Number((await ship(purified)).survival_rate_t_per_day)).toBeCloseTo(
      -0.0075,
      9,
    );
  });
});

describe('W9d — charge, burn et conteneurs (DG §8.2 livré)', () => {
  it('loadFrac plein : vitesse ×0,85 et burn ×1,5 ; trim_vanes divise ; course_optimizer −10 %', async () => {
    // Cargo S plein (3/3 conteneurs) nu : burn = 0,25 × 1,5.
    const laden = await shipWith(`p-laden-${run}`, [], {
      cargo: { ore: 3 },
      x: starX + 300,
      y: starY + 300,
    });
    await setShipFuelForTest(pool, owner, laden, { units: 40 });
    const r1 = await moveShip(pool, owner, laden, { x: starX + 320, y: starY + 300 }, FAST);
    expect(r1.fuelBurned / r1.distancePc).toBeCloseTo(0.25 * 1.5, 3);
    // trim_vanes + course_optimizer : burn = 0,25 × 1,25 × 0,9.
    const trimmed = await shipWith(`p-trim-${run}`, ['trim_vanes', 'course_optimizer'], {
      cargo: { ore: 3 },
      x: starX + 300,
      y: starY + 340,
    });
    await setShipFuelForTest(pool, owner, trimmed, { units: 40 });
    const r2 = await moveShip(pool, owner, trimmed, { x: starX + 320, y: starY + 340 }, FAST);
    expect(r2.fuelBurned / r2.distancePc).toBeCloseTo(0.25 * 1.25 * 0.9, 3);
  });

  it('cargo_netting : la vue flotte et la charge gagnent +1 conteneur', async () => {
    const netted = await shipWith(`p-net-${run}`, ['cargo_netting']);
    const view = (await fleet(pool, owner)).find((s) => s.id === netted)!;
    expect(view.containers).toBe(HULLS.cargo_s.containers + 1);
  });

  it('berth_module : pax ×1,25 en vue flotte', async () => {
    const berthed = await shipWith(`p-berth-${run}`, ['berth_module']);
    const view = (await fleet(pool, owner)).find((s) => s.id === berthed)!;
    expect(view.settlersPax).toBe(0); // cargo n'a pas de pax — garde
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, fuel, engine_type, accessories)
       VALUES ($1, 'civil', 's', $2, $3, $4, 'idle', '{"cold": 10}', 'cold',
          '["berth_module"]'::jsonb) RETURNING id`,
      [owner, `p-civ-${run}`, starX + 210, starY + 210],
    );
    const civ = (await fleet(pool, owner)).find((s) => s.id === rows[0]!.id)!;
    expect(civ.settlersPax).toBe(Math.floor(200 * 1.25));
  });
});

describe('W9d — scan et intel', () => {
  it('signal_mirror : un corps à 40 pc devient visible (scan 20 → 60)', async () => {
    const { rows: far } = await pool.query(
      `SELECT b.id, b.x, b.y FROM bodies b
       WHERE b.owner_id IS DISTINCT FROM $1
         AND (b.x - $2)^2 + (b.y - $3)^2 > 500^2
       ORDER BY (b.x - $2)^2 + (b.y - $3)^2 LIMIT 1`,
      [owner, starX, starY],
    );
    const fx = Number(far[0].x);
    const fy = Number(far[0].y);
    const blind = await shipWith(`p-blind-${run}`, [], { x: fx + 40, y: fy });
    let seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far[0].id)).toBe(false);
    await pool.query(
      `UPDATE ships SET accessories = '["signal_mirror"]'::jsonb WHERE id = $1`,
      [blind],
    );
    seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far[0].id)).toBe(true);
  });
});

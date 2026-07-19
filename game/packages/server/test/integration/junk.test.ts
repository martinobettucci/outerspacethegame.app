/**
 * Intégration champs de junk (GB §22, DG §10.4) sur vraie base : largage
 * (zone starter 50 pc interdite, quota 5/jour, trou noir = puits propre,
 * fusion par cellule de 0,5 pc avec décroissance 10 %/j matérialisée),
 * dégâts de présence via l'usure de coque, collecte au collector (atelier
 * L2, scoop 30 T/24 h-jeu, conteneurs libres), junk d'épave de supernova
 * (carcasse + fret), visibilité sous scope. Refus §10 directs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  collectJunk,
  dumpCargo,
  fitJunkCollector,
  visibleJunkFields,
} from '../../src/services/junk.js';
import { setShipFuelForTest } from '../../src/services/ships.js';
import {
  BASE_SKY_PC,
  PROBE_SCAN_PC,
  SHIP_SCAN_PC,
  TELESCOPE_SCOPE_PC_PER_LEVEL,
} from '../../src/services/world.js';
import { enqueue, processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let other = '';
let farX = 0;
let farY = 0;

const handlers = baseHandlers();
const scopeCfg = {
  baseSkyPc: BASE_SKY_PC,
  telescopePcPerLevel: TELESCOPE_SCOPE_PC_PER_LEVEL,
  probePc: PROBE_SCAN_PC,
  shipPc: SHIP_SCAN_PC,
};

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function fieldAtCell(x: number, y: number) {
  const { rows } = await pool.query(
    `SELECT * FROM junk_fields WHERE cell_x = $1 AND cell_y = $2`,
    [Math.floor(x / 0.5), Math.floor(y / 0.5)],
  );
  return rows[0];
}

async function idleAt(shipId: string, x: number, y: number, cargoObj: object) {
  await pool.query(
    `UPDATE ships SET status = 'idle', x = $2, y = $3, cargo = $4,
       docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL
     WHERE id = $1`,
    [shipId, x, y, JSON.stringify(cargoObj)],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `jk-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Scrapper',
    politics: 'industrialist',
    universeSeed: `jk-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `jk-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'FarAway',
    politics: 'mercantile',
    universeSeed: `jk-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  const { rows } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
    ownerStarter,
  ]);
  // Point de largage : à 60 pc du starter (hors zone interdite de 50 pc).
  farX = Number(rows[0].x) + 60;
  farY = Number(rows[0].y);
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 2, 0, 'active', 0)`,
    [ownerStarter],
  );
  for (const [res, tons] of [
    ['steel_l', 50],
    ['silicon', 20],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $3, as_of = now()`,
      [ownerStarter, res, tons],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('largage : zone starter, quota, fusion, décroissance', () => {
  it('à ≤ 50 pc d\'un starter : refus (anti-grief canon)', async () => {
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL, cargo = '{"ore": 20}' WHERE id = $1`,
      [cargo],
    );
    await expect(
      dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 2 }),
    ).rejects.toThrow(/Zone protégée/);
  });

  it('dans le vide : le champ naît dans la cellule, la soute descend', async () => {
    await idleAt(cargo, farX, farY, { ore: 20 });
    const res = await dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 3 });
    expect(res.sunk).toBe(false);
    const f = await fieldAtCell(farX, farY);
    expect(Number(f.amount_t)).toBeCloseTo(3, 6);
    expect(Number((await ship(cargo)).cargo.ore)).toBeCloseTo(17, 6);
  });

  it('fusion par cellule + décroissance MATÉRIALISÉE (0,9^j) à l\'apport', async () => {
    await pool.query(
      `UPDATE junk_fields SET as_of = now() - interval '1 day'
       WHERE cell_x = $1 AND cell_y = $2`,
      [Math.floor(farX / 0.5), Math.floor(farY / 0.5)],
    );
    await dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 2 });
    const f = await fieldAtCell(farX, farY);
    // 3 × 0,9 + 2 = 4,7 T.
    expect(Number(f.amount_t)).toBeCloseTo(4.7, 3);
  });

  it('quota : 5 largages/jour réel, le 6e est refusé', async () => {
    for (let i = 0; i < 3; i++) {
      await dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 1 });
    }
    await expect(
      dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 1 }),
    ).rejects.toThrow(/Quota de largage/);
  });

  it('§10 : autrui ne largue pas depuis MA coque ; soute insuffisante refusée', async () => {
    await expect(
      dumpCargo(pool, other, cargo, { resource: 'ore', tons: 1 }),
    ).rejects.toThrow(/obéit pas/);
    await pool.query(`UPDATE ships SET dump_count = 0 WHERE id = $1`, [cargo]);
    await expect(
      dumpCargo(pool, owner, cargo, { resource: 'gold', tons: 1 }),
    ).rejects.toThrow(/Soute insuffisante/);
  });

  it('trou noir ≤ 5 pc : le fret disparaît, aucun champ (puits canon)', async () => {
    const bx = farX + 5000;
    await pool.query(
      `INSERT INTO bodies (body_type, name, x, y, seed)
       VALUES ('black_hole', $1, $2, $3, $1)`,
      [`jk-bh-${run}`, bx, farY],
    );
    await idleAt(cargo, bx + 3, farY, { ore: 10 });
    const res = await dumpCargo(pool, owner, cargo, { resource: 'ore', tons: 4 });
    expect(res.sunk).toBe(true);
    expect(await fieldAtCell(bx + 3, farY)).toBeUndefined();
  });
});

describe('dégâts de présence (usure) et collecte', () => {
  it('s\'attarder dans la cellule use : −(tonnage × 0,5) HP/j', async () => {
    await idleAt(cargo, farX, farY, {});
    await setShipFuelForTest(pool, owner, cargo, { units: 10 });
    const f = await fieldAtCell(farX, farY);
    const tons = Number(f.amount_t); // ≈ 4,7 − micro-décroissance
    const s = await ship(cargo);
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(-tons * 0.5, 2);
  });

  it('collector : L2 exigé au montage, coût payé, §10', async () => {
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [cargo, ownerStarter],
    );
    await expect(fitJunkCollector(pool, other, cargo)).rejects.toThrow(/obéit pas/);
    await fitJunkCollector(pool, owner, cargo);
    expect((await ship(cargo)).junk_collector).toBe(true);
    const { rows } = await pool.query(
      `SELECT amount_t FROM planet_stock
       WHERE body_id = $1 AND resource = 'steel_l'`,
      [ownerStarter],
    );
    expect(Number(rows[0].amount_t)).toBeCloseTo(35, 3);
    await expect(fitJunkCollector(pool, owner, cargo)).rejects.toThrow(/déjà monté/);
  });

  it('scoop : min(30, champ, conteneurs libres), champ décrémenté, cooldown', async () => {
    await idleAt(cargo, farX, farY, {});
    const before = Number((await fieldAtCell(farX, farY)).amount_t);
    const res = await collectJunk(pool, owner, cargo, { timeScale: 1 });
    // Cargo S : 3 conteneurs libres ⇒ scoop = min(30, champ≈4,7, 3) = 3.
    expect(res.collected).toBeCloseTo(3, 2);
    const s = await ship(cargo);
    expect(Number(s.cargo.junk)).toBeCloseTo(3, 2);
    expect(Number((await fieldAtCell(farX, farY)).amount_t)).toBeCloseTo(
      before - 3,
      1,
    );
    await expect(collectJunk(pool, owner, cargo, { timeScale: 1 })).rejects.toThrow(
      /en cycle/,
    );
  });

  it('cooldown écoulé (24 h-jeu ÷ timeScale) : re-scoop, soute pleine refusée', async () => {
    // À ×3 600 000, le cycle de 24 h-jeu dure 24 ms réels.
    await new Promise((r) => setTimeout(r, 40));
    await expect(
      collectJunk(pool, owner, cargo, { timeScale: 3_600_000 }),
    ).rejects.toThrow(/Soute pleine/);
  });
});

describe('épaves de supernova → junk (GB §22)', () => {
  it('la coque annihilée devient carcasse + fret dans sa cellule', async () => {
    const sx = farX + 9000;
    const { rows: st } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, star_class,
          star_fuel_type, star_fuel_stock, star_fuel_initial,
          star_fuel_rate_u_per_day, star_fuel_as_of, r_nova)
       VALUES ('star', $1, $2, $3, $1, 's', 'cold', 0, 1000, -1, now(), 40)
       RETURNING id`,
      [`jk-star-${run}`, sx, farY],
    );
    const { rows: victim } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, fuel, cargo)
       VALUES ($1, 'cargo', 's', $2, $3, $4, 'idle', '{"cold": 5}',
          '{"ore": 5}') RETURNING id`,
      [owner, `jk-victim-${run}`, sx + 1, farY],
    );
    const client = await pool.connect();
    try {
      await enqueue(client, 'star_supernova', new Date(), { bodyId: st[0]!.id });
    } finally {
      client.release();
    }
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    expect(await ship(victim[0]!.id)).toBeUndefined();
    const f = await fieldAtCell(sx + 1, farY);
    // Carcasse S (10 T [TUNE-v1]) + 5 T de fret répandu.
    expect(Number(f.amount_t)).toBeCloseTo(15, 3);
  });
});

describe('visibilité : sous scope seulement', () => {
  it('le propriétaire voit son champ (vision de coque), l\'autre poche non', async () => {
    await idleAt(cargo, farX, farY, { junk: 3 });
    const mine = await visibleJunkFields(pool, owner, scopeCfg);
    expect(mine.some((f) => Math.abs(f.x - farX) < 1)).toBe(true);
    const theirs = await visibleJunkFields(pool, other, scopeCfg);
    expect(theirs.some((f) => Math.abs(f.x - farX) < 1)).toBe(false);
  });
});

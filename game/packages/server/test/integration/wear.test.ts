/** @verifies This test file verifies: docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Hull wear & shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.7/§8.8. */
/**
 * Intégration usure de coque & adaptations (GB §27 SETTLED, DG §8.8 ;
 * W5 2026-07-21) sur vraie base : coque MORPHIQUE (adaptation = temps
 * seul, sur place, une chimie active à la fois, §10), péage 5 % HP
 * max/jour par source hostile NON blindée — climat hot/cold du monde
 * sous la coque (tempéré : jamais), zone ≤ 5 pc d'un trou noir ou d'une
 * étoile en FLARE (radio), CHAMPS climatiques stellaires (0,5 × r_nova,
 * W5), dégâts de proximité du harvest rig (d < d_safe, cumul additif) —
 * plancher canon 1 HP (péage, jamais une mort).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  
  setStarStockForTest,
  startHarvest,
} from '../../src/services/harvest.js';
import {
  fleet,
  morphShield,
  relocateShipForTest,
  setShipFuelForTest,
} from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

const FAST = { timeScale: 1_000_000 };

/** Morphose complète (24 h-jeu ÷ 1e6 ≈ 86 ms réels) puis bord traité. */
async function morphNow(
  poolRef: pg.Pool,
  playerId: string,
  shipId: string,
  kind: 'hot' | 'cold' | 'radio',
): Promise<void> {
  await morphShield(poolRef, playerId, shipId, kind, FAST);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    await processDueEvents(poolRef, baseHandlers());
    const { rows } = await poolRef.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'shield_morph_complete'`,
    );
    if (rows[0].n === 0) return;
  }
  throw new Error('morphose jamais réglée');
}

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let starId = '';
let starX = 0;
let starY = 0;
let starType = '';
let other = '';
let hotWildId = '';

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function newDockedShip(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, docked_body_id, docked_at, fuel)
     VALUES ($1, 'cargo', 's', $2,
        (SELECT x FROM bodies WHERE id = $3),
        (SELECT y FROM bodies WHERE id = $3),
        'docked', $3, now(), $4) RETURNING id`,
    [owner, name, ownerStarter, JSON.stringify({ [starType]: 10 })],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `wr-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Wearer',
    politics: 'industrialist',
    universeSeed: `wr-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `wr-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Other',
    politics: 'mercantile',
    universeSeed: `wr-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  starId = a.spawn.starId;
  other = b.playerId;
  const { rows: st } = await pool.query(`SELECT * FROM bodies WHERE id = $1`, [
    starId,
  ]);
  starX = Number(st[0].x);
  starY = Number(st[0].y);
  starType = String(st[0].star_fuel_type);
  // Monde SAUVAGE chaud, posé sur un point CLAIR (≥ 52 pc de toute
  // étoile — W5 : un champ climatique stellaire fausserait le péage).
  let hx = starX + 60;
  let hy = starY + 60;
  for (let k = 1; k <= 40; k++) {
    const cx = starX + 300 + 137 * k;
    const cy = starY + 240 + 91 * k;
    const { rows: near } = await pool.query(
      `SELECT 1 FROM bodies
       WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
         AND (x - $1)^2 + (y - $2)^2 <= 52^2 LIMIT 1`,
      [cx, cy],
    );
    if (!near[0]) {
      hx = cx;
      hy = cy;
      break;
    }
  }
  const { rows: hw } = await pool.query<{ id: string }>(
    `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
        tiles, population)
     VALUES ('planet', $1, $2, $3, $4, 's', 'hot', 'F', 6, 0) RETURNING id`,
    [`wr-hot-${run}`, hx, hy, `wr-hot-${run}`],
  );
  hotWildId = hw[0]!.id;
  // Atelier L2 + matières des accessoires sur le starter.
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 1, 0, 'active', 0)`,
    [ownerStarter],
  );
  for (const [res, tons] of [
    ['steel_l', 100],
    ['crystal_hot', 20],
    ['crystal_cold', 20],
    ['crystal_nox', 20],
    ['crystal_temperate', 20],
    ['gold', 20],
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

/** W5 : place un corps sur un point CLAIR (≥ 52 pc de toute étoile) —
 *  les champs climatiques stellaires rendraient les attentes de péage
 *  dépendantes du seed. */
async function moveToClearSpace(bodyOrShipSql: string, id: string): Promise<{ x: number; y: number }> {
  for (let k = 1; k <= 40; k++) {
    const cx = starX + 500 + 137 * k;
    const cy = starY + 400 + 91 * k;
    const { rows } = await pool.query(
      `SELECT 1 FROM bodies
       WHERE body_type = 'star' AND star_fuel_type IS NOT NULL
         AND (x - $1)^2 + (y - $2)^2 <= 52^2 LIMIT 1`,
      [cx, cy],
    );
    if (!rows[0]) {
      await pool.query(bodyOrShipSql, [id, cx, cy]);
      return { x: cx, y: cy };
    }
  }
  throw new Error('aucun point clair trouvé');
}

describe('W5 — coque morphique (temps seul, sur place, une chimie, §10)', () => {
  it('morphose hot : aucun coût, aucun atelier, coque immobilisée, puis LA SEULE active', async () => {
    const { rows: before } = await pool.query(
      `SELECT resource, amount_t FROM planet_stock WHERE body_id = $1
       ORDER BY resource`,
      [ownerStarter],
    );
    const r = await morphShield(pool, owner, cargo, 'hot', FAST);
    expect(r.completesAt).toBeTruthy();
    // Immobilisée pendant la réécriture, seconde morphose refusée.
    await expect(
      morphShield(pool, owner, cargo, 'cold', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Fin de morphose : hot active, seule.
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, 50));
      await processDueEvents(pool, baseHandlers());
      const s0 = await ship(cargo);
      if (!s0.morphing_shield) break;
    }
    const s = await ship(cargo);
    expect(s.shield_hot).toBe(true);
    expect(s.shield_cold).toBe(false);
    expect(s.morphing_shield).toBeNull();
    // TEMPS SEUL : aucun stock consommé.
    const { rows: after } = await pool.query(
      `SELECT resource, amount_t FROM planet_stock WHERE body_id = $1
       ORDER BY resource`,
      [ownerStarter],
    );
    expect(after).toEqual(before);
    await expect(
      morphShield(pool, owner, cargo, 'hot', FAST),
    ).rejects.toThrow(/déjà active/);
    // Re-morphose vers cold : hot s'éteint (une chimie à la fois).
    await morphNow(pool, owner, cargo, 'cold');
    const s2 = await ship(cargo);
    expect(s2.shield_cold).toBe(true);
    expect(s2.shield_hot).toBe(false);
    // Retour hot pour la suite de la suite.
    await morphNow(pool, owner, cargo, 'hot');
  });

  it('§10 : autrui ne morphe pas MA coque ; la sonde jamais', async () => {
    await expect(morphShield(pool, other, cargo, 'cold')).rejects.toThrow(
      /obéit pas/,
    );
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'probe' LIMIT 1`,
      [owner],
    );
    if (rows[0]) {
      await expect(morphShield(pool, owner, rows[0].id, 'hot')).rejects.toThrow(
        /sonde/,
      );
    }
  });
});

describe('péage climatique : 5 % HP max/jour, tempéré jamais', () => {
  it('à quai sur monde TEMPÉRÉ : aucune usure', async () => {
    const s = await ship(cargo);
    expect(Number(s.hull_wear_hp_per_day)).toBe(0);
  });

  it('survol d\'un monde CHAUD sans bouclier : −4 HP/j (Cargo S, 80 HP)', async () => {
    const bare = await newDockedShip(`wr-bare-${run}`);
    await relocateShipForTest(pool, owner, bare, hotWildId);
    const s = await ship(bare);
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(-4, 6);
    expect(Number(s.hull_hp)).toBeCloseTo(80, 3);
  });

  it('avec le bouclier apparié : le péage cesse', async () => {
    await relocateShipForTest(pool, owner, cargo, hotWildId); // shield_hot monté
    const s = await ship(cargo);
    expect(Number(s.hull_wear_hp_per_day)).toBe(0);
  });
});

describe('zone de hasard ≤ 5 pc : flare et trou noir (radio)', () => {
  it('étoile en FLARE à 3 pc sans shield_radio : −4 HP/j', async () => {
    const scout = await newDockedShip(`wr-scout-${run}`);
    const { rows: init } = await pool.query(
      `SELECT star_fuel_initial FROM bodies WHERE id = $1`,
      [starId],
    );
    await setStarStockForTest(
      pool,
      starId,
      Number(init[0].star_fuel_initial) * 0.04,
    );
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3,
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL
       WHERE id = $1`,
      [scout, starX + 3, starY],
    );
    // Rebase par l'instrumentation fuel (piggyback coque — mêmes points).
    await setShipFuelForTest(pool, owner, scout, { units: 10 });
    const s = await ship(scout);
    // W5 : à 3 pc l'on baigne AUSSI dans le champ climatique de l'étoile
    // (0,5 × r_nova ≥ 20 pc) sans bouclier apparié : 4 (flare) + 4 (champ).
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(-8, 6);
    // L'étoile se rallume (fixture) : le hasard du FLARE cesse au rebase
    // suivant — le CHAMP climatique, lui, demeure (W5).
    await setStarStockForTest(
      pool,
      starId,
      Number(init[0].star_fuel_initial) * 0.5,
    );
    await setShipFuelForTest(pool, owner, scout, { units: 10 });
    expect(Number((await ship(scout)).hull_wear_hp_per_day)).toBeCloseTo(-4, 6);
  });

  it('trou noir à 3 pc sans shield_radio : −4 HP/j ; avec : 0', async () => {
    // W5 : le trou noir est posé sur un point CLAIR (hors de tout champ
    // stellaire) pour isoler la source « hasard radio ».
    const { rows: bhIns } = await pool.query(
      `INSERT INTO bodies (body_type, name, x, y, seed)
       VALUES ('black_hole', $1, 0, 0, $1) RETURNING id`,
      [`wr-bh-${run}`],
    );
    const spot = await moveToClearSpace(
      `UPDATE bodies SET x = $2, y = $3 WHERE id = $1`,
      bhIns[0].id,
    );
    const bx = spot.x;
    const diver = await newDockedShip(`wr-diver-${run}`);
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3,
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL
       WHERE id = $1`,
      [diver, bx + 3, spot.y],
    );
    await setShipFuelForTest(pool, owner, diver, { units: 10 });
    expect(Number((await ship(diver)).hull_wear_hp_per_day)).toBeCloseTo(-4, 6);
    // shield_radio : monté à quai puis retour au trou noir.
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [diver, ownerStarter],
    );
    await morphNow(pool, owner, diver, 'radio');
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3,
         docked_body_id = NULL, docked_at = NULL
       WHERE id = $1`,
      [diver, bx + 3, spot.y],
    );
    await setShipFuelForTest(pool, owner, diver, { units: 10 });
    expect(Number((await ship(diver)).hull_wear_hp_per_day)).toBe(0);
  });
});

describe('dégâts de proximité du rig (d < d_safe) et cumul', () => {
  it('récolte à 2,5 pc d\'une étoile en flare : −(20 + 4) HP/j', async () => {
    const digger = await newDockedShip(`wr-digger-${run}`);
    await pool.query(
      `UPDATE ships SET harvest_rig = true, accessories = accessories || '[\"harvest_rig\"]'::jsonb WHERE id = $1`,
      [digger],
    ); // fixture §15 — l'acquisition par pipeline est couverte par gear.test
    const { rows: init } = await pool.query(
      `SELECT star_fuel_initial FROM bodies WHERE id = $1`,
      [starId],
    );
    await setStarStockForTest(
      pool,
      starId,
      Number(init[0].star_fuel_initial) * 0.04,
    );
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3,
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL
       WHERE id = $1`,
      [digger, starX + 2.5, starY],
    );
    await startHarvest(pool, owner, digger, starId);
    const s = await ship(digger);
    // harvest d_safe : 80 × ((5 − 2,5)/5)² = 20 ; flare ≤ 5 pc : +4 ;
    // W5 champ climatique stellaire (0,5 × r_nova) non blindé : +4.
    expect(Number(s.hull_wear_hp_per_day)).toBeCloseTo(-28, 6);
    expect(Number(s.fuel_rate_u_per_day)).toBeGreaterThan(0); // récolte active
    await setStarStockForTest(
      pool,
      starId,
      Number(init[0].star_fuel_initial) * 0.5,
    ); // fixture restaurée (pas de Starfall ici)
  });
});

describe('plancher canon : le péage ne tue jamais', () => {
  it('une coque usée jusqu\'au bout s\'arrête à 1 HP', async () => {
    const husk = await newDockedShip(`wr-husk-${run}`);
    await pool.query(
      `UPDATE ships SET hull_hp = 1.5, hull_wear_hp_per_day = -4,
         hull_as_of = now() - interval '10 days'
       WHERE id = $1`,
      [husk],
    );
    const view = await fleet(pool, owner);
    const mine = view.find((v) => v.id === husk)!;
    expect(mine.hull.hp).toBe(1);
    expect(mine.hull.maxHp).toBe(80);
  });
});

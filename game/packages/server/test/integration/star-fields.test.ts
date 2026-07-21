/** @verifies This test file verifies: docs/MASTER_PLAN.md §W5; docs/BACKLOG.md §P3 “Hull wear & shields”; GAME_BOOK.md §27; DESIGN_GUIDE.md §8.7/§8.8. */
/**
 * Intégration W5 : champs climatiques stellaires (MASTER_PLAN W5,
 * JOURNAL 2026-07-21) sur vraie base — une étoile diffuse son climat sur
 * 0,5 × r_nova : coque À L'ARRÊT dans le champ sans le bouclier apparié
 * = +5 % HP max/j (additif) ; TRAVERSÉE en transit = péage réglé au bord
 * (longueur d'intersection ÷ vitesse, plancher 1 HP) ; la morphose
 * apparié éteint le péage. (L'exemption à quai est le chemin de code
 * `status !== 'docked'` — couverte par wear.test « à quai : 0 ».)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HULLS, segmentCircleCrossingPc, shieldForStarField, starFieldRadiusPc } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { moveShip, setShipFuelForTest } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let starId = '';
let starX = 0;
let starY = 0;
let fieldRadius = 0;
let fieldShield: string | null = null;

const FAST = { timeScale: 1_000_000 };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function newShipAt(
  name: string,
  x: number,
  y: number,
  shields: Partial<Record<'hot' | 'cold' | 'radio', boolean>> = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, shield_hot, shield_cold, shield_radio)
     VALUES ($1, 'cargo', 's', $2, $3, $4, 'idle', '{"cold": 60}', 'cold',
             $5, $6, $7) RETURNING id`,
    [owner, name, x, y, !!shields.hot, !!shields.cold, !!shields.radio],
  );
  return rows[0]!.id;
}

async function waitArrived(shipId: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await new Promise((res) => setTimeout(res, 60));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(`SELECT status FROM ships WHERE id = $1`, [shipId]);
    if (rows[0].status !== 'transit') return;
  }
  throw new Error('arrivée jamais traitée');
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `field-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Fieldwalker',
    politics: 'scientific',
    universeSeed: `field-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  starId = a.spawn.starId;
  const { rows: st } = await pool.query(
    `SELECT x, y, star_fuel_type, r_nova FROM bodies WHERE id = $1`,
    [starId],
  );
  starX = Number(st[0].x);
  starY = Number(st[0].y);
  fieldRadius = starFieldRadiusPc(Number(st[0].r_nova));
  fieldShield = shieldForStarField(st[0].star_fuel_type);
  expect(fieldRadius).toBeGreaterThanOrEqual(19.9);
  expect(fieldShield).toBeTruthy();
});

afterAll(async () => {
  await pool.end();
});

describe('W5 — champs climatiques stellaires (0,5 × r_nova)', () => {
  it("à l'arrêt DANS le champ sans bouclier : −4 HP/j (Cargo S) ; apparié : 0", async () => {
    const bare = await newShipAt(`fld-bare-${run}`, starX + fieldRadius - 2, starY);
    await setShipFuelForTest(pool, owner, bare, { units: 10 });
    expect(Number((await ship(bare)).hull_wear_hp_per_day)).toBeCloseTo(-4, 6);

    // Le MÊME point avec l'adaptation appariée : le champ ne mord pas.
    const clad = await newShipAt(
      `fld-clad-${run}`,
      starX + fieldRadius - 2,
      starY,
      { [fieldShield as 'hot']: true },
    );
    await setShipFuelForTest(pool, owner, clad, { units: 10 });
    expect(Number((await ship(clad)).hull_wear_hp_per_day)).toBe(0);

    // Juste HORS du champ : rien.
    const out = await newShipAt(`fld-out-${run}`, starX + fieldRadius + 3, starY);
    await setShipFuelForTest(pool, owner, out, { units: 10 });
    expect(Number((await ship(out)).hull_wear_hp_per_day)).toBe(0);
  });

  it('TRAVERSÉE en transit : péage réglé au bord = longueur ÷ vitesse × 4 HP/j', async () => {
    const ax = starX - (fieldRadius + 10);
    const bx2 = starX + (fieldRadius + 10);
    const runner = await newShipAt(`fld-runner-${run}`, ax, starY);
    const before = Number((await ship(runner)).hull_hp ?? 80) || 80;
    await moveShip(pool, owner, runner, { x: bx2, y: starY }, FAST);
    await waitArrived(runner);
    const after = await ship(runner);
    const crossing = segmentCircleCrossingPc(
      ax,
      starY,
      bx2,
      starY,
      starX,
      starY,
      fieldRadius,
    );
    expect(crossing).toBeCloseTo(2 * fieldRadius, 6);
    const expectedToll =
      (crossing / HULLS.cargo_s.speedPcPerDay) * (0.05 * HULLS.cargo_s.armorHp);
    expect(before - Number(after.hull_hp)).toBeCloseTo(expectedToll, 1);

    // La même traversée BLINDÉE : aucun péage.
    const cladRunner = await newShipAt(`fld-cladrun-${run}`, ax, starY, {
      [fieldShield as 'hot']: true,
    });
    await moveShip(pool, owner, cladRunner, { x: bx2, y: starY }, FAST);
    await waitArrived(cladRunner);
    expect(Number((await ship(cladRunner)).hull_hp ?? 80) || 80).toBeCloseTo(80, 1);
  });

  it('plancher 1 HP : la traversée ne tue jamais', async () => {
    const husk = await newShipAt(`fld-husk-${run}`, starX - (fieldRadius + 10), starY);
    await pool.query(
      `UPDATE ships SET hull_hp = 2, hull_as_of = now() WHERE id = $1`,
      [husk],
    );
    await moveShip(
      pool,
      owner,
      husk,
      { x: starX + fieldRadius + 10, y: starY },
      FAST,
    );
    await waitArrived(husk);
    expect(Number((await ship(husk)).hull_hp)).toBe(1);
  });
});

/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Stargates”; GAME_BOOK.md §6; DESIGN_GUIDE.md §9.3–§9.4. */
/**
 * Intégration stargates (GB §6, DG §9.3–9.4) sur vraie base : chantier au
 * stargate_yard ACTIF (coût payé — crystal_any résolu par climat, 1
 * chantier concurrent par niveau, paire unique bidirectionnelle, v1 les
 * DEUX endpoints possédés), activation par événement, traversée
 * instantanée (sortie dispersée ≤ 15 pc, capacité 1/tick/direction),
 * péage HARD depuis la soute des non-propriétaires (encaissé au stock du
 * monde d'entrée, propriétaire exempt), mort du gate avec un endpoint
 * annihilé (supernova). Refus §10 directs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  buildStargate,
  setStargateToll,
  traverseStargate,
} from '../../src/services/stargates.js';
import { enqueue, processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let other = '';
let otherStarter = '';
let secondId = '';
let thirdId = '';
let secondX = 0;
let secondY = 0;

const handlers = baseHandlers();

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function stock(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

async function ownedPlanet(name: string, dx: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
        tiles, owner_id, population)
     SELECT 'planet', $1, x + $2, y, $1, 's', 'temperate', 'F', 6, $3, 100
     FROM bodies WHERE id = $4 RETURNING id`,
    [name, dx, owner, ownerStarter],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `sg-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Gatewright',
    politics: 'industrialist',
    universeSeed: `sg-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `sg-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Wayfarer',
    politics: 'mercantile',
    universeSeed: `sg-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  otherStarter = b.spawn.starterPlanetId;
  // Deux mondes possédés supplémentaires (l'acquisition est couverte par
  // la colonisation ; ici la règle de GATE est le sujet).
  secondId = await ownedPlanet(`sg-second-${run}`, 300);
  thirdId = await ownedPlanet(`sg-third-${run}`, 500);
  const { rows } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
    secondId,
  ]);
  secondX = Number(rows[0].x);
  secondY = Number(rows[0].y);
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'stargate_yard', 1, 0, 'active', 0)`,
    [ownerStarter],
  );
  for (const [res, tons] of [
    ['fuel_cells', 800],
    ['steel_h', 1_200],
    ['crystal_temperate', 400],
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

describe('chantier : yard, coût, endpoints, paire, concurrence (§10)', () => {
  it('endpoint d\'autrui refusé ; même monde refusé ; sans yard refusé', async () => {
    await expect(
      buildStargate(pool, owner, ownerStarter, otherStarter),
    ).rejects.toThrow(/DEUX endpoints doivent être à vous/);
    await expect(
      buildStargate(pool, owner, ownerStarter, ownerStarter),
    ).rejects.toThrow(/DEUX mondes distincts/);
    await expect(buildStargate(pool, owner, secondId, thirdId)).rejects.toThrow(
      /stargate_yard ACTIF/,
    );
  });

  it('coût payé (250 cells + 400 steelH + 100 cristal du climat)', async () => {
    const { gateId, completesAt } = await buildStargate(
      pool,
      owner,
      ownerStarter,
      secondId,
      { timeScale: 3_600_000 }, // 48 h ≈ 48 ms
    );
    expect(gateId).toBeTruthy();
    expect(completesAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    expect(await stock(ownerStarter, 'fuel_cells')).toBeCloseTo(550, 3);
    expect(await stock(ownerStarter, 'steel_h')).toBeCloseTo(800, 3);
    expect(await stock(ownerStarter, 'crystal_temperate')).toBeCloseTo(300, 3);
  });

  it('paire dupliquée refusée (les deux sens) ; concurrence 1/niveau', async () => {
    await expect(
      buildStargate(pool, owner, ownerStarter, secondId),
    ).rejects.toThrow(/existe déjà/);
    // L1 = 1 chantier concurrent : un second gate depuis le même yard
    // pendant le premier chantier est refusé.
    await expect(
      buildStargate(pool, owner, ownerStarter, thirdId),
    ).rejects.toThrow(/saturés/);
  });

  it('l\'événement active le gate à l\'échéance', async () => {
    await new Promise((r) => setTimeout(r, 100));
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const { rows } = await pool.query(
      `SELECT status FROM stargates WHERE a_body_id = $1 AND b_body_id = $2`,
      [ownerStarter, secondId],
    );
    expect(rows[0].status).toBe('active');
  });
});

describe('traversée : instantanée, dispersée, capacité, péage hard', () => {
  let gateId = '';

  beforeAll(async () => {
    const { rows } = await pool.query(
      `SELECT id FROM stargates WHERE a_body_id = $1 AND b_body_id = $2`,
      [ownerStarter, secondId],
    );
    gateId = rows[0].id;
  });

  it('le propriétaire traverse SANS péage : idle, dispersé ≤ 15 pc', async () => {
    const res = await traverseStargate(pool, owner, cargo, gateId);
    expect(res.scatterPc).toBeLessThanOrEqual(15);
    const s = await ship(cargo);
    expect(s.status).toBe('idle');
    const d = Math.hypot(Number(s.x) - secondX, Number(s.y) - secondY);
    expect(d).toBeCloseTo(res.scatterPc, 6);
    expect(d).toBeLessThanOrEqual(15);
  });

  it('capacité 1/tick/direction : retraversée immédiate refusée puis servie', async () => {
    // Retour : la coque est idle près du second monde — la re-poser en
    // survol de l'endpoint (fixture ; l'atterrissage est couvert ailleurs).
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         x = $3, y = $4 WHERE id = $1`,
      [cargo, secondId, secondX, secondY],
    );
    await traverseStargate(pool, owner, cargo, gateId, { tickMs: 500 });
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         x = $3, y = $4 WHERE id = $1`,
      [cargo, secondId, secondX, secondY],
    );
    await expect(
      traverseStargate(pool, owner, cargo, gateId, { tickMs: 500 }),
    ).rejects.toThrow(/recharge/);
    await new Promise((r) => setTimeout(r, 550));
    await traverseStargate(pool, owner, cargo, gateId, { tickMs: 500 });
    expect((await ship(cargo)).status).toBe('idle');
  });

  it('péage HARD pour autrui : soute courte = refus ; payé = encaissé', async () => {
    await setStargateToll(pool, owner, gateId, { resource: 'ore', amount: 2 });
    await expect(
      setStargateToll(pool, other, gateId, { resource: 'ore', amount: 0 }),
    ).rejects.toThrow(/ne vous appartient pas/);
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, hover_body_id, fuel, cargo)
       SELECT $1, 'cargo', 's', $2, x, y, 'hovering', $3, '{"cold": 5}', '{}'
       FROM bodies WHERE id = $3 RETURNING id`,
      [other, `sg-guest-${run}`, ownerStarter],
    );
    const guest = rows[0]!.id;
    await expect(
      traverseStargate(pool, other, guest, gateId),
    ).rejects.toThrow(/Péage impayable/);
    await pool.query(`UPDATE ships SET cargo = '{"ore": 5}' WHERE id = $1`, [
      guest,
    ]);
    const before = await stock(ownerStarter, 'ore');
    await traverseStargate(pool, other, guest, gateId);
    const g = await ship(guest);
    expect(g.status).toBe('idle');
    expect(Number(g.cargo.ore)).toBeCloseTo(3, 6);
    expect(await stock(ownerStarter, 'ore')).toBeCloseTo(before + 2, 3);
  });

  it('le vaisseau personnel d\'autrui ne traverse pas vers un monde étranger', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
      [other],
    );
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, docked_at = NULL,
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [rows[0].id, ownerStarter],
    );
    await expect(
      traverseStargate(pool, other, rows[0].id, gateId),
    ).rejects.toThrow(/personnel ne voyage que vers VOS mondes/);
  });
});

describe('le gate meurt avec un endpoint (canon)', () => {
  it('supernova annihilant le second monde : gate supprimé', async () => {
    // Étoile S de fixture À 1 pc du second monde, stock nul → Starfall.
    const { rows: st } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, star_class,
          star_fuel_type, star_fuel_stock, star_fuel_initial,
          star_fuel_rate_u_per_day, star_fuel_as_of, r_nova)
       VALUES ('star', $1, $2, $3, $1, 's', 'cold', 0, 1000, -1, now(), 40)
       RETURNING id`,
      [`sg-star-${run}`, secondX + 1, secondY],
    );
    const client = await pool.connect();
    try {
      await enqueue(client, 'star_supernova', new Date(), { bodyId: st[0]!.id });
    } finally {
      client.release();
    }
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const { rows: wiped } = await pool.query(
      `SELECT (config->>'annihilated') AS ann FROM bodies WHERE id = $1`,
      [secondId],
    );
    expect(wiped[0].ann).toBe('true');
    const { rows: gates } = await pool.query(
      `SELECT 1 FROM stargates WHERE a_body_id = $1 OR b_body_id = $1`,
      [secondId],
    );
    expect(gates).toEqual([]);
  });
});

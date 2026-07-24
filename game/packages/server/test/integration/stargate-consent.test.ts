/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Stargates”; GAME_BOOK.md §6; DESIGN_GUIDE.md §9.3–§9.4. */
/**
 * Intégration consentement 50/50 des stargates (canon GB §6 « price
 * split between the two owners », DG §9.3 « both consent ») sur vraie
 * base : proposition depuis un monde à yard ACTIF vers le monde
 * d'AUTRUI, réponse réservée au propriétaire CIBLE (§10), acceptation =
 * LES DEUX moitiés payées (chacune chez soi, cristal par climat) +
 * chantier lancé, refus si l'une des trésoreries est courte, déclin,
 * annulation (proposeur seul), paire unique, et exemption de péage des
 * DEUX propriétaires d'endpoints après activation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  cancelStargateProposal,
  proposeStargate,
  respondStargateProposal,
  setStargateToll,
  traverseStargate,
} from '../../src/services/stargates.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let alice = '';
let aliceStarter = '';
let bob = '';
let bobStarter = '';
let bobCargo = '';

const handlers = baseHandlers();

async function stock(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
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

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `sc-alice-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Alice',
    politics: 'industrialist',
    universeSeed: `sc-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `sc-bob-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Bob',
    politics: 'mercantile',
    universeSeed: `sc-universe-${run}`,
  });
  alice = a.playerId;
  aliceStarter = a.spawn.starterPlanetId;
  bob = b.playerId;
  bobStarter = b.spawn.starterPlanetId;
  bobCargo = b.spawn.cargoShipId;
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'stargate_yard', 1, 0, 'active', 0)`,
    [aliceStarter],
  );
  for (const [res, tons] of [
    ['fuel_cells', 400],
    ['steel_h', 600],
    ['crystal_temperate', 200],
  ] as const) {
    await setStock(aliceStarter, res, tons);
  }
});

afterAll(async () => {
  await pool.end();
});

describe('proposition (§10, yard, cibles)', () => {
  it('depuis le monde d\'autrui : refus ; vers SON monde : « construisez » ; sans yard : refus', async () => {
    await expect(
      proposeStargate(pool, alice, bobStarter, aliceStarter),
    ).rejects.toThrow(/départ doit être à vous/);
    await expect(
      proposeStargate(pool, bob, bobStarter, aliceStarter),
    ).rejects.toThrow(/yard ACTIF/);
    // Vers un monde à soi : le flux direct existe (chunk AK).
    const { rows: wilds } = await pool.query(
      `SELECT id FROM bodies WHERE body_type = 'planet' AND owner_id IS NULL LIMIT 1`,
    );
    await expect(
      proposeStargate(pool, alice, aliceStarter, wilds[0].id),
    ).rejects.toThrow(/monde sauvage/);
  });

  it('proposition ouverte, doublon refusé (les deux sens)', async () => {
    const { proposalId } = await proposeStargate(
      pool,
      alice,
      aliceStarter,
      bobStarter,
    );
    expect(proposalId).toBeTruthy();
    await expect(
      proposeStargate(pool, alice, aliceStarter, bobStarter),
    ).rejects.toThrow(/déjà ouverte/);
  });
});

describe('réponse : §10, moitiés payées, chantier, déclin', () => {
  let proposalId = '';

  beforeAll(async () => {
    const { rows } = await pool.query(
      `SELECT id FROM stargate_proposals WHERE status = 'open'
         AND from_body_id = $1 AND to_body_id = $2`,
      [aliceStarter, bobStarter],
    );
    proposalId = rows[0].id;
  });

  it('le proposeur ne répond pas à sa propre proposition (§10)', async () => {
    await expect(
      respondStargateProposal(pool, alice, proposalId, true),
    ).rejects.toThrow(/propriétaire du monde cible/);
  });

  it('accepter avec une trésorerie COURTE : refus (rien n\'est débité)', async () => {
    const aliceCells = await stock(aliceStarter, 'fuel_cells');
    await expect(
      respondStargateProposal(pool, bob, proposalId, true, {
        timeScale: 3_600_000,
      }),
    ).rejects.toThrow(/insuffisante/);
    expect(await stock(aliceStarter, 'fuel_cells')).toBeCloseTo(aliceCells, 3);
  });

  it('accepter : LES DEUX moitiés débitées, chantier lancé, événement posé', async () => {
    for (const [res, tons] of [
      ['fuel_cells', 200],
      ['steel_h', 300],
      ['crystal_temperate', 100],
    ] as const) {
      await setStock(bobStarter, res, tons);
    }
    const { gateId } = await respondStargateProposal(pool, bob, proposalId, true, {
      timeScale: 3_600_000,
    });
    expect(gateId).toBeTruthy();
    expect(await stock(aliceStarter, 'fuel_cells')).toBeCloseTo(275, 3);
    expect(await stock(aliceStarter, 'steel_h')).toBeCloseTo(400, 3);
    expect(await stock(aliceStarter, 'crystal_temperate')).toBeCloseTo(150, 3);
    expect(await stock(bobStarter, 'fuel_cells')).toBeCloseTo(75, 3);
    expect(await stock(bobStarter, 'steel_h')).toBeCloseTo(100, 3);
    expect(await stock(bobStarter, 'crystal_temperate')).toBeCloseTo(50, 3);
    const { rows } = await pool.query(
      `SELECT status, owner_id FROM stargates
       WHERE a_body_id = $1 AND b_body_id = $2`,
      [aliceStarter, bobStarter],
    );
    expect(rows[0].status).toBe('building');
    expect(rows[0].owner_id).toBe(alice);
  });

  it('activation, puis EXEMPTION de péage du co-payeur (endpoint à lui)', async () => {
    await new Promise((r) => setTimeout(r, 100));
    await processDueEvents(pool, handlers);
    const { rows: gates } = await pool.query(
      `SELECT id, status FROM stargates WHERE a_body_id = $1 AND b_body_id = $2`,
      [aliceStarter, bobStarter],
    );
    expect(gates[0].status).toBe('active');
    await setStargateToll(pool, alice, gates[0].id, {
      resource: 'ore',
      amount: 3,
    });
    // Bob (propriétaire de l'endpoint B, co-payeur) traverse SANS péage,
    // même la soute vide.
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, docked_at = NULL, cargo = '{}',
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [bobCargo, bobStarter],
    );
    const res = await traverseStargate(pool, bob, bobCargo, gates[0].id);
    expect(res.scatterPc).toBeLessThanOrEqual(15);
    const { rows: after } = await pool.query(
      `SELECT status FROM ships WHERE id = $1`,
      [bobCargo],
    );
    expect(after[0].status).toBe('idle');
  });

  it('déclin et annulation (§10) sur une nouvelle paire', async () => {
    const { rows: b2 } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, owner_id, population)
       SELECT 'planet', $1, x + 400, y, $1, 's', 'temperate', 'F', 6, $2, 100
       FROM bodies WHERE id = $3 RETURNING id`,
      [`sc-bob2-${run}`, bob, bobStarter],
    );
    const p1 = await proposeStargate(pool, alice, aliceStarter, b2[0]!.id);
    await expect(
      cancelStargateProposal(pool, bob, p1.proposalId),
    ).rejects.toThrow(/pas la vôtre/);
    await cancelStargateProposal(pool, alice, p1.proposalId);
    const p2 = await proposeStargate(pool, alice, aliceStarter, b2[0]!.id);
    await respondStargateProposal(pool, bob, p2.proposalId, false);
    const { rows } = await pool.query(
      `SELECT status FROM stargate_proposals WHERE id = $1`,
      [p2.proposalId],
    );
    expect(rows[0].status).toBe('declined');
  });
});

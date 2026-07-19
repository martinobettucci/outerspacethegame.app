/**
 * Intégration claim rig & salvage (GB §6 « no honor », DG §8.8) sur vraie
 * base : rig monté à l'atelier L2 (coût 25 steelL + 5 gold), réclamation
 * d'une épave SANS propriétaire à ≤ 1 pc [TUNE-v1], stationnaire, 2 h de
 * jeu — l'événement salvage_claimed RE-VÉRIFIE tout à l'échéance (partir
 * ou dériver annule ; une épave déjà réclamée est refusée). Refus §10
 * directs. (La FABRICATION d'épaves par survival_out est couverte par
 * survival.test.ts — ici les épaves sont des fixtures.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { fitClaimRig, startClaim } from '../../src/services/junk.js';
import { fleet, moveShip, setShipFuelForTest } from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
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

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function newWreck(x: number, y: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel)
     VALUES (NULL, 'cargo', 's', $1, $2, $3, 'derelict', '{"cold": 0}')
     RETURNING id`,
    [`cl-wreck-${run}-${Math.floor(x)}`, x, y],
  );
  return rows[0]!.id;
}

async function idleAt(shipId: string, x: number, y: number) {
  await pool.query(
    `UPDATE ships SET status = 'idle', x = $2, y = $3,
       docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL
     WHERE id = $1`,
    [shipId, x, y],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `cl-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Reclaimer',
    politics: 'industrialist',
    universeSeed: `cl-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `cl-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Rival',
    politics: 'mercantile',
    universeSeed: `cl-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  const { rows } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
    ownerStarter,
  ]);
  farX = Number(rows[0].x) + 200;
  farY = Number(rows[0].y);
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 2, 0, 'active', 0)`,
    [ownerStarter],
  );
  for (const [res, tons] of [
    ['steel_l', 60],
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

describe('fit du claim rig (atelier L2, coût, §10)', () => {
  it('coût payé (25 steelL + 5 gold), double-fit refusé, autrui refusé', async () => {
    await expect(fitClaimRig(pool, other, cargo)).rejects.toThrow(/obéit pas/);
    await fitClaimRig(pool, owner, cargo);
    expect((await ship(cargo)).claim_rig).toBe(true);
    const { rows } = await pool.query(
      `SELECT resource, amount_t FROM planet_stock
       WHERE body_id = $1 AND resource IN ('steel_l', 'gold') ORDER BY resource`,
      [ownerStarter],
    );
    expect(Number(rows.find((r) => r.resource === 'steel_l')!.amount_t)).toBeCloseTo(
      35,
      3,
    );
    expect(Number(rows.find((r) => r.resource === 'gold')!.amount_t)).toBeCloseTo(
      15,
      3,
    );
    await expect(fitClaimRig(pool, owner, cargo)).rejects.toThrow(/déjà monté/);
  });
});

describe('gardes de réclamation', () => {
  it('à quai : refus (immobile sur zone) ; cible possédée : refus ; trop loin : refus', async () => {
    const wreck = await newWreck(farX, farY);
    await expect(startClaim(pool, owner, cargo, wreck)).rejects.toThrow(
      /immobile, sur zone/,
    );
    await idleAt(cargo, farX + 0.5, farY);
    // Cible possédée (la coque d'autrui n'est PAS une épave).
    const { rows: owned } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 LIMIT 1`,
      [other],
    );
    await expect(startClaim(pool, owner, cargo, owned[0].id)).rejects.toThrow(
      /pas une épave/,
    );
    await idleAt(cargo, farX + 5, farY);
    await expect(startClaim(pool, owner, cargo, wreck)).rejects.toThrow(
      /Trop loin/,
    );
  });
});

describe('réclamation complète et annulations', () => {
  it('2 h de proximité tenues : l\'épave devient MA coque idle', async () => {
    const wreck = await newWreck(farX, farY);
    await idleAt(cargo, farX + 0.5, farY);
    const { claimsAt } = await startClaim(pool, owner, cargo, wreck, {
      timeScale: 3_600_000, // 2 h de jeu ≈ 2 ms réels
    });
    expect(claimsAt.getTime()).toBeGreaterThan(Date.now() - 1000);
    const view = await fleet(pool, owner);
    const mine = view.find((v) => v.id === cargo)!;
    expect(mine.claimingTargetId).toBe(wreck);
    expect(mine.claimsAt).toBe(claimsAt.toISOString());
    await expect(
      startClaim(pool, owner, cargo, wreck, { timeScale: 3_600_000 }),
    ).rejects.toThrow(/déjà en cours/);
    await new Promise((r) => setTimeout(r, 60));
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const w = await ship(wreck);
    expect(w.owner_id).toBe(owner);
    expect(w.status).toBe('idle');
    expect((await ship(cargo)).claiming_target_id).toBeNull();
  });

  it('une épave déjà réclamée n\'est plus réclamable', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND name LIKE 'cl-wreck-%'`,
      [owner],
    );
    await expect(
      startClaim(pool, owner, cargo, rows[0].id, { timeScale: 3_600_000 }),
    ).rejects.toThrow(/pas une épave/);
  });

  it('partir en vol ANNULE (lien + événement purgés)', async () => {
    const wreck = await newWreck(farX + 20, farY);
    await idleAt(cargo, farX + 20.5, farY);
    await setShipFuelForTest(pool, owner, cargo, { units: 30 });
    await startClaim(pool, owner, cargo, wreck, { timeScale: 1 });
    await moveShip(pool, owner, cargo, { x: farX + 40, y: farY });
    const s = await ship(cargo);
    expect(s.claiming_target_id).toBeNull();
    const { rows: ev } = await pool.query(
      `SELECT 1 FROM events WHERE processed_at IS NULL
         AND kind = 'salvage_claimed' AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(ev).toEqual([]);
    // Fixture repliée : retour à l'arrêt près du starter.
    await pool.query(
      `DELETE FROM events WHERE processed_at IS NULL AND payload->>'shipId' = $1`,
      [cargo],
    );
  });

  it('dériver hors de portée à l\'échéance : la proximité n\'a pas tenu', async () => {
    const wreck = await newWreck(farX + 60, farY);
    await idleAt(cargo, farX + 60.5, farY);
    await startClaim(pool, owner, cargo, wreck, { timeScale: 3_600_000 });
    // La coque « dérive » (fixture SQL) SANS purger le lien : le handler
    // doit constater la rupture de proximité et abandonner.
    await pool.query(
      `UPDATE ships SET x = $2 WHERE id = $1`,
      [cargo, farX + 90],
    );
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, handlers);
    const w = await ship(wreck);
    expect(w.owner_id).toBeNull();
    expect(w.status).toBe('derelict');
    expect((await ship(cargo)).claiming_target_id).toBeNull();
  });
});

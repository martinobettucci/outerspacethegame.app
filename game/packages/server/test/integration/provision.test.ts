/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Survival clocks & derelicts”; GAME_BOOK.md §6/§7; DESIGN_GUIDE.md §3.5/§8.8. */
/**
 * Intégration avitaillement & chemin stock-planète de la survie (GB §6/§7,
 * DG §3.5) sur vraie base : en survol de SON monde, le stock planétaire
 * nourrit l'équipage (familles food+water, tout-ou-rien, APRÈS la survie
 * de la population) et l'horloge de la coque est exempte ; monde à sec →
 * bascule, les provisions de la coque paient ; re-serve → re-exemption.
 * provisionShip remplit food/water jusqu'à la capacité de coque depuis le
 * stock. RÉGRESSIONS verrouillées : le recompute planétaire et l'arrivée
 * de transit conservaient une ligne `ships` PARTIELLE qui écrasait les
 * provisions à zéro (corrigé chunk AE). Refus §10 par requêtes directes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  assignCrew,
  provisionShip,
  relocateShipForTest,
  setShipSurvivalForTest,
} from '../../src/services/ships.js';
import { recomputePlanetRates } from '../../src/sim/rebase.js';
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

const handlers = baseHandlers();

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
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

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

async function recompute(bodyId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const snap = await recomputePlanetRates(client, bodyId, Date.now());
    await client.query('COMMIT');
    return snap;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `pv-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Steward',
    politics: 'industrialist',
    universeSeed: `pv-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `pv-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Stranger',
    politics: 'mercantile',
    universeSeed: `pv-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  otherStarter = b.spawn.starterPlanetId;
  await assignCrew(pool, owner, cargo, a.spawn.pilotNpcId);
  // Vivres planétaires généreux : la POPULATION mange aussi (priorité
  // canon) — le surplus sert l'équipage en survol.
  await setStock(ownerStarter, 'food_1', 500);
  await setStock(ownerStarter, 'water', 500);
});

afterAll(async () => {
  await pool.end();
});

describe('survol de SON monde : le stock planétaire nourrit (GB §7)', () => {
  it('RÉGRESSION : le recompute planétaire CONSERVE les provisions', async () => {
    await setShipSurvivalForTest(pool, owner, cargo, {
      foodT: 0.1,
      waterT: 0.1,
    });
    await relocateShipForTest(pool, owner, cargo, ownerStarter);
    await recompute(ownerStarter);
    const s = await ship(cargo);
    expect(Number(s.survival.food)).toBeCloseTo(0.1, 6);
    expect(Number(s.survival.water)).toBeCloseTo(0.1, 6);
  });

  it('servi : besoin 0.01×équipage visible, horloge exempte, aucun bord', async () => {
    const snap = await recompute(ownerStarter);
    expect(snap?.rates.hoverSurvivalConsumption.food).toBeCloseTo(0.01, 6);
    expect(snap?.rates.hoverSurvivalConsumption.water).toBeCloseTo(0.01, 6);
    const s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBe(0);
    const { rows } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND kind IN ('survival_low', 'survival_out')
         AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(rows).toEqual([]);
  });

  it('monde à sec (familles vides, aucun arrivage) : la coque paie', async () => {
    for (const res of ['food_1', 'food_2', 'food_3', 'water']) {
      await setStock(ownerStarter, res, 0);
    }
    await recompute(ownerStarter);
    const s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBeLessThan(0);
    // Les provisions ne sont PAS touchées par la bascule elle-même.
    expect(Number(s.survival.food)).toBeCloseTo(0.1, 6);
  });

  it('re-serve : le stock revient, l\'horloge se désarme, bords purgés', async () => {
    await setStock(ownerStarter, 'food_1', 500);
    await setStock(ownerStarter, 'water', 500);
    await recompute(ownerStarter);
    const s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBe(0);
    const { rows } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND kind IN ('survival_low', 'survival_out')
         AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(rows).toEqual([]);
  });

  it('RÉGRESSION : une VRAIE arrivée de transit conserve les provisions', async () => {
    // Transit minimal vers SON monde forgé en SQL (le vol lui-même est
    // couvert par ships.test.ts) ; l'événement ship_arrival fait le reste.
    await pool.query(
      `UPDATE ships SET status = 'transit',
         origin_x = x - 1, origin_y = y, dest_x = x, dest_y = y,
         dest_body_id = $2, hover_body_id = NULL,
         departed_at = now() - interval '1 hour', arrives_at = now()
       WHERE id = $1`,
      [cargo, ownerStarter],
    );
    const client = await pool.connect();
    try {
      await enqueue(client, 'ship_arrival', new Date(), { shipId: cargo });
    } finally {
      client.release();
    }
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const s = await ship(cargo);
    expect(s.status).toBe('hovering');
    expect(s.hover_body_id).toBe(ownerStarter);
    expect(Number(s.survival.food)).toBeCloseTo(0.1, 6);
    expect(Number(s.survival.water)).toBeCloseTo(0.1, 6);
    expect(Number(s.survival_rate_t_per_day)).toBe(0); // servi à l'arrivée
  });
});

describe('avitaillement (provisionShip)', () => {
  it('remplit food ET water à la capacité de coque depuis le stock', async () => {
    // Cargo S : 14 crew-days × 0.01 × 1 équipage = 0.14 T par ressource.
    const foodBefore = await stockOf(ownerStarter, 'food_1');
    const res = await provisionShip(pool, owner, cargo);
    expect(res.loadedFood).toBeCloseTo(0.04, 6);
    expect(res.loadedWater).toBeCloseTo(0.04, 6);
    expect(res.food).toBeCloseTo(0.14, 6);
    expect(res.water).toBeCloseTo(0.14, 6);
    const s = await ship(cargo);
    expect(Number(s.survival.food)).toBeCloseTo(0.14, 6);
    expect(await stockOf(ownerStarter, 'food_1')).toBeCloseTo(
      foodBefore - 0.04,
      3,
    );
  });

  it('plein : refusé explicitement', async () => {
    await expect(provisionShip(pool, owner, cargo)).rejects.toThrow(
      /déjà pleines/,
    );
  });

  it('stock partiel : charge ce qui existe (famille food dans l\'ordre)', async () => {
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 0, waterT: 0.14 });
    for (const res of ['food_1', 'food_2', 'food_3']) {
      await setStock(ownerStarter, res, 0);
    }
    await setStock(ownerStarter, 'food_2', 0.05);
    const res = await provisionShip(pool, owner, cargo);
    expect(res.loadedFood).toBeCloseTo(0.05, 6);
    expect(res.loadedWater).toBeCloseTo(0, 6);
    await setStock(ownerStarter, 'food_1', 500); // fixture restaurée
    await recompute(ownerStarter);
  });

  it('§10 : autrui n\'avitaille pas MA coque (refusé dès le monde)', async () => {
    // La garde MONDE frappe la première (même ordre que refuel) : le monde
    // sous MA coque n'appartient pas à l'appelant → forbidden.
    await expect(provisionShip(pool, other, cargo)).rejects.toThrow(
      /vos mondes seulement/,
    );
  });

  it('§10 : jamais depuis le monde d\'AUTRUI', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, hover_body_id, fuel)
       VALUES ($1, 'cargo', 's', $2,
          (SELECT x FROM bodies WHERE id = $3),
          (SELECT y FROM bodies WHERE id = $3),
          'hovering', $3, '{"cold": 5}') RETURNING id`,
      [owner, `pv-foreign-${run}`, otherStarter],
    );
    await expect(provisionShip(pool, owner, rows[0]!.id)).rejects.toThrow(
      /vos mondes seulement/,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [rows[0]!.id]);
  });

  it('§10 : le vaisseau personnel n\'embarque pas de vivres (GB §21)', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
      [owner],
    );
    await expect(provisionShip(pool, owner, rows[0].id)).rejects.toThrow(
      /n'embarque pas de vivres/,
    );
  });

  it('sans équipage : capacité nulle, refus explicite', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, docked_body_id, docked_at, fuel)
       VALUES ($1, 'cargo', 's', $2,
          (SELECT x FROM bodies WHERE id = $3),
          (SELECT y FROM bodies WHERE id = $3),
          'docked', $3, now(), '{"cold": 5}') RETURNING id`,
      [owner, `pv-nocrew-${run}`, ownerStarter],
    );
    await expect(provisionShip(pool, owner, rows[0]!.id)).rejects.toThrow(
      /Aucun équipage/,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [rows[0]!.id]);
  });
});

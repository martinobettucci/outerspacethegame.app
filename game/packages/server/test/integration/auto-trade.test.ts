/**
 * Intégration auto-trade du survol étranger (GB §7, DG §3.5) sur vraie
 * base : règles par coque (§10, validation), déclenchement PARESSEUX
 * (auto_trade_check au whenReaches, check immédiat sous le seuil),
 * exécution best-effort au PREMIER slot fixe dont le monde DONNE la
 * ressource — contrepartie depuis la soute, borne 3:1 [TUNE-v1],
 * physique intégrale (soute→stock, stock→provisions/tank/soute),
 * journal des trades (slot −3). Monde possédé/sans marché : no-op.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { setAutoTrade } from '../../src/services/hoverTrade.js';
import { setMarketSlot } from '../../src/services/market.js';
import {
  assignCrew,
  relocateShipForTest,
  setShipFuelForTest,
  setShipSurvivalForTest,
} from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let alice = '';
let cargo = '';
let bob = '';
let bobStarter = '';
let marketId = '';

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

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `at-alice-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Roamer',
    politics: 'industrialist',
    universeSeed: `at-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `at-bob-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Grocer',
    politics: 'mercantile',
    universeSeed: `at-universe-${run}`,
  });
  alice = a.playerId;
  cargo = a.spawn.cargoShipId;
  bob = b.playerId;
  bobStarter = b.spawn.starterPlanetId;
  await assignCrew(pool, alice, cargo, a.spawn.pilotNpcId);
  // L'épicerie de Bob : marché ACTIF qui VEND food_1 contre ore (1:1) et
  // du stock food_1 à revendre.
  const { rows: m } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'market', 1, 0, 'active', 0) RETURNING id`,
    [bobStarter],
  );
  marketId = m[0]!.id;
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, 'food_1', 300, now())
     ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = 300, as_of = now()`,
    [bobStarter],
  );
  await setMarketSlot(pool, bob, bobStarter, marketId, 0, {
    give: 'food_1',
    get: 'ore',
    rate: 1,
    dailyLimitT: 0,
    absoluteLimitT: 0,
    whitelist: [],
  });
});

afterAll(async () => {
  await pool.end();
});

describe('règles (§10, validation)', () => {
  it('autrui ne configure pas MA coque ; 4 règles refusées', async () => {
    await expect(
      setAutoTrade(pool, bob, cargo, [
        { resource: 'food_1', belowT: 1, buyT: 1 },
      ]),
    ).rejects.toThrow(/obéit pas/);
    await expect(
      setAutoTrade(pool, alice, cargo, [
        { resource: 'ore', belowT: 1, buyT: 1 },
        { resource: 'gold', belowT: 1, buyT: 1 },
        { resource: 'water', belowT: 1, buyT: 1 },
        { resource: 'food_1', belowT: 1, buyT: 1 },
      ]),
    ).rejects.toThrow(/Au plus/);
  });
});

describe('rachat de provisions en survol étranger (canon « if food < 20 »)', () => {
  it('sous le seuil : le check immédiat rachète — provisions ↑, soute ore ↓, stock du monde ajusté, trade journalisé', async () => {
    // Provisions basses + contrepartie en soute, puis survol du monde de
    // Bob (relocate §15 arme l'auto-trade comme les vraies entrées).
    await setShipFuelForTest(pool, alice, cargo, { units: 30 });
    await setShipSurvivalForTest(pool, alice, cargo, { foodT: 0.02, waterT: 0.1 });
    await pool.query(`UPDATE ships SET cargo = '{"ore": 3}' WHERE id = $1`, [
      cargo,
    ]);
    await setAutoTrade(pool, alice, cargo, [
      { resource: 'food_1', belowT: 0.05, buyT: 0.1 },
    ]);
    const foodBefore = await stock(bobStarter, 'food_1');
    const oreBefore = await stock(bobStarter, 'ore');
    await relocateShipForTest(pool, alice, cargo, bobStarter);
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const s = await ship(cargo);
    // Cargo S, 1 pilote : capacité 0,14 T — l'achat vise 0,1 T mais est
    // borné par la capacité restante (0,14 − 0,02 = 0,12 ≥ 0,1) → 0,1.
    expect(Number(s.survival.food)).toBeCloseTo(0.12, 3);
    expect(Number(s.cargo.ore)).toBeCloseTo(2.9, 3);
    expect(await stock(bobStarter, 'food_1')).toBeCloseTo(foodBefore - 0.1, 3);
    expect(await stock(bobStarter, 'ore')).toBeCloseTo(oreBefore + 0.1, 3);
    const { rows: trades } = await pool.query(
      `SELECT * FROM trades WHERE trader = $1 AND slot_index = -3`,
      [alice],
    );
    expect(trades.length).toBe(1);
    expect(trades[0].got_resource).toBe('food_1');
  });

  it('borne 3:1 : un taux abusif est refusé (aucun achat)', async () => {
    // Bob re-price : 1 food_1 contre 4 ore (rate 0,25 → coût 4/T > 3).
    await pool.query(
      `UPDATE buildings SET config = jsonb_set(config, '{slots,0,rate}', '0.25')
       WHERE id = $1`,
      [marketId],
    );
    await setShipSurvivalForTest(pool, alice, cargo, { foodT: 0.01, waterT: 0.1 });
    const client = await pool.connect();
    try {
      const { runAutoTrade } = await import('../../src/services/hoverTrade.js');
      const s = await ship(cargo);
      const n = await runAutoTrade(client, s, Date.now());
      expect(n).toBe(0);
    } finally {
      client.release();
    }
    expect(Number((await ship(cargo)).survival.food)).toBeCloseTo(0.01, 3);
  });

  it('soute sans contrepartie : skip propre (aucun débit)', async () => {
    await pool.query(
      `UPDATE buildings SET config = jsonb_set(config, '{slots,0,rate}', '1')
       WHERE id = $1`,
      [marketId],
    );
    await pool.query(`UPDATE ships SET cargo = '{}' WHERE id = $1`, [cargo]);
    const client = await pool.connect();
    try {
      const { runAutoTrade } = await import('../../src/services/hoverTrade.js');
      const n = await runAutoTrade(client, await ship(cargo), Date.now());
      expect(n).toBe(0);
    } finally {
      client.release();
    }
  });

  it('monde POSSÉDÉ ou sans marché : no-op structurel', async () => {
    const client = await pool.connect();
    try {
      const { runAutoTrade } = await import('../../src/services/hoverTrade.js');
      // Sur SON propre starter (relocate) : le canon réserve l'auto-trade
      // au survol d'AUTRUI.
      const { rows } = await pool.query(
        `SELECT starter.id FROM bodies starter
         WHERE starter.owner_id = $1 AND starter.is_starter LIMIT 1`,
        [alice],
      );
      await pool.query(`UPDATE ships SET cargo = '{"ore": 5}' WHERE id = $1`, [
        cargo,
      ]);
      await relocateShipForTest(pool, alice, cargo, rows[0].id);
      const n = await runAutoTrade(client, await ship(cargo), Date.now());
      expect(n).toBe(0);
    } finally {
      client.release();
    }
  });

  it('planification paresseuse : au-dessus du seuil, le check se pose au whenReaches', async () => {
    // Retour chez Bob avec des provisions AU-DESSUS du seuil : le drain
    // de survie (−0,01/j) mène au seuil → un auto_trade_check est posé
    // dans le futur, pas immédiat.
    await setShipSurvivalForTest(pool, alice, cargo, { foodT: 0.12, waterT: 0.12 });
    await relocateShipForTest(pool, alice, cargo, bobStarter);
    const { rows: ev } = await pool.query(
      `SELECT due_at FROM events WHERE processed_at IS NULL
         AND kind = 'auto_trade_check' AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(ev.length).toBe(1);
    expect(new Date(ev[0].due_at).getTime()).toBeGreaterThan(Date.now() + 1000);
  });
});

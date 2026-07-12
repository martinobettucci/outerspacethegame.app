/**
 * Intégration : marché L1 taux fixe (GB §9/§13, DG §11.1) sur vraie base —
 * slots = niveau, re-tarification 1/min, physicalité (soute à quai ↔ stock
 * planétaire), limites quotidienne/absolue, whitelist, refus d'autorisation
 * par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { REPRICE_MIN_INTERVAL_MS, type SlotInput } from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import {
  executeTrade,
  listMarkets,
  setMarketSlot,
} from '../../src/services/market.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let ownerCargo = '';
let trader = '';
let traderCargo = '';
let marketId = '';

const SLOT: SlotInput = {
  give: 'ore',
  get: 'water',
  rate: 0.5,
  dailyLimitT: 0,
  absoluteLimitT: 0,
  whitelist: [],
};

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `mkt-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Marketeer',
    politics: 'mercantile',
    universeSeed: `mkt-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `mkt-trader-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Trader',
    politics: 'industrialist',
    universeSeed: `mkt-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  ownerCargo = a.spawn.cargoShipId;
  trader = b.playerId;
  traderCargo = b.spawn.cargoShipId;
  // Marché actif L1 (la pose/unlock est couverte ailleurs) + trésorerie
  // d'eau pour payer les échanges (sous 0,7 × cap).
  const { rows: m } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'market', 1, 0, 'active', 0) RETURNING id`,
    [ownerStarter],
  );
  marketId = m[0]!.id;
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, 'water', 100, now())
     ON CONFLICT (body_id, resource)
     DO UPDATE SET amount_t = 100, as_of = now()`,
    [ownerStarter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('configuration des slots (GB §9 : slots = niveau)', () => {
  it('le propriétaire configure le slot 0 ; le slot 1 n\'existe pas sur un L1', async () => {
    const { slots } = await setMarketSlot(pool, owner, ownerStarter, marketId, 0, SLOT);
    expect(slots[0]!.give).toBe('ore');
    await expect(
      setMarketSlot(pool, owner, ownerStarter, marketId, 1, SLOT),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('validation pure : paire identique, taux nul → refus', async () => {
    await expect(
      setMarketSlot(pool, owner, ownerStarter, marketId, 0, { ...SLOT, get: 'ore' }),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      setMarketSlot(pool, owner, ownerStarter, marketId, 0, { ...SLOT, rate: 0 }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('re-tarification ≤ 1/min (DG §11.1) — même paire, taux différent', async () => {
    await expect(
      setMarketSlot(pool, owner, ownerStarter, marketId, 0, { ...SLOT, rate: 0.6 }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // 61 s plus tard (horloge contrôlée) : accepté.
    await setMarketSlot(pool, owner, ownerStarter, marketId, 0, { ...SLOT, rate: 0.5 }, {
      nowMs: Date.now() + REPRICE_MIN_INTERVAL_MS + 1_000,
    });
  });

  it('autorisation : un étranger ne configure pas MON marché (requête directe)', async () => {
    await expect(
      setMarketSlot(pool, trader, ownerStarter, marketId, 0, SLOT),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('consultation & échange (physicalité GB §13)', () => {
  it('les offres se consultent à quai : refus avant, visibles après', async () => {
    await expect(listMarkets(pool, trader, ownerStarter)).rejects.toMatchObject({
      code: 'forbidden',
    });
    // Le vol + l'atterrissage sont couverts (ships/landing-cargo) : on POSE
    // le cargo du trader à quai avec 3 T d'ore en soute.
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, hover_body_id = NULL,
         cargo = '{"ore": 3}'::jsonb
       WHERE id = $1`,
      [traderCargo, ownerStarter],
    );
    const markets = await listMarkets(pool, trader, ownerStarter);
    expect(markets).toHaveLength(1);
    expect(markets[0]!.slots[0]!.give).toBe('ore');
    expect(markets[0]!.slots[0]!.payableStockT).toBeGreaterThan(50);
  });

  it('échange : 2 T d\'ore → 1 T d\'eau ; les deux côtés bougent physiquement', async () => {
    const oreBefore = await stockOf(ownerStarter, 'ore');
    const waterBefore = await stockOf(ownerStarter, 'water');
    const r = await executeTrade(pool, trader, marketId, 0, traderCargo, 2);
    expect(r.gotT).toBeCloseTo(1, 9);
    expect(r.gotResource).toBe('water');
    const { rows } = await pool.query(`SELECT cargo FROM ships WHERE id = $1`, [
      traderCargo,
    ]);
    expect(rows[0].cargo).toEqual({ ore: 1, water: 1 });
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(oreBefore + 2, 4);
    expect(await stockOf(ownerStarter, 'water')).toBeCloseTo(waterBefore - 1, 4);
    const { rows: journal } = await pool.query(
      `SELECT * FROM trades WHERE market_building_id = $1`,
      [marketId],
    );
    expect(journal).toHaveLength(1);
    expect(Number(journal[0].gave_t)).toBe(2);
  });

  it('refus : soute insuffisante, quantité invalide, pas à quai', async () => {
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 5),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, -1),
    ).rejects.toMatchObject({ code: 'not_available' });
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL WHERE id = $1`,
      [traderCargo],
    );
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 1),
    ).rejects.toMatchObject({ code: 'not_available' });
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, hover_body_id = NULL
       WHERE id = $1`,
      [traderCargo, ownerStarter],
    );
  });

  it('le vaisseau d\'un autre ne commerce pas pour moi (requête directe)', async () => {
    await expect(
      executeTrade(pool, owner, marketId, 0, traderCargo, 1),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('limites & whitelist (canon §9 « limits absolute and daily »)', () => {
  it('limite quotidienne : 2 T déjà passées + limite 3 → 1 T passe, la suivante non', async () => {
    await setMarketSlot(
      pool,
      owner,
      ownerStarter,
      marketId,
      0,
      { ...SLOT, dailyLimitT: 3 },
      { nowMs: Date.now() + 2 * REPRICE_MIN_INTERVAL_MS },
    );
    await executeTrade(pool, trader, marketId, 0, traderCargo, 1);
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 0.5),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('limite absolue : total 3 T atteint avec limite 3 → refus', async () => {
    await setMarketSlot(
      pool,
      owner,
      ownerStarter,
      marketId,
      0,
      { ...SLOT, absoluteLimitT: 3 },
      { nowMs: Date.now() + 3 * REPRICE_MIN_INTERVAL_MS },
    );
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 0.5),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('whitelist : slot réservé → étranger refusé, propriétaire exempt', async () => {
    await setMarketSlot(
      pool,
      owner,
      ownerStarter,
      marketId,
      0,
      { ...SLOT, whitelist: [owner] },
      { nowMs: Date.now() + 4 * REPRICE_MIN_INTERVAL_MS },
    );
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 0.5),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Le propriétaire échange avec son propre marché (self-wash pointless,
    // not dangerous) : son cargo est à quai chez lui depuis le spawn.
    await pool.query(
      `UPDATE ships SET cargo = '{"ore": 1}'::jsonb WHERE id = $1`,
      [ownerCargo],
    );
    const r = await executeTrade(pool, owner, marketId, 0, ownerCargo, 1);
    expect(r.gotT).toBeCloseTo(0.5, 9);
  });

  it('le marché ne paie pas au-delà de son stock', async () => {
    await setMarketSlot(
      pool,
      owner,
      ownerStarter,
      marketId,
      0,
      { ...SLOT, rate: 1000 },
      { nowMs: Date.now() + 5 * REPRICE_MIN_INTERVAL_MS },
    );
    await pool.query(
      `UPDATE ships SET cargo = '{"ore": 2}'::jsonb WHERE id = $1`,
      [traderCargo],
    );
    await expect(
      executeTrade(pool, trader, marketId, 0, traderCargo, 1),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
  });
});

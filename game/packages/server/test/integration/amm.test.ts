/**
 * Intégration pools AMM (GB §13, DG §11.2) sur vraie base : seed = prix
 * initial payé PHYSIQUEMENT, réserves comptées au stockage, échanges à
 * produit constant avec frais 25 bp LP (en réserve) + 25 bp maison (au
 * stock), liquidité proportionnelle, limites/whitelist, census incluant
 * les pools, refus d'autorisation par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  AMM_FEE_HOUSE_BP,
  AMM_FEE_LP_BP,
  ammQuote,
} from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import {
  ammLiquidity,
  executeAmmTrade,
  executeTrade,
  listMarkets,
  seedAmmPool,
  setMarketSlot,
} from '../../src/services/market.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers, censusRun } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let visitor = '';
let visitorCargo = '';
let marketId = '';

const handlers = { ...baseHandlers(), census_run: censusRun(3_000) };

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

/** Réserves EXACTES du slot (le view arrondit — on lit la config). */
async function poolOf(slotIndex: number): Promise<{ rx: number; ry: number }> {
  const { rows } = await pool.query(`SELECT config FROM buildings WHERE id = $1`, [
    marketId,
  ]);
  const slot = rows[0].config.slots[slotIndex];
  return { rx: Number(slot.pool.rx), ry: Number(slot.pool.ry) };
}

async function latestCensusTotals(): Promise<
  Record<string, { totalT: number; ammPoolT: number }>
> {
  const { rows } = await pool.query(
    `SELECT totals FROM census_snapshots ORDER BY taken_at DESC LIMIT 1`,
  );
  return rows[0]?.totals ?? {};
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `amm-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'PoolOwner',
    politics: 'mercantile',
    universeSeed: `amm-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `amm-visit-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'PoolVisitor',
    politics: 'industrialist',
    universeSeed: `amm-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  visitor = b.playerId;
  visitorCargo = b.spawn.cargoShipId;

  // Marché L2 actif (le gate mercantile du level-up est couvert par
  // levelup-demolish.test.ts — fixture directe ici).
  const { rows: m } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'market', 2, 0, 'active', 0) RETURNING id`,
    [ownerStarter],
  );
  marketId = m[0]!.id;
  // Trésorerie : le stock roulé du starter (~60 T d'ore) ne couvre pas les
  // seeds du scénario — dotation directe (dev, reproductible).
  // Dotation SOUS le cap (les réserves AMM comptent au stockage — un
  // monde sur-cap refuserait les échanges à entrée nette, §3.3b).
  for (const [res, tons] of [
    ['ore', 300],
    ['water', 100],
    ['carbon', 30],
    ['silicon', 30],
    ['hydrogen', 30],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
      [ownerStarter, res, tons],
    );
  }
  // Le visiteur est à quai (le vol est couvert ailleurs).
  await pool.query(
    `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
       hover_body_id = NULL,
       x = (SELECT x FROM bodies WHERE id = $2),
       y = (SELECT y FROM bodies WHERE id = $2)
     WHERE id = $1`,
    [visitorCargo, ownerStarter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('seed (le ratio du dépôt EST le prix ; physique ; §10)', () => {
  it('refus : étranger, marché L1, bundle invalide, stock insuffisant', async () => {
    await expect(
      seedAmmPool(pool, visitor, ownerStarter, marketId, 0, {
        x: 'ore',
        y: 'water',
        depositX: 10,
        depositY: 5,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await pool.query(`UPDATE buildings SET level = 1 WHERE id = $1`, [marketId]);
    await expect(
      seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
        x: 'ore',
        y: 'water',
        depositX: 10,
        depositY: 5,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('L2+'),
    });
    await pool.query(`UPDATE buildings SET level = 2 WHERE id = $1`, [marketId]);
    await expect(
      seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
        x: 'ore',
        y: 'ore',
        depositX: 10,
        depositY: 5,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
        x: 'gold',
        y: 'water',
        depositX: 10_000,
        depositY: 5,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
  });

  it('seed 100 ore / 50 water : stock déduit, spot 0,5, stockage INCHANGÉ (les réserves comptent)', async () => {
    const oreBefore = await stockOf(ownerStarter, 'ore');
    const waterBefore = await stockOf(ownerStarter, 'water');
    const usedBefore = (await planetDetail(pool, owner, ownerStarter)).storageUsedT;

    await seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
      x: 'ore',
      y: 'water',
      depositX: 100,
      depositY: 50,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [],
    });
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(oreBefore - 100, 5);
    expect(await stockOf(ownerStarter, 'water')).toBeCloseTo(waterBefore - 50, 2);

    const markets = await listMarkets(pool, owner, ownerStarter);
    const slot = markets[0]!.slots.find((s) => s.slotIndex === 0)!;
    expect(slot).toMatchObject({ mode: 'amm', x: 'ore', y: 'water', spot: 0.5 });

    // DG §3.3b : stock → pool est neutre pour le stockage occupé.
    const usedAfter = (await planetDetail(pool, owner, ownerStarter)).storageUsedT;
    expect(usedAfter).toBeCloseTo(usedBefore, 1);
  });

  it('un pool en place se protège : re-seed ET slot taux-fixe refusés', async () => {
    await expect(
      seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
        x: 'carbon',
        y: 'silicon',
        depositX: 5,
        depositY: 5,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('retirez la liquidité'),
    });
    await expect(
      setMarketSlot(pool, owner, ownerStarter, marketId, 0, {
        give: 'ore',
        get: 'water',
        rate: 1,
        dailyLimitT: 0,
        absoluteLimitT: 0,
        whitelist: [],
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('échange à produit constant (frais 25 bp LP + 25 bp maison)', () => {
  it('quote partagée = règlement serveur, à l\'unité près ; maison au stock ; journal', async () => {
    // 3 T : la sortie (~1,45 T d'eau) tient dans les 3 conteneurs du Cargo S.
    await pool.query(`UPDATE ships SET cargo = '{"ore": 3}' WHERE id = $1`, [
      visitorCargo,
    ]);
    const { rx, ry } = await poolOf(0);
    const expected = ammQuote(rx, ry, 3, AMM_FEE_LP_BP, AMM_FEE_HOUSE_BP);
    const oreStockBefore = await stockOf(ownerStarter, 'ore');

    const r = await executeAmmTrade(
      pool,
      visitor,
      marketId,
      0,
      visitorCargo,
      'ore',
      3,
    );
    expect(r.gotResource).toBe('water');
    expect(r.gotT).toBeCloseTo(expected.outT, 9);
    expect(r.lpFeeT).toBeCloseTo(expected.lpFeeT, 12);
    expect(r.houseFeeT).toBeCloseTo(expected.houseFeeT, 12);

    const after = await poolOf(0);
    expect(after.rx).toBeCloseTo(expected.newRIn, 9);
    expect(after.ry).toBeCloseTo(expected.newROut, 9);
    // k a crû (la jambe LP rémunère la liquidité dans la réserve).
    expect(after.rx * after.ry).toBeGreaterThan(rx * ry);
    // Commission maison au stock planétaire.
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(
      oreStockBefore + expected.houseFeeT,
      5,
    );
    const { rows: ship } = await pool.query(
      `SELECT cargo FROM ships WHERE id = $1`,
      [visitorCargo],
    );
    expect(ship[0].cargo.ore).toBeUndefined();
    expect(Number(ship[0].cargo.water)).toBeCloseTo(expected.outT, 9);
    const { rows: journal } = await pool.query(
      `SELECT * FROM trades WHERE market_building_id = $1 AND slot_index = 0`,
      [marketId],
    );
    expect(journal).toHaveLength(1);
  });

  it('jambe inverse (water → ore) et refus : jambe étrangère, pas à quai, slot fixe interdit', async () => {
    const { rows: ship } = await pool.query(
      `SELECT cargo FROM ships WHERE id = $1`,
      [visitorCargo],
    );
    const waterHeld = Number(ship[0].cargo.water);
    const r = await executeAmmTrade(
      pool,
      visitor,
      marketId,
      0,
      visitorCargo,
      'water',
      waterHeld,
    );
    expect(r.gotResource).toBe('ore');
    expect(r.gotT).toBeGreaterThan(0);

    await expect(
      executeAmmTrade(pool, visitor, marketId, 0, visitorCargo, 'carbon', 1),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      executeTrade(pool, visitor, marketId, 0, visitorCargo, 1),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('AMM'),
    });
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL WHERE id = $1`,
      [visitorCargo],
    );
    await expect(
      executeAmmTrade(pool, visitor, marketId, 0, visitorCargo, 'ore', 1),
    ).rejects.toMatchObject({ code: 'not_available' });
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = hover_body_id,
         hover_body_id = NULL, docked_at = now() WHERE id = $1`,
      [visitorCargo],
    );
  });

  it('whitelist (slot 1) : le visiteur est refusé, le propriétaire exempt ; limite quotidienne', async () => {
    await seedAmmPool(pool, owner, ownerStarter, marketId, 1, {
      x: 'carbon',
      y: 'silicon',
      depositX: 10,
      depositY: 10,
      dailyLimitT: 3,
      absoluteLimitT: 0,
      whitelist: [owner],
    });
    await pool.query(
      `UPDATE ships SET cargo = '{"carbon": 2}' WHERE id = $1`,
      [visitorCargo],
    );
    await expect(
      executeAmmTrade(pool, visitor, marketId, 1, visitorCargo, 'carbon', 1),
    ).rejects.toMatchObject({ code: 'forbidden' });

    // Le propriétaire est exempt de whitelist — et borné par la limite/jour.
    const { rows: ownShip } = await pool.query<{ id: string }>(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'cargo' LIMIT 1`,
      [owner],
    );
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
         hover_body_id = NULL, cargo = '{"carbon": 2}' WHERE id = $1`,
      [ownShip[0]!.id, ownerStarter],
    );
    await executeAmmTrade(pool, owner, marketId, 1, ownShip[0]!.id, 'carbon', 2);
    await pool.query(
      `UPDATE ships SET cargo = '{"carbon": 2}' WHERE id = $1`,
      [ownShip[0]!.id],
    );
    await expect(
      executeAmmTrade(pool, owner, marketId, 1, ownShip[0]!.id, 'carbon', 2),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('quotidienne'),
    });
  });
});

describe('liquidité (v1 propriétaire ; proportionnelle ; retrait libère)', () => {
  it('add proportionnel : prix préservé ; §10 : jamais un étranger', async () => {
    await expect(
      ammLiquidity(pool, visitor, ownerStarter, marketId, 0, {
        action: 'add',
        tonsX: 1,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const before = await poolOf(0);
    const spotBefore = before.ry / before.rx;
    const oreBefore = await stockOf(ownerStarter, 'ore');
    await ammLiquidity(pool, owner, ownerStarter, marketId, 0, {
      action: 'add',
      tonsX: 10,
    });
    const after = await poolOf(0);
    expect(after.rx).toBeCloseTo(before.rx + 10, 9);
    expect(after.ry / after.rx).toBeCloseTo(spotBefore, 9);
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(oreBefore - 10, 5);
  });

  it('remove 100 % : réserves au stock, slot LIBÉRÉ et re-seedable', async () => {
    const before = await poolOf(0);
    const oreBefore = await stockOf(ownerStarter, 'ore');
    const waterBefore = await stockOf(ownerStarter, 'water');
    await ammLiquidity(pool, owner, ownerStarter, marketId, 0, {
      action: 'remove',
      pct: 100,
    });
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(oreBefore + before.rx, 2);
    expect(await stockOf(ownerStarter, 'water')).toBeCloseTo(
      waterBefore + before.ry,
      2,
    );
    const markets = await listMarkets(pool, owner, ownerStarter);
    expect(
      markets[0]!.slots.find((s) => s.slotIndex === 0 && 'mode' in s),
    ).toBeUndefined();
    // Slot libéré : un taux fixe s'y pose sans obstacle.
    await setMarketSlot(pool, owner, ownerStarter, marketId, 0, {
      give: 'ore',
      get: 'water',
      rate: 1,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [],
    });
  });
});

describe('census : les réserves des pools comptent (DG §11.5)', () => {
  it('stock → pool est NEUTRE dans les totaux du census', async () => {
    await pool.query(`DELETE FROM events WHERE kind = 'census_run'`);
    await pool.query(
      `INSERT INTO events (due_at, kind, payload) VALUES (now(), 'census_run', '{}')`,
    );
    await processDueEvents(pool, handlers);
    const before = await latestCensusTotals();

    // 30 carbon du stock vers un pool (slot 2 : L2 n'en a que 2 — au 1,
    // déjà pris ? slot 1 vit encore ; on retire d'abord).
    await ammLiquidity(pool, owner, ownerStarter, marketId, 1, {
      action: 'remove',
      pct: 100,
    });
    await seedAmmPool(pool, owner, ownerStarter, marketId, 1, {
      x: 'carbon',
      y: 'hydrogen',
      depositX: 8,
      depositY: 4,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [],
    });
    await pool.query(`DELETE FROM events WHERE kind = 'census_run'`);
    await pool.query(
      `INSERT INTO events (due_at, kind, payload) VALUES (now(), 'census_run', '{}')`,
    );
    await processDueEvents(pool, handlers);
    const after = await latestCensusTotals();
    // Conservation : le déplacement stock→pool ne change pas l'offre —
    // et le compartiment ammPoolT porte bien les réserves.
    expect(after.carbon.totalT).toBeCloseTo(before.carbon.totalT, 1);
    expect(after.hydrogen.totalT).toBeCloseTo(before.hydrogen.totalT, 1);
    expect(after.carbon.ammPoolT).toBeGreaterThanOrEqual(8);
    expect(after.hydrogen.ammPoolT).toBeGreaterThanOrEqual(4);
  });
});

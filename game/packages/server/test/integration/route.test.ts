/**
 * Intégration routage cells-étoile & nudge triade (GB §13, DG §11.2) :
 * meilleure exécution 1–2 jambes sur les pools de LA planète, double
 * frais (chaque jambe paie SON pool), intermédiaire jamais en soute,
 * journal ×2, éligibilité par jambe (whitelist/limites), refus directs
 * (§10) ; nudge = aucune paire FOOD dans la portée télescope (paire
 * propre OU étrangère visible l'éteint).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  AMM_FEE_HOUSE_BP,
  ammLpFeeBp,
  ammRouteQuote,
} from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import {
  ammLiquidity,
  executeAmmRoute,
  seedAmmPool,
} from '../../src/services/market.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let visitor = '';
let visitorCargo = '';
let marketId = '';

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

async function poolsOf(): Promise<Record<number, { rx: number; ry: number }>> {
  const { rows } = await pool.query(`SELECT config FROM buildings WHERE id = $1`, [
    marketId,
  ]);
  const out: Record<number, { rx: number; ry: number }> = {};
  (rows[0].config.slots ?? []).forEach(
    (s: { pool?: { rx: number; ry: number } } | null, i: number) => {
      if (s?.pool) out[i] = { rx: Number(s.pool.rx), ry: Number(s.pool.ry) };
    },
  );
  return out;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `route-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'RouteOwner',
    politics: 'mercantile',
    universeSeed: `route-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `route-visit-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'RouteVisitor',
    politics: 'industrialist',
    universeSeed: `route-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  visitor = b.playerId;
  visitorCargo = b.spawn.cargoShipId;

  // Marché L3 actif (3 slots — et jambe LP à 20 bp, vérifiée en route).
  const { rows: m } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'market', 3, 0, 'active', 0) RETURNING id`,
    [ownerStarter],
  );
  marketId = m[0]!.id;
  for (const [res, tons] of [
    ['ore', 200],
    ['fuel_cells', 150],
    ['water', 100],
    ['food_1', 40],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
      [ownerStarter, res, tons],
    );
  }
  // Étoile-cellules : ore/cells + cells/water (aucun pool direct ore/water).
  await seedAmmPool(pool, owner, ownerStarter, marketId, 0, {
    x: 'ore',
    y: 'fuel_cells',
    depositX: 100,
    depositY: 50,
    dailyLimitT: 0,
    absoluteLimitT: 0,
    whitelist: [],
  });
  await seedAmmPool(pool, owner, ownerStarter, marketId, 1, {
    x: 'fuel_cells',
    y: 'water',
    depositX: 60,
    depositY: 60,
    dailyLimitT: 0,
    absoluteLimitT: 0,
    whitelist: [],
  });
  await pool.query(
    `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
       hover_body_id = NULL, cargo = '{"ore": 3}',
       x = (SELECT x FROM bodies WHERE id = $2),
       y = (SELECT y FROM bodies WHERE id = $2)
     WHERE id = $1`,
    [visitorCargo, ownerStarter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('routage deux jambes (double frais, canon GB §13)', () => {
  it('ore → water via cells : quote composée EXACTE, journal ×2, intermédiaire jamais en soute', async () => {
    const before = await poolsOf();
    const lp = ammLpFeeBp(3); // 20 bp au L3
    const expected = ammRouteQuote(
      { rIn: before[0]!.rx, rOut: before[0]!.ry, lpBp: lp, houseBp: AMM_FEE_HOUSE_BP },
      { rIn: before[1]!.rx, rOut: before[1]!.ry, lpBp: lp, houseBp: AMM_FEE_HOUSE_BP },
      3,
    );
    const oreStock = await stockOf(ownerStarter, 'ore');
    const cellsStock = await stockOf(ownerStarter, 'fuel_cells');

    const r = await executeAmmRoute(
      pool,
      visitor,
      ownerStarter,
      visitorCargo,
      'ore',
      'water',
      3,
    );
    expect(r.midResource).toBe('fuel_cells');
    expect(r.gotT).toBeCloseTo(expected.outT, 9);
    expect(r.legs).toHaveLength(2);
    expect(r.legs[0]!.gotT).toBeCloseTo(expected.midT, 9);

    // Soute : jamais l'intermédiaire.
    const { rows: ship } = await pool.query(
      `SELECT cargo FROM ships WHERE id = $1`,
      [visitorCargo],
    );
    expect(ship[0].cargo.fuel_cells).toBeUndefined();
    expect(ship[0].cargo.ore).toBeUndefined();
    expect(Number(ship[0].cargo.water)).toBeCloseTo(expected.outT, 9);

    // Chaque jambe a payé SA maison (double frais) au stock planétaire.
    expect(await stockOf(ownerStarter, 'ore')).toBeCloseTo(
      oreStock + expected.legs[0]!.houseFeeT,
      5,
    );
    expect(await stockOf(ownerStarter, 'fuel_cells')).toBeCloseTo(
      cellsStock + expected.legs[1]!.houseFeeT,
      5,
    );
    // Réserves des DEUX pools mises à jour.
    const after = await poolsOf();
    expect(after[0]!.rx).toBeCloseTo(expected.legs[0]!.newRIn, 9);
    expect(after[1]!.ry).toBeCloseTo(expected.legs[1]!.newROut, 9);
    // Journal : une ligne PAR jambe.
    const { rows: journal } = await pool.query(
      `SELECT slot_index FROM trades WHERE market_building_id = $1 ORDER BY id`,
      [marketId],
    );
    expect(journal.map((j) => j.slot_index)).toEqual([0, 1]);
  });

  it('un pool DIRECT meilleur gagne (frais simples, route à 1 jambe)', async () => {
    // Pool direct ore/water généreux sur le slot 2.
    await seedAmmPool(pool, owner, ownerStarter, marketId, 2, {
      x: 'ore',
      y: 'water',
      depositX: 30,
      depositY: 30,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [],
    });
    await pool.query(`UPDATE ships SET cargo = '{"ore": 2}' WHERE id = $1`, [
      visitorCargo,
    ]);
    const r = await executeAmmRoute(
      pool,
      visitor,
      ownerStarter,
      visitorCargo,
      'ore',
      'water',
      2,
    );
    expect(r.midResource).toBeNull();
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]!.slotIndex).toBe(2);
    // Nettoyage : retire le pool direct pour les tests suivants.
    await ammLiquidity(pool, owner, ownerStarter, marketId, 2, {
      action: 'remove',
      pct: 100,
    });
  });

  it('éligibilité PAR JAMBE : une whitelist sur la jambe 2 exclut la route du visiteur', async () => {
    // Slot 2 : cells/water réservé au propriétaire — la route ore→water
    // via CE pool est inéligible ; la seule route restante passe par le
    // slot 1 (ouvert). On retire le slot 1 pour prouver le refus.
    await seedAmmPool(pool, owner, ownerStarter, marketId, 2, {
      x: 'fuel_cells',
      y: 'water',
      depositX: 20,
      depositY: 20,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [owner],
    });
    await ammLiquidity(pool, owner, ownerStarter, marketId, 1, {
      action: 'remove',
      pct: 100,
    });
    await pool.query(`UPDATE ships SET cargo = '{"ore": 2}' WHERE id = $1`, [
      visitorCargo,
    ]);
    await expect(
      executeAmmRoute(pool, visitor, ownerStarter, visitorCargo, 'ore', 'water', 2),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('Aucune route'),
    });
    // Le PROPRIÉTAIRE, exempt de whitelist, route sans obstacle.
    const { rows: ownShip } = await pool.query<{ id: string }>(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'cargo' LIMIT 1`,
      [owner],
    );
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
         hover_body_id = NULL, cargo = '{"ore": 2}' WHERE id = $1`,
      [ownShip[0]!.id, ownerStarter],
    );
    const r = await executeAmmRoute(
      pool,
      owner,
      ownerStarter,
      ownShip[0]!.id,
      'ore',
      'water',
      2,
    );
    expect(r.midResource).toBe('fuel_cells');
  });

  it('refus directs (§10) : pas à quai, vaisseau d\'autrui, paire invalide', async () => {
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL WHERE id = $1`,
      [visitorCargo],
    );
    await expect(
      executeAmmRoute(pool, visitor, ownerStarter, visitorCargo, 'ore', 'water', 1),
    ).rejects.toMatchObject({ code: 'not_available' });
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = hover_body_id,
         hover_body_id = NULL, docked_at = now() WHERE id = $1`,
      [visitorCargo],
    );
    await expect(
      executeAmmRoute(pool, owner, ownerStarter, visitorCargo, 'ore', 'water', 1),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      executeAmmRoute(pool, visitor, ownerStarter, visitorCargo, 'ore', 'ore', 1),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('nudge triade (DG §11.2 — portée télescope)', () => {
  it('true sans paire FOOD ; une paire food_1/cells PROPRE l\'éteint', async () => {
    let detail = await planetDetail(pool, owner, ownerStarter);
    expect(detail.triadNudge).toBe(true);
    await seedAmmPool(pool, owner, ownerStarter, marketId, 1, {
      x: 'food_1',
      y: 'fuel_cells',
      depositX: 20,
      depositY: 20,
      dailyLimitT: 0,
      absoluteLimitT: 0,
      whitelist: [],
    });
    detail = await planetDetail(pool, owner, ownerStarter);
    expect(detail.triadNudge).toBe(false);
    await ammLiquidity(pool, owner, ownerStarter, marketId, 1, {
      action: 'remove',
      pct: 100,
    });
    detail = await planetDetail(pool, owner, ownerStarter);
    expect(detail.triadNudge).toBe(true);
  });

  it('une paire FOOD ÉTRANGÈRE visible au télescope l\'éteint aussi ; hors portée, non', async () => {
    // Marché du VISITEUR avec un slot taux-fixe food (sa poche est à
    // 150-240 pc : hors du ciel de base de 60 pc).
    const { rows: vHome } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id = $1 AND body_type = 'planet' LIMIT 1`,
      [visitor],
    );
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce, config)
       VALUES ($1, 'market', 1, 0, 'active', 0,
               '{"slots": [{"give": "ore", "get": "food_1", "rate": 1,
                            "dailyLimitT": 0, "absoluteLimitT": 0,
                            "whitelist": [], "rateUpdatedAtMs": 0}]}')`,
      [vHome[0].id],
    );
    let detail = await planetDetail(pool, owner, ownerStarter);
    expect(detail.triadNudge).toBe(true); // hors portée : le nudge reste

    // Télescope L2 (+400 pc) : le marché voisin entre dans le ciel.
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, status, workforce)
       VALUES ($1, 'telescope', 2, 'active', 0)`,
      [ownerStarter],
    );
    detail = await planetDetail(pool, owner, ownerStarter);
    expect(detail.triadNudge).toBe(false);
  });

  it('null sans marché actif sur CE monde', async () => {
    const { rows: vHome } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id = $1 AND body_type = 'planet' LIMIT 1`,
      [visitor],
    );
    const detail = await planetDetail(pool, visitor, vHome[0].id);
    // Le monde du visiteur A un marché (fixture précédente) : true/false —
    // on vérifie null sur un monde SANS marché : n'importe quel monde
    // sauvage n'est pas consultable ; on retire donc son marché.
    await pool.query(
      `DELETE FROM buildings WHERE body_id = $1 AND key = 'market'`,
      [vHome[0].id],
    );
    const detail2 = await planetDetail(pool, visitor, vHome[0].id);
    expect(detail2.triadNudge).toBeNull();
    expect(detail).toBeTruthy();
  });
});

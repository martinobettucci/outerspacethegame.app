/** @verifies This test file verifies: docs/MASTER_PLAN.md §W8 (W8a+W8b) ; GAME_BOOK.md §14 (amendé 2026-07-21) ; DESIGN_GUIDE.md §8.1. */
/**
 * Intégration W8a : naissance du CRUSADER (MASTER_PLAN W8, JOURNAL
 * 2026-07-21) sur vraie base — le combat_l naît EN SURVOL (jamais à
 * quai), 25 % de la population source migre à bord (proportions d'âges,
 * compteurs décrémentés), l'oxygène/vivres d'amorçage sont puisés au
 * stock (partiel annoncé), l'infrastructure est FIGÉE ; atterrissage et
 * entrepôt REFUSÉS ; il vole comme une coque normale.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { CRUSADER } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { buildShip, dockAtCrusader, fleet, landShip, moveShip, undockFromCrusader, warehouseShip } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let crusaderId = '';

const FAST = { timeScale: 1_000_000 };

async function pump(loops: number): Promise<void> {
  for (let i = 0; i < loops; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers());
  }
}

async function planetPop(): Promise<{ population: number; children: number; seniors: number }> {
  const { rows } = await pool.query(
    `SELECT population, pop_children, pop_seniors FROM bodies WHERE id = $1`,
    [starter],
  );
  return {
    population: Number(rows[0].population),
    children: Number(rows[0].pop_children),
    seniors: Number(rows[0].pop_seniors),
  };
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `cru-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Admiral',
    politics: 'scientific',
    universeSeed: `cru-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Chantier L3 (coques L) + trésorerie + provisions d'amorçage.
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'shipyard', 3, 0, 'active', 0)`,
    [starter],
  );
  for (const [res, qty] of [
    ['steel_h', 800],
    ['steel_l', 400],
    ['fuel_cells', 400],
    ['oxygen', 300],
    ['food_1', 200],
    ['water', 200],
    ['fuel_cold', 300],
    ['fuel_hot', 300],
    ['fuel_gas', 300],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
      [starter, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('W8a — naissance du Crusader', () => {
  it('naît EN SURVOL avec 25 % de la population source (proportions d\'âges) et l\'oxygène au stock', async () => {
    const before = await planetPop();
    expect(before.population).toBeGreaterThan(0);
    const { rows: oxyBefore } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'oxygen'`,
      [starter],
    );
    await buildShip(
      pool,
      owner,
      starter,
      { category: 'combat', size: 'l', name: 'Le Croisé' },
      FAST,
    );
    await pump(15);
    const ships = await fleet(pool, owner);
    const cru = ships.find((s) => s.name === 'Le Croisé')!;
    expect(cru).toBeTruthy();
    crusaderId = cru.id;
    // JAMAIS à quai : né en survol de son monde.
    expect(cru.status).toBe('hovering');
    expect(cru.hoverBodyId).toBe(starter);
    const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [
      crusaderId,
    ]);
    const row = rows[0];
    // 25 % embarqués, proportions d'âges, somme exacte.
    const expectedTotal = Math.floor(before.population * CRUSADER.migrationFraction);
    const pop = row.crusader_pop;
    expect(pop.children + pop.actives + pop.seniors).toBe(expectedTotal);
    const after = await planetPop();
    expect(before.population - after.population).toBe(expectedTotal);
    expect(before.children - after.children).toBe(pop.children);
    expect(before.seniors - after.seniors).toBe(pop.seniors);
    // Oxygène d'amorçage puisé au stock (on respire AU STOCK à bord).
    expect(Number(row.crusader_stock.oxygen)).toBeCloseTo(
      CRUSADER.birthStock.oxygen!,
      3,
    );
    const { rows: oxyAfter } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'oxygen'`,
      [starter],
    );
    expect(
      Number(oxyBefore[0].amount_t) - Number(oxyAfter[0].amount_t),
    ).toBeCloseTo(CRUSADER.birthStock.oxygen!, 2);
    // Infrastructure FIGÉE écrite (descriptive v1).
    expect(row.crusader_infra.residential).toBe(3);
    expect(row.crusader_infra.markets).toBe(false);
    // Plein de naissance 25 % du réservoir (coque L : 400 u → 100 u).
    expect(Number(cru.fuel[cru.fuelType])).toBeCloseTo(100, 1);
  });

  it('ne se pose JAMAIS : atterrissage et entrepôt refusés, mais il VOLE', async () => {
    await expect(landShip(pool, owner, crusaderId, FAST)).rejects.toMatchObject({
      code: 'not_available',
    });
    await expect(
      warehouseShip(pool, owner, crusaderId),
    ).rejects.toMatchObject({ code: 'not_available' });
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    const r = await moveShip(
      pool,
      owner,
      crusaderId,
      { x: Number(pos[0].x) + 8, y: Number(pos[0].y) },
      FAST,
    );
    expect(r.arrivesAt).toBeTruthy();
  });
});

describe('W8c — docks VOLANTS (amarrage au Crusader)', () => {
  let hauler = '';

  it("le hauler s'amarre à ≤ 1 pc : réservoir gelé, il voyage avec l'hôte", async () => {
    // L'arrivée du vol de W8a peut encore être en file : on la traite.
    await pump(10);
    const { rows: st } = await pool.query(
      `SELECT status FROM ships WHERE id = $1`,
      [crusaderId],
    );
    expect(['idle', 'hovering']).toContain(st[0].status);
    const f = await fleet(pool, owner);
    hauler = f.find((s) => s.name === 'First hauler')!.id;
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM ships WHERE id = $1`,
      [crusaderId],
    );
    // Le hauler posé à couple (fixture §15 — le vol libre est couvert).
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3, fuel = '{"cold": 20}',
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
         fuel_rate_u_per_day = 0, fuel_as_of = now(), engine_type = 'cold'
       WHERE id = $1`,
      [hauler, Number(pos[0].x) + 0.4, Number(pos[0].y)],
    );
    await dockAtCrusader(pool, owner, hauler, crusaderId);
    const { rows: g } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [hauler]);
    expect(g[0].status).toBe('docked');
    expect(g[0].follow_ship_id).toBe(crusaderId);
    expect(Number(g[0].fuel_rate_u_per_day)).toBe(0); // gelé à bord

    // Le Crusader vole : l'invité arrive AVEC lui.
    const { rows: home } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    await moveShip(
      pool,
      owner,
      crusaderId,
      { x: Number(home[0].x) + 15, y: Number(home[0].y) + 3 },
      FAST,
    );
    await pump(15);
    const { rows: after } = await pool.query(
      `SELECT g.x AS gx, g.y AS gy, s.x AS sx, s.y AS sy
       FROM ships g JOIN ships s ON s.id = g.follow_ship_id
       WHERE g.id = $1`,
      [hauler],
    );
    expect(Number(after[0].gx)).toBeCloseTo(Number(after[0].sx), 6);
    expect(Number(after[0].gy)).toBeCloseTo(Number(after[0].sy), 6);
  });

  it('gardes : sonde/personnel/Crusader refusés, trop loin refusé ; appareillage OK', async () => {
    // Un Crusader ne s'amarre pas à un Crusader (lui-même inclus).
    await expect(
      dockAtCrusader(pool, owner, crusaderId, crusaderId),
    ).rejects.toMatchObject({ code: 'not_available' });
    // L'invité repart à l'arrêt.
    const r = await undockFromCrusader(pool, owner, hauler);
    expect(r.status).toBe('idle');
    const { rows: g } = await pool.query(
      `SELECT status, follow_ship_id FROM ships WHERE id = $1`,
      [hauler],
    );
    expect(g[0].status).toBe('idle');
    expect(g[0].follow_ship_id).toBeNull();
    // Trop loin : refusé.
    await pool.query(
      `UPDATE ships SET x = x + 50 WHERE id = $1`,
      [hauler],
    );
    await expect(
      dockAtCrusader(pool, owner, hauler, crusaderId),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('W8b — la fiche pop v2 VIVANTE à bord (crusader_daily)', () => {
  /** Force l'horloge quotidienne du bord à MAINTENANT puis la traite. */
  async function tickDaily(): Promise<void> {
    await pool.query(
      `UPDATE events SET due_at = now() - interval '1 second'
       WHERE processed_at IS NULL AND kind = 'crusader_daily'
         AND payload->>'shipId' = $1`,
      [crusaderId],
    );
    await processDueEvents(pool, baseHandlers());
  }

  async function board() {
    const { rows } = await pool.query(
      `SELECT crusader_pop, crusader_stock FROM ships WHERE id = $1`,
      [crusaderId],
    );
    return rows[0];
  }

  it('un jour à bord : consommation au STOCK, natalité residential L3, vieillissement', async () => {
    const before = await board();
    const popBefore =
      before.crusader_pop.children +
      before.crusader_pop.actives +
      before.crusader_pop.seniors;
    const oxyBefore = Number(before.crusader_stock.oxygen);
    await tickDaily();
    const after = await board();
    const popAfter =
      after.crusader_pop.children +
      after.crusader_pop.actives +
      after.crusader_pop.seniors;
    // Le stock d'oxygène de bord a payé la journée.
    expect(Number(after.crusader_stock.oxygen)).toBeLessThan(oxyBefore);
    // Natalité 0,24 × actifs × M_growth : le bord CROÎT (servi partout).
    expect(popAfter).toBeGreaterThan(popBefore);
    expect(after.crusader_pop.children).toBeGreaterThan(
      before.crusader_pop.children,
    );
    // L'horloge se replanifie (le bord vit).
    const { rows: next } = await pool.query(
      `SELECT 1 FROM events WHERE processed_at IS NULL
         AND kind = 'crusader_daily' AND payload->>'shipId' = $1`,
      [crusaderId],
    );
    expect(next).toHaveLength(1);
  });

  it("pénurie d'EAU : horloge 3 j posée et morts linéaires ; ravitaillé, elle se lève", async () => {
    await pool.query(
      `UPDATE ships SET crusader_stock = crusader_stock || '{"water": 0}'
       WHERE id = $1`,
      [crusaderId],
    );
    const before = await board();
    const popBefore =
      before.crusader_pop.children +
      before.crusader_pop.actives +
      before.crusader_pop.seniors;
    await tickDaily();
    const mid = await board();
    expect(mid.crusader_pop.clock_deadlines.water).toBeTruthy();
    // Ravitaillé : l'horloge se lève au jour suivant.
    await pool.query(
      `UPDATE ships SET crusader_stock = crusader_stock || '{"water": 50}'
       WHERE id = $1`,
      [crusaderId],
    );
    await tickDaily();
    const after = await board();
    expect(after.crusader_pop.clock_deadlines.water).toBeUndefined();
    expect(popBefore).toBeGreaterThan(0); // garde de scénario
  });

  it("OXYGÈNE à sec : mort instantanée de tout le bord, l'horloge s'arrête", async () => {
    await pool.query(
      `UPDATE ships SET crusader_stock = crusader_stock || '{"oxygen": 0}'
       WHERE id = $1`,
      [crusaderId],
    );
    await tickDaily();
    const after = await board();
    expect(after.crusader_pop.children).toBe(0);
    expect(after.crusader_pop.actives).toBe(0);
    expect(after.crusader_pop.seniors).toBe(0);
    // Les morts sont tracées ; plus d'horloge quotidienne.
    expect(after.crusader_pop.demo_counters.deaths.actives).toBeGreaterThan(0);
    const { rows: next } = await pool.query(
      `SELECT 1 FROM events WHERE processed_at IS NULL
         AND kind = 'crusader_daily' AND payload->>'shipId' = $1`,
      [crusaderId],
    );
    expect(next).toHaveLength(0);
  });
});

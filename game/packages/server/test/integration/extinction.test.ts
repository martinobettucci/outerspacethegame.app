/**
 * Intégration BD sur vraie PostgreSQL : embarquement C/A/S sans garde morale
 * jusqu'à P=0, extinction canonique, héritage intact, puis recolonisation du
 * même monde avec le manifeste exact et une nouvelle grâce.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { colonizeShip, transferSettlers } from '../../src/services/colonization.js';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import { undockShip } from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

describe('extinction → monde sauvage → recolonisation (GB §10)', () => {
  it('retire propriété/gouverneurs, conserve l\'héritage et repart du manifeste', async () => {
    const account = await registerPlayer(pool, {
      email: `bd-extinction-${run}@test.local`,
      password: 'motdepasse-solide-bd',
      displayName: 'Phoenix',
      politics: 'industrialist',
      universeSeed: `bd-extinction-universe-${run}`,
    });
    const bodyId = account.spawn.starterPlanetId;

    const { rows: depositsBefore } = await pool.query(
      `SELECT id, resource FROM deposits WHERE body_id = $1 ORDER BY id`,
      [bodyId],
    );
    expect(depositsBefore.length).toBeGreaterThan(0);
    const mined = String(depositsBefore[0].resource);

    // Monde exact de 300 têtes ; tout l'emploi est actif. L'ordre d'embarquer
    // les 180 actifs doit être accepté et ramener le staff à zéro.
    await pool.query(
      `UPDATE bodies
          SET population = 300, pop_children = 60, pop_seniors = 60,
              config = '{"innateOffers":[{"sell":"water","want":"ore","price":2}]}'
        WHERE id = $1`,
      [bodyId],
    );
    const { rows: inheritedBuildings } = await pool.query<{ id: string }>(
      `INSERT INTO buildings
         (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES
         ($1, 'spaceport', 1, 2, 'active', NULL, 30),
         ($1, 'mine', 2, 3, 'active', $2, 150)
       RETURNING id`,
      [bodyId, `extract:${mined}`],
    );
    await pool.query(
      `INSERT INTO tech_unlocks (body_id, node_key)
       VALUES ($1, 'colony_program') ON CONFLICT DO NOTHING`,
      [bodyId],
    );
    const { rows: governor } = await pool.query<{ id: string }>(
      `INSERT INTO npcs
         (owner_id, people, role, rarity, stat_rolls, bound_host_type, bound_host_id)
       VALUES ($1, 'human', 'engineer', 'rare', '{}', 'planet', $2)
       RETURNING id`,
      [account.playerId, bodyId],
    );
    const { rows: ark } = await pool.query<{ id: string }>(
      `INSERT INTO ships
         (owner_id, hull_category, hull_size, name, x, y, status,
          docked_body_id, docked_at, fuel, colony_kit)
       SELECT $1, 'civil', 'm', 'Phoenix Ark', x, y, 'docked', id, now(),
              '{"cold":100}', true
         FROM bodies WHERE id = $2
       RETURNING id`,
      [account.playerId, bodyId],
    );
    await pool.query(
      `UPDATE planet_stock SET amount_t = 0 WHERE body_id = $1`,
      [bodyId],
    );
    const { rows: stockIdsBefore } = await pool.query(
      `SELECT resource FROM planet_stock WHERE body_id = $1 ORDER BY resource`,
      [bodyId],
    );

    const moved = await transferSettlers(pool, account.playerId, ark[0]!.id, {
      children: 60,
      actives: 180,
      seniors: 60,
      direction: 'embark',
    });
    expect(moved).toEqual({
      settlers: 300,
      manifest: { children: 60, actives: 180, seniors: 60 },
    });

    const { rows: extinctRows } = await pool.query(
      `SELECT owner_id, is_starter, account_bound_until, colonized_at,
              population, pop_children, pop_seniors, illness,
              unemp_over_days, clock_deadlines, demo_counters, config
         FROM bodies WHERE id = $1`,
      [bodyId],
    );
    const extinct = extinctRows[0];
    expect(extinct.owner_id).toBeNull();
    expect(extinct.is_starter).toBe(false);
    expect(extinct.account_bound_until).toBeNull();
    expect(extinct.colonized_at).toBeNull();
    expect(Number(extinct.population)).toBe(0);
    expect(Number(extinct.pop_children)).toBe(0);
    expect(Number(extinct.pop_seniors)).toBe(0);
    expect(Number(extinct.illness)).toBe(0);
    expect(Number(extinct.unemp_over_days)).toBe(0);
    expect(extinct.clock_deadlines).toEqual({});
    expect(extinct.demo_counters.exodus).toEqual({
      children: 60,
      actives: 180,
      seniors: 60,
    });
    expect(extinct.config.innateOffers).toBeUndefined();

    const { rows: keptBuildings } = await pool.query(
      `SELECT id, workforce FROM buildings WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [inheritedBuildings.map((building) => building.id)],
    );
    expect(keptBuildings.map((building) => building.id).sort()).toEqual(
      inheritedBuildings.map((building) => building.id).sort(),
    );
    expect(keptBuildings.every((building) => Number(building.workforce) === 0)).toBe(true);
    expect(
      Number(
        (
          await pool.query(
            `SELECT count(*) FROM tech_unlocks
             WHERE body_id = $1 AND node_key = 'colony_program'`,
            [bodyId],
          )
        ).rows[0].count,
      ),
    ).toBe(1);
    expect(
      Number(
        (
          await pool.query(`SELECT count(*) FROM npcs WHERE id = $1`, [governor[0]!.id])
        ).rows[0].count,
      ),
    ).toBe(0);
    expect(
      (
        await pool.query(
          `SELECT resource FROM planet_stock WHERE body_id = $1 ORDER BY resource`,
          [bodyId],
        )
      ).rows,
    ).toEqual(stockIdsBefore);
    expect(
      (
        await pool.query(`SELECT id, resource FROM deposits WHERE body_id = $1 ORDER BY id`, [bodyId])
      ).rows,
    ).toEqual(depositsBefore);
    const { rows: liveRates } = await pool.query(
      `SELECT
         (SELECT COALESCE(max(abs(rate_t_per_day)), 0) FROM planet_stock WHERE body_id = $1) AS stock_rate,
         (SELECT COALESCE(max(abs(rate_t_per_day)), 0) FROM deposits WHERE body_id = $1) AS deposit_rate,
         (SELECT count(*) FROM events WHERE processed_at IS NULL
            AND kind IN ('pop_daily', 'pop_clock') AND payload->>'bodyId' = $1::text) AS pop_events`,
      [bodyId],
    );
    expect(Number(liveRates[0].stock_rate)).toBe(0);
    expect(Number(liveRates[0].deposit_rate)).toBe(0);
    expect(Number(liveRates[0].pop_events)).toBe(0);

    // Le même vaisseau quitte le quai devenu sauvage et lance la vraie
    // commande de colonisation ; l'événement 72 h est avancé explicitement.
    await undockShip(pool, account.playerId, ark[0]!.id);
    const colonizing = await colonizeShip(pool, account.playerId, ark[0]!.id, {
      timeScale: 1_000_000,
    });
    await processDueEvents(pool, baseHandlers(), {
      nowMs: colonizing.completesAt.getTime() + 1,
    });

    const detail = await planetDetail(pool, account.playerId, bodyId);
    expect(detail.population).toBe(300);
    expect(detail.pyramid).toEqual({ children: 60, actives: 180, seniors: 60 });
    expect(detail.colonizedAt).toBeTruthy();
    expect(detail.graceUntil).toBeTruthy();
    const { rows: reborn } = await pool.query(
      `SELECT demo_counters FROM bodies WHERE id = $1`,
      [bodyId],
    );
    expect(reborn[0].demo_counters).toEqual({});
    expect(detail.buildings.some((building) => building.id === inheritedBuildings[0]!.id)).toBe(true);
    expect(detail.buildings.some((building) => building.id === inheritedBuildings[1]!.id)).toBe(true);
  });
});

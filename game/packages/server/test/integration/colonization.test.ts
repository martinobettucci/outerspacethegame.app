/**
 * Intégration : colonisation (GB §19/§14/§12, DG §12/§3.2/§10.3) sur
 * vraie base — fitting (prérequis + coût provisionné), settlers
 * (spaceport, pax, manifeste C/A/S sans garde morale), équipage (liaison permanente),
 * péage de route déterministe à l'arrivée, établissement 72 h (transfert
 * de propriété, conversion de coque, gouverneur), grâce 14 j exposée,
 * refus d'autorisation par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  COLONY_FITTING_COST,
  COLONY_SEED_STOCK,
  ITEMS,
} from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail, unlockNode } from '../../src/services/planets.js';
import {
  colonizeShip,
  fitColonyKit,
  transferSettlers,
} from '../../src/services/colonization.js';
import { assignCrew, fleet, listNpcs, moveShip } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let colonyShip = '';
let pilotId = '';
let wildId = '';
let intruder = '';

const FAST = { timeScale: 1_000_000 };

async function processAll(kind: string): Promise<void> {
  // Attend l'épuisement de TOUS les événements du type — y compris ceux
  // datés quelques centaines de ms dans le futur (échelle FAST).
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = $1`,
      [kind],
    );
    if (rows[0].n === 0) return;
  }
  throw new Error(`événements ${kind} jamais épuisés`);
}

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `col-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Coloniser',
    politics: 'industrialist',
    universeSeed: `col-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `col-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intrus',
    politics: 'militarist',
    universeSeed: `col-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  intruder = b.playerId;
  // v2 : le starter naît à 350 (sous sa capacité d'emploi) — la fixture
  // le mûrit à 1 200 (pyramide stationnaire) pour pouvoir embarquer des
  // cohortes de 300 (chemin déterministe §15 ; dans le vrai jeu, la
  // natalité fait ce travail en ~J+40).
  await pool.query(
    `UPDATE bodies SET population = 1200, pop_children = 218,
        pop_seniors = 327 WHERE id = $1`,
    [starter],
  );
  // Cible sauvage DÉTERMINISTE : un wild de la poche, climat forcé non-
  // poison et tuiles garanties (le roll climatique par run rendrait le
  // test aléatoire ; l'éligibilité poison est testée séparément).
  wildId = a.spawn.wildPlanetIds[0]!;
  await pool.query(
    `UPDATE bodies SET climate = 'cold', tiles = GREATEST(tiles, 8) WHERE id = $1`,
    [wildId],
  );
  // Coque Civil M à quai (la construction navale est couverte par
  // shipyard.test.ts) + trésorerie de fitting.
  const { rows: s } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y, status,
                        docked_body_id, fuel, cargo)
     SELECT $1, 'civil', 'm', 'Arche', x, y, 'docked', id, '{"cold": 100}', '{}'
     FROM bodies WHERE id = $2 RETURNING id`,
    [owner, starter],
  );
  colonyShip = s[0]!.id;
  for (const [res, qty] of [
    ['ore', 200],
    ['steel_l', 200],
    ['steel_h', 20],
    ['fuel_cells', 500],
    ['crystal_temperate', 10],
    ['crystal_cold', 10],
    ['crystal_hot', 10],
    ['food_1', 60],
    ['water', 60],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = planet_stock.amount_t + $3`,
      [starter, res, qty],
    );
  }
  // Infrastructure requise : workshop L2 + spaceport actifs (les chemins
  // unlock/build/level-up sont couverts par leurs propres tests).
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 2, 0, 'active', 0), ($1, 'spaceport', 1, 1, 'active', 0)`,
    [starter],
  );
  const pilots = await listNpcs(pool, owner);
  pilotId = pilots.find((n) => n.role === 'pilot')!.id;
  // Réduction de risque FIXÉE pour un péage exactement assertable.
  await pool.query(
    `UPDATE npcs SET stat_rolls = '{"settler_risk_reduction": 0.02}' WHERE id = $1`,
    [pilotId],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('fitting colonie (DG §12.1)', () => {
  it('refus AVANT les prérequis : programme non déverrouillé, puis workshop, puis coque', async () => {
    await expect(fitColonyKit(pool, owner, colonyShip)).rejects.toMatchObject({
      code: 'not_unlocked',
    });
    await unlockNode(pool, owner, starter, 'colony_program');
    // Workshop L2 existe déjà ici — teste la coque inapte à la place.
    const { rows: cargoShip } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'cargo'`,
      [owner],
    );
    await expect(fitColonyKit(pool, owner, cargoShip[0].id)).rejects.toMatchObject({
      code: 'not_available',
    });
  });

  it('équipe le kit : coût = core + fitting + provisions (payé au stock)', async () => {
    const before = Number(
      (
        await pool.query(
          `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'fuel_cells'`,
          [starter],
        )
      ).rows[0].amount_t,
    );
    const { cost } = await fitColonyKit(pool, owner, colonyShip);
    expect(cost.fuel_cells).toBe(
      (COLONY_FITTING_COST.fuel_cells ?? 0) + (ITEMS.terraform_core.cost.fuel_cells ?? 0),
    );
    expect(cost.food_1).toBe(COLONY_SEED_STOCK.food_1);
    const after = Number(
      (
        await pool.query(
          `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'fuel_cells'`,
          [starter],
        )
      ).rows[0].amount_t,
    );
    expect(before - after).toBeCloseTo(cost.fuel_cells!, 1);
    expect((await ship(colonyShip)).colony_kit).toBe(true);
    await expect(fitColonyKit(pool, owner, colonyShip)).rejects.toMatchObject({
      code: 'not_available', // déjà équipé
    });
  });
});

describe('settlers & équipage (DG §3.2, GB §12)', () => {
  it('embarque 300 settlers C/A/S : population, manifeste et exode concordent', async () => {
    const popBefore = (await planetDetail(pool, owner, starter)).population;
    const { settlers, manifest } = await transferSettlers(pool, owner, colonyShip, {
      children: 60,
      actives: 180,
      seniors: 60,
      direction: 'embark',
    });
    expect(settlers).toBe(300);
    expect(manifest).toEqual({ children: 60, actives: 180, seniors: 60 });
    const popAfter = (await planetDetail(pool, owner, starter)).population;
    expect(popBefore - popAfter).toBeCloseTo(300, 0);
    const { rows: history } = await pool.query(
      `SELECT demo_counters FROM bodies WHERE id = $1`,
      [starter],
    );
    expect(history[0].demo_counters.exodus).toEqual({
      children: 60,
      actives: 180,
      seniors: 60,
    });
    // Pax civil_m = 800 : 300 + 501 dépasse (cohortes restantes suffisantes).
    await expect(
      transferSettlers(pool, owner, colonyShip, {
        children: 158,
        actives: 343,
        seniors: 0,
        direction: 'embark',
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('liaison PERMANENTE du pilote (GB §12) — et jamais deux fois', async () => {
    await assignCrew(pool, owner, colonyShip, pilotId);
    const npcs = await listNpcs(pool, owner);
    const pilot = npcs.find((n) => n.id === pilotId)!;
    expect(pilot.boundHostType).toBe('ship');
    expect(pilot.boundHostId).toBe(colonyShip);
    await expect(assignCrew(pool, owner, colonyShip, pilotId)).rejects.toMatchObject({
      code: 'not_available',
    });
  });

  it("autorisation : l'intrus ne touche ni au vaisseau ni aux settlers (requêtes directes)", async () => {
    await expect(fitColonyKit(pool, intruder, colonyShip)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      transferSettlers(pool, intruder, colonyShip, {
        children: 0,
        actives: 10,
        seniors: 0,
        direction: 'embark',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(colonizeShip(pool, intruder, colonyShip, FAST)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('péage de route déterministe (DG §3.2)', () => {
  it('arrivée : morts = floor(300 × (5 % − 2 % pilote)), report en route', async () => {
    await moveShip(pool, owner, colonyShip, { bodyId: wildId }, FAST);
    await processAll('ship_arrival');
    const s = await ship(colonyShip);
    // risque = 0,05 − 0,02 = 0,03 → 300 × 0,03 = 9 morts exactement.
    expect(s.settlers).toBe(291);
    expect({
      children: s.settlers_children,
      actives: s.settlers_actives,
      seniors: s.settlers_seniors,
    }).toEqual({ children: 58, actives: 175, seniors: 58 });
    expect(s.status).toBe('hovering');
    const { rows: route } = await pool.query(
      `SELECT loss_carry FROM settler_routes
       WHERE origin_body_id = $1 AND dest_body_id = $2`,
      [starter, wildId],
    );
    expect(Number(route[0].loss_carry)).toBeCloseTo(0, 9);
    const { rows: history } = await pool.query(
      `SELECT demo_counters FROM bodies WHERE id = $1`,
      [starter],
    );
    expect(history[0].demo_counters.deaths).toEqual({
      children: 2,
      actives: 5,
      seniors: 2,
    });
  });

  it('settlers à bord ⇒ pas de destination dans le vide (garde v1)', async () => {
    await expect(
      moveShip(pool, owner, colonyShip, { x: 1000, y: 1000 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('établissement (DG §12.3, GB §19)', () => {
  it('poison/cendre inconstructibles, monde possédé refusé', async () => {
    await pool.query(
      `UPDATE bodies SET config = COALESCE(config, '{}'::jsonb)
                                  || '{"annihilated":true}'::jsonb
       WHERE id = $1`,
      [wildId],
    );
    await expect(colonizeShip(pool, owner, colonyShip, FAST)).rejects.toMatchObject({
      code: 'unbuildable',
    });
    await pool.query(`UPDATE bodies SET config = config - 'annihilated' WHERE id = $1`, [
      wildId,
    ]);

    const { rows: poison } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, population)
       VALUES ('planet', 'Venin', 930000, 930000, 'poison-${run}', 's', 'poison',
          'F', 0, 0) RETURNING id`,
    );
    await pool.query(
      `UPDATE ships SET hover_body_id = $2 WHERE id = $1`,
      [colonyShip, poison[0]!.id],
    );
    await expect(colonizeShip(pool, owner, colonyShip, FAST)).rejects.toMatchObject({
      code: 'unbuildable',
    });
    await pool.query(`UPDATE ships SET hover_body_id = $2 WHERE id = $1`, [
      colonyShip,
      starter,
    ]);
    await expect(colonizeShip(pool, owner, colonyShip, FAST)).rejects.toMatchObject({
      code: 'not_available',
    });
    await pool.query(`UPDATE ships SET hover_body_id = $2 WHERE id = $1`, [
      colonyShip,
      wildId,
    ]);
  });

  it('colonise : 72 h d\'établissement, anti-course, puis LA colonie', async () => {
    const { bodyId } = await colonizeShip(pool, owner, colonyShip, FAST);
    expect(bodyId).toBe(wildId);
    expect((await ship(colonyShip)).status).toBe('colonizing');
    // Anti-course : une seconde coque ne peut pas viser le même monde.
    const { rows: rival } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y, status,
                          hover_body_id, colony_kit, settlers,
                          settlers_children, settlers_actives, settlers_seniors,
                          settlers_origin_body_id)
       SELECT $1, 'civil', 'm', 'Rivale', x, y, 'hovering', id, true,
              250, 50, 150, 50, $2
       FROM bodies WHERE id = $3 RETURNING id`,
      [owner, starter, wildId],
    );
    await expect(colonizeShip(pool, owner, rival[0]!.id, FAST)).rejects.toMatchObject({
      code: 'not_available',
    });

    await processAll('colony_established');

    // Propriété, population = settlers livrés, grâce 14 j exposée.
    const detail = await planetDetail(pool, owner, wildId);
    expect(detail.population).toBe(291);
    expect(detail.pyramid).toEqual({ children: 58, actives: 175, seniors: 58 });
    expect(detail.colonizedAt).toBeTruthy();
    expect(detail.graceUntil).toBeTruthy();
    // Conversion de coque : depot + spaceport L1 ACTIFS, tuiles 0 et 1.
    const converted = detail.buildings.filter((b) =>
      ['depot', 'spaceport'].includes(b.key),
    );
    expect(converted.map((b) => `${b.key}:${b.status}:L${b.level}`).sort()).toEqual([
      'depot:active:L1',
      'spaceport:active:L1',
    ]);
    // Provisions du kit déchargées + reliquat fuel (1 u = 1 T).
    expect(detail.stock.food_1?.amount).toBeCloseTo(COLONY_SEED_STOCK.food_1!, 0);
    expect(detail.stock.water?.amount).toBeCloseTo(COLONY_SEED_STOCK.water!, 0);
    expect(detail.stock.fuel_cold?.amount).toBeGreaterThan(0);
    // « The ship is spent » — le pilote COMMON survit NON hébergé
    // [interp amendée, chunk W] : seul un grade gouverneur (rareté ≥
    // rare) prend un siège permanent de la colonie (GB §11/§12).
    expect(await ship(colonyShip)).toBeNull();
    const pilot = (await listNpcs(pool, owner)).find((n) => n.id === pilotId)!;
    expect(pilot.boundHostType).toBeNull();
    expect(pilot.boundHostId).toBeNull();
    // La flotte ne liste plus l'Arche.
    const ships = await fleet(pool, owner);
    expect(ships.some((s) => s.id === colonyShip)).toBe(false);
  });
});

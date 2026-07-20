/**
 * Intégration récolte stellaire (GB §22, DG §8.8) sur vraie base : rig
 * monté à l'atelier (coût payé), récolte IMMOBILE à ≤ 8 pc (gradient
 * (1 − d/8)², type de carburant apparié, net = rendement − entretien),
 * double ledger paresseux (réservoir ↑, stock caché ↓), bord harvest_full
 * (réservoir plein → gréement replié), départ = arrêt automatique, flare
 * ≤ 5 % visible, et SUPERNOVA : annihilation STRICTE dans R_nova (le
 * starter généré À R_nova est SAUF — canon), host-fate des équipages,
 * classe S → plus rien, classe L → trou noir, mondes → cendre. Refus §10
 * par requêtes directes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  fitHarvestRig,
  setStarStockForTest,
  startHarvest,
  stopHarvest,
} from '../../src/services/harvest.js';
import { assignCrew, moveShip } from '../../src/services/ships.js';
import { visibleBodies } from '../../src/services/world.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let starId = '';
let starX = 0;
let starY = 0;
let starType = '';
let other = '';

const handlers = baseHandlers();

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function star(id: string) {
  const { rows } = await pool.query(`SELECT * FROM bodies WHERE id = $1`, [id]);
  return rows[0];
}

/** Coque IDLE posée par SQL à (x, y) — le vol libre est couvert par
 * ships.test.ts ; la fixture isole la règle de récolte. */
async function idleAt(shipId: string, x: number, y: number, fuel: object) {
  await pool.query(
    `UPDATE ships SET status = 'idle', x = $2, y = $3, fuel = $4,
       docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
       fuel_rate_u_per_day = 0, fuel_as_of = now()
     WHERE id = $1`,
    [shipId, x, y, JSON.stringify(fuel)],
  );
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `hv-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Harvester',
    politics: 'industrialist',
    universeSeed: `hv-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `hv-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Bystander',
    politics: 'mercantile',
    universeSeed: `hv-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  starId = a.spawn.starId;
  other = b.playerId;
  const st = await star(starId);
  starX = Number(st.x);
  starY = Number(st.y);
  starType = String(st.star_fuel_type);
  await assignCrew(pool, owner, cargo, a.spawn.pilotNpcId);
  // Atelier + matériaux du rig sur le starter (vraie commande de fitting).
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'workshop', 1, 0, 'active', 0)`,
    [ownerStarter],
  );
  for (const [res, tons] of [
    ['steel_l', 30],
    ['crystal_temperate', 10],
    ['gold', 10],
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

describe('fit du rig (atelier, coût, §10)', () => {
  it('paie le coût et monte le rig ; le double-fit est refusé', async () => {
    await fitHarvestRig(pool, owner, cargo);
    const s = await ship(cargo);
    expect(s.harvest_rig).toBe(true);
    const { rows } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'steel_l'`,
      [ownerStarter],
    );
    expect(Number(rows[0].amount_t)).toBeCloseTo(10, 3); // 30 − 20
    await expect(fitHarvestRig(pool, owner, cargo)).rejects.toThrow(/déjà monté/);
  });

  it('§10 : autrui ne monte pas de rig sur MA coque', async () => {
    await expect(fitHarvestRig(pool, other, cargo)).rejects.toThrow(/obéit pas/);
  });

  it('le vaisseau personnel ne porte pas de rig', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
      [owner],
    );
    await expect(fitHarvestRig(pool, owner, rows[0].id)).rejects.toThrow(
      /ne porte pas de rig/,
    );
  });
});

describe('démarrage : gardes de distance, type, statut, net', () => {
  it('à quai : refus (la récolte se fait immobile dans le vide)', async () => {
    await expect(startHarvest(pool, owner, cargo, starId)).rejects.toThrow(
      /immobile dans le vide/,
    );
  });

  it('trop loin (> 8 pc) : refus explicite', async () => {
    await idleAt(cargo, starX + 9, starY, { [starType]: 5 });
    await expect(startHarvest(pool, owner, cargo, starId)).rejects.toThrow(
      /Trop loin/,
    );
  });

  it('type de carburant non apparié : refus (mono-type v1)', async () => {
    const wrong = starType === 'cold' ? 'hot' : 'cold';
    await idleAt(cargo, starX + 1, starY, { [wrong]: 5 });
    await expect(startHarvest(pool, owner, cargo, starId)).rejects.toThrow(
      /mono-type v1/,
    );
  });

  it('net ≤ 0 (rendement < entretien idle à ~7,9 pc) : refus', async () => {
    await idleAt(cargo, starX + 7.9, starY, { [starType]: 5 });
    await expect(startHarvest(pool, owner, cargo, starId)).rejects.toThrow(
      /Rendement insuffisant/,
    );
  });
});

describe('double ledger paresseux + arrêts', () => {
  it('à 1 pc : réservoir ↑ net, étoile ↓ rendement, bords posés', async () => {
    await idleAt(cargo, starX + 1, starY, { [starType]: 5 });
    const res = await startHarvest(pool, owner, cargo, starId);
    // yield = 120 × (7/8)² = 91.875 ; net = yield − 0.2 (idle S).
    expect(res.yieldPerDay).toBeCloseTo(91.875, 6);
    expect(res.netPerDay).toBeCloseTo(91.675, 6);
    const s = await ship(cargo);
    expect(s.harvesting_star_id).toBe(starId);
    expect(Number(s.fuel_rate_u_per_day)).toBeCloseTo(91.675, 6);
    const st = await star(starId);
    expect(Number(st.star_fuel_rate_u_per_day)).toBeCloseTo(-91.875, 6);
    const { rows: ev } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND ((kind = 'harvest_full' AND payload->>'shipId' = $1)
           OR (kind = 'star_supernova' AND payload->>'bodyId' = $2))
       ORDER BY kind`,
      [cargo, starId],
    );
    expect(ev.map((e) => e.kind)).toEqual(['harvest_full', 'star_supernova']);
  });

  it('stop : lien détaché, retour au drain idle, étoile rendue', async () => {
    await stopHarvest(pool, owner, cargo);
    const s = await ship(cargo);
    expect(s.harvesting_star_id).toBeNull();
    expect(Number(s.fuel_rate_u_per_day)).toBeCloseTo(-0.2, 6);
    const st = await star(starId);
    expect(Number(st.star_fuel_rate_u_per_day)).toBe(0);
    const { rows: ev } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND kind IN ('harvest_full', 'star_supernova')
         AND (payload->>'shipId' = $1 OR payload->>'bodyId' = $2)`,
      [cargo, starId],
    );
    expect(ev).toEqual([]);
  });

  it('réservoir plein → harvest_full replie le gréement', async () => {
    // À ~106 ms du plein : (60 − units)/net jours ≈ 0,1 s.
    const units = 60 - 91.675 * (0.1 / 86_400);
    await idleAt(cargo, starX + 1, starY, { [starType]: units });
    await startHarvest(pool, owner, cargo, starId);
    await new Promise((r) => setTimeout(r, 250));
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const s = await ship(cargo);
    expect(s.harvesting_star_id).toBeNull();
    expect(Number(s.fuel_rate_u_per_day)).toBeCloseTo(-0.2, 6);
    const tank = Number((s.fuel as Record<string, number>)[starType]);
    expect(tank).toBeGreaterThan(59.9999);
    expect(tank).toBeLessThanOrEqual(60 + 1e-6);
    const st = await star(starId);
    expect(Number(st.star_fuel_rate_u_per_day)).toBe(0);
  });

  it('départ en vol = arrêt automatique de la récolte', async () => {
    await idleAt(cargo, starX + 1, starY, { [starType]: 30 });
    await startHarvest(pool, owner, cargo, starId);
    await moveShip(pool, owner, cargo, {
      x: starX + 20,
      y: starY,
    });
    const s = await ship(cargo);
    expect(s.harvesting_star_id).toBeNull();
    expect(s.status).toBe('transit');
    const st = await star(starId);
    expect(Number(st.star_fuel_rate_u_per_day)).toBe(0);
    // Fixture repliée : retour à quai SQL pour la suite.
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, docked_at = now(),
         hover_body_id = NULL, origin_x = NULL, origin_y = NULL,
         dest_x = NULL, dest_y = NULL, dest_body_id = NULL,
         departed_at = NULL, arrives_at = NULL,
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2),
         fuel_rate_u_per_day = 0
       WHERE id = $1`,
      [cargo, ownerStarter],
    );
    await pool.query(
      `DELETE FROM events WHERE processed_at IS NULL
         AND payload->>'shipId' = $1`,
      [cargo],
    );
  });
});

describe('flare ≤ 5 % : la seule jauge de l\'univers', () => {
  it('sous 5 % du stock initial : flaring true ; au-dessus : false', async () => {
    const st = await star(starId);
    const initial = Number(st.star_fuel_initial);
    await setStarStockForTest(pool, starId, initial * 0.04);
    let bodies = await visibleBodies(pool, owner);
    expect(bodies.find((b) => b.id === starId)?.flaring).toBe(true);
    await setStarStockForTest(pool, starId, initial * 0.5);
    bodies = await visibleBodies(pool, owner);
    expect(bodies.find((b) => b.id === starId)?.flaring).toBe(false);
  });
});

describe('supernova : annihilation stricte, host-fate, cendre', () => {
  it('S-class : victimes DANS le rayon détruites, starter À R_nova SAUF, étoile disparue', async () => {
    // Victime : coque avec équipage à 1 pc de l'étoile.
    const { rows: victimRows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, fuel)
       VALUES ($1, 'cargo', 's', $2, $3, $4, 'idle', '{"cold": 5}')
       RETURNING id`,
      [owner, `hv-victim-${run}`, starX + 1, starY],
    );
    const victim = victimRows[0]!.id;
    const { rows: crew } = await pool.query<{ id: string }>(
      `INSERT INTO npcs (owner_id, people, role, rarity,
          bound_host_type, bound_host_id)
       VALUES ($2, 'human', 'pilot', 'common', 'ship', $1)
       RETURNING id`,
      [victim, owner],
    );
    const crewId = crew[0]!.id;
    // L'étoile s'éteint : stock quasi nul drainé par une récolte réelle.
    await idleAt(cargo, starX + 1, starY, { [starType]: 5 });
    // 1e-4 u à 91.875 u/j : le bord tombe à ~94 ms.
    await setStarStockForTest(pool, starId, 1e-4);
    await startHarvest(pool, owner, cargo, starId);
    // Le bord tombe à ~94 ms ; un résidu d'arrondi du due_at peut exiger
    // une replanification (couverte ici) — on traite jusqu'au Starfall.
    let exploded = false;
    for (let i = 0; i < 6 && !exploded; i++) {
      await new Promise((r) => setTimeout(r, 120));
      await processDueEvents(pool, handlers);
      exploded = (await star(starId)) === undefined;
    }
    expect(exploded).toBe(true);
    // Les deux coques (victime + récolteur) sont dans R_nova : détruites.
    expect(await ship(victim)).toBeUndefined();
    expect(await ship(cargo)).toBeUndefined();
    const { rows: npcRows } = await pool.query(
      `SELECT 1 FROM npcs WHERE id = $1`,
      [crewId],
    );
    expect(npcRows).toEqual([]); // host-fate
    // Starter généré À R_nova exactement (40 pc) : SAUF, canon garanti.
    const { rows: starterRows } = await pool.query(
      `SELECT owner_id, population, (config->>'annihilated') AS ann
       FROM bodies WHERE id = $1`,
      [ownerStarter],
    );
    expect(starterRows[0].owner_id).toBe(owner);
    expect(Number(starterRows[0].population)).toBeGreaterThan(0);
    expect(starterRows[0].ann).toBeNull();
    // Classe S : l'étoile ne laisse RIEN (canon) — déjà vérifié par la
    // boucle de Starfall ci-dessus (exploded).
  });

  it('L-class : trou noir + monde habité dans le rayon nettoyé en cendre', async () => {
    // Étoile L artificielle et monde habité à 2 pc, loin de tout. Les
    // champs population v2 servent de garde contre une cendre encore vive.
    const fx = 90_000 + Math.random() * 1000;
    const { rows: lRows } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, star_class,
          star_fuel_type, star_fuel_stock, star_fuel_initial,
          star_fuel_rate_u_per_day, star_fuel_as_of, r_nova)
       VALUES ('star', $1, $2, $3, $4, 'l', 'gas', 0, 1000, -1, now(),
               $5)
       RETURNING id`,
      [`hv-lstar-${run}`, fx, 0, `hv-lstar-${run}`, 40 * Math.cbrt(16)],
    );
    const lStar = lRows[0]!.id;
    const { rows: wildRows } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles, owner_id, population, pop_children, pop_seniors,
          illness, unemp_over_days, colonized_at, account_bound_until,
          clock_deadlines, config)
       VALUES ('planet', $1, $2, $3, $4, 's', 'temperate', 'F', 6, $5,
          10, 2, 3, 0.4, 2, now(), now() + interval '10 days',
          '{"water":"2099-01-01T00:00:00.000Z"}',
          '{"innateOffers":[{"sell":"water","want":"ore","price":2}],
            "kept":"cinder"}')
       RETURNING id`,
      [`hv-world-${run}`, fx + 2, 0, `hv-world-${run}`, owner],
    );
    const wild = wildRows[0]!.id;
    const client = await pool.connect();
    try {
      const { enqueue } = await import('../../src/sim/events.js');
      await enqueue(client, 'star_supernova', new Date(), { bodyId: lStar });
    } finally {
      client.release();
    }
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const bh = await star(lStar);
    expect(bh.body_type).toBe('black_hole'); // canon : L laisse un trou noir
    const { rows: wildAfter } = await pool.query(
      `SELECT owner_id, is_starter, account_bound_until, colonized_at,
              population, pop_children, pop_seniors, illness,
              unemp_over_days, clock_deadlines, tiles, config
         FROM bodies WHERE id = $1`,
      [wild],
    );
    const cinder = wildAfter[0];
    expect(cinder.owner_id).toBeNull();
    expect(cinder.is_starter).toBe(false);
    expect(cinder.account_bound_until).toBeNull();
    expect(cinder.colonized_at).toBeNull();
    expect(Number(cinder.population)).toBe(0);
    expect(Number(cinder.pop_children)).toBe(0);
    expect(Number(cinder.pop_seniors)).toBe(0);
    expect(Number(cinder.illness)).toBe(0);
    expect(Number(cinder.unemp_over_days)).toBe(0);
    expect(cinder.clock_deadlines).toEqual({});
    expect(Number(cinder.tiles)).toBe(0);
    expect(cinder.config).toEqual({ annihilated: true, kept: 'cinder' });
  });
});

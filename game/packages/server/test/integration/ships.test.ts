/**
 * Intégration : vol libre & sondes (GB §6/§14/§21, DG §8) sur vraie base.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { unlockNode, placeBuilding } from '../../src/services/planets.js';
import { fleet, launchProbe, moveShip, shipPosition } from '../../src/services/ships.js';
import { visibleBodies } from '../../src/services/world.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let playerId = '';
let starterId = '';
let cargoId = '';
let personalId = '';
let wildId = '';

const FAST = { timeScale: 1_000_000 };

/** Attend l'arrivée d'un vaisseau (trajets ≈ 0,1–3 s à cette échelle). */
async function waitArrived(shipId: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await new Promise((res) => setTimeout(res, 60));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query('SELECT status FROM ships WHERE id = $1', [shipId]);
    if (rows[0].status !== 'transit') return;
  }
  throw new Error('arrivée jamais traitée');
}

beforeAll(async () => {
  pool = await createTestPool();
  const r = await registerPlayer(pool, {
    email: `nav-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Navigator',
    politics: 'scientific',
    universeSeed: `nav-universe-${run}`,
  });
  playerId = r.playerId;
  starterId = r.spawn.starterPlanetId;
  cargoId = r.spawn.cargoShipId;
  personalId = r.spawn.personalShipId;
  wildId = r.spawn.wildPlanetIds[0]!;
  // Grants de test : 5 sondes coûtent 75 ore + 50 silicon (on teste les
  // commandes, pas la rareté) — calibrés sous 0,7 × cap.
  for (const [res, qty] of [['ore', 150], ['silicon', 100]] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = planet_stock.amount_t + $3`,
      [starterId, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('vol libre (GB §6)', () => {
  it('cargo vers une planète sauvage : auto-chargement du fuel planétaire, transit interpolé, arrivée en survol', async () => {
    const t0 = Date.now();
    const { rows: fuelBefore } = await pool.query(
      `SELECT resource, amount_t FROM planet_stock WHERE body_id = $1 AND resource LIKE 'fuel_%'`,
      [starterId],
    );
    expect(Number(fuelBefore[0].amount_t)).toBe(150);

    const r = await moveShip(pool, playerId, cargoId, { bodyId: wildId }, { nowMs: t0, ...FAST });
    expect(r.distancePc).toBeGreaterThan(15);
    expect(r.distancePc).toBeLessThanOrEqual(61);
    // Cargo-S : 0.25 u/pc.
    expect(r.fuelBurned).toBeCloseTo(r.distancePc * 0.25, 4);
    const { rows: fuelAfter } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
      [starterId, fuelBefore[0].resource],
    );
    expect(Number(fuelAfter[0].amount_t)).toBeCloseTo(150 - r.fuelBurned, 2);

    // Position interpolée à mi-parcours (fonction pure).
    const { rows: shipRows } = await pool.query('SELECT * FROM ships WHERE id = $1', [cargoId]);
    const ship = shipRows[0];
    expect(ship.status).toBe('transit');
    const midMs = (new Date(ship.departed_at).getTime() + new Date(ship.arrives_at).getTime()) / 2;
    const mid = shipPosition(ship, midMs);
    const { rows: bodies } = await pool.query('SELECT x, y FROM bodies WHERE id IN ($1, $2)', [starterId, wildId]);
    const dTotal = Math.hypot(bodies[0].x - bodies[1].x, bodies[0].y - bodies[1].y);
    const dFromStart = Math.hypot(mid.x - ship.origin_x, mid.y - ship.origin_y);
    expect(dFromStart / dTotal).toBeGreaterThan(0.45);
    expect(dFromStart / dTotal).toBeLessThan(0.55);

    // Arrivée par événement.
    await waitArrived(cargoId);
    const ships = await fleet(pool, playerId);
    const cargo = ships.find((s) => s.id === cargoId)!;
    expect(cargo.status).toBe('hovering');
    expect(cargo.x).toBeCloseTo(bodies[1].x, 6);
  });

  it('carburant insuffisant (loin, hors monde possédé) : refus explicite, rien ne part', async () => {
    // Le cargo survole la sauvage (pas de recharge possible) : cible lointaine.
    await expect(
      moveShip(pool, playerId, cargoId, { x: 500_000, y: 500_000 }, FAST),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    const ships = await fleet(pool, playerId);
    expect(ships.find((s) => s.id === cargoId)!.status).toBe('hovering');
  });

  it('vaisseau personnel : refuse le vide et les mondes étrangers (canon §21)', async () => {
    await expect(
      moveShip(pool, playerId, personalId, { x: 500_000, y: 500_000 }, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      moveShip(pool, playerId, personalId, { bodyId: wildId }, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it("autorisation : on ne pilote pas le vaisseau d'un autre (requête directe)", async () => {
    const other = await registerPlayer(pool, {
      email: `nav-other-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Pirate',
      politics: 'militarist',
      universeSeed: `nav-universe-${run}`,
    });
    await expect(
      moveShip(pool, other.playerId, cargoId, { bodyId: wildId }, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('sondes & vision (GB §4, DG §8.1)', () => {
  it('probe_pad requis, coût payé, la sonde arrivée étend la vision', async () => {
    const t0 = Date.now();
    await expect(
      launchProbe(pool, playerId, starterId, { x: 500_100, y: 500_100 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });

    await unlockNode(pool, playerId, starterId, 'probe_pad', t0);
    await placeBuilding(pool, playerId, starterId, 'probe_pad', null, FAST);
    await new Promise((res) => setTimeout(res, 60));
    await processDueEvents(pool, baseHandlers());

    // Cible : le starter du voisin (à 150–300 pc) — invisible sans scope.
    const { rows: foreign } = await pool.query(
      `SELECT id, x, y FROM bodies WHERE owner_id IS NOT NULL AND owner_id <> $1 AND is_starter LIMIT 1`,
      [playerId],
    );
    const before = await visibleBodies(pool, playerId);
    expect(before.some((b) => b.id === foreign[0].id)).toBe(false);

    const probe = await launchProbe(
      pool,
      playerId,
      starterId,
      { x: foreign[0].x, y: foreign[0].y },
      FAST,
    );
    await waitArrived(probe.probeId);
    const ships = await fleet(pool, playerId);
    expect(ships.find((s) => s.id === probe.probeId)!.status).toBe('idle');

    // La Silence se lève : le monde du voisin entre dans le ciel connu.
    const after = await visibleBodies(pool, playerId);
    expect(after.some((b) => b.id === foreign[0].id)).toBe(true);
  });

  it('cap de sondes : 5/jour/pad', async () => {
    for (let i = 0; i < 4; i++) {
      await launchProbe(pool, playerId, starterId, { x: 500_200 + i, y: 500_200 }, FAST);
    }
    await expect(
      launchProbe(pool, playerId, starterId, { x: 500_300, y: 500_300 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

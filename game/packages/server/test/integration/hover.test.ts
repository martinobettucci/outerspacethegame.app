/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Hovering”; GAME_BOOK.md §7/§13; DESIGN_GUIDE.md §3.5. */
/**
 * Intégration : drains de loitering, échouage & ravitaillement (GB §7/§13,
 * DG §3.5) sur vraie base — survol possédé payé par le stock planétaire,
 * survol étranger/sauvage et idle payés par le réservoir, monde à sec =
 * bascule réservoir, ship_fuel_out → stranded, refuel (à quai, échoué,
 * cap, monde d'autrui), transfert vaisseau→vaisseau (rayon, type, cap),
 * refus d'autorisation par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HOVER_IDLE_FUEL_U_PER_DAY } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import {
  fleet,
  landShip,
  moveShip,
  refuelShip,
  setShipFuelForTest,
  transferFuel,
  undockShip,
} from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let hauler = '';
let wildId = '';
let fuelType = '';
let intruder = '';
let intruderStarter = '';

const FAST = { timeScale: 1_000_000 };

async function drainEvents(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 40));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND due_at <= now()
         AND kind IN ('ship_arrival', 'ship_fuel_out')`,
    );
    if (rows[0].n === 0) return;
  }
  throw new Error('événements de vol jamais épuisés');
}

async function shipRow(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function stockRow(bodyId: string, resource: string) {
  const { rows } = await pool.query(
    `SELECT amount_t, rate_t_per_day FROM planet_stock
     WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ?? null;
}

/** Insère une coque de test (état contrôlé — mise en place directe). */
async function insertShip(opts: {
  ownerId: string;
  name: string;
  x: number;
  y: number;
  status: string;
  dockedBodyId?: string | null;
  hoverBodyId?: string | null;
  fuel: Record<string, number>;
  rate?: number;
}): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, docked_body_id, hover_body_id, fuel, fuel_rate_u_per_day,
        fuel_as_of, cargo)
     VALUES ($1, 'cargo', 's', $2, $3, $4, $5, $6, $7, $8, $9, now(), '{}')
     RETURNING id`,
    [
      opts.ownerId,
      opts.name,
      opts.x,
      opts.y,
      opts.status,
      opts.dockedBodyId ?? null,
      opts.hoverBodyId ?? null,
      JSON.stringify(opts.fuel),
      opts.rate ?? 0,
    ],
  );
  return rows[0].id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `hover-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Loiterer',
    politics: 'industrialist',
    universeSeed: `hover-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `hover-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intruder',
    politics: 'militarist',
    universeSeed: `hover-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  wildId = a.spawn.wildPlanetIds[0]!;
  hauler = a.spawn.cargoShipId;
  fuelType = a.spawn.starFuelType;
  intruder = b.playerId;
  intruderStarter = b.spawn.starterPlanetId;
}, 30_000);

afterAll(async () => {
  await pool.end();
});

describe('drains de loitering (GB §7, DG §3.5)', () => {
  it('survol de SON monde : le stock planétaire paie, le réservoir est figé', async () => {
    await undockShip(pool, owner, hauler);
    const stock = await stockRow(starter, `fuel_${fuelType}`);
    // Seul drain de fuel du starter : −0.2 u/j (Cargo S), servi par le stock.
    expect(Number(stock.rate_t_per_day)).toBeCloseTo(-HOVER_IDLE_FUEL_U_PER_DAY, 6);
    const ship = await shipRow(hauler);
    expect(Number(ship.fuel_rate_u_per_day)).toBe(0);
    const { rows: edges } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'ship_fuel_out'
         AND payload->>'shipId' = $1`,
      [hauler],
    );
    expect(edges[0].n).toBe(0);
  });

  it('atterrir désarme : la planète cesse de payer', async () => {
    await landShip(pool, owner, hauler);
    const stock = await stockRow(starter, `fuel_${fuelType}`);
    expect(Number(stock.rate_t_per_day)).toBeCloseTo(0, 6);
  });

  it('survol de son monde À SEC : bascule sur le réservoir + bord planifié', async () => {
    // Assèche le fuel du starter (mise en place directe).
    await pool.query(
      `UPDATE planet_stock SET amount_t = 0, rate_t_per_day = 0, as_of = now()
       WHERE body_id = $1 AND resource = $2`,
      [starter, `fuel_${fuelType}`],
    );
    await setShipFuelForTest(pool, owner, hauler, { units: 30 });
    await undockShip(pool, owner, hauler);
    const ship = await shipRow(hauler);
    expect(Number(ship.fuel_rate_u_per_day)).toBeCloseTo(
      -HOVER_IDLE_FUEL_U_PER_DAY,
      6,
    );
    const { rows: edges } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'ship_fuel_out'
         AND payload->>'shipId' = $1`,
      [hauler],
    );
    expect(edges[0].n).toBe(1);
    await landShip(pool, owner, hauler);
    // Restaure un stock de travail pour la suite.
    await pool.query(
      `UPDATE planet_stock SET amount_t = 90, rate_t_per_day = 0, as_of = now()
       WHERE body_id = $1 AND resource = $2`,
      [starter, `fuel_${fuelType}`],
    );
  });

  it('arrivée dans le vide (idle) : le réservoir paie', async () => {
    const { rows: b } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
      starter,
    ]);
    await moveShip(
      pool,
      owner,
      hauler,
      { x: Number(b[0].x) + 2, y: Number(b[0].y) },
      FAST,
    );
    await drainEvents();
    const ship = await shipRow(hauler);
    expect(ship.status).toBe('idle');
    expect(Number(ship.fuel_rate_u_per_day)).toBeCloseTo(
      -HOVER_IDLE_FUEL_U_PER_DAY,
      6,
    );
  });

  it('réservoir à sec : ship_fuel_out → stranded, plus aucun départ', async () => {
    await setShipFuelForTest(pool, owner, hauler, { units: 0.000001 });
    // Le bord est daté ~0,4 s dans le futur (0.000001 u / 0.2 u·j⁻¹) :
    // attendre qu'il soit CONSOMMÉ, pas seulement qu'aucun ne soit échu.
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 40));
      await processDueEvents(pool, baseHandlers());
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM events
         WHERE processed_at IS NULL AND kind = 'ship_fuel_out'
           AND payload->>'shipId' = $1`,
        [hauler],
      );
      if (rows[0].n === 0) break;
    }
    const ship = await shipRow(hauler);
    expect(ship.status).toBe('stranded');
    expect(ship.fuel[fuelType]).toBe(0);
    expect(Number(ship.fuel_rate_u_per_day)).toBe(0);
    const view = (await fleet(pool, owner)).find((s) => s.id === hauler)!;
    expect(view.status).toBe('stranded');
    await expect(
      moveShip(pool, owner, hauler, { bodyId: starter }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

describe('transfert de carburant vaisseau→vaisseau (GB §13)', () => {
  let tender = '';
  let strandedPos = { x: 0, y: 0 };

  beforeAll(async () => {
    const s = await shipRow(hauler);
    strandedPos = { x: Number(s.x), y: Number(s.y) };
    tender = await insertShip({
      ownerId: owner,
      name: 'Tender',
      x: strandedPos.x + 0.6,
      y: strandedPos.y,
      status: 'idle',
      fuel: { [fuelType]: 40 },
      rate: -HOVER_IDLE_FUEL_U_PER_DAY,
    });
  });

  it('nominal ≤ 1 pc : l\'échoué repart (idle), les deux drains rebasés', async () => {
    const r = await transferFuel(pool, owner, tender, {
      toShipId: hauler,
      units: 10,
    });
    expect(r.transferred).toBeCloseTo(10, 6);
    expect(r.fuelType).toBe(fuelType);
    const back = await shipRow(hauler);
    expect(back.status).toBe('idle');
    expect(back.fuel[fuelType]).toBeCloseTo(10, 4);
    expect(Number(back.fuel_rate_u_per_day)).toBeCloseTo(
      -HOVER_IDLE_FUEL_U_PER_DAY,
      6,
    );
    const giver = await shipRow(tender);
    expect(giver.fuel[fuelType]).toBeCloseTo(30, 4);
    // Chacun a son bord ship_fuel_out replanifié.
    const { rows: edges } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'ship_fuel_out'
         AND payload->>'shipId' = ANY($1)`,
      [[hauler, tender]],
    );
    expect(edges[0].n).toBe(2);
  });

  it('refus : trop loin, type incompatible, cap receveur, quantité', async () => {
    const far = await insertShip({
      ownerId: owner,
      name: 'Far',
      x: strandedPos.x + 5,
      y: strandedPos.y,
      status: 'idle',
      fuel: { [fuelType]: 40 },
    });
    await expect(
      transferFuel(pool, owner, far, { toShipId: hauler, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    const otherType = fuelType === 'cold' ? 'hot' : 'cold';
    const mismatched = await insertShip({
      ownerId: owner,
      name: 'Mismatch',
      x: strandedPos.x + 0.3,
      y: strandedPos.y,
      status: 'idle',
      fuel: { [otherType]: 40 },
    });
    await expect(
      transferFuel(pool, owner, mismatched, { toShipId: hauler, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Cap receveur : le réservoir du Tender (40 max… déjà 30) — on le
    // remplit à ras bord puis on tente encore.
    await setShipFuelForTest(pool, owner, tender, { units: 60 });
    await expect(
      transferFuel(pool, owner, mismatched, { toShipId: tender, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    await expect(
      transferFuel(pool, owner, tender, { toShipId: tender, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it("autorisation : pas de transfert avec la coque d'autrui (requête directe)", async () => {
    const foreign = await insertShip({
      ownerId: intruder,
      name: 'Leech',
      x: strandedPos.x + 0.2,
      y: strandedPos.y,
      status: 'idle',
      fuel: { [fuelType]: 40 },
    });
    await expect(
      transferFuel(pool, intruder, foreign, { toShipId: hauler, units: 5 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      transferFuel(pool, owner, tender, { toShipId: foreign, units: 5 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('ravitaillement depuis un monde possédé (GB §13)', () => {
  it('échoué AU-DESSUS de son monde : refuel → hovering, stock décrémenté, taux honnêtes', async () => {
    const stranded = await insertShip({
      ownerId: owner,
      name: 'Dry hover',
      x: 0,
      y: 0,
      status: 'stranded',
      hoverBodyId: starter,
      fuel: { [fuelType]: 0 },
    });
    const before = await stockRow(starter, `fuel_${fuelType}`);
    const r = await refuelShip(pool, owner, stranded, { units: 20 });
    expect(r.loaded).toBeCloseTo(20, 6);
    const ship = await shipRow(stranded);
    expect(ship.status).toBe('hovering');
    expect(ship.fuel[fuelType]).toBeCloseTo(20, 4);
    // Servi par le stock du monde possédé : réservoir figé, la planète
    // paie désormais SON survol (−0.2 u/j de plus au stock).
    expect(Number(ship.fuel_rate_u_per_day)).toBe(0);
    const after = await stockRow(starter, `fuel_${fuelType}`);
    expect(Number(after.amount_t)).toBeCloseTo(Number(before.amount_t) - 20, 2);
    expect(Number(after.rate_t_per_day)).toBeCloseTo(
      -HOVER_IDLE_FUEL_U_PER_DAY,
      6,
    );
    await landShip(pool, owner, stranded);
  });

  it('à quai : refuel sans quantité = plein (cap réservoir)', async () => {
    const docked = await insertShip({
      ownerId: owner,
      name: 'Topper',
      x: 0,
      y: 0,
      status: 'docked',
      dockedBodyId: starter,
      fuel: { [fuelType]: 55 },
    });
    const r = await refuelShip(pool, owner, docked);
    // Cargo S : tank 60 → 5 u seulement, malgré le stock disponible.
    expect(r.loaded).toBeCloseTo(5, 4);
    expect(r.units).toBeCloseTo(60, 4);
    await expect(refuelShip(pool, owner, docked)).rejects.toMatchObject({
      code: 'not_available',
    });
  });

  it('refus : stock à sec → insufficient_resources', async () => {
    const docked = await insertShip({
      ownerId: owner,
      name: 'Thirsty',
      x: 0,
      y: 0,
      status: 'docked',
      dockedBodyId: starter,
      fuel: { [fuelType]: 0 },
    });
    await pool.query(
      `UPDATE planet_stock SET amount_t = 0, rate_t_per_day = 0, as_of = now()
       WHERE body_id = $1 AND resource = $2`,
      [starter, `fuel_${fuelType}`],
    );
    await expect(refuelShip(pool, owner, docked)).rejects.toMatchObject({
      code: 'insufficient_resources',
    });
  });

  it("autorisation : monde d'autrui et coque d'autrui refusés (requêtes directes)", async () => {
    // Ma coque au-dessus du monde de l'intrus : refus (v1).
    const overForeign = await insertShip({
      ownerId: owner,
      name: 'Beggar',
      x: 0,
      y: 0,
      status: 'hovering',
      hoverBodyId: intruderStarter,
      fuel: { [fuelType]: 1 },
    });
    await expect(refuelShip(pool, owner, overForeign)).rejects.toMatchObject({
      code: 'forbidden',
    });
    // L'intrus ravitaille MA coque : refus.
    const mine = await insertShip({
      ownerId: owner,
      name: 'Coveted',
      x: 0,
      y: 0,
      status: 'docked',
      dockedBodyId: starter,
      fuel: { [fuelType]: 1 },
    });
    await expect(refuelShip(pool, intruder, mine)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

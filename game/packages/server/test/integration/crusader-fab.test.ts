/** @verifies This test file verifies: docs/MASTER_PLAN.md §W8 (W8e); JOURNAL 2026-07-22 (plan W8e persisté); docs/SCHEMA.md (migration 038). */
/**
 * Intégration W8e — fabrication À BORD du Crusader : ADN complet (tout
 * hôte réputé L3, enhanced d'office), usinage partiel D'OFFICE (paliers
 * de 5 % sur crusader_stock, FIFO de bord, starved/reprise), item né
 * dans la balance de bord (cap 450) ; équipement d'une coque AMARRÉE
 * (item + coût de bord, immobilisation, undock refusé pendant) ;
 * démontage vers la balance de bord ; coque CONSTRUITE à bord (née
 * amarrée, plein 25 % au stock de bord) ; interdits : non-Crusader,
 * autrui (§10), Crusader-de-Crusader.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { GEAR, shipBuildCost, HULLS } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { fabricateGearAboard, installGear, uninstallGear } from '../../src/services/gear.js';
import { buildShipAboard, dockAtCrusader, undockFromCrusader } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let crusaderId = '';
let guestId = '';

const FAST = { timeScale: 1_000_000 };
const handlers = baseHandlers(1_000_000);

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

/** Draine les paliers d'usinage et les naissances jusqu'au calme. */
async function drainWork(maxLoops = 80): Promise<void> {
  for (let i = 0; i < maxLoops; i++) {
    await new Promise((r) => setTimeout(r, 40));
    await processDueEvents(pool, handlers);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL
         AND kind IN ('work_step', 'item_fabricated', 'ship_built')`,
    );
    if (rows[0].n === 0) return;
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `cf-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Shipwright',
    politics: 'industrialist',
    universeSeed: `cf-universe-${run}`,
  });
  owner = a.playerId;
  const { rows: st } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
    a.spawn.starterPlanetId,
  ]);
  const x = Number(st[0].x) + 120;
  const y = Number(st[0].y) + 120;
  // Crusader de fixture (§15) : infra figée + stock de bord garni.
  const { rows: cr } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, crusader_stock, crusader_pop,
        crusader_infra, cargo)
     VALUES ($1, 'combat', 'l', 'Ark', $2, $3, 'idle',
        '{"cold": 400}', 'cold',
        '{"steel_l": 400, "silicon": 100, "gold": 40, "fuel_cells": 60, "fuel_cold": 120}',
        '{"children": 100, "actives": 300, "seniors": 100}',
        '{"residential": 3, "factoriesL3": true}', '{}')
     RETURNING id`,
    [owner, x, y],
  );
  crusaderId = cr[0]!.id;
  const { rows: g } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo)
     VALUES ($1, 'cargo', 's', 'Skiff', $2, $3, 'idle',
        '{"cold": 30}', 'cold', '[]', '{}')
     RETURNING id`,
    [owner, x, y],
  );
  guestId = g[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('W8e — fabrication d\'items à bord', () => {
  it('gardes : seul un Crusader fabrique ; autrui refusé (§10)', async () => {
    await expect(
      fabricateGearAboard(pool, owner, guestId, 'cargo_netting', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    const b = await registerPlayer(pool, {
      email: `cf-b-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Interloper',
      politics: 'mercantile',
      universeSeed: `cf-universe-${run}`,
    });
    await expect(
      fabricateGearAboard(pool, b.playerId, crusaderId, 'cargo_netting', FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('ADN complet : un grade ENHANCED se fabrique d\'office, paliers 5 % débités au stock de bord', async () => {
    const before = await ship(crusaderId);
    const steelBefore = Number(before.crusader_stock.steel_l);
    const r = await fabricateGearAboard(
      pool, owner, crusaderId, 'cargo_netting_enhanced', FAST,
    );
    expect(r.completesAt).toBeTruthy();
    await drainWork();
    const after = await ship(crusaderId);
    expect(after.crusader_items?.cargo_netting_enhanced).toBe(1);
    // Coût intégral débité par 20 paliers (enhanced = coût ×2).
    const cost = GEAR.cargo_netting_enhanced!.fabricationCost.steel_l!;
    expect(steelBefore - Number(after.crusader_stock.steel_l)).toBeCloseTo(cost, 6);
  });

  it('starved : stock à sec → l\'ordre attend, réapprovisionné → il finit', async () => {
    // Vide l'or du bord puis commande un item qui en veut.
    await pool.query(
      `UPDATE ships SET crusader_stock = crusader_stock - 'gold' WHERE id = $1`,
      [crusaderId],
    );
    await fabricateGearAboard(pool, owner, crusaderId, 'haggler_matrix', FAST);
    await drainWork(20); // les retries tournent, l'ordre reste
    const { rows: order } = await pool.query(
      `SELECT status FROM work_orders WHERE ship_id = $1`,
      [crusaderId],
    );
    expect(order[0]?.status).toBe('starved');
    await pool.query(
      `UPDATE ships SET crusader_stock = jsonb_set(crusader_stock, '{gold}', '40')
       WHERE id = $1`,
      [crusaderId],
    );
    await drainWork();
    const after = await ship(crusaderId);
    expect(after.crusader_items?.haggler_matrix).toBe(1);
    const { rows: left } = await pool.query(
      `SELECT count(*)::int AS n FROM work_orders WHERE ship_id = $1`,
      [crusaderId],
    );
    expect(left[0].n).toBe(0);
  });
});

describe('W8e — équipement d\'une coque AMARRÉE', () => {
  it('install : item de la balance de bord + coût au stock, undock REFUSÉ pendant, accessoire monté au terme', async () => {
    await dockAtCrusader(pool, owner, guestId, crusaderId);
    const r = await installGear(pool, owner, guestId, 'cargo_netting_enhanced', FAST);
    expect(r.completesAt).toBeTruthy();
    const host = await ship(crusaderId);
    expect(host.crusader_items?.cargo_netting_enhanced ?? 0).toBe(0); // consommé
    await expect(
      undockFromCrusader(pool, owner, guestId),
    ).rejects.toMatchObject({ code: 'not_available' }); // immobilisée
    await drainWork();
    await new Promise((r2) => setTimeout(r2, 80));
    await processDueEvents(pool, handlers);
    const guest = await ship(guestId);
    expect(guest.accessories).toContain('cargo_netting_enhanced');
    expect(guest.installing_item).toBeNull();
  });

  it('uninstall : l\'accessoire démonté retourne à la balance de BORD', async () => {
    await uninstallGear(pool, owner, guestId, 'cargo_netting_enhanced', FAST);
    await new Promise((r) => setTimeout(r, 80));
    await processDueEvents(pool, handlers);
    const guest = await ship(guestId);
    expect(guest.accessories).not.toContain('cargo_netting_enhanced');
    const host = await ship(crusaderId);
    expect(host.crusader_items?.cargo_netting_enhanced).toBe(1);
  });
});

describe('W8e — coque construite à bord', () => {
  it('Crusader-de-Crusader refusé ; une cargo_s naît AMARRÉE, plein 25 % au stock de bord', async () => {
    await expect(
      buildShipAboard(pool, owner, crusaderId, { category: 'combat', size: 'l', name: 'Ark II' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    const before = await ship(crusaderId);
    const fuelBefore = Number(before.crusader_stock.fuel_cold ?? 0);
    const r = await buildShipAboard(
      pool, owner, crusaderId,
      { category: 'cargo', size: 's', name: 'Lighter', engine: 'cold' },
      FAST,
    );
    expect(r.cost).toEqual(shipBuildCost(HULLS.cargo_s, 3));
    await drainWork();
    const { rows: born } = await pool.query(
      `SELECT * FROM ships WHERE owner_id = $1 AND name = 'Lighter'`,
      [owner],
    );
    expect(born[0]).toBeTruthy();
    expect(born[0].status).toBe('docked');
    expect(born[0].follow_ship_id).toBe(crusaderId);
    expect(born[0].accessories).toContain('metamorphic_hull');
    // Plein de naissance : 25 % de 60 u = 15 u puisés au stock de bord.
    expect(Number(born[0].fuel.cold)).toBeCloseTo(HULLS.cargo_s.tankU * 0.25, 6);
    const after = await ship(crusaderId);
    expect(
      fuelBefore - Number(after.crusader_stock.fuel_cold ?? 0),
    ).toBeCloseTo(HULLS.cargo_s.tankU * 0.25, 6);
  });
});

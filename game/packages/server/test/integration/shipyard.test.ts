/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Ship hulls”, “Free flight”, and “Hovering”; GAME_BOOK.md §6/§7/§14/§21; DESIGN_GUIDE.md §7–§9. */
/**
 * Intégration : chantier naval (GB §14, DG §381) sur vraie base — gate de
 * taille par niveau, remise M à L2+, coût payé, événement ship_built →
 * vaisseau À QUAI réservoirs vides, file d'attente, refus d'autorisation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HULLS } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { buildShip, fleet, pendingShipBuilds } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let intruder = '';

const FAST = { timeScale: 1_000_000 };

async function processAll(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'ship_built' AND due_at <= now()`,
    );
    if (rows[0].n === 0) return;
  }
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `yard-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Shipwright',
    politics: 'industrialist',
    universeSeed: `yard-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `yard-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intruder',
    politics: 'militarist',
    universeSeed: `yard-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  intruder = b.playerId;
  // Trésorerie de chantier (on teste les COMMANDES, pas la rareté) —
  // sous 0,7 × cap : un Cargo S (40 steelL + 10 cells) + un Cargo M remisé.
  for (const [res, qty] of [['steel_l', 200], ['fuel_cells', 60]] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, as_of = now()`,
      [starter, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('chantier naval (DG §381)', () => {
  it('sans chantier actif : refus', async () => {
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 's', name: 'Bateau' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('L1 : construit un Cargo S — coût payé, événement → vaisseau à quai, vide', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'shipyard', 1, 0, 'active', 0)`,
      [starter],
    );
    const before = Number(
      (await pool.query(
        `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'steel_l'`,
        [starter],
      )).rows[0].amount_t,
    );
    const { cost } = await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 's', name: 'Mule I' },
      FAST,
    );
    expect(cost).toEqual(HULLS.cargo_s.buildCost);
    // File d'attente visible tant que l'événement n'est pas traité.
    const pending = await pendingShipBuilds(pool, owner, starter);
    expect(pending.some((b) => b.name === 'Mule I')).toBe(true);

    await processAll();
    const ships = await fleet(pool, owner);
    const mule = ships.find((s) => s.name === 'Mule I');
    expect(mule).toBeTruthy();
    expect(mule!.status).toBe('docked');
    expect(mule!.dockedBodyId).toBe(starter);
    // Réservoir vide mais TYPÉ sur l'étoile natale (auto-chargement).
    // Naissance à 25 % de plein (v3, 2026-07-20) : Cargo S 60 u × 0,25
    // = 15 u puisées au stock du monde, type de l'étoile natale.
    expect(Object.values(mule!.fuel)).toEqual([15]);
    expect(['cold', 'hot', 'gas']).toContain(Object.keys(mule!.fuel)[0]);
    expect(mule!.cargo).toEqual({});
    const after = Number(
      (await pool.query(
        `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'steel_l'`,
        [starter],
      )).rows[0].amount_t,
    );
    expect(after).toBeCloseTo(before - 40, 4);
  });

  it('gate de taille : une coque L exige un chantier L3', async () => {
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 'l', name: 'Trop Gros' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('remise de masse : Cargo M à −25 % sur un chantier L2', async () => {
    await pool.query(
      `UPDATE buildings SET level = 2 WHERE body_id = $1 AND key = 'shipyard'`,
      [starter],
    );
    const { cost } = await buildShip(
      pool,
      owner,
      starter,
      { category: 'cargo', size: 'm', name: 'Mule II' },
      FAST,
    );
    expect(cost).toEqual({ steel_l: 90, fuel_cells: 22.5 });
    await processAll();
  });

  it('refus : ressources insuffisantes, catégorie inconnue, nom invalide', async () => {
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 'm', name: 'Mule III' }, FAST),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await expect(
      buildShip(pool, owner, starter, { category: 'probe' as never, size: 's', name: 'Nope' }, FAST),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      buildShip(pool, owner, starter, { category: 'cargo', size: 's', name: 'X' }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it("autorisation : on ne lance pas un chantier sur le monde d'un autre (requête directe)", async () => {
    await expect(
      buildShip(pool, intruder, starter, { category: 'cargo', size: 's', name: 'Pirate' }, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

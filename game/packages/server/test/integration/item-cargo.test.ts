/** @verifies This test file verifies: docs/MASTER_PLAN.md §W6 (reste b — acheminement d'items); JOURNAL 2026-07-22 (plan W6c-b persisté); docs/SCHEMA.md (migration 039). */
/**
 * Intégration W6c-b1 — acheminement d'ITEMS par cargo : charge à quai
 * d'un monde possédé (ligne planet_items consommée, un item = UN
 * conteneur), la capacité TOTALE (fongibles + items) borne le
 * chargement fongible ET le fret ; décharge vers la balance (pleine →
 * REFUS, jamais de désassemblage) ; monde d'autrui refusé (§10) ;
 * aller-retour avec un Crusader (balance de bord).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { loadItemCargo, unloadItemCargo } from '../../src/services/gear.js';
import { transferCargo } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let shipId = '';

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `ic-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Hauler',
    politics: 'mercantile',
    universeSeed: `ic-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Warehouse actif (balance 50) + 2 items en balance (fixture §15).
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'warehouse', 1, 0, 'active', 0)`,
    [starter],
  );
  await pool.query(
    `INSERT INTO planet_items (body_id, item_key)
     VALUES ($1, 'cargo_netting'), ($1, 'heat_recycler')`,
    [starter],
  );
  // Cargo S DOCKÉ au starter (3 conteneurs).
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, docked_body_id, docked_at, fuel, engine_type, cargo)
     SELECT $1, 'cargo', 's', 'Freighter', x, y, 'docked', id, now(),
        '{"cold": 30}', 'cold', '{}'
     FROM bodies WHERE id = $2 RETURNING id`,
    [owner, starter],
  );
  shipId = rows[0]!.id;
});

afterAll(async () => {
  await pool.end();
});

describe('W6c-b1 — fret d\'items', () => {
  it('charge : la ligne du monde est consommée, l\'item occupe UN conteneur', async () => {
    const r = await loadItemCargo(pool, owner, shipId, 'cargo_netting');
    expect(r.itemCargo).toEqual(['cargo_netting']);
    const { rows: left } = await pool.query(
      `SELECT count(*)::int AS n FROM planet_items
       WHERE body_id = $1 AND item_key = 'cargo_netting'`,
      [starter],
    );
    expect(left[0].n).toBe(0);
    // Capacité TOTALE : 1 item + 2 T d'ore = 3/3 ; la 3e tonne fongible
    // passe, la 4e est refusée (l'item compte).
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, 'ore', 50, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = 50, rate_t_per_day = 0, as_of = now()`,
      [starter],
    );
    await transferCargo(pool, owner, shipId, {
      resource: 'ore',
      tons: 2,
      direction: 'load',
    });
    await expect(
      transferCargo(pool, owner, shipId, {
        resource: 'ore',
        tons: 1,
        direction: 'load',
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Et le fret d'un 2e item est refusé aussi (3/3).
    await expect(
      loadItemCargo(pool, owner, shipId, 'heat_recycler'),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('décharge : l\'item retourne à la balance ; balance PLEINE → refus (jamais désassemblé)', async () => {
    // Remplit la balance à 50 (49 lignes de bourrage + heat_recycler déjà là).
    await pool.query(
      `INSERT INTO planet_items (body_id, item_key)
       SELECT $1, 'hull_patch_kit' FROM generate_series(1, 49)`,
      [starter],
    );
    await expect(
      unloadItemCargo(pool, owner, shipId, 'cargo_netting'),
    ).rejects.toMatchObject({ code: 'not_available' });
    expect((await ship(shipId)).item_cargo).toEqual(['cargo_netting']); // intact
    await pool.query(
      `DELETE FROM planet_items WHERE id IN (
         SELECT id FROM planet_items
         WHERE body_id = $1 AND item_key = 'hull_patch_kit' LIMIT 10)`,
      [starter],
    );
    const r = await unloadItemCargo(pool, owner, shipId, 'cargo_netting');
    expect(r.itemCargo).toEqual([]);
    const { rows: back } = await pool.query(
      `SELECT count(*)::int AS n FROM planet_items
       WHERE body_id = $1 AND item_key = 'cargo_netting'`,
      [starter],
    );
    expect(back[0].n).toBe(1);
  });

  it('§10 : autrui ne charge pas depuis MON monde ; hors quai refusé', async () => {
    const b = await registerPlayer(pool, {
      email: `ic-b-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Rival',
      politics: 'militarist',
      universeSeed: `ic-universe-${run}`,
    });
    await expect(
      loadItemCargo(pool, b.playerId, shipId, 'heat_recycler'),
    ).rejects.toMatchObject({ code: 'forbidden' }); // pas son vaisseau
    await pool.query(`UPDATE ships SET status = 'idle', docked_body_id = NULL WHERE id = $1`, [shipId]);
    await expect(
      loadItemCargo(pool, owner, shipId, 'heat_recycler'),
    ).rejects.toMatchObject({ code: 'not_available' }); // hors quai
    await pool.query(
      `UPDATE ships SET status = 'docked',
          docked_body_id = $2, docked_at = now() WHERE id = $1`,
      [shipId, starter],
    );
  });

  it('Crusader : décharge vers la balance de bord puis recharge depuis elle', async () => {
    // Vide la soute fongible puis recharge l'item du monde.
    await transferCargo(pool, owner, shipId, {
      resource: 'ore',
      tons: 2,
      direction: 'unload',
    });
    await loadItemCargo(pool, owner, shipId, 'cargo_netting');
    // Amarre à un Crusader de fixture (mêmes coordonnées).
    const { rows: cr } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, fuel, engine_type, crusader_stock, crusader_pop,
          crusader_infra, cargo)
       SELECT $1, 'combat', 'l', 'Barge', x, y, 'idle',
          '{"cold": 400}', 'cold', '{}', '{}',
          '{"residential": 3}', '{}'
       FROM bodies WHERE id = $2 RETURNING id`,
      [owner, starter],
    );
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = NULL,
          follow_ship_id = $2 WHERE id = $1`,
      [shipId, cr[0]!.id],
    );
    await unloadItemCargo(pool, owner, shipId, 'cargo_netting');
    const host = await ship(cr[0]!.id);
    expect(host.crusader_items?.cargo_netting).toBe(1);
    const r = await loadItemCargo(pool, owner, shipId, 'cargo_netting');
    expect(r.itemCargo).toEqual(['cargo_netting']);
    expect((await ship(cr[0]!.id)).crusader_items?.cargo_netting ?? 0).toBe(0);
  });
});

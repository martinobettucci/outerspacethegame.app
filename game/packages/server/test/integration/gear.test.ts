/**
 * Intégration W6 : pipeline accessoires & upgrades-items (MASTER_PLAN
 * W6, JOURNAL 2026-07-21) sur vraie base — fabrication (bâtiment hôte
 * actif, balance d'items des warehouses AD réveillée, coût payé, bord),
 * installation sur coque ENTREPOSÉE (item consommé à la commande,
 * immobilisation, retrieve refusé pendant), effets : 2 ancrages
 * (accessoire W3), réservoir ×1,5, armure ×1,6, remplacement L2→L3
 * (jamais l'inverse), autorisation §10.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { GEAR } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { fabricateGear, installGear, listPlanetGear } from '../../src/services/gear.js';
import {
  anchorTransferFuel,
  buildProbe,
  fleet,
  refuelShip,
  retrieveShip,
  warehouseShip,
} from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let intruder = '';
let starter = '';
let haulerId = '';
let natal = 'cold';

const FAST = { timeScale: 1_000_000 };

async function drainGear(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL
         AND kind IN ('item_fabricated', 'item_installed')`,
    );
    if (rows[0].n === 0) return;
  }
  throw new Error('événements d\'items jamais tous traités');
}

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `gear-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Outfitter',
    politics: 'scientific',
    universeSeed: `gear-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `gear-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intruder',
    politics: 'militarist',
    universeSeed: `gear-universe-${run}`,
  });
  owner = a.playerId;
  intruder = b.playerId;
  starter = a.spawn.starterPlanetId;
  haulerId = a.spawn.cargoShipId;
  const { rows: h } = await pool.query(
    `SELECT engine_type FROM ships WHERE id = $1`,
    [haulerId],
  );
  natal = h[0].engine_type;
  // Ateliers hôtes + trésorerie (on teste les COMMANDES, pas la rareté).
  for (const key of ['workshop', 'shipyard'] as const) {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, $2, 1, $3, 'active', 0)`,
      [starter, key, key === 'workshop' ? 0 : 1],
    );
  }
  for (const [res, qty] of [
    ['steel_l', 500],
    ['steel_h', 300],
    ['silicon', 200],
    ['gold', 60],
    ['fuel_cells', 120],
    ['ore', 400],
    [`fuel_${natal}`, 200],
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

describe('W6 — fabrication d\'items (balance AD réveillée)', () => {
  it('sans warehouse actif : capacité 0, refus explicite', async () => {
    await expect(
      fabricateGear(pool, owner, starter, 'advanced_refueling_system', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('bâtiment hôte absent : refus (weapon_foundry pour les armes)', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'warehouse', 1, 2, 'active', 0)`,
      [starter],
    );
    await expect(
      fabricateGear(pool, owner, starter, 'weapon_l2', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      fabricateGear(pool, owner, starter, 'inconnu', FAST),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      fabricateGear(pool, intruder, starter, 'advanced_refueling_system', FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('nominal : coût payé, bord → ligne non-fongible, inventaire honnête', async () => {
    const { rows: before } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'steel_l'`,
      [starter],
    );
    const r = await fabricateGear(pool, owner, starter, 'advanced_refueling_system', FAST);
    expect(r.completesAt).toBeTruthy();
    const { rows: after } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'steel_l'`,
      [starter],
    );
    expect(Number(before[0].amount_t) - Number(after[0].amount_t)).toBeCloseTo(30, 3);
    await drainGear();
    const inv = await listPlanetGear(pool, owner, starter);
    expect(inv.capacity).toBe(50);
    expect(inv.items).toEqual([{ itemKey: 'advanced_refueling_system', count: 1 }]);
  });
});

describe('W6 — installation sur coque ENTREPOSÉE', () => {
  it('refus hors entrepôt ; monté après warehouse + immobilisation (retrieve refusé pendant)', async () => {
    await expect(
      installGear(pool, owner, haulerId, 'advanced_refueling_system', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    await warehouseShip(pool, owner, haulerId);
    // timeScale 1 : l'installation dure 12 h réelles — on observe l'état.
    await installGear(pool, owner, haulerId, 'advanced_refueling_system', {
      timeScale: 1,
    });
    const s = await ship(haulerId);
    expect(s.installing_item).toBe('advanced_refueling_system');
    // L'item est CONSOMMÉ à la commande.
    const inv = await listPlanetGear(pool, owner, starter);
    expect(inv.items).toEqual([]);
    // Immobilisée : pas de redéploiement pendant l'installation.
    await expect(retrieveShip(pool, owner, haulerId, FAST)).rejects.toMatchObject({
      code: 'not_available',
    });
    // On purge la commande lente et on refait en FAST (fixture §15 : le
    // bord relit installing_item/started_at — l'idempotence est la garde).
    await pool.query(
      `DELETE FROM events WHERE kind = 'item_installed' AND processed_at IS NULL`,
    );
    await pool.query(
      `UPDATE ships SET installing_item = NULL, install_started_at = NULL
       WHERE id = $1`,
      [haulerId],
    );
    await fabricateGear(pool, owner, starter, 'advanced_refueling_system', FAST);
    await drainGear();
    await installGear(pool, owner, haulerId, 'advanced_refueling_system', FAST);
    await drainGear();
    const done = await ship(haulerId);
    expect(done.accessories).toEqual(['advanced_refueling_system']);
    expect(done.installing_item).toBeNull();
    // Doublon d'accessoire : refusé (slots de la coque, pas de rnd).
    await fabricateGear(pool, owner, starter, 'advanced_refueling_system', FAST);
    await drainGear();
    await expect(
      installGear(pool, owner, haulerId, 'advanced_refueling_system', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('upgrades : réservoir ×1,5 servi au refuel, armure ×1,6, L3 remplace L2 (jamais l\'inverse)', async () => {
    for (const key of ['fuel_l2', 'armor_l3', 'engine_l2'] as const) {
      await fabricateGear(pool, owner, starter, key, FAST);
    }
    await drainGear();
    for (const key of ['fuel_l2', 'armor_l3', 'engine_l2'] as const) {
      await installGear(pool, owner, haulerId, key, FAST);
      await drainGear();
    }
    const s = await ship(haulerId);
    expect(s.upgrades).toEqual({ fuel: 2, armor: 3, engine: 2 });
    // Même niveau / niveau inférieur : refusés.
    await fabricateGear(pool, owner, starter, 'fuel_l2', FAST);
    await drainGear();
    await expect(
      installGear(pool, owner, haulerId, 'fuel_l2', FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Retour au quai : réservoir EFFECTIF 90 u (60 × 1,5) servi au refuel.
    await retrieveShip(pool, owner, haulerId, FAST);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      await processDueEvents(pool, baseHandlers());
      const st = await ship(haulerId);
      if (st.status === 'docked') break;
    }
    const r = await refuelShip(pool, owner, haulerId);
    expect(r.units).toBeCloseTo(90, 1);
    const view = (await fleet(pool, owner)).find((v) => v.id === haulerId)!;
    expect(view.tankU).toBeCloseTo(90, 6);
    expect(view.hull.maxHp).toBeCloseTo(128, 6); // 80 × 1,6
    expect(view.upgrades).toEqual({ fuel: 2, armor: 3, engine: 2 });
  });

  it('effet accessoire : DEUX sondes L3 ancrées (au lieu d\'une)', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'probe_pad', 3, NULL, 'active', 0)`,
      [starter],
    );
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    const x = Number(pos[0].x) + 3.3;
    const y = Number(pos[0].y) + 2.1;
    // Le hauler équipé, à l'arrêt au vide, réservoir entamé.
    await pool.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3, fuel = $4,
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
         fuel_rate_u_per_day = 0, fuel_as_of = now()
       WHERE id = $1`,
      [haulerId, x, y, JSON.stringify({ [natal]: 5 })],
    );
    const probes: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await buildProbe(pool, owner, starter, {});
      expect(p.level).toBe(3);
      await pool.query(
        `UPDATE ships SET status = 'idle', x = $2, y = $3, fuel = $4,
           docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
           fuel_rate_u_per_day = 0, fuel_as_of = now()
         WHERE id = $1`,
        [p.probeId, x + 0.1 * (i + 1), y, JSON.stringify({ [natal]: 30 })],
      );
      probes.push(p.probeId);
    }
    // timeScale 1 : les deux premiers transferts restent EN COURS.
    await anchorTransferFuel(pool, owner, probes[0]!, {
      toShipId: haulerId,
      units: 20,
      timeScale: 1,
    });
    await anchorTransferFuel(pool, owner, probes[1]!, {
      toShipId: haulerId,
      units: 20,
      timeScale: 1,
    });
    // La 3e ancre sature (2 max avec l'accessoire).
    await expect(
      anchorTransferFuel(pool, owner, probes[2]!, {
        toShipId: haulerId,
        units: 5,
        timeScale: 1,
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

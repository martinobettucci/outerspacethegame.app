/** @verifies This test file verifies: docs/BACKLOG.md §P3 “Vehicle warehouse” and §P4 “Manual channel”; GAME_BOOK.md §9; DESIGN_GUIDE.md §3.3b/§6. */
/**
 * Intégration entrepôt de véhicules (GB §9, DG §6 round 6) sur vraie base :
 * balances SÉPARÉES par taille (tampon au sol 2M/2S, jamais de L sans
 * warehouse ; warehouse actif = ×mult(niveau) sur la base L1 6S/4M/2L),
 * LIBÉRATION d'équipage à l'entreposage (seule sortie du lien GB §12) et
 * re-crew AU warehouse, zéro consommation en entrepôt, redéploiement
 * 1/3/6 h par taille exigeant un dock libre, et refus d'autorisation par
 * requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import {
  assignCrew,
  fleet,
  retrieveShip,
  warehouseShip,
} from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = ''; // « First hauler » du spawn, à quai, pilote à bord
let pilotId = '';
let other = '';
let otherStarter = '';

const handlers = baseHandlers();

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function npc(id: string) {
  const { rows } = await pool.query(`SELECT * FROM npcs WHERE id = $1`, [id]);
  return rows[0];
}

/** Coque À QUAI par SQL — l'atterrissage (spaceport, politique, docks) est
 * couvert par docks.test.ts ; ici la fixture isole la règle d'entrepôt. */
async function dockedShip(
  ownerId: string,
  category: string,
  size: string,
  at: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, docked_body_id, docked_at, fuel)
     VALUES ($1, $2, $3, $4,
        (SELECT x FROM bodies WHERE id = $5),
        (SELECT y FROM bodies WHERE id = $5),
        'docked', $5, now(), '{"cold": 5}') RETURNING id`,
    [ownerId, category, size, `wh-${category}-${size}-${run}`, at],
  );
  return rows[0]!.id;
}

async function vehiclesOf(bodyId: string, playerId = owner) {
  const d = await planetDetail(pool, playerId, bodyId);
  return d.vehicles;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `wh-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Stocker',
    politics: 'industrialist',
    universeSeed: `wh-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `wh-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intruder',
    politics: 'mercantile',
    universeSeed: `wh-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  pilotId = a.spawn.pilotNpcId;
  other = b.playerId;
  otherStarter = b.spawn.starterPlanetId;
  // Le pilote embarque sur le hauler (vraie commande, à quai).
  await assignCrew(pool, owner, cargo, pilotId);
});

afterAll(async () => {
  await pool.end();
});

describe('tampon au sol (aucun warehouse) : 2 M + 2 S, jamais de L', () => {
  it('les balances du détail planète partent à 2S/2M/0L, vides', async () => {
    const v = await vehiclesOf(ownerStarter);
    expect(v.capacity).toEqual({ s: 2, m: 2, l: 0 });
    expect(v.stored).toEqual({ s: 0, m: 0, l: 0 });
  });

  it('entreposer LIBÈRE l\'équipage (crewReleased, lien npc rompu)', async () => {
    const before = await npc(pilotId);
    expect(before.bound_host_id).toBe(cargo);
    const res = await warehouseShip(pool, owner, cargo);
    expect(res.bodyId).toBe(ownerStarter);
    expect(res.crewReleased).toBe(1);
    const after = await npc(pilotId);
    expect(after.bound_host_type).toBeNull();
    expect(after.bound_host_id).toBeNull();
    const s = await ship(cargo);
    expect(s.status).toBe('warehoused');
    expect(s.docked_at).toBeNull();
  });

  it('zéro consommation en entrepôt : drains désarmés, aucun bord', async () => {
    const s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBe(0);
    expect(Number(s.fuel_rate_u_per_day)).toBe(0);
    const { rows } = await pool.query(
      `SELECT kind FROM events WHERE processed_at IS NULL
         AND kind IN ('ship_fuel_out', 'survival_low', 'survival_out')
         AND payload->>'shipId' = $1`,
      [cargo],
    );
    expect(rows).toEqual([]);
  });

  it('re-crew AU warehouse (canon) : le pilote rembarque sans quai', async () => {
    await assignCrew(pool, owner, cargo, pilotId);
    const p = await npc(pilotId);
    expect(p.bound_host_type).toBe('ship');
    expect(p.bound_host_id).toBe(cargo);
  });

  it('balances SÉPARÉES : 2e S entre, 3e S refusé même avec du M libre', async () => {
    const s2 = await dockedShip(owner, 'cargo', 's', ownerStarter);
    await warehouseShip(pool, owner, s2);
    const s3 = await dockedShip(owner, 'cargo', 's', ownerStarter);
    await expect(warehouseShip(pool, owner, s3)).rejects.toThrow(
      /Balances S pleines \(2\/2\)/,
    );
    const m1 = await dockedShip(owner, 'civil', 'm', ownerStarter);
    await warehouseShip(pool, owner, m1); // le M libre n'a PAS servi au S
    const v = await vehiclesOf(ownerStarter);
    expect(v.stored).toEqual({ s: 2, m: 1, l: 0 });
  });

  it('le lourd est refusé structurellement sans warehouse', async () => {
    const l1 = await dockedShip(owner, 'cargo', 'l', ownerStarter);
    await expect(warehouseShip(pool, owner, l1)).rejects.toThrow(
      /Aucune balance L ici/,
    );
  });
});

describe('warehouse actif : base 6S/4M/2L × mult(niveau), cumul', () => {
  it('un warehouse L1 porte les balances à 8S/6M/2L et accepte le L', async () => {
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'warehouse', 1, 3, 'active', 0)`,
      [ownerStarter],
    );
    const v = await vehiclesOf(ownerStarter);
    expect(v.capacity).toEqual({ s: 8, m: 6, l: 2 });
    // W8 : le combat_l (Crusader) ne s'entrepose plus JAMAIS — la
    // balance L se prouve avec un cargo_l.
    const l1 = await dockedShip(owner, 'cargo', 'l', ownerStarter);
    await warehouseShip(pool, owner, l1);
    expect((await ship(l1)).status).toBe('warehoused');
    expect((await vehiclesOf(ownerStarter)).stored).toEqual({ s: 2, m: 1, l: 1 });
  });
});

describe('refus d\'autorisation par requêtes directes (§10)', () => {
  it('autrui ne remise pas MON vaisseau', async () => {
    const s = await dockedShip(owner, 'cargo', 's', ownerStarter);
    await expect(warehouseShip(pool, other, s)).rejects.toThrow(
      /obéit pas|inconnu/i,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [s]);
  });

  it('on ne remise que sur SES mondes (à quai chez autrui : refus)', async () => {
    const s = await dockedShip(owner, 'cargo', 's', otherStarter);
    await expect(warehouseShip(pool, owner, s)).rejects.toThrow(
      /On remise sur SES mondes/,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [s]);
  });

  it('le vaisseau personnel ne se remise pas (le Souverain reste)', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
      [owner],
    );
    await expect(warehouseShip(pool, owner, rows[0].id)).rejects.toThrow(
      /ne se remise pas/,
    );
  });

  it('en survol : on remise depuis le quai uniquement', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
          status, hover_body_id, fuel)
       VALUES ($1, 'cargo', 's', $2,
          (SELECT x FROM bodies WHERE id = $3),
          (SELECT y FROM bodies WHERE id = $3),
          'hovering', $3, '{"cold": 5}') RETURNING id`,
      [owner, `wh-hover-${run}`, ownerStarter],
    );
    await expect(warehouseShip(pool, owner, rows[0]!.id)).rejects.toThrow(
      /On remise depuis le quai/,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [rows[0]!.id]);
  });

  it('retrieve : refusé sur une coque qui n\'est PAS en entrepôt', async () => {
    const s = await dockedShip(owner, 'cargo', 's', ownerStarter);
    await expect(retrieveShip(pool, owner, s)).rejects.toThrow(
      /n'est pas en entrepôt/,
    );
    await pool.query(`DELETE FROM ships WHERE id = $1`, [s]);
  });

  it('autrui ne redéploie pas MA coque entreposée', async () => {
    await expect(retrieveShip(pool, other, cargo)).rejects.toThrow(
      /obéit pas|inconnu/i,
    );
  });
});

describe('redéploiement : 1/3/6 h par taille, dock libre exigé, événement', () => {
  it('S = 1 h ÷ timeScale ; le double-retrieve est refusé ; l\'événement repose à quai', async () => {
    const before = Date.now();
    // ×3 600 000 : l'heure canon du S devient ~1 ms (événement immédiat).
    const { readyAt } = await retrieveShip(pool, owner, cargo, {
      timeScale: 3_600_000,
    });
    expect(readyAt.getTime() - before).toBeLessThan(2_000);
    const view = await fleet(pool, owner);
    const mine = view.find((v) => v.id === cargo);
    expect(mine?.retrievesAt).toBe(readyAt.toISOString());
    await expect(retrieveShip(pool, owner, cargo)).rejects.toThrow(
      /déjà en cours/,
    );
    await new Promise((r) => setTimeout(r, 10));
    const { processed } = await processDueEvents(pool, handlers);
    expect(processed).toBeGreaterThan(0);
    const s = await ship(cargo);
    expect(s.status).toBe('docked');
    expect(s.docked_body_id).toBe(ownerStarter);
    expect(s.docked_at).not.toBeNull();
    expect((await vehiclesOf(ownerStarter)).stored.s).toBe(1);
  });

  it('M = 3 h ÷ timeScale (délai proportionnel à la taille)', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_size = 'm'
         AND status = 'warehoused'`,
      [owner],
    );
    const before = Date.now();
    const { readyAt } = await retrieveShip(pool, owner, rows[0].id, {
      timeScale: 1,
    });
    expect(Math.abs(readyAt.getTime() - before - 3 * 3_600_000)).toBeLessThan(
      5_000,
    );
    // Fixture repliée : le redéploiement lui-même est prouvé ci-dessus.
    await pool.query(
      `DELETE FROM events WHERE kind = 'ship_retrieved'
         AND processed_at IS NULL AND payload->>'shipId' = $1`,
      [rows[0].id],
    );
  });

  it('sans dock libre au spaceport actif : redéploiement refusé', async () => {
    // Spaceport L1 (2 docks S) saturé par le hauler redéployé + un 2e S.
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'spaceport', 1, 4, 'active', 0)`,
      [ownerStarter],
    );
    await dockedShip(owner, 'cargo', 's', ownerStarter);
    const { rows } = await pool.query(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_size = 's'
         AND status = 'warehoused'`,
      [owner],
    );
    await expect(retrieveShip(pool, owner, rows[0].id)).rejects.toThrow(
      /Aucun dock libre/,
    );
  });
});

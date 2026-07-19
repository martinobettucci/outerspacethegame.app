/**
 * Intégration : atterrissage & fret (GB §9/§13, DG §7) sur vraie base —
 * décoller/atterrir, matrice spaceport (self/everyone), manutention des
 * conteneurs (1 T/conteneur, tonnes partielles), refus d'autorisation par
 * requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail, setBuildingSettings } from '../../src/services/planets.js';
import {
  landShip,
  transferCargo,
  undockShip,
} from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let hauler = '';
let haulerStarter = '';
let haulerCargo = '';
let host = '';
let hostStarter = '';

async function ship(id: string) {
  const { rows } = await pool.query('SELECT * FROM ships WHERE id = $1', [id]);
  return rows[0];
}

async function stockOf(bodyId: string, resource: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = $2`,
    [bodyId, resource],
  );
  return rows[0] ? Number(rows[0].amount_t) : 0;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `haul-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Hauler',
    politics: 'industrialist',
    universeSeed: `haul-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `host-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Host',
    politics: 'mercantile',
    universeSeed: `haul-universe-${run}`,
  });
  hauler = a.playerId;
  haulerStarter = a.spawn.starterPlanetId;
  haulerCargo = a.spawn.cargoShipId;
  host = b.playerId;
  hostStarter = b.spawn.starterPlanetId;
});

afterAll(async () => {
  await pool.end();
});

describe('décoller / atterrir sur son monde (GB §9, v1)', () => {
  it('undock → survol du même monde ; land → à quai (ses mondes accueillent toujours)', async () => {
    const { bodyId } = await undockShip(pool, hauler, haulerCargo);
    expect(bodyId).toBe(haulerStarter);
    let s = await ship(haulerCargo);
    expect(s.status).toBe('hovering');
    expect(s.hover_body_id).toBe(haulerStarter);

    await landShip(pool, hauler, haulerCargo);
    s = await ship(haulerCargo);
    expect(s.status).toBe('docked');
    expect(s.docked_body_id).toBe(haulerStarter);
    expect(s.hover_body_id).toBeNull();
  });

  it('refus : décoller un vaisseau déjà en survol, atterrir sans monde sous la coque', async () => {
    await undockShip(pool, hauler, haulerCargo);
    await expect(undockShip(pool, hauler, haulerCargo)).rejects.toMatchObject({
      code: 'not_available',
    });
    // À l'arrêt dans le vide (pas de hover_body_id) : rien où se poser.
    await pool.query(
      `UPDATE ships SET status = 'idle', hover_body_id = NULL WHERE id = $1`,
      [haulerCargo],
    );
    await expect(landShip(pool, hauler, haulerCargo)).rejects.toMatchObject({
      code: 'not_available',
    });
    // Remise à quai pour la suite.
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, hover_body_id = NULL
       WHERE id = $1`,
      [haulerCargo, haulerStarter],
    );
  });

  it("autorisation : le vaisseau d'un autre ne s'actionne pas (requêtes directes)", async () => {
    await expect(undockShip(pool, host, haulerCargo)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(landShip(pool, host, haulerCargo)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      transferCargo(pool, host, haulerCargo, {
        resource: 'ore',
        tons: 1,
        direction: 'load',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('fret à quai (DG §7 — 1 conteneur = 1 T)', () => {
  it('charge 2 T d\'ore : le stock baisse, la soute monte ; capacité Cargo S = 3 conteneurs', async () => {
    const before = await stockOf(haulerStarter, 'ore');
    const { cargo } = await transferCargo(pool, hauler, haulerCargo, {
      resource: 'ore',
      tons: 2,
      direction: 'load',
    });
    expect(cargo.ore).toBe(2);
    expect(await stockOf(haulerStarter, 'ore')).toBeCloseTo(before - 2, 5);

    // 0,5 T d'eau : la tonne partielle monopolise le 3e conteneur.
    await transferCargo(pool, hauler, haulerCargo, {
      resource: 'water',
      tons: 0.5,
      direction: 'load',
    });
    // 4e conteneur inexistant : refus.
    await expect(
      transferCargo(pool, hauler, haulerCargo, {
        resource: 'ore',
        tons: 1,
        direction: 'load',
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Mais compléter le conteneur d'eau entamé reste possible (0,5 → 0,9 T).
    const r = await transferCargo(pool, hauler, haulerCargo, {
      resource: 'water',
      tons: 0.4,
      direction: 'load',
    });
    expect(r.cargo.water).toBeCloseTo(0.9, 5);
  });

  it('refus : stock planétaire insuffisant, soute insuffisante, ressource inconnue', async () => {
    // Libère un conteneur (la capacité se vérifie avant le stock).
    await transferCargo(pool, hauler, haulerCargo, {
      resource: 'ore',
      tons: 1,
      direction: 'unload',
    });
    await expect(
      transferCargo(pool, hauler, haulerCargo, {
        resource: 'gold',
        tons: 1,
        direction: 'load',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await transferCargo(pool, hauler, haulerCargo, {
      resource: 'ore',
      tons: 1,
      direction: 'load',
    });
    await expect(
      transferCargo(pool, hauler, haulerCargo, {
        resource: 'gold',
        tons: 1,
        direction: 'unload',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
    await expect(
      transferCargo(pool, hauler, haulerCargo, {
        resource: 'unobtainium',
        tons: 1,
        direction: 'load',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('décharge : la soute se vide, le stock remonte ; l\'overfill de livraison PASSE (§3.3b)', async () => {
    const before = await stockOf(haulerStarter, 'ore');
    const { cargo } = await transferCargo(pool, hauler, haulerCargo, {
      resource: 'ore',
      tons: 2,
      direction: 'unload',
    });
    expect(cargo.ore).toBeUndefined();
    expect(await stockOf(haulerStarter, 'ore')).toBeCloseTo(before + 2, 5);

    // Stockage saturé au cap : la décharge ATTERRIT quand même — canon
    // §3.3b « swaps/deliveries may overfill; only production halts at
    // cap » (aligné chunk Y ; l'ancien refus explicite était plus strict
    // que le canon).
    const detail = await planetDetail(pool, hauler, haulerStarter);
    await pool.query(
      `UPDATE planet_stock SET amount_t = $2, rate_t_per_day = 0, as_of = now()
       WHERE body_id = $1 AND resource = 'ore'`,
      [haulerStarter, detail.storageCapT],
    );
    await transferCargo(pool, hauler, haulerCargo, {
      resource: 'water',
      tons: 0.9,
      direction: 'unload',
    });
    const after = await planetDetail(pool, hauler, haulerStarter);
    expect(after.storageUsedT).toBeGreaterThan(after.storageCapT);
    // Restauration d'un niveau raisonnable pour la suite.
    await pool.query(
      `UPDATE planet_stock SET amount_t = 60, as_of = now()
       WHERE body_id = $1 AND resource = 'ore'`,
      [haulerStarter],
    );
  });
});

describe('atterrissage sur monde étranger (GB §9 — spaceport requis)', () => {
  // Le vol réel est couvert par ships.test.ts ; ici le vaisseau est POSÉ en
  // survol par SQL (la distance de la paire, roulée par le seed, peut
  // dépasser l'autonomie v1 d'un Cargo S — 240 pc).
  it('sans spaceport actif : refus ; spaceport self : refus ; everyone : accueilli', async () => {
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [haulerCargo, hostStarter],
    );
    await expect(landShip(pool, hauler, haulerCargo)).rejects.toMatchObject({
      code: 'forbidden',
    });

    const { rows: port } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'spaceport', 1, 0, 'active', 0) RETURNING id`,
      [hostStarter],
    );
    // Politique par défaut = self : toujours refusé.
    await expect(landShip(pool, hauler, haulerCargo)).rejects.toMatchObject({
      code: 'forbidden',
    });

    // L'hôte ouvre son port via la VRAIE commande (et elle est validée).
    await expect(
      setBuildingSettings(pool, host, hostStarter, port[0]!.id, {
        landing: 'anyone-at-all',
      }),
    ).rejects.toMatchObject({ code: 'workforce_invalid' });
    await setBuildingSettings(pool, host, hostStarter, port[0]!.id, {
      landing: 'everyone',
    });
    await landShip(pool, hauler, haulerCargo);
    const s = await ship(haulerCargo);
    expect(s.status).toBe('docked');
    expect(s.docked_body_id).toBe(hostStarter);

    // Le fret sur monde étranger, c'est du commerce : refusé en v1.
    await expect(
      transferCargo(pool, hauler, haulerCargo, {
        resource: 'water',
        tons: 0.5,
        direction: 'unload',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('monde sauvage : rien pour vous accueillir ; une sonde ne se pose jamais', async () => {
    const { rows: wild } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id IS NULL AND body_type = 'planet' LIMIT 1`,
    );
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2, docked_body_id = NULL
       WHERE id = $1`,
      [haulerCargo, wild[0].id],
    );
    await expect(landShip(pool, hauler, haulerCargo)).rejects.toMatchObject({
      code: 'not_available',
    });

    const { rows: probe } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, name, x, y, status, hover_body_id)
       VALUES ($1, 'probe', 'Probe', 0, 0, 'hovering', $2) RETURNING id`,
      [hauler, hostStarter],
    );
    await expect(landShip(pool, hauler, probe[0]!.id)).rejects.toMatchObject({
      code: 'not_available',
    });

    // Remise à quai chez soi pour l'état final du fichier.
    await pool.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, hover_body_id = NULL
       WHERE id = $1`,
      [haulerCargo, haulerStarter],
    );
  });

  it('la politique d\'atterrissage ne se règle que sur un spaceport (et par son propriétaire)', async () => {
    const { rows: mine } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'mine', 1, 1, 'active', 'extract:ore', 35) RETURNING id`,
      [hostStarter],
    );
    await expect(
      setBuildingSettings(pool, host, hostStarter, mine[0]!.id, {
        landing: 'everyone',
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Un étranger ne règle pas MON port (requête directe).
    const { rows: port } = await pool.query(
      `SELECT id FROM buildings WHERE body_id = $1 AND key = 'spaceport'`,
      [hostStarter],
    );
    await expect(
      setBuildingSettings(pool, hauler, hostStarter, port[0].id, {
        landing: 'self',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Docks”; GAME_BOOK.md §9/§14; DESIGN_GUIDE.md §5.1/§7/§8.6. */
/**
 * Intégration docks de spaceport (GB §9/§14, DG §5.1/§8.6) sur vraie base :
 * capacité S/M/L cumulée par niveau, refus structurel vs saturation,
 * exemptions canon (personnel, Combat-S), réservations pour soi (pool
 * visiteurs), éviction de séjour (dwell) avec péremption au re-atterrissage,
 * et refus d'autorisation par requêtes directes (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail, setBuildingSettings } from '../../src/services/planets.js';
import { landShip, undockShip } from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let host = '';
let hostStarter = '';
let hostCargo = '';
let visitor = '';
let visitorCargo = '';
let portId = '';

async function ship(id: string) {
  const { rows } = await pool.query('SELECT * FROM ships WHERE id = $1', [id]);
  return rows[0];
}

/** Pose un vaisseau en survol d'un monde par SQL (le vol est couvert par
 * ships.test.ts ; la distance inter-poches dépasse l'autonomie v1). */
async function hoverAt(shipId: string, bodyId: string) {
  await pool.query(
    `UPDATE ships SET status = 'hovering', hover_body_id = $2,
       docked_body_id = NULL, docked_at = NULL,
       x = (SELECT x FROM bodies WHERE id = $2),
       y = (SELECT y FROM bodies WHERE id = $2)
     WHERE id = $1`,
    [shipId, bodyId],
  );
}

async function newShip(
  ownerId: string,
  category: string,
  size: string | null,
  at: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, hover_body_id, fuel)
     VALUES ($1, $2, $3, $4,
        (SELECT x FROM bodies WHERE id = $5),
        (SELECT y FROM bodies WHERE id = $5),
        'hovering', $5, '{"cold": 5}') RETURNING id`,
    [ownerId, category, size, `${category}-${size ?? 'x'}-${run}`, at],
  );
  return rows[0]!.id;
}

async function evictionEventsFor(shipId: string) {
  const { rows } = await pool.query(
    `SELECT id, due_at, payload FROM events
     WHERE kind = 'dock_eviction' AND processed_at IS NULL
       AND payload->>'shipId' = $1
     ORDER BY due_at`,
    [shipId],
  );
  return rows;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `dock-host-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'DockHost',
    politics: 'mercantile',
    universeSeed: `dock-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `dock-visit-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'DockVisitor',
    politics: 'industrialist',
    universeSeed: `dock-universe-${run}`,
  });
  host = a.playerId;
  hostStarter = a.spawn.starterPlanetId;
  hostCargo = a.spawn.cargoShipId;
  visitor = b.playerId;
  visitorCargo = b.spawn.cargoShipId;

  // Spaceport L1 actif chez l'hôte, ouvert à tous via la VRAIE commande.
  const { rows: port } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'spaceport', 1, 0, 'active', 0) RETURNING id`,
    [hostStarter],
  );
  portId = port[0]!.id;
  await setBuildingSettings(pool, host, hostStarter, portId, {
    landing: 'everyone',
  });
  // Le « First hauler » du spawn occupe un dock S : on le met en survol
  // pour partir de 2 docks S libres (fixture lisible).
  await pool.query(
    `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
       docked_body_id = NULL, docked_at = NULL
     WHERE id = $1`,
    [hostCargo],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('capacité de dock (L1 = 2 S, cumulatif par niveau)', () => {
  it('2 visiteurs S entrent (docked_at posé), le 3e sature', async () => {
    await hoverAt(visitorCargo, hostStarter);
    await landShip(pool, visitor, visitorCargo);
    const s1 = await ship(visitorCargo);
    expect(s1.status).toBe('docked');
    expect(s1.docked_at).not.toBeNull();

    const v2 = await newShip(visitor, 'cargo', 's', hostStarter);
    await landShip(pool, visitor, v2);

    const v3 = await newShip(visitor, 'cargo', 's', hostStarter);
    await expect(landShip(pool, visitor, v3)).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('saturés'),
    });
  });

  it('exemptions : Combat-S et coque personnelle entrent même saturé', async () => {
    const fighter = await newShip(visitor, 'combat', 's', hostStarter);
    await landShip(pool, visitor, fighter);
    expect((await ship(fighter)).status).toBe('docked');

    // La coque personnelle de l'hôte rentre toujours chez elle.
    const { rows: personal } = await pool.query<{ id: string }>(
      `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
      [host],
    );
    await hoverAt(personal[0]!.id, hostStarter);
    await landShip(pool, host, personal[0]!.id);
    expect((await ship(personal[0]!.id)).status).toBe('docked');
  });

  it('coque M : refus STRUCTUREL sur L1, accueillie au niveau 2 ; L refusée', async () => {
    const barge = await newShip(visitor, 'civil', 'm', hostStarter);
    await expect(landShip(pool, visitor, barge)).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('Aucun dock M'),
    });

    await pool.query(`UPDATE buildings SET level = 2 WHERE id = $1`, [portId]);
    await landShip(pool, visitor, barge);
    expect((await ship(barge)).status).toBe('docked');

    const liner = await newShip(visitor, 'civil', 'l', hostStarter);
    await expect(landShip(pool, visitor, liner)).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('Aucun dock L'),
    });
  });

  it('planetDetail agrège : total, coques à quai par taille, visiteurs', async () => {
    const detail = await planetDetail(pool, host, hostStarter);
    expect(detail.docks).not.toBeNull();
    expect(detail.docks!.total).toEqual({ s: 2, m: 2, l: 0 });
    // À quai : 2 cargo S + 1 civil M visiteurs (les exemptions n'occupent
    // pas : Combat-S et personnel sont hors compte).
    expect(detail.docks!.occupied).toEqual({ s: 2, m: 1, l: 0 });
    expect(detail.docks!.visitors).toBe(3);
    const port = detail.buildings.find((b) => b.id === portId)!;
    expect(port.dwellHours).toBe(24);
    expect(port.reservedForSelf).toBe(0);
  });
});

describe('réservations pour soi (pool visiteurs, plus petits docks d\'abord)', () => {
  it('le dock gardé refuse le visiteur et sert le propriétaire', async () => {
    // Coques du bloc précédent remises en survol, port ramené à L1,
    // 1 dock réservé (seuls les vaisseaux À QUAI comptent).
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $1,
         docked_body_id = NULL, docked_at = NULL
       WHERE docked_body_id = $1`,
      [hostStarter],
    );
    await pool.query(`UPDATE buildings SET level = 1 WHERE id = $1`, [portId]);
    await setBuildingSettings(pool, host, hostStarter, portId, {
      reservedForSelf: 1,
    });

    // Pool visiteurs = 1 S : le premier entre, le second est refusé.
    await hoverAt(visitorCargo, hostStarter);
    await landShip(pool, visitor, visitorCargo);
    const v2 = await newShip(visitor, 'cargo', 's', hostStarter);
    await expect(landShip(pool, visitor, v2)).rejects.toMatchObject({
      code: 'not_available',
    });

    // Le propriétaire, lui, utilise le dock réservé.
    await hoverAt(hostCargo, hostStarter);
    await landShip(pool, host, hostCargo);
    expect((await ship(hostCargo)).status).toBe('docked');
    const detail = await planetDetail(pool, host, hostStarter);
    expect(detail.docks!.reservedForSelf).toBe(1);
    expect(detail.docks!.occupied).toEqual({ s: 2, m: 0, l: 0 });
    expect(detail.docks!.visitors).toBe(1);
  });
});

describe('éviction de séjour (dwell) — anti-DoS DG §8.6', () => {
  it('le visiteur est renvoyé au survol à l\'échéance, réservoir armé', async () => {
    // État propre : plus aucun visiteur à quai, pas de réservation, dwell 2 h.
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $1,
         docked_body_id = NULL, docked_at = NULL
       WHERE docked_body_id = $1 AND owner_id <> $2`,
      [hostStarter, host],
    );
    await setBuildingSettings(pool, host, hostStarter, portId, {
      reservedForSelf: 0,
      dwellHours: 2,
    });

    const t0 = Date.now();
    await hoverAt(visitorCargo, hostStarter);
    await pool.query(
      `UPDATE ships SET fuel = '{"cold": 10}', fuel_rate_u_per_day = 0,
         fuel_as_of = to_timestamp($2 / 1000.0)
       WHERE id = $1`,
      [visitorCargo, t0],
    );
    await landShip(pool, visitor, visitorCargo, { nowMs: t0 });

    // Les évictions des atterrissages PRÉCÉDENTS restent en file (aucun
    // worker ici) : on ne compte que celle de CET atterrissage.
    const events = (await evictionEventsFor(visitorCargo)).filter(
      (e) => Number(e.payload.landedAtMs) === t0,
    );
    expect(events).toHaveLength(1);
    expect(
      Math.abs(new Date(events[0].due_at).getTime() - (t0 + 2 * 3600e3)),
    ).toBeLessThan(5);

    await processDueEvents(pool, baseHandlers(), {
      nowMs: t0 + 2 * 3600e3 + 1000,
    });
    const s = await ship(visitorCargo);
    expect(s.status).toBe('hovering');
    expect(s.hover_body_id).toBe(hostStarter);
    expect(s.docked_at).toBeNull();
    expect(Number(s.fuel_rate_u_per_day)).toBeLessThan(0);
  });

  it('un re-atterrissage périme l\'ancienne éviction (garde docked_at)', async () => {
    const t0 = Date.now();
    await landShip(pool, visitor, visitorCargo, { nowMs: t0 }); // éviction A : t0+2h
    await undockShip(pool, visitor, visitorCargo);
    await landShip(pool, visitor, visitorCargo, { nowMs: t0 + 3600e3 }); // B : t0+3h

    // A échoit : la garde (docked_at ≠ landedAtMs de A) laisse le vaisseau
    // à quai. B échoit ensuite : éviction réelle.
    await processDueEvents(pool, baseHandlers(), {
      nowMs: t0 + 2 * 3600e3 + 1000,
    });
    expect((await ship(visitorCargo)).status).toBe('docked');
    await processDueEvents(pool, baseHandlers(), {
      nowMs: t0 + 3 * 3600e3 + 1000,
    });
    expect((await ship(visitorCargo)).status).toBe('hovering');
  });

  it('le propriétaire n\'est jamais évincé (aucun événement planifié)', async () => {
    expect(await evictionEventsFor(hostCargo)).toHaveLength(0);
  });
});

describe('mondes sauvages & Combat-S (GB §14, interp annoncée)', () => {
  it('cargo refusé sur monde sauvage ; Combat-S se pose, sans éviction', async () => {
    const { rows: wild } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id IS NULL AND body_type = 'planet' LIMIT 1`,
    );
    await hoverAt(visitorCargo, wild[0].id);
    await expect(landShip(pool, visitor, visitorCargo)).rejects.toMatchObject({
      code: 'not_available',
    });

    const fighter = await newShip(visitor, 'combat', 's', wild[0].id);
    await landShip(pool, visitor, fighter);
    expect((await ship(fighter)).status).toBe('docked');
    expect(await evictionEventsFor(fighter)).toHaveLength(0);
  });

  it('Combat-S ignore la politique self d\'un monde étranger', async () => {
    await setBuildingSettings(pool, host, hostStarter, portId, {
      landing: 'self',
    });
    const fighter = await newShip(visitor, 'combat', 's', hostStarter);
    await landShip(pool, visitor, fighter);
    expect((await ship(fighter)).status).toBe('docked');
    // Mais son séjour reste borné : le monde a un propriétaire.
    expect(await evictionEventsFor(fighter)).toHaveLength(1);
    await setBuildingSettings(pool, host, hostStarter, portId, {
      landing: 'everyone',
    });
  });
});

describe('réglages : bornes & autorisations directes (CLAUDE.md §10)', () => {
  it('dwellHours/reservedForSelf : spaceport uniquement, bornes strictes', async () => {
    const { rows: mine } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'mine', 1, 2, 'active', 'extract:ore', 0) RETURNING id`,
      [hostStarter],
    );
    await expect(
      setBuildingSettings(pool, host, hostStarter, mine[0]!.id, { dwellHours: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      setBuildingSettings(pool, host, hostStarter, mine[0]!.id, { reservedForSelf: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' });
    for (const dwellHours of [0, 721, -3]) {
      await expect(
        setBuildingSettings(pool, host, hostStarter, portId, { dwellHours }),
      ).rejects.toMatchObject({ code: 'workforce_invalid' });
    }
    for (const reservedForSelf of [-1, 3]) {
      await expect(
        setBuildingSettings(pool, host, hostStarter, portId, { reservedForSelf }),
      ).rejects.toMatchObject({ code: 'workforce_invalid' });
    }
  });

  it('un étranger ne règle ni le dwell ni les réservations de MON port', async () => {
    await expect(
      setBuildingSettings(pool, visitor, hostStarter, portId, { dwellHours: 1 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      setBuildingSettings(pool, visitor, hostStarter, portId, { reservedForSelf: 2 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

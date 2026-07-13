/**
 * Intégration : intel par paliers (GB §20, DG §4.1/§11.3) sur vraie base —
 * hors scope = 404 (jamais d'oracle), montée L1→L2→L3, +1 scientifique
 * (gouverneur), sonde sur site = deep sight, listes blanches EXACTES par
 * palier, fuite quality corrigée dans /galaxy, GET /planets/:id d'autrui
 * TOUJOURS 403 même à palier 4 (requêtes directes, CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import { bodyIntel, visibleBodies } from '../../src/services/world.js';
import { CommandError } from '../../src/services/planets.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let observer = '';
let obsStarter = '';
let target = '';
let targetStarter = '';
let telescopeId = '';

async function setTelescopeLevel(level: number): Promise<void> {
  await pool.query(`UPDATE buildings SET level = $2 WHERE id = $1`, [
    telescopeId,
    level,
  ]);
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `intel-obs-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Observer',
    politics: 'industrialist',
    universeSeed: `intel-universe-${run}`,
  });
  // Le second inscrit bénéficie de la garantie voisin 150–240 pc — la
  // SEULE ancre active est l'observateur : distance déterministe ≤ 240,
  // couvrable par un télescope L1 (60 + 200 = 260).
  const b = await registerPlayer(pool, {
    email: `intel-target-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Target',
    politics: 'mercantile',
    universeSeed: `intel-universe-${run}`,
  });
  observer = a.playerId;
  obsStarter = a.spawn.starterPlanetId;
  target = b.playerId;
  targetStarter = b.spawn.starterPlanetId;
}, 30_000);

afterAll(async () => {
  await pool.end();
});

describe('intel par paliers (GB §20)', () => {
  it('hors scope : 404 not_found — jamais un oracle d\'existence', async () => {
    await expect(
      bodyIntel(pool, observer, targetStarter, Date.now()),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('télescope L1 : palier 1 — silhouette, ET la fuite quality est fermée', async () => {
    const { rows } = await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'telescope', 1, NULL, 'active', 0) RETURNING id`,
      [obsStarter],
    );
    telescopeId = rows[0].id;
    const intel = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(intel.tier).toBe(1);
    expect(Object.keys(intel).sort()).toEqual(
      ['bodyType', 'climate', 'id', 'isStarter', 'name', 'ownerId', 'ownerName', 'size', 'tier', 'x', 'y'].sort(),
    );
    // /galaxy ne publie plus la qualité d'un monde étranger.
    const seen = await visibleBodies(pool, observer);
    const t = seen.find((v) => v.id === targetStarter);
    expect(t).toBeTruthy();
    expect(t!.quality).toBeNull();
    const own = seen.find((v) => v.id === obsStarter);
    expect(own!.quality).not.toBeNull();
  });

  it('télescope L2 : palier 2 — développement (spaceport, offres innées)', async () => {
    await setTelescopeLevel(2);
    // Donne des données L2 à montrer : spaceport ouvert + offre innée.
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce, config)
       VALUES ($1, 'spaceport', 1, 0, 'active', 0, '{"landing":"everyone"}')`,
      [targetStarter],
    );
    await pool.query(
      `UPDATE bodies SET config = '{"innateOffers":[{"sell":"water","want":"ore","price":2,"keepFloorT":5}]}'
       WHERE id = $1`,
      [targetStarter],
    );
    const intel = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(intel.tier).toBe(2);
    expect(intel.tilesUsed).toBe(1);
    expect(intel.spaceportOpen).toBe(true);
    expect(intel.innateOffers).toEqual([{ sell: 'water', want: 'ore', price: 2 }]);
    // keepFloorT (donnée du propriétaire) ne sort JAMAIS.
    expect(JSON.stringify(intel)).not.toContain('keepFloor');
    // Les clefs des paliers supérieurs sont ABSENTES.
    expect('buildings' in intel).toBe(false);
    expect('quality' in intel).toBe(false);
  });

  it('télescope L3 : palier 3 — stratégique, gisements en PRÉSENCE seule', async () => {
    await setTelescopeLevel(3);
    const intel = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(intel.tier).toBe(3);
    expect(intel.buildings).toEqual([
      { key: 'spaceport', level: 1, status: 'active' },
    ]);
    expect(intel.defenseCount).toBe(0);
    expect(intel.depositsPresent!.length).toBeGreaterThan(0);
    expect('deposits' in intel).toBe(false);
    expect('techDna' in intel).toBe(false);
  });

  it('+1 scientifique (gouverneur) : palier 4 — deep sight, sans sonde', async () => {
    await pool.query(
      `INSERT INTO npcs (owner_id, people, role, rarity, stat_rolls,
          bound_host_type, bound_host_id)
       VALUES ($1, 'human', 'scientist', 'common', '{}', 'planet', $2)`,
      [observer, obsStarter],
    );
    const intel = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(intel.tier).toBe(4);
    expect(intel.quality).toBeTruthy();
    expect(intel.deposits!.length).toBeGreaterThan(0);
    expect(intel.deposits![0]).toHaveProperty('remainingT');
    expect(intel.techDna!.available.length).toBeGreaterThan(0);
    // Le SEED ne sort jamais, ni le détail opérationnel.
    const json = JSON.stringify(intel);
    for (const banned of ['seed', 'starFuelStock', 'workforce', 'runPct', 'recipe']) {
      expect(json).not.toContain(banned);
    }
    await pool.query(
      `DELETE FROM npcs WHERE role = 'scientist' AND owner_id = $1`,
      [observer],
    );
  });

  it('sonde sur site : palier 4 même sans télescope couvrant', async () => {
    await setTelescopeLevel(1);
    const pre = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(pre.tier).toBe(1);
    const { rows: tb } = await pool.query(`SELECT x, y FROM bodies WHERE id = $1`, [
      targetStarter,
    ]);
    await pool.query(
      `INSERT INTO ships (owner_id, hull_category, name, x, y, status)
       VALUES ($1, 'probe', 'Eye', $2, $3, 'idle')`,
      [observer, Number(tb[0].x) + 1, Number(tb[0].y)],
    );
    const intel = await bodyIntel(pool, observer, targetStarter, Date.now());
    expect(intel.tier).toBe(4);
  });

  it("autorisation : /planets/:id d'autrui reste interdit MÊME à palier 4", async () => {
    await expect(
      planetDetail(pool, observer, targetStarter),
    ).rejects.toMatchObject({ code: 'forbidden' });
    // Et l'intel d'un tiers ne donne pas la main sur le monde : le
    // propriétaire, lui, voit toujours tout.
    const own = await planetDetail(pool, target, targetStarter);
    expect(own.id).toBe(targetStarter);
  });

  it('étoile : intel détaillée refusée (v1 planètes seulement)', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM bodies WHERE body_type = 'star' LIMIT 1`,
    );
    await expect(
      bodyIntel(pool, observer, rows[0].id, Date.now()),
    ).rejects.toMatchObject({ code: 'not_available' });
  });
});

// Garde d'import : CommandError est bien celui des services (le même
// wrap → COMMAND_HTTP côté API).
void CommandError;

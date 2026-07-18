/**
 * Intégration gouvernance v1 (GB §11/§21, DG §4.1) sur vraie base :
 * exigences par taille (S 0 / M 1 / L 3), G ×0.5 appliqué aux DÉBITS,
 * vaisseau personnel parqué = gouverneur temporaire, installation
 * PERMANENTE (grade requis, caps, §10 par requêtes directes), préview
 * canon-obligatoire (masque résultant, nœuds perdus, sans mutation).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { effectiveMask, ROLE_TO_ARCHETYPE } from '@atg/shared';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail } from '../../src/services/planets.js';
import {
  installGovernor,
  previewGovernance,
} from '../../src/services/governance.js';
import { landShip, undockShip } from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
let personalShip = '';
let foreign = '';
let foreignStarter = '';

async function newNpc(
  ownerId: string,
  role: string,
  rarity: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO npcs (owner_id, people, role, rarity, stat_rolls)
     VALUES ($1, 'human', $2, $3, '{}') RETURNING id`,
    [ownerId, role, rarity],
  );
  return rows[0]!.id;
}

async function mineRate(): Promise<number> {
  const d = await planetDetail(pool, owner, starter);
  return d.buildings.find((b) => b.key === 'mine')!.effBatchesPerDay ?? 0;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `gov-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Regent',
    politics: 'industrialist',
    universeSeed: `gov-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `gov-foreign-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Outsider',
    politics: 'mercantile',
    universeSeed: `gov-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  foreign = b.playerId;
  foreignStarter = b.spawn.starterPlanetId;
  const { rows: ps } = await pool.query<{ id: string }>(
    `SELECT id FROM ships WHERE owner_id = $1 AND hull_category = 'personal'`,
    [owner],
  );
  personalShip = ps[0]!.id;
  // Taille CONTRÔLÉE (le roll starter est s|m) : moyen — exigence 1.
  await pool.query(`UPDATE bodies SET size = 'm' WHERE id = $1`, [starter]);
  // Une mine active : le G se lit sur un DÉBIT réel.
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
     VALUES ($1, 'mine', 1, 0, 'active', 'extract:ore', 35)`,
    [starter],
  );
});

afterAll(async () => {
  await pool.end();
});

describe('vaisseau personnel parqué = gouverneur temporaire (GB §21)', () => {
  it('parqué au spawn : M pleinement gouverné, G = 1', async () => {
    const d = await planetDetail(pool, owner, starter);
    expect(d.governance.required).toBe(1);
    expect(d.governance.personalShipParked).toBe(true);
    expect(d.governance.governors).toHaveLength(0);
    expect(d.governance.g).toBe(1);
    expect(d.governance.fullyGoverned).toBe(true);
  });

  it('décollé : G tombe à 0.5 et les DÉBITS sont exactement halvés', async () => {
    const before = await mineRate();
    expect(before).toBeGreaterThan(0);
    await undockShip(pool, owner, personalShip);
    const d = await planetDetail(pool, owner, starter);
    expect(d.governance.g).toBe(0.5);
    expect(d.governance.fullyGoverned).toBe(false);
    expect(await mineRate()).toBeCloseTo(before / 2, 6);
    // Re-posé : tout revient (exception bootstrap — pas de spaceport).
    await landShip(pool, owner, personalShip);
    expect((await planetDetail(pool, owner, starter)).governance.g).toBe(1);
    expect(await mineRate()).toBeCloseTo(before, 6);
  });
});

describe('préview canon-obligatoire (lecture seule)', () => {
  it('rend archétypes, masque résultant, nœuds PERDUS et G — sans muter', async () => {
    const merchant = await newNpc(owner, 'merchant', 'rare');
    const p = await previewGovernance(pool, owner, starter, [merchant]);
    expect(p.archetypes).toEqual(['mercantile']);
    // Vaisseau (industrialist) parqué + candidat mercantile : intersection.
    const expected = effectiveMask(['mercantile', 'industrialist']);
    expect(new Set(p.maskAllowed)).toEqual(expected);
    expect(p.maskLost.length).toBeGreaterThan(0);
    expect(p.g).toBe(1.06); // plein + min tier rare (3, échelle 1-based du chunk R) → +6 %
    // Aucune mutation.
    const d = await planetDetail(pool, owner, starter);
    expect(d.governance.governors).toHaveLength(0);
  });

  it('§10 : préview refusée à l\'étranger, candidats invalides refusés', async () => {
    const merchant = await newNpc(owner, 'merchant', 'rare');
    await expect(
      previewGovernance(pool, foreign, starter, [merchant]),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const common = await newNpc(owner, 'pilot', 'common');
    await expect(
      previewGovernance(pool, owner, starter, [common]),
    ).rejects.toMatchObject({ code: 'not_available' });
    const theirs = await newNpc(foreign, 'diplomat', 'epic');
    await expect(
      previewGovernance(pool, owner, starter, [theirs]),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      previewGovernance(pool, owner, starter, [randomUUID()]),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('installation permanente (canon GB §11)', () => {
  it('installe un rare : siège occupé, G tient SANS le vaisseau, masque intersecté', async () => {
    const merchant = await newNpc(owner, 'merchant', 'rare');
    const view = await installGovernor(pool, owner, starter, merchant);
    expect(view.governors).toHaveLength(1);
    expect(view.governors[0]!.archetype).toBe(ROLE_TO_ARCHETYPE.merchant);
    // Le PNJ gouverne : le vaisseau peut partir, G reste plein (+4 %).
    await undockShip(pool, owner, personalShip);
    const d = await planetDetail(pool, owner, starter);
    expect(d.governance.g).toBe(1.06);
    expect(d.governance.personalShipParked).toBe(false);
    // Masque du monde = intersection des gouvernants (mercantile seul ici).
    expect(new Set(d.tech.maskAllowed)).toEqual(effectiveMask(['mercantile']));
    await landShip(pool, owner, personalShip);
  });

  it('caps : M plein refuse le 2e ; un PETIT monde refuse tout', async () => {
    const extra = await newNpc(owner, 'diplomat', 'epic');
    await expect(
      installGovernor(pool, owner, starter, extra),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('pleins'),
    });
    await pool.query(`UPDATE bodies SET size = 's' WHERE id = $1`, [foreignStarter]);
    const fNpc = await newNpc(foreign, 'scientist', 'rare');
    await expect(
      installGovernor(pool, foreign, foreignStarter, fNpc),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('petit monde'),
    });
  });

  it('§10 : grade requis, PNJ d\'autrui, PNJ déjà lié, monde d\'autrui — refusés', async () => {
    await pool.query(`UPDATE bodies SET size = 'l' WHERE id = $1`, [starter]);
    const common = await newNpc(owner, 'soldier', 'uncommon');
    await expect(
      installGovernor(pool, owner, starter, common),
    ).rejects.toMatchObject({
      code: 'not_available',
      message: expect.stringContaining('rare'),
    });
    const theirs = await newNpc(foreign, 'diplomat', 'epic');
    await expect(
      installGovernor(pool, owner, starter, theirs),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const bound = await newNpc(owner, 'engineer', 'rare');
    await pool.query(
      `UPDATE npcs SET bound_host_type = 'ship', bound_host_id = $2 WHERE id = $1`,
      [bound, personalShip],
    );
    await expect(
      installGovernor(pool, owner, starter, bound),
    ).rejects.toMatchObject({ code: 'not_available' });
    const mine2 = await newNpc(owner, 'scientist', 'rare');
    await expect(
      installGovernor(pool, foreign, starter, mine2),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('grand monde : 0.5 à 1–2 gouverneurs, 1 + bonus du plus faible à 3', async () => {
    // starter est passé 'l' : 1 gouverneur (rare) → 0.5.
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL, docked_at = NULL
       WHERE id = $1`,
      [personalShip],
    );
    await pool.query(`SELECT 1`); // (le rebase se fait aux lectures suivantes)
    let d = await planetDetail(pool, owner, starter);
    expect(d.governance.required).toBe(3);
    expect(d.governance.g).toBe(0.5);
    const epic = await newNpc(owner, 'diplomat', 'epic');
    await installGovernor(pool, owner, starter, epic);
    d = await planetDetail(pool, owner, starter);
    expect(d.governance.g).toBe(0.5); // 2/3
    const legendary = await newNpc(owner, 'scientist', 'legendary');
    const view = await installGovernor(pool, owner, starter, legendary);
    // 3/3 : min tier = rare (3, échelle 1-based) → 1 + 0.06.
    expect(view.g).toBe(1.06);
    expect(view.governors).toHaveLength(3);
    // Permanence : aucun chemin de retrait n'existe — le PNJ reste lié.
    const { rows } = await pool.query(
      `SELECT bound_host_id FROM npcs WHERE id = $1`,
      [legendary],
    );
    expect(rows[0].bound_host_id).toBe(starter);
  });
});

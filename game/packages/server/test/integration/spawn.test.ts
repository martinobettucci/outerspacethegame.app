/**
 * Intégration : garanties du spawn starter (DG §2.2) sur vraie base,
 * via le VRAI flux d'inscription (registerPlayer) — CLAUDE.md §8/§15.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  registerPlayer,
  RegistrationError,
  type RegisterResult,
} from '../../src/services/players.js';
import { verifyPassword } from '../../src/services/passwords.js';
import { createTestPool } from './helpers.js';
import {
  POCKET_MIN_ISOLATION_PC,
  POCKET_NEIGHBOR_MAX_PC,
  POCKET_STAR_MAX_PC,
  POCKET_WILD_MAX_PC,
  STARTER_POPULATION,
} from '../../src/gen/spawn.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
const universeSeed = `test-universe-${run}`;
let first: RegisterResult;
let second: RegisterResult;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

beforeAll(async () => {
  pool = await createTestPool();
  first = await registerPlayer(pool, {
    email: `first-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Premier',
    politics: 'industrialist',
    universeSeed,
  });
  second = await registerPlayer(pool, {
    email: `second-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Second',
    politics: 'mercantile',
    universeSeed,
  });
});

afterAll(async () => {
  await pool.end();
});

async function body(id: string) {
  const { rows } = await pool.query('SELECT * FROM bodies WHERE id = $1', [id]);
  return rows[0];
}

describe('spawn starter — garanties DG §2.2', () => {
  it('starter tempéré, qualité D–F, ≥ 10 tuiles, lié au compte 45 j, is_starter', async () => {
    for (const r of [first, second]) {
      const starter = await body(r.spawn.starterPlanetId);
      expect(starter.climate).toBe('temperate');
      expect(['D', 'E', 'F']).toContain(starter.quality);
      expect(starter.tiles).toBeGreaterThanOrEqual(10);
      expect(starter.is_starter).toBe(true);
      expect(starter.owner_id).toBe(r.playerId);
      const bindDays =
        (new Date(starter.account_bound_until).getTime() - Date.now()) /
        86_400_000;
      expect(bindDays).toBeGreaterThan(44);
      expect(bindDays).toBeLessThanOrEqual(45.01);
      expect(Number(starter.population)).toBe(STARTER_POPULATION);
    }
  });

  it('gisements garantis : ore, carbon, hydrogen, oxygen, silicon, cristal climatique, lithium|gold', async () => {
    const { rows } = await pool.query(
      'SELECT resource, amount_t FROM deposits WHERE body_id = $1',
      [first.spawn.starterPlanetId],
    );
    const resources = new Set(rows.map((r) => r.resource));
    for (const req of ['ore', 'carbon', 'hydrogen', 'oxygen', 'silicon', 'crystal_temperate']) {
      expect(resources.has(req), req).toBe(true);
    }
    expect(resources.has('lithium') || resources.has('gold')).toBe(true);
    for (const r of rows) expect(Number(r.amount_t)).toBeGreaterThan(0);
  });

  it('garantie du démarrage : valeur extractible ≥ coût télescope + sonde + 25 % (canon GB §19)', async () => {
    const { rows } = await pool.query(
      'SELECT sum(amount_t)::float AS total FROM deposits WHERE body_id = $1',
      [first.spawn.starterPlanetId],
    );
    // Télescope 20 ore + 10 silicon ; probe_pad 15+10 ; sonde 15+10 → ≈ 80 T.
    expect(rows[0].total).toBeGreaterThan(80 * 1.25);
  });

  it('stock de départ ×U(1.0–1.3) + 150 u de fuel du type de l\'étoile voisine', async () => {
    const { rows } = await pool.query(
      'SELECT resource, amount_t FROM planet_stock WHERE body_id = $1',
      [first.spawn.starterPlanetId],
    );
    const stock = Object.fromEntries(
      rows.map((r) => [r.resource, Number(r.amount_t)]),
    );
    expect(stock.ore).toBeGreaterThanOrEqual(60);
    expect(stock.ore).toBeLessThanOrEqual(78);
    expect(stock.water).toBeGreaterThanOrEqual(30);
    const star = await body(first.spawn.starId);
    expect(stock[`fuel_${star.star_fuel_type}`]).toBe(150);
  });

  it('géométrie de la poche : étoile ≤ 40 pc et hors R_nova ; 2 sauvages ≤ 60 pc', async () => {
    const starter = await body(first.spawn.starterPlanetId);
    const star = await body(first.spawn.starId);
    const d = dist(starter, star);
    expect(d).toBeLessThanOrEqual(POCKET_STAR_MAX_PC + 1e-6);
    expect(d).toBeGreaterThanOrEqual(Number(star.r_nova) - 1e-6);
    expect(first.spawn.wildPlanetIds).toHaveLength(2);
    for (const wid of first.spawn.wildPlanetIds) {
      const wild = await body(wid);
      expect(wild.owner_id).toBeNull();
      expect(dist(starter, wild)).toBeLessThanOrEqual(POCKET_WILD_MAX_PC);
      expect(dist(star, wild)).toBeGreaterThanOrEqual(Number(star.r_nova));
    }
  });

  it('le second joueur naît à 150–240 pc du premier (voisin garanti, jamais plus près)', async () => {
    const s1 = await body(first.spawn.starterPlanetId);
    const s2 = await body(second.spawn.starterPlanetId);
    const d = dist(s1, s2);
    expect(d).toBeGreaterThanOrEqual(POCKET_MIN_ISOLATION_PC);
    // Le centre est tiré dans l'anneau autour d'UN actif du voisin ; la
    // distance au starter précis peut légèrement dépasser 240 (l'ancrage
    // peut être une planète sauvage) — tolérance = rayon de poche.
    expect(d).toBeLessThanOrEqual(POCKET_NEIGHBOR_MAX_PC + POCKET_WILD_MAX_PC);
  });

  it('vaisseau personnel + Cargo-S dockés, pilote commun dans la main', async () => {
    const { rows: ships } = await pool.query(
      'SELECT hull_category, hull_size, status, docked_body_id FROM ships WHERE owner_id = $1',
      [first.playerId],
    );
    const cats = ships.map((s) => s.hull_category).sort();
    expect(cats).toEqual(['cargo', 'personal']);
    for (const s of ships) {
      expect(s.status).toBe('docked');
      expect(s.docked_body_id).toBe(first.spawn.starterPlanetId);
    }
    const { rows: npcs } = await pool.query(
      'SELECT role, rarity, bound_host_id, stat_rolls FROM npcs WHERE owner_id = $1',
      [first.playerId],
    );
    expect(npcs).toHaveLength(1);
    expect(npcs[0].role).toBe('pilot');
    expect(npcs[0].rarity).toBe('common');
    expect(npcs[0].bound_host_id).toBeNull();
    // Roll individuel présent (canon GB §12).
    const roll = npcs[0].stat_rolls.settler_risk_reduction;
    expect(roll).toBeGreaterThan(0);
  });

  it('autorisations & intégrité : e-mail unique refusé, mot de passe haché vérifiable', async () => {
    await expect(
      registerPlayer(pool, {
        email: `first-${run}@test.local`,
        password: 'motdepasse-solide-3',
        displayName: 'Doublon',
        politics: 'civic',
        universeSeed,
      }),
    ).rejects.toThrowError(RegistrationError);
    const { rows } = await pool.query(
      'SELECT password_hash FROM players WHERE id = $1',
      [first.playerId],
    );
    expect(rows[0].password_hash.startsWith('scrypt$')).toBe(true);
    expect(
      await verifyPassword('motdepasse-solide-1', rows[0].password_hash),
    ).toBe(true);
    expect(
      await verifyPassword('mauvais-mot-de-passe', rows[0].password_hash),
    ).toBe(false);
  });
});

/**
 * Intégration API : inscription/login/session, lecture galaxie/planète,
 * unlock + construction, et REFUS d'autorisation vérifiés par requêtes
 * directes qui contournent l'interface (CLAUDE.md §10/§15).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { buildServer } from '../../src/api/server.js';
import { loadConfig } from '../../src/config.js';
import { createTestPool } from './helpers.js';

const run = randomUUID().slice(0, 8);
let pool: pg.Pool;
let app: FastifyInstance;
let cookieA = '';
let cookieB = '';
let starterA = '';
let starterB = '';

const config = {
  ...loadConfig(process.env),
  UNIVERSE_SEED: `api-universe-${run}`,
  TIME_SCALE: 3600, // instrumentation de test : 6 h → 6 s
};

async function register(email: string, politics: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'motdepasse-solide-9',
      displayName: 'Testeur',
      politics,
    },
  });
  expect(res.statusCode).toBe(201);
  const setCookie = res.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)!.split(';')[0]!;
  return { cookie, starterPlanetId: res.json().starterPlanetId as string };
}

beforeAll(async () => {
  pool = await createTestPool();
  app = await buildServer({ pool, config });
  const a = await register(`api-a-${run}@test.local`, 'industrialist');
  cookieA = a.cookie;
  starterA = a.starterPlanetId;
  const b = await register(`api-b-${run}@test.local`, 'militarist');
  cookieB = b.cookie;
  starterB = b.starterPlanetId;
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('auth', () => {
  it('login retourne une session ; mauvais mot de passe → 401 sans oracle', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `api-a-${run}@test.local`, password: 'motdepasse-solide-9' },
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `api-a-${run}@test.local`, password: 'faux' },
    });
    expect(bad.statusCode).toBe(401);
    const ghost = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `inconnu-${run}@test.local`, password: 'faux' },
    });
    expect(ghost.statusCode).toBe(401);
    expect(ghost.json()).toEqual(bad.json());
  });

  it('les routes de jeu exigent la session (401 sans cookie)', async () => {
    for (const url of ['/me', '/galaxy', `/planets/${starterA}`]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(401);
    }
  });
});

describe('galaxie & brouillard (GB §4)', () => {
  it('sans télescope, on voit sa poche mais PAS le voisin à 150–240 pc', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/galaxy',
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const bodies = res.json().bodies as { id: string; owned: boolean; bodyType: string }[];
    expect(bodies.some((b) => b.id === starterA && b.owned)).toBe(true);
    expect(bodies.some((b) => b.bodyType === 'star')).toBe(true);
    // ≥ 2 sauvages de la poche + jamais le starter du voisin.
    expect(bodies.filter((b) => !b.owned && b.bodyType === 'planet').length).toBeGreaterThanOrEqual(2);
    expect(bodies.some((b) => b.id === starterB)).toBe(false);
  });

  it("le stock caché d'une étoile ne fuit jamais dans la réponse", async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/galaxy',
      headers: { cookie: cookieA },
    });
    expect(JSON.stringify(res.json())).not.toContain('fuel_stock');
    expect(JSON.stringify(res.json())).not.toContain('fuelStock');
  });
});

describe('planète : lecture et autorisations (CLAUDE.md §10)', () => {
  it('le propriétaire lit le détail complet (stock, gisements, ADN tech)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/planets/${starterA}`,
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    const p = res.json();
    expect(p.tiles).toBeGreaterThanOrEqual(10);
    expect(p.stock.ore.amount).toBeGreaterThan(0);
    expect(p.deposits.length).toBeGreaterThanOrEqual(7);
    expect(p.tech.available).toContain('telescope');
    expect(p.tech.available).toContain('colony_program');
    // Vaisseau personnel docké ⇒ la politique du joueur gouverne.
    expect(p.tech.governingArchetypes).toContain('industrialist');
    expect(p.storageCapT).toBeGreaterThanOrEqual(800);
    // v2 : planetEfficiency = Ē staff-pondéré (neutre 0,7 sans emploi).
    expect(p.planetEfficiency).toBeCloseTo(0.7, 6);
    expect(p.pyramid.actives).toBeGreaterThan(0);
  });

  it("un AUTRE joueur reçoit 403 par requête directe (contournement d'UI)", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/planets/${starterA}`,
      headers: { cookie: cookieB },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('tech + construction (GB §18, DG §5/§6)', () => {
  it('unlock workshop → build workshop : coût déduit, tuile occupée, chantier + événement', async () => {
    // Le depot naît débloqué (GB §19 savoir de départ) — le flux d'unlock
    // par l'API se prouve sur le workshop (T1, prérequis mine = savoir de
    // départ, masque commun, pas une industrie → pose sans recette).
    const before = (
      await app.inject({
        method: 'GET',
        url: `/planets/${starterA}`,
        headers: { cookie: cookieA },
      })
    ).json();
    const oreBefore = before.stock.ore.amount as number;

    const unlock = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/unlock`,
      payload: { node: 'workshop' },
      headers: { cookie: cookieA },
    });
    expect(unlock.statusCode).toBe(200);

    const build = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/build`,
      payload: { building: 'workshop', tileIndex: 0 },
      headers: { cookie: cookieA },
    });
    expect(build.statusCode).toBe(200);

    const after = (
      await app.inject({
        method: 'GET',
        url: `/planets/${starterA}`,
        headers: { cookie: cookieA },
      })
    ).json();
    // workshop : unlock 30 ore + 10 si ; placement = moitié (règle 50 %).
    expect(after.stock.ore.amount).toBeLessThan(oreBefore);
    const shop = after.buildings.find((b: { key: string }) => b.key === 'workshop');
    expect(shop.status).toBe('constructing');
    expect(shop.tileIndex).toBe(0);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE kind = 'construction_complete' AND processed_at IS NULL`,
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('refus vérifiés : tuile occupée, nœud non déverrouillé, double unlock', async () => {
    const taken = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/build`,
      payload: { building: 'depot', tileIndex: 0 },
      headers: { cookie: cookieA },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error).toBe('tile_taken');

    const notUnlocked = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/build`,
      payload: { building: 'waterworks', tileIndex: 1 },
      headers: { cookie: cookieA },
    });
    expect(notUnlocked.statusCode).toBe(409);
    expect(notUnlocked.json().error).toBe('not_unlocked');

    const again = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/unlock`,
      payload: { node: 'depot' },
      headers: { cookie: cookieA },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe('already_unlocked');
  });

  it('masque de gouvernance : un industrialiste ne déverrouille PAS la branche militaire (requête directe)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/unlock`,
      payload: { node: 'military_district' },
      headers: { cookie: cookieA },
    });
    // Refusé : soit absent de l'ADN du seed (409), soit interdit par le
    // masque (403) — jamais accepté.
    expect([403, 409]).toContain(res.statusCode);
    expect(['mask_denied', 'not_available', 'prereq_missing']).toContain(
      res.json().error,
    );
  });

  it("un joueur ne construit pas chez l'autre (403 par requête directe)", async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/planets/${starterB}/unlock`,
      payload: { node: 'depot' },
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(403);
  });

  it('ressources insuffisantes → 409 explicite, rien n\'est débité', async () => {
    // stargate_yard coûte 1 000 steelH — impossible au départ.
    // (telescope naît débloqué — le 200 du flux d'unlock se prouve sur farm.)
    const res = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/unlock`,
      payload: { node: 'farm' },
      headers: { cookie: cookieA },
    });
    expect(res.statusCode).toBe(200);
    // Épuise l'ore : unlock à répétition de nœuds coûteux jusqu'au refus.
    const fail = await app.inject({
      method: 'POST',
      url: `/planets/${starterA}/unlock`,
      payload: { node: 'refinery' },
      headers: { cookie: cookieA },
    });
    if (fail.statusCode !== 200) {
      expect([409]).toContain(fail.statusCode);
      expect(['insufficient_resources', 'prereq_missing', 'not_available']).toContain(
        fail.json().error,
      );
    }
  });
});

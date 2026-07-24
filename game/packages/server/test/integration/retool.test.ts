/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Industry”; GAME_BOOK.md §9; DESIGN_GUIDE.md §3.3/§5.1/§6. */
/**
 * Intégration retool (DG §5.1 « re-targeting = 24 h retool » ; §4.1
 * Industrialist : instantané ≤ 1 switch/24 h) : chemin minuté (statut
 * retooling, production coupée, événement retool_complete), chemin
 * instantané et sa fenêtre, gisement pris par un autre, refus directs
 * (CLAUDE.md §10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { planetDetail, retoolBuilding } from '../../src/services/planets.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let indus = '';
let indusStarter = '';
let merc = '';
let mercStarter = '';

async function building(id: string) {
  const { rows } = await pool.query(
    `SELECT status, recipe, completes_at, config FROM buildings WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function newMine(bodyId: string, tile: number, recipe: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
     VALUES ($1, 'mine', 1, $2, 'active', $3, 20) RETURNING id`,
    [bodyId, tile, recipe],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `ret-indus-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Forgeron',
    politics: 'industrialist',
    universeSeed: `ret-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `ret-merc-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Marchand',
    politics: 'mercantile',
    universeSeed: `ret-universe-${run}`,
  });
  indus = a.playerId;
  indusStarter = a.spawn.starterPlanetId;
  merc = b.playerId;
  mercStarter = b.spawn.starterPlanetId;
});

afterAll(async () => {
  await pool.end();
});

describe('chemin minuté (gouvernance non-Industrialist)', () => {
  it('retool → statut retooling, recette écrite, production COUPÉE, échéance 24 h/timeScale', async () => {
    const mine = await newMine(mercStarter, 3, 'extract:ore');
    const t0 = Date.now();
    const r = await retoolBuilding(pool, merc, mercStarter, mine, 'extract:silicon', {
      nowMs: t0,
      timeScale: 7200,
    });
    expect(r.instant).toBe(false);
    expect(r.completesAt!.getTime()).toBeCloseTo(t0 + (24 * 3600e3) / 7200, -2);
    const b = await building(mine);
    expect(b.status).toBe('retooling');
    expect(b.recipe).toBe('extract:silicon');
    // Production coupée : l'industrie en retooling n'apparaît plus dans
    // les débits (le rebase ne compte que les ACTIVES).
    const detail = await planetDetail(pool, merc, mercStarter);
    const view = detail.buildings.find((x) => x.id === mine)!;
    expect(view.status).toBe('retooling');
    expect(view.effBatchesPerDay).toBeNull();
  });

  it('retool_complete : la recette s\'éveille, un second retool pendant le chantier est refusé', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM buildings WHERE body_id = $1 AND status = 'retooling' LIMIT 1`,
      [mercStarter],
    );
    const mine = rows[0].id;
    await expect(
      retoolBuilding(pool, merc, mercStarter, mine, 'extract:carbon'),
    ).rejects.toMatchObject({ code: 'not_available' });
    // Échéance atteinte (l'événement est déjà en file à ~12 s réelles).
    await pool.query(
      `UPDATE buildings SET completes_at = now() - interval '1 second' WHERE id = $1`,
      [mine],
    );
    await pool.query(
      `UPDATE events SET due_at = now() - interval '1 second'
       WHERE kind = 'retool_complete' AND processed_at IS NULL
         AND payload->>'buildingId' = $1`,
      [mine],
    );
    await processDueEvents(pool, baseHandlers());
    const b = await building(mine);
    expect(b.status).toBe('active');
    expect(b.recipe).toBe('extract:silicon');
    const detail = await planetDetail(pool, merc, mercStarter);
    expect(
      detail.buildings.find((x) => x.id === mine)!.effBatchesPerDay,
    ).not.toBeNull();
  });
});

describe('chemin instantané Industrialist (≤ 1 switch/24 h)', () => {
  it('instantané, puis fenêtre occupée → minuté, puis fenêtre libérée → instantané', async () => {
    const mine = await newMine(indusStarter, 3, 'extract:ore');
    const t0 = Date.now();
    const r1 = await retoolBuilding(pool, indus, indusStarter, mine, 'extract:silicon', {
      nowMs: t0,
    });
    expect(r1.instant).toBe(true);
    let b = await building(mine);
    expect(b.status).toBe('active');
    expect(b.recipe).toBe('extract:silicon');
    expect(Number(b.config.lastInstantRetoolMs)).toBe(t0);

    // 23 h plus tard : la fenêtre est occupée → retool STANDARD.
    const r2 = await retoolBuilding(pool, indus, indusStarter, mine, 'extract:carbon', {
      nowMs: t0 + 23 * 3600e3,
    });
    expect(r2.instant).toBe(false);
    b = await building(mine);
    expect(b.status).toBe('retooling');
    // Remise active pour la suite (l'événement réel est à +24 h).
    await pool.query(
      `UPDATE buildings SET status = 'active', completes_at = NULL WHERE id = $1`,
      [mine],
    );
    await pool.query(
      `DELETE FROM events WHERE kind = 'retool_complete' AND processed_at IS NULL
         AND payload->>'buildingId' = $1`,
      [mine],
    );

    // 25 h après le premier switch : fenêtre libre → instantané à nouveau.
    const r3 = await retoolBuilding(pool, indus, indusStarter, mine, 'extract:hydrogen', {
      nowMs: t0 + 25 * 3600e3,
    });
    expect(r3.instant).toBe(true);
  });
});

describe('refus directs (§10) et gisements', () => {
  it('étranger, non-industrie, même recette, recette invalide', async () => {
    const mine = await newMine(indusStarter, 4, 'extract:oxygen');
    await expect(
      retoolBuilding(pool, merc, indusStarter, mine, 'extract:carbon'),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const { rows: port } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'spaceport', 1, 5, 'active', 0) RETURNING id`,
      [indusStarter],
    );
    await expect(
      retoolBuilding(pool, indus, indusStarter, port[0]!.id, 'extract:ore'),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      retoolBuilding(pool, indus, indusStarter, mine, 'extract:oxygen'),
    ).rejects.toMatchObject({ code: 'recipe_invalid' });
    await expect(
      retoolBuilding(pool, indus, indusStarter, mine, 'extract:unobtainium'),
    ).rejects.toMatchObject({ code: 'recipe_invalid' });
  });

  it('un gisement pris par UNE AUTRE mine reste interdit au retool', async () => {
    // La mine du test précédent (tile 3) détient extract:hydrogen ; si un
    // gisement d'hydrogène existe, une seconde mine ne peut pas s'y
    // rééquiper — sinon la règle ne s'applique qu'aux gisements réels :
    // on force un gisement déterministe.
    await pool.query(
      `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
       VALUES ($1, 'hydrogen', 1000, 1000, now())
       ON CONFLICT (body_id, resource) DO NOTHING`,
      [indusStarter],
    );
    const other = await newMine(indusStarter, 6, 'extract:carbon');
    await expect(
      retoolBuilding(pool, indus, indusStarter, other, 'extract:hydrogen'),
    ).rejects.toMatchObject({ code: 'deposit_taken' });
  });
});

/**
 * Intégration : montée de niveau & démolition (GB §18, DG §5.1/§6) sur
 * vraie base — coûts, plafond de profondeur du seed, politique de niveau
 * (intersection), remboursement 50 %, libération de tuile et de gisement.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { planetTechAvailability } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import {
  demolishBuilding,
  levelUpBuilding,
  placeBuilding,
  setBuildingSettings,
} from '../../src/services/planets.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let playerId = '';
let planetId = '';

const FAST = { timeScale: 1_000_000 }; // chantiers ≈ instantanés (tests)

beforeAll(async () => {
  pool = await createTestPool();
  const r = await registerPlayer(pool, {
    email: `lvl-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Leveler',
    politics: 'industrialist',
    universeSeed: `lvl-universe-${run}`,
  });
  playerId = r.playerId;
  planetId = r.spawn.starterPlanetId;
  // Grants de test CALIBRÉS : le scénario enchaîne unlock/pose/paliers
  // au-delà de l'économie du starter (on teste les COMMANDES, pas la
  // rareté) — sans dépasser 0,7 × cap de stockage, sinon le frein §3.3b
  // écrase les débits attendus. Le fuel (150 u inutiles ici) est retiré.
  await pool.query(
    `DELETE FROM planet_stock WHERE body_id = $1 AND resource LIKE 'fuel_%'`,
    [planetId],
  );
  for (const [res, qty] of [['ore', 100], ['carbon', 20]] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = planet_stock.amount_t + $3`,
      [planetId, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

async function activateAll(): Promise<void> {
  // Les chantiers accélérés durent jusqu'à ~90 ms (24 h / 1e6) : on boucle
  // jusqu'à épuisement des événements de chantier en attente.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL
         AND kind IN ('construction_complete', 'demolition_complete')
         AND due_at <= now() + interval '2 seconds'`,
    );
    if (rows[0].n === 0) return;
  }
}

async function building(id: string) {
  const { rows } = await pool.query('SELECT * FROM buildings WHERE id = $1', [id]);
  return rows[0] ?? null;
}

async function oreRate(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT rate_t_per_day FROM planet_stock WHERE body_id = $1 AND resource = 'ore'`,
    [planetId],
  );
  return rows[0]?.rate_t_per_day ?? 0;
}

describe('montée de niveau (GB §18, DG §5.1)', () => {
  let mineId = '';

  it('mine L1 → L2 : coût payé, production coupée pendant le chantier, débit L2 après', async () => {
    const placed = await placeBuilding(pool, playerId, planetId, 'mine', 0, {
      ...FAST,
      recipe: 'extract:ore',
    });
    mineId = placed.buildingId;
    await activateAll();
    const rateL1 = await oreRate();
    expect(rateL1).toBeGreaterThan(8);

    const { newLevel } = await levelUpBuilding(pool, playerId, planetId, mineId, FAST);
    expect(newLevel).toBe(2);
    // Pendant le chantier : plus de production.
    expect(await oreRate()).toBe(0);
    expect((await building(mineId)).status).toBe('constructing');

    await activateAll();
    expect((await building(mineId)).status).toBe('active');
    // L2 : workforce optimale = 120 ; on ré-assigne 84 (u = 0,7).
    await setBuildingSettings(pool, playerId, planetId, mineId, { workforce: 84 });
    const rateL2 = await oreRate();
    expect(rateL2).toBeGreaterThan(17); // 20 × E(0,7)=1 × gouvernance G.
    expect(rateL2).toBeGreaterThan(rateL1 * 1.7);
  });

  it('niveau 3 = plafond absolu', async () => {
    await pool.query(`UPDATE buildings SET level = 3, status = 'active' WHERE id = $1`, [mineId]);
    await expect(
      levelUpBuilding(pool, playerId, planetId, mineId, FAST),
    ).rejects.toMatchObject({ code: 'max_level' });
    await pool.query(`UPDATE buildings SET level = 2 WHERE id = $1`, [mineId]);
  });

  it("plafond de profondeur de l'ADN du seed : niveau max roulé respecté", async () => {
    // Cherche un seed (fonction pure) où `farm` existe avec un plafond L1.
    let cappedSeed: string | null = null;
    for (let i = 0; i < 3_000; i++) {
      const seed = `capseed-${run}-${i}`;
      const av = planetTechAvailability(seed);
      if (av.available.has('farm') && av.maxLevel.get('farm') === 1) {
        cappedSeed = seed;
        break;
      }
    }
    expect(cappedSeed, 'aucun seed plafonné trouvé (poids du roll ?)').not.toBeNull();
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, owner_id, population, pop_as_of)
       VALUES ('planet', 'Capworld', 910000, 910000, $1, 's', 'temperate', 'E',
          8, $2, 1200, now()) RETURNING id`,
      [cappedSeed, playerId],
    );
    const cappedPlanet = b[0]!.id;
    const { rows: farm } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'farm', 1, 0, 'active', 'food_1', 35) RETURNING id`,
      [cappedPlanet],
    );
    await expect(
      levelUpBuilding(pool, playerId, cappedPlanet, farm[0]!.id, FAST),
    ).rejects.toMatchObject({ code: 'max_level' });
  });

  it('politique de niveau : market L2 exige une gouvernance TOUTE mercantile (gouverneur industrialiste refusé)', async () => {
    // Seed PUR garantissant market présent ET profondeur ≥ 2 : le refus
    // vient alors de la POLITIQUE, jamais du plafond d'ADN. (L'ancienne
    // version roulait l'ADN du starter — market absent ou plafonné L1 dans
    // ~20 % des univers, et `max_level` tombait avant `mask_denied` :
    // test non déterministe, corrigé ici — même patron que « Capworld ».)
    let deepSeed: string | null = null;
    for (let i = 0; i < 3_000; i++) {
      const seed = `maskseed-${run}-${i}`;
      const av = planetTechAvailability(seed);
      if (av.available.has('market') && (av.maxLevel.get('market') ?? 0) >= 2) {
        deepSeed = seed;
        break;
      }
    }
    expect(deepSeed, 'aucun seed market profond trouvé').not.toBeNull();
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, owner_id, population, pop_as_of)
       VALUES ('planet', 'Maskworld', 920000, 920000, $1, 's', 'temperate', 'E',
          8, $2, 1200, now()) RETURNING id`,
      [deepSeed, playerId],
    );
    const maskPlanet = b[0]!.id;
    // Gouvernance réelle : un gouverneur ingénieur (⇒ industrialist) —
    // l'intersection « TOUS mercantiles » échoue.
    await pool.query(
      `INSERT INTO npcs (owner_id, people, role, rarity, bound_host_type, bound_host_id)
       VALUES ($1, 'human', 'engineer', 'common', 'planet', $2)`,
      [playerId, maskPlanet],
    );
    const { rows: market } = await pool.query<{ id: string }>(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'market', 1, 0, 'active', 35) RETURNING id`,
      [maskPlanet],
    );
    await expect(
      levelUpBuilding(pool, playerId, maskPlanet, market[0]!.id, FAST),
    ).rejects.toMatchObject({ code: 'mask_denied' });
  });

  it("autorisation : un autre joueur ne monte pas MES bâtiments (contournement d'UI)", async () => {
    const other = await registerPlayer(pool, {
      email: `lvl-other-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Autre',
      politics: 'mercantile',
      universeSeed: `lvl-universe-${run}`,
    });
    await expect(
      levelUpBuilding(pool, other.playerId, planetId, mineId, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      demolishBuilding(pool, other.playerId, planetId, mineId, FAST),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('démolition (DG §6)', () => {
  it('remboursement 50 % crédité, production coupée, tuile et gisement libérés à l\'issue', async () => {
    // Un dépôt à démolir (placement 10 ore ⇒ remboursement 5). Le depot est
    // never-masked : unlock déterministe quel que soit l'ADN du starter.
    await placeBuilding(pool, playerId, planetId, 'depot', 2, FAST);
    await activateAll();
    const { rows: dep } = await pool.query(
      `SELECT id FROM buildings WHERE body_id = $1 AND key = 'depot' AND tile_index = 2`,
      [planetId],
    );
    const depotId = dep[0].id;
    const { rows: before } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'ore'`,
      [planetId],
    );

    const { refunded } = await demolishBuilding(pool, playerId, planetId, depotId, FAST);
    expect(refunded.ore).toBe(5);
    const { rows: after } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'ore'`,
      [planetId],
    );
    expect(Number(after[0].amount_t)).toBeCloseTo(Number(before[0].amount_t) + 5, 1);
    expect((await building(depotId)).status).toBe('demolishing');
    await expect(
      demolishBuilding(pool, playerId, planetId, depotId, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });

    await activateAll();
    expect(await building(depotId)).toBeNull();
    // Tuile 2 libérée : re-construction possible au même index.
    const again = await placeBuilding(pool, playerId, planetId, 'depot', 2, FAST);
    expect(again.buildingId).toBeTruthy();
  });

  it('démolir la mine libère le gisement (un nouvel extracteur redevient possible)', async () => {
    const { rows: mine } = await pool.query(
      `SELECT id FROM buildings WHERE body_id = $1 AND key = 'mine'`,
      [planetId],
    );
    await demolishBuilding(pool, playerId, planetId, mine[0].id, FAST);
    // Décision documentée : un extracteur EN DÉMOLITION ne réserve plus le
    // gisement (il ne produira plus jamais — aucune double extraction
    // possible, le remplaçant peut être lancé sans attendre).
    const again = await placeBuilding(pool, playerId, planetId, 'mine', 3, {
      ...FAST,
      recipe: 'extract:ore',
    });
    expect(again.buildingId).toBeTruthy();
    await activateAll();
    // Un seul extracteur actif sur le gisement, jamais deux.
    const { rows: actives } = await pool.query(
      `SELECT count(*)::int AS n FROM buildings
       WHERE body_id = $1 AND recipe = 'extract:ore' AND status = 'active'`,
      [planetId],
    );
    expect(actives[0].n).toBe(1);
  });
});

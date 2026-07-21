/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Industry”/“Population sim v2”/“Efficiency engine”; GAME_BOOK.md §9/§10; DESIGN_GUIDE.md §3.2-v2/§3.3/§3.4/§6. */
/**
 * Intégration : la boucle colonie vivante (DG §3.2/§3.3/§6) sur vraie
 * base — construction → activation par événement → débits écrits →
 * évaluation lazy dans le temps → tarissement définitif → population
 * quotidienne → cohérence du rattrapage hors-ligne (GB §15).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { evalLazy } from '../../src/sim/lazy.js';
import { enqueue, processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { recomputePlanetRates } from '../../src/sim/rebase.js';
import { registerPlayer } from '../../src/services/players.js';
import { placeBuilding, setBuildingSettings } from '../../src/services/planets.js';
import { createTestPool } from './helpers.js';

const DAY = 86_400_000;
let pool: pg.Pool;
const run = randomUUID().slice(0, 8);

beforeAll(async () => {
  pool = await createTestPool();
});

afterAll(async () => {
  await pool.end();
});

const toMs = (d: Date | string) => new Date(d).getTime();

async function stockRow(bodyId: string, resource: string) {
  const { rows } = await pool.query(
    'SELECT amount_t, rate_t_per_day, as_of FROM planet_stock WHERE body_id = $1 AND resource = $2',
    [bodyId, resource],
  );
  return rows[0];
}

describe('boucle colonie', () => {
  it('mine construite → activée par événement → l\'ore coule et le gisement se vide', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-a-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'Loop',
      politics: 'industrialist',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;

    const { buildingId } = await placeBuilding(
      pool,
      playerId,
      planetId,
      'mine',
      0,
      { nowMs: t0, timeScale: 3600 * 6, recipe: 'extract:ore' }, // 6 h → 1 s
    );

    // Avant activation : aucun débit.
    expect((await stockRow(planetId, 'ore')).rate_t_per_day).toBe(0);

    // L'événement d'activation est traité à son échéance.
    await new Promise((r) => setTimeout(r, 1_100));
    const res = await processDueEvents(pool, baseHandlers());
    expect(res.processed).toBeGreaterThanOrEqual(1);

    const after = await stockRow(planetId, 'ore');
    // Workforce par défaut 35 ⇒ optimum d'efficacité ; G gouverné = 1,
    // donc le débit approche les 10 T/jour de base.
    expect(after.rate_t_per_day).toBeGreaterThan(8);
    expect(after.rate_t_per_day).toBeLessThanOrEqual(10);
    const { rows: dep } = await pool.query(
      'SELECT rate_t_per_day FROM deposits WHERE body_id = $1 AND resource = $2',
      [planetId, 'ore'],
    );
    expect(dep[0].rate_t_per_day).toBeCloseTo(-after.rate_t_per_day, 6);

    // Évaluation lazy 3 jours plus tard : le stock a poussé linéairement.
    const now = toMs(after.as_of);
    const in3d = evalLazy(
      {
        amount: after.amount_t,
        ratePerDay: after.rate_t_per_day,
        asOfMs: now,
      },
      now + 3 * DAY,
    );
    expect(in3d).toBeCloseTo(after.amount_t + 3 * after.rate_t_per_day, 6);

    // runPct 0 : la mine s'arrête, le débit retombe à zéro.
    await setBuildingSettings(pool, playerId, planetId, buildingId, { runPct: 0 });
    expect((await stockRow(planetId, 'ore')).rate_t_per_day).toBe(0);
    await setBuildingSettings(pool, playerId, planetId, buildingId, { runPct: 100 });
  });

  it('workforce > actifs disponibles : refus explicite', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-b-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopB',
      politics: 'civic',
      universeSeed: `loop-universe-${run}`,
    });
    const { buildingId } = await placeBuilding(
      pool,
      playerId,
      spawn.starterPlanetId,
      'mine',
      0,
      { nowMs: t0, timeScale: 100_000, recipe: 'extract:ore' },
    );
    await expect(
      setBuildingSettings(pool, playerId, spawn.starterPlanetId, buildingId, {
        workforce: 10_000_000,
      }),
    ).rejects.toMatchObject({ code: 'workforce_invalid' });
  });

  it('max 1 extracteur par gisement ; recette obligatoire pour une industrie', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-c-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopC',
      politics: 'mercantile',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;
    await placeBuilding(pool, playerId, planetId, 'mine', 0, {
      nowMs: t0,
      timeScale: 100_000,
      recipe: 'extract:ore',
    });
    await expect(
      placeBuilding(pool, playerId, planetId, 'mine', 1, {
        nowMs: t0,
        timeScale: 100_000,
        recipe: 'extract:ore',
      }),
    ).rejects.toMatchObject({ code: 'deposit_taken' });
    await expect(
      placeBuilding(pool, playerId, planetId, 'mine', 1, {
        nowMs: t0,
        timeScale: 100_000,
      }),
    ).rejects.toMatchObject({ code: 'recipe_invalid' });
  });

  it('gisement à sec : événement deposit_dry → 0 pour toujours, extracteur arrêté', async () => {
    // Planète artisanale avec un minuscule gisement pour un tarissement court.
    const t0 = Date.now();
    const seed = `dry-${run}`;
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate, quality,
          tiles, owner_id, population, pop_as_of)
       SELECT 'planet', 'Dryworld', 900001, 900001, $1, 's', 'temperate', 'F',
              8, p.id, 1200, to_timestamp($2 / 1000.0)
         FROM players p ORDER BY p.created_at LIMIT 1
       RETURNING id`,
      [seed, t0],
    );
    const bodyId = b[0]!.id;
    await pool.query(
      `INSERT INTO deposits (body_id, resource, initial_t, amount_t, as_of)
       VALUES ($1, 'ore', 5, 5, to_timestamp($2 / 1000.0))`,
      [bodyId, t0],
    );
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, recipe, workforce)
       VALUES ($1, 'mine', 1, 0, 'active', 'extract:ore', 35)`,
      [bodyId],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recomputePlanetRates(client, bodyId, t0);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const { rows: pending } = await pool.query(
      `SELECT due_at FROM events WHERE processed_at IS NULL AND kind = 'deposit_dry'
       AND payload->>'bodyId' = $1`,
      [bodyId],
    );
    expect(pending).toHaveLength(1);
    const dryAt = toMs(pending[0].due_at);
    // ~5 T à ~9,5 T/jour ⇒ ~0,53 jour.
    expect(dryAt - t0).toBeGreaterThan(0.4 * DAY);
    expect(dryAt - t0).toBeLessThan(0.7 * DAY);

    // Rattrapage : on traite la file « au futur » (nowMs = après le dry).
    await processDueEvents(pool, baseHandlers(), { nowMs: dryAt + 1000 });
    const { rows: dep } = await pool.query(
      'SELECT amount_t, rate_t_per_day FROM deposits WHERE body_id = $1',
      [bodyId],
    );
    expect(dep[0].amount_t).toBe(0);
    expect(dep[0].rate_t_per_day).toBe(0);
    const ore = await stockRow(bodyId, 'ore');
    // Le stock extrait ≈ le gisement initial (5 T), et il ne pousse plus.
    expect(ore.amount_t).toBeGreaterThan(4.5);
    expect(ore.amount_t).toBeLessThanOrEqual(5.01);
    expect(ore.rate_t_per_day).toBe(0);
  });

  it('pop_daily v2 : natalité avec residential, vieillissement pur sans (DG §3.2-v2)', async () => {
    const t0 = Date.now();
    const mk = async (
      name: string,
      stocks: [string, number][],
      withResidential: boolean,
    ) => {
      // Pyramide stationnaire d'un monde de 1 200 (218/655/327).
      const { rows: b } = await pool.query<{ id: string }>(
        `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
            quality, tiles, owner_id, population, pop_children, pop_seniors,
            pop_as_of)
         SELECT 'planet', $1, 900100, 900100, $2, 's', 'temperate', 'F', 8,
                p.id, 1200, 218, 327, to_timestamp($3 / 1000.0)
         FROM players p LIMIT 1 RETURNING id`,
        [name, `pop-${name}-${run}`, t0],
      );
      if (withResidential) {
        await pool.query(
          `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
           VALUES ($1, 'residential', 1, 0, 'active', 0)`,
          [b[0]!.id],
        );
      }
      for (const [res, qty] of stocks) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
          [b[0]!.id, res, qty, t0],
        );
      }
      await enqueue(pool, 'pop_daily', new Date(t0 + DAY), { bodyId: b[0]!.id });
      return b[0]!.id;
    };
    const cradle = await mk(
      'Cradleworld',
      [
        ['food_1', 100],
        ['water', 100],
        ['med_1', 10],
      ],
      true,
    );
    const aging = await mk(
      'Agingworld',
      [
        ['food_1', 100],
        ['water', 100],
      ],
      false,
    );

    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });

    const read = async (id: string) =>
      (
        await pool.query(
          `SELECT population, pop_children, pop_seniors, demo_counters
           FROM bodies WHERE id = $1`,
          [id],
        )
      ).rows[0];
    // Attendus v2 EXACTS (mêmes fonctions pures que le handler).
    const actives0 = 1200 - 218 - 327; // 655
    const seniorDeaths = 327 / 30;
    // Berceau : residential L1, Ē neutre 0,7 (aucune industrie), flux de
    // vie LOCAUX nuls (ρ = 0 ⇒ déficit ×0,5 par famille — le stock plein
    // ne nourrit PAS la croissance, canon).
    const mEff = 0.5 + 0.5 * 0.7;
    const mLife = 0.5 * 0.5;
    const births = 0.12 * actives0 * mEff * mLife;
    const fedRow = await read(cradle);
    const expectFed = 1200 + births - seniorDeaths;
    expect(Number(fedRow.population)).toBeCloseTo(expectFed, 1);
    expect(Number(fedRow.pop_children)).toBeGreaterThan(218); // berceau
    // Sans residential : natalité NULLE — le monde vieillit (−S/30).
    const agingRow = await read(aging);
    expect(Number(agingRow.population)).toBeCloseTo(1200 - seniorDeaths, 1);
    expect(Number(agingRow.demo_counters.deaths.seniors)).toBeCloseTo(
      seniorDeaths,
      1,
    );
    // Le pop_daily suivant est replanifié.
    const { rows: next } = await pool.query(
      `SELECT count(*)::int AS n FROM events WHERE processed_at IS NULL
       AND kind = 'pop_daily' AND payload->>'bodyId' IN ($1, $2)`,
      [cradle, aging],
    );
    expect(next[0].n).toBe(2);
  });

  it('clinique active : sa réduction diminue réellement les morts de maladie', async () => {
    const t0 = Date.now();
    const mk = async (name: string, clinicLevel: 0 | 1) => {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
            quality, tiles, owner_id, population, pop_children, pop_seniors,
            illness, colonized_at, pop_as_of)
         SELECT 'planet', $1, 900150, 900150, $2, 's', 'temperate', 'F', 8,
                p.id, 1000, 182, 273, 0.5,
                to_timestamp($3 / 1000.0), to_timestamp($3 / 1000.0)
         FROM players p LIMIT 1 RETURNING id`,
        [name, `clinic-${name}-${run}`, t0],
      );
      if (clinicLevel > 0) {
        await pool.query(
          `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
           VALUES ($1, 'clinic', $2, 0, 'active', 0)`,
          [rows[0]!.id, clinicLevel],
        );
      }
      for (const [resource, tons] of [
        ['food_1', 200],
        ['water', 200],
        ['med_1', 50],
      ] as const) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
          [rows[0]!.id, resource, tons, t0],
        );
      }
      await enqueue(pool, 'pop_daily', new Date(t0 + DAY), {
        bodyId: rows[0]!.id,
      });
      return rows[0]!.id;
    };
    const untreated = await mk('Untreated', 0);
    const treated = await mk('Treated', 1);

    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });
    const read = async (bodyId: string) =>
      (
        await pool.query(
          `SELECT population, illness, demo_counters FROM bodies WHERE id = $1`,
          [bodyId],
        )
      ).rows[0];
    const withoutClinic = await read(untreated);
    const withClinic = await read(treated);

    // Même pression brute (I décroît de 5 %), mais L1 retire 0,10 avant
    // le taux létal de 3 % : environ 3 morts évitées sur 1 000 têtes.
    expect(Number(withClinic.illness)).toBeCloseTo(
      Number(withoutClinic.illness),
      9,
    );
    expect(Number(withClinic.population)).toBeGreaterThan(
      Number(withoutClinic.population) + 2.5,
    );
    const deaths = (row: { demo_counters: { deaths: Record<string, number> } }) =>
      Object.values(row.demo_counters.deaths).reduce(
        (total, value) => total + Number(value),
        0,
      );
    expect(deaths(withClinic)).toBeLessThan(deaths(withoutClinic) - 2.5);
  });

  it('médicaments par âge : stock/flux complet mitigent, déficit tombe à zéro sans horloge, surplus reste vendable', async () => {
    const t0 = Date.now();
    const { playerId } = await registerPlayer(pool, {
      email: `loop-med-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'Medic',
      politics: 'scientific',
      universeSeed: `loop-med-universe-${run}`,
    });
    let coordinate = 900_170;
    const mk = async (
      name: string,
      opts: { medicineT?: number; labRunPct?: number } = {},
    ) => {
      coordinate += 1;
      // P=3 000 sur cap 2 000 : la parabole rend la différence de pression
      // médicale observable dès le premier pop_daily. Pyramide C/A/S
      // 600/1 800/600 ⇒ 3 450 têtes médicales, donc 0,345 T/jour.
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
            quality, tiles, owner_id, population, pop_children, pop_seniors,
            illness, colonized_at, pop_as_of)
         VALUES ('planet', $1, $2, $2, $3, 's', 'temperate', 'F', 8, $4,
                 3000, 600, 600, 0, to_timestamp($5 / 1000.0),
                 to_timestamp($5 / 1000.0))
         RETURNING id`,
        [name, coordinate, `medicine-${name}-${run}`, playerId, t0],
      );
      const bodyId = rows[0]!.id;
      for (const [resource, tons] of [
        ['food_1', 200],
        ['water', 200],
        ['lithium', 100],
      ] as const) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
          [bodyId, resource, tons, t0],
        );
      }
      if (opts.medicineT !== undefined) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, 'med_1', $2, to_timestamp($3 / 1000.0))`,
          [bodyId, opts.medicineT, t0],
        );
      }
      if (opts.labRunPct !== undefined) {
        await pool.query(
          `INSERT INTO buildings
             (body_id, key, level, tile_index, status, recipe, workforce, run_pct)
           VALUES ($1, 'lab', 1, 0, 'active', 'med_1', 34, $2)`,
          [bodyId, opts.labRunPct],
        );
      }
      // Rebase autoritatif : écrit le burn, programme le bord exact de la
      // petite réserve et garantit un pop_daily unique à J+1.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await recomputePlanetRates(client, bodyId, t0);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return bodyId;
    };

    const stocked = await mk('Med-stocked', { medicineT: 10 });
    const empty = await mk('Med-empty');
    const exhausted = await mk('Med-exhausted', { medicineT: 0.1 });
    const producer = await mk('Med-producer', { labRunPct: 100 });

    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });

    const read = async (bodyId: string) =>
      (
        await pool.query(
          `SELECT population, illness, clock_deadlines
           FROM bodies WHERE id = $1`,
          [bodyId],
        )
      ).rows[0];
    const stockedRow = await read(stocked);
    const emptyRow = await read(empty);
    const exhaustedRow = await read(exhausted);
    const producerRow = await read(producer);

    // Stock et production live COMPLÈTE donnent la même mitigation. La
    // réserve déficitaire s'est épuisée avant J+1 et rejoint le monde vide.
    expect(Number(producerRow.illness)).toBeCloseTo(
      Number(stockedRow.illness),
      6,
    );
    expect(Number(exhaustedRow.illness)).toBeCloseTo(
      Number(emptyRow.illness),
      6,
    );
    expect(Number(emptyRow.illness)).toBeGreaterThan(
      Number(stockedRow.illness) * 1.9,
    );
    expect(Number(stockedRow.population)).toBeGreaterThan(
      Number(emptyRow.population) + 20,
    );
    expect(Number(producerRow.population)).toBeGreaterThan(
      Number(exhaustedRow.population) + 20,
    );

    const deficitMed = await stockRow(exhausted, 'med_1');
    expect(Number(deficitMed.amount_t)).toBeGreaterThanOrEqual(0);
    expect(Number(deficitMed.amount_t)).toBeLessThanOrEqual(1e-6);
    expect(Number(deficitMed.rate_t_per_day)).toBe(0);

    // Le lab L1 produit bien au-delà de 0,345 T/j : après burn, le reliquat
    // est un stock fongible ordinaire, positif et donc vendable.
    const producerMed = await stockRow(producer, 'med_1');
    expect(Number(producerMed.amount_t)).toBeGreaterThan(9);
    expect(Number(producerMed.rate_t_per_day)).toBeGreaterThan(9);

    // Aucun stock ne passe négatif et « medicine » n'entre jamais dans les
    // horloges létales (réservées à water/food ; oxygen reste instantané).
    const ids = [stocked, empty, exhausted, producer];
    const { rows: physical } = await pool.query(
      `SELECT min(amount_t)::float8 AS minimum
       FROM planet_stock WHERE body_id = ANY($1::uuid[])`,
      [ids],
    );
    expect(Number(physical[0].minimum)).toBeGreaterThanOrEqual(0);
    for (const row of [stockedRow, emptyRow, exhaustedRow, producerRow]) {
      expect(row.clock_deadlines.medicine).toBeUndefined();
    }
    const { rows: clocks } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE kind = 'pop_clock' AND payload->>'bodyId' = ANY($1::text[])
         AND payload->>'family' = 'medicine'`,
      [ids],
    );
    expect(clocks[0].n).toBe(0);
  });

  it('horloge de mort v2 : eau à sec → échéance 3 j posée → tout le monde meurt (canon)', async () => {
    const t0 = Date.now();
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles, owner_id, population, pop_children, pop_seniors,
          pop_as_of)
       SELECT 'planet', 'Thirstworld', 900200, 900200, $1, 's', 'temperate',
              'F', 8, p.id, 900, 164, 245, to_timestamp($2 / 1000.0)
       FROM players p LIMIT 1 RETURNING id`,
      [`thirst-${run}`, t0],
    );
    const id = b[0]!.id;
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, 'food_1', 500, to_timestamp($2 / 1000.0))`,
      [id, t0],
    );
    // Aucune eau : le premier pop_daily pose l'échéance FIXE à +3 j.
    await enqueue(pool, 'pop_daily', new Date(t0 + DAY), { bodyId: id });
    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });
    const { rows: clocks } = await pool.query(
      `SELECT clock_deadlines FROM bodies WHERE id = $1`,
      [id],
    );
    expect(clocks[0].clock_deadlines.water).toBeTruthy();
    const deadline = new Date(clocks[0].clock_deadlines.water).getTime();
    expect(deadline).toBeCloseTo(t0 + DAY + 3 * DAY, -4);
    const { rows: ev } = await pool.query(
      `SELECT count(*)::int AS n FROM events WHERE processed_at IS NULL
       AND kind = 'pop_clock' AND payload->>'bodyId' = $1`,
      [id],
    );
    expect(ev[0].n).toBe(1);
    // À l'échéance : mort TOTALE (l'événement re-vérifie la famine).
    await processDueEvents(pool, baseHandlers(), { nowMs: deadline + 1000 });
    const { rows: after } = await pool.query(
      `SELECT owner_id, population, demo_counters FROM bodies WHERE id = $1`,
      [id],
    );
    expect(after[0].owner_id).toBeNull();
    expect(Number(after[0].population)).toBe(0);
    expect(
      Number(after[0].demo_counters.deaths.children) +
        Number(after[0].demo_counters.deaths.actives) +
        Number(after[0].demo_counters.deaths.seniors),
    ).toBeGreaterThan(800);
  });

  it('chômage v2 (chunk BB) : grâce épuisée → morts γ(τ−7 %)×P et staff décrémenté', async () => {
    const t0 = Date.now();
    // Monde HORS grâce de colonie (colonisé il y a 20 j), grâce de
    // chômage déjà consommée (unemp_over_days = 3), un seul emploi :
    // mine L1 staffée 50 → τ = 1 − 50/655 ≈ 0,924.
    const { rows: b } = await pool.query<{ id: string }>(
      `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
          quality, tiles, owner_id, population, pop_children, pop_seniors,
          unemp_over_days, colonized_at, pop_as_of)
       SELECT 'planet', 'Idleworld', 900400, 900400, $1, 's', 'temperate',
              'F', 8, p.id, 1200, 218, 327, 3,
              to_timestamp(($2::bigint - 20 * 86400000::bigint) / 1000.0),
              to_timestamp($2 / 1000.0)
       FROM players p LIMIT 1 RETURNING id`,
      [`idle-${run}`, t0],
    );
    const id = b[0]!.id;
    await pool.query(
      `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
       VALUES ($1, 'mine', 1, 0, 'active', 50)`,
      [id],
    );
    for (const [res, qty] of [
      ['food_1', 200],
      ['water', 200],
    ] as const) {
      await pool.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
        [id, res, qty, t0],
      );
    }
    await enqueue(pool, 'pop_daily', new Date(t0 + DAY), { bodyId: id });
    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });

    const { rows: after } = await pool.query(
      `SELECT population, unemp_over_days, demo_counters,
              (SELECT workforce FROM buildings WHERE body_id = $1 LIMIT 1) AS wf
       FROM bodies WHERE id = $1`,
      [id],
    );
    // Morts séniles naturelles (S/30 ≈ 10,9, pas de natalité) + morts de
    // chômage γ(τ−0,07) × P ≈ 20,4 → total ≈ −31,3.
    expect(Number(after[0].population)).toBeLessThan(1200 - 25);
    expect(Number(after[0].population)).toBeGreaterThan(1200 - 40);
    expect(Number(after[0].unemp_over_days)).toBeGreaterThanOrEqual(4);
    // Les morts frappent AUSSI les employés : le staff a été décrémenté.
    expect(Number(after[0].wf)).toBeLessThan(50);
    expect(Number(after[0].demo_counters.deaths.actives)).toBeGreaterThan(5);
  });

  it("oxygène v2 : climat hostile à sec = mort instantanée ; temperate = ambiant", async () => {
    const t0 = Date.now();
    const mk = async (name: string, climate: string) => {
      const { rows: b } = await pool.query<{ id: string }>(
        `INSERT INTO bodies (body_type, name, x, y, seed, size, climate,
            quality, tiles, owner_id, population, pop_children, pop_seniors,
            pop_as_of)
         SELECT 'planet', $1, 900300, 900300, $2, 's', $3, 'F', 8,
                p.id, 600, 109, 164, to_timestamp($4 / 1000.0)
         FROM players p LIMIT 1 RETURNING id`,
        [name, `oxy-${name}-${run}`, climate, t0],
      );
      for (const [res, qty] of [
        ['food_1', 100],
        ['water', 100],
      ] as const) {
        await pool.query(
          `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
           VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))`,
          [b[0]!.id, res, qty, t0],
        );
      }
      await enqueue(pool, 'pop_daily', new Date(t0 + DAY), { bodyId: b[0]!.id });
      return b[0]!.id;
    };
    const hostile = await mk('Chokeworld', 'hot'); // zéro oxygène en stock
    const ambient = await mk('Breezeworld', 'temperate');
    await processDueEvents(pool, baseHandlers(), { nowMs: t0 + DAY + 1000 });
    const pop = async (id: string) =>
      Number(
        (await pool.query(`SELECT population FROM bodies WHERE id = $1`, [id]))
          .rows[0].population,
      );
    expect(await pop(hostile)).toBe(0); // instantané (canon)
    expect(await pop(ambient)).toBeGreaterThan(0); // l'air est gratuit
  });

  it('rattrapage hors-ligne : évaluer à t+N = matérialiser à t+k puis évaluer (zéro dérive)', async () => {
    const t0 = Date.now();
    const { playerId, spawn } = await registerPlayer(pool, {
      email: `loop-d-${run}@test.local`,
      password: 'motdepasse-solide-1',
      displayName: 'LoopD',
      politics: 'scientific',
      universeSeed: `loop-universe-${run}`,
    });
    const planetId = spawn.starterPlanetId;
    await placeBuilding(pool, playerId, planetId, 'mine', 0, {
      nowMs: t0,
      timeScale: 3600 * 6,
      recipe: 'extract:ore',
    });
    await new Promise((r) => setTimeout(r, 1_100));
    await processDueEvents(pool, baseHandlers());
    const row = await stockRow(planetId, 'ore');
    const q = {
      amount: row.amount_t,
      ratePerDay: row.rate_t_per_day,
      asOfMs: toMs(row.as_of),
    };
    const direct = evalLazy(q, q.asOfMs + 2 * DAY);
    // Chemin « spectateur » : matérialisation intermédiaire à J+1 puis J+2.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await recomputePlanetRates(client, planetId, q.asOfMs + DAY);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const mid = await stockRow(planetId, 'ore');
    const stepped = evalLazy(
      {
        amount: mid.amount_t,
        ratePerDay: mid.rate_t_per_day,
        asOfMs: toMs(mid.as_of),
      },
      q.asOfMs + 2 * DAY,
    );
    expect(stepped).toBeCloseTo(direct, 6);
  });
});

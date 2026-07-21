/** @verifies This test file verifies: docs/BACKLOG.md §P4 “Recruitment pods”; GAME_BOOK.md §12/§13/§19; DESIGN_GUIDE.md §11.4. */
/**
 * Intégration : pods de recrutement (GB §12/§13, DG §11.4) sur vraie
 * base — barème dérivé du census, impact immédiat des achats sur S_r,
 * âge de compte 45 j (refus direct), cap quotidien 10, paiement physique
 * depuis un monde possédé (refus monde d'autrui / stock insuffisant),
 * PNJ lié au compte 60 j, déterminisme du roll (seed = index d'achat).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  ALL_RESOURCE_IDS,
  GAME_DAY_SECONDS,
  POD_DAILY_CAP,
  POD_MIN_ACCOUNT_AGE_DAYS,
  POD_NPC_ACCOUNT_BIND_DAYS,
  POD_PRICE_FLOOR_T,
  podPrices,
  rollPodNpc,
  SeededStream,
  type ResourceId,
} from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers, censusRun } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { openPod, podEligibility, podPricing } from '../../src/services/pods.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
const UNIVERSE = `pods-universe-${run}`;
let buyer = '';
let starter = '';
let stranger = '';
let strangerStarter = '';

async function ageAccount(playerId: string, days: number): Promise<void> {
  await pool.query(
    `UPDATE players SET created_at = created_at - make_interval(days => $2)
     WHERE id = $1`,
    [playerId, days],
  );
}

async function takeCensus(): Promise<void> {
  await pool.query(
    `INSERT INTO events (due_at, kind, payload)
     VALUES (now() - interval '1 second', 'census_run', '{}')`,
  );
  await processDueEvents(pool, {
    ...baseHandlers(),
    census_run: censusRun(3_600_000),
  });
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `pods-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Recruteur',
    politics: 'industrialist',
    universeSeed: UNIVERSE,
  });
  const b = await registerPlayer(pool, {
    email: `pods-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Étranger',
    politics: 'militarist',
    universeSeed: UNIVERSE,
  });
  buyer = a.playerId;
  starter = a.spawn.starterPlanetId;
  stranger = b.playerId;
  strangerStarter = b.spawn.starterPlanetId;
  // Trésorerie : de quoi payer plusieurs pods en ore.
  await pool.query(
    `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
     VALUES ($1, 'ore', 2000, now())
     ON CONFLICT (body_id, resource)
     DO UPDATE SET amount_t = 2000, as_of = now()`,
    [starter],
  );
  await takeCensus();
}, 30_000);

afterAll(async () => {
  await pool.end();
});

describe('pods de recrutement (DG §11.4)', () => {
  it('barème : exhaustif, basé sur le dernier census, plancher 5', async () => {
    const p = await podPricing(pool);
    expect(p.censusTakenAt).toBeTruthy();
    expect(Object.keys(p.prices).sort()).toEqual([...ALL_RESOURCE_IDS].sort());
    for (const price of Object.values(p.prices)) {
      expect(price).toBeGreaterThanOrEqual(POD_PRICE_FLOOR_T);
    }
    // L'ore est massivement sur-approvisionné dans cet univers de test.
    expect(p.prices.ore).toBeGreaterThan(POD_PRICE_FLOOR_T);
  });

  it('âge de compte : < 45 jours ⇒ refus (requête directe)', async () => {
    const eligibility = await podEligibility(pool, buyer);
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.minAccountAgeDays).toBe(POD_MIN_ACCOUNT_AGE_DAYS);
    expect(new Date(eligibility.eligibleAt).getTime()).toBeGreaterThan(
      Date.now() + 44 * GAME_DAY_SECONDS * 1000,
    );
    const threshold = new Date(eligibility.eligibleAt).getTime();
    expect((await podEligibility(pool, buyer, threshold - 1)).eligible).toBe(false);
    expect((await podEligibility(pool, buyer, threshold)).eligible).toBe(true);
    await expect(
      openPod(pool, buyer, { planetId: starter, resource: 'ore' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('ouverture : payé du stock, PNJ lié 60 j, roll DÉTERMINISTE, impact de prix', async () => {
    await ageAccount(buyer, 46);
    expect((await podEligibility(pool, buyer)).eligible).toBe(true);
    const before = await podPricing(pool);
    const { rows: stockBefore } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'ore'`,
      [starter],
    );
    const opened = await openPod(
      pool,
      buyer,
      { planetId: starter, resource: 'ore' },
      { universeSeed: UNIVERSE },
    );
    expect(opened.paid.tons).toBeCloseTo(before.prices.ore, 2);
    // Roll reproductible : même seed (universe:pod:joueur:1) ⇒ même PNJ.
    const expected = rollPodNpc(new SeededStream(UNIVERSE, `pod:${buyer}:1`));
    expect(opened.npc.role).toBe(expected.role);
    expect(opened.npc.rarity).toBe(expected.rarity);
    expect(opened.npc.people).toBe(expected.people);
    expect(opened.npc.statRolls).toEqual(expected.statRolls);
    // Lié au compte 60 jours.
    const boundMs = new Date(opened.npc.accountBoundUntil).getTime();
    expect(boundMs - Date.now()).toBeGreaterThan(
      (POD_NPC_ACCOUNT_BIND_DAYS - 1) * GAME_DAY_SECONDS * 1000,
    );
    // Stock réellement débité + taux rebasés.
    const { rows: stockAfter } = await pool.query(
      `SELECT amount_t FROM planet_stock WHERE body_id = $1 AND resource = 'ore'`,
      [starter],
    );
    expect(Number(stockAfter[0].amount_t)).toBeCloseTo(
      Number(stockBefore[0].amount_t) - opened.paid.tons,
      1,
    );
    // Impact immédiat : le barème suivant est EXACTEMENT la formule
    // partagée appliquée à S_census − tonnes payées depuis le snapshot
    // (la direction du ratio n'est pas garantie : S̄ bouge aussi).
    const after = await podPricing(pool);
    const { rows: snap } = await pool.query(
      `SELECT totals FROM census_snapshots ORDER BY taken_at DESC, id DESC LIMIT 1`,
    );
    const supplies: Partial<Record<ResourceId, number>> = {};
    for (const r of ALL_RESOURCE_IDS) {
      supplies[r] = Math.max(
        0,
        Number(snap[0].totals[r]?.totalT ?? 0) - (r === 'ore' ? opened.paid.tons : 0),
      );
    }
    expect(after.prices.ore).toBeCloseTo(podPrices(supplies).ore, 6);
    expect(after.prices.ore).not.toBeCloseTo(before.prices.ore, 6);
    // Le PNJ existe, possédé, non lié à un hôte.
    const { rows: npcs } = await pool.query(
      `SELECT owner_id, bound_host_type, account_bound_until FROM npcs WHERE id = $1`,
      [opened.npc.id],
    );
    expect(npcs[0].owner_id).toBe(buyer);
    expect(npcs[0].bound_host_type).toBeNull();
    expect(npcs[0].account_bound_until).not.toBeNull();
  });

  it('cap quotidien : 10 pods/jour, le 11e est refusé', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM pod_openings WHERE player_id = $1`,
      [buyer],
    );
    for (let i = rows[0].n; i < POD_DAILY_CAP; i++) {
      await openPod(pool, buyer, { planetId: starter, resource: 'ore' }, {
        universeSeed: UNIVERSE,
      });
    }
    await expect(
      openPod(pool, buyer, { planetId: starter, resource: 'ore' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it("refus : monde d'autrui, ressource inconnue, stock insuffisant", async () => {
    await ageAccount(stranger, 46);
    // L'étranger ne paie pas depuis MON monde.
    await expect(
      openPod(pool, stranger, { planetId: starter, resource: 'ore' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      openPod(pool, stranger, { planetId: strangerStarter, resource: 'pas_une_ressource' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    // Stock insuffisant : gold n'existe pas dans le stock du starter.
    await pool.query(
      `DELETE FROM planet_stock WHERE body_id = $1 AND resource = 'gold'`,
      [strangerStarter],
    );
    await expect(
      openPod(pool, stranger, { planetId: strangerStarter, resource: 'gold' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'insufficient_resources' });
  });

  it('sans census : refus explicite (jamais de prix inventé)', async () => {
    await pool.query(`DELETE FROM census_snapshots`);
    await expect(podPricing(pool)).rejects.toMatchObject({
      code: 'not_available',
    });
    await expect(
      openPod(pool, buyer, { planetId: starter, resource: 'ore' }, {
        universeSeed: UNIVERSE,
      }),
    ).rejects.toMatchObject({ code: 'not_available' });
    await takeCensus(); // restaure pour les fichiers suivants
  });
});

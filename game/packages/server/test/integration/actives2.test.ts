/** @verifies This test file verifies: docs/GEAR_CATALOG.md §2–§3; docs/MASTER_PLAN.md §W9e (partie 2); JOURNAL 2026-07-22. */
/**
 * Intégration W9e (partie 2 — actifs couplés au déplacement/temps) :
 * gravity_sling (départ ≤ 8 pc d'une étoile : vitesse contre dégâts),
 * ram_scoop (récolte de traversée de champ CONTRE usure), jump_primer
 * (charge libre → boost ×1,5 pendant 3× la charge), kedge_winch (5 pc
 * sans carburant ; MODE BOOST < 1 u : tout brûlé, 10 pc), cryo pod
 * (stase : survie gelée, réveil 10 min, L1 immobile ; L2 autopilote
 * voyage en stase, irréveillable), deep_scan_pulse (instantané L3
 * persisté du corps sous scan).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { GRAVITY_SLING, HULLS, RAM_SCOOP, starFieldRadiusPc } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { setConversion } from '../../src/services/conversions.js';
import { moveShip } from '../../src/services/ships.js';
import { bodyIntel } from '../../src/services/world.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starX = 0;
let starY = 0;
let starFuel = 'cold';
let fieldR = 0;

const FAST = { timeScale: 1_000_000 };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function shipAt(
  name: string,
  accessories: string[],
  x: number,
  y: number,
  extra: { fuel?: number; engine?: string; cargo?: object } = {},
): Promise<string> {
  const engine = extra.engine ?? 'cold';
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo)
     VALUES ($1, 'cargo', 'l', $2, $3, $4, 'idle', $5, $6, $7, $8)
     RETURNING id`,
    [
      owner,
      name,
      x,
      y,
      JSON.stringify({ [engine]: extra.fuel ?? 200 }),
      engine,
      JSON.stringify(accessories),
      JSON.stringify(extra.cargo ?? {}),
    ],
  );
  return rows[0]!.id;
}

/** Fixture §15 : force le terme du batch à maintenant puis traite. */
async function forceBatchTerm(shipId: string, itemKey: string): Promise<void> {
  await pool.query(
    `UPDATE ships SET conversions = jsonb_set(conversions,
       ARRAY[$2, 'processEndsAtMs'], to_jsonb($3::bigint))
     WHERE id = $1`,
    [shipId, itemKey, Date.now() - 1000],
  );
  await pool.query(
    `UPDATE events SET due_at = now() - interval '1 second'
     WHERE processed_at IS NULL AND kind = 'conversion_edge'
       AND payload->>'shipId' = $1`,
    [shipId],
  );
  await processDueEvents(pool, baseHandlers(1));
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `ac2-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Voyager',
    politics: 'scientific',
    universeSeed: `ac2-universe-${run}`,
  });
  owner = a.playerId;
  const { rows: st } = await pool.query(
    `SELECT x, y, star_fuel_type, r_nova FROM bodies WHERE id = $1`,
    [a.spawn.starId],
  );
  starX = Number(st[0].x);
  starY = Number(st[0].y);
  starFuel = st[0].star_fuel_type ?? 'cold';
  fieldR = starFieldRadiusPc(Number(st[0].r_nova ?? 0));
});

afterAll(async () => {
  await pool.end();
});

describe('W9e — stances de déplacement', () => {
  it('gravity_sling : départ ≤ 8 pc d\'une étoile — arrivée plus tôt, dégâts au lancement', async () => {
    const bare = await shipAt(`v-bare-${run}`, [], starX + 6, starY + 300);
    const slung = await shipAt(`v-sling-${run}`, ['gravity_sling'], starX + 6, starY);
    await setConversion(pool, owner, slung, { itemKey: 'gravity_sling', runPct: 100 }, FAST);
    const t0 = Date.now();
    const rBare = await moveShip(pool, owner, bare, { x: starX + 6, y: starY + 340 }, FAST);
    const rSlung = await moveShip(pool, owner, slung, { x: starX + 6, y: starY + 40 }, FAST);
    // Fenêtre : le nu part à +300 pc de l'étoile (hors fenêtre même s'il
    // avait la stance) — même distance (40 pc), le slung arrive ~×1,5 plus vite.
    const durBare = rBare.arrivesAt.getTime() - t0;
    const durSlung = rSlung.arrivesAt.getTime() - t0;
    expect(durSlung).toBeLessThan(durBare * 0.75);
    // Dégâts au départ : maxHp − 10 (plein → péage, plancher jamais atteint).
    const s = await ship(slung);
    const maxHp = HULLS.cargo_l.armorHp;
    expect(Number(s.hull_hp)).toBeCloseTo(maxHp - GRAVITY_SLING.damageHpAt100, 0);
  });

  it('ram_scoop : la traversée du champ du type moteur récolte du carburant CONTRE de l\'usure', async () => {
    // Trajet diamétral : de l'ouest du champ à l'est — traverse ~2×fieldR.
    const scooper = await shipAt(
      `v-scoop-${run}`,
      ['ram_scoop'],
      starX - fieldR - 10,
      starY,
      { engine: starFuel, fuel: 150 },
    );
    await setConversion(pool, owner, scooper, { itemKey: 'ram_scoop', runPct: 100 }, FAST);
    const before = await ship(scooper);
    const fuelBefore = Number(before.fuel[starFuel]);
    const r = await moveShip(
      pool,
      owner,
      scooper,
      { x: starX + fieldR + 10, y: starY },
      FAST,
    );
    const s = await ship(scooper);
    const pcIn = 2 * fieldR;
    const expectedScoop = pcIn * RAM_SCOOP.fuelUPerPcAt100 * 1;
    const fuelAfter = Number(s.fuel[starFuel]);
    // Crédit net = récolte − pré-brûlage (borné au réservoir).
    expect(fuelAfter).toBeCloseTo(
      Math.min(400, fuelBefore - r.fuelBurned + expectedScoop),
      0,
    );
    // Usure de traversée : pcIn × 0,5 HP × 2.
    const maxHp = HULLS.cargo_l.armorHp;
    expect(Number(s.hull_hp)).toBeCloseTo(
      Math.max(1, maxHp - pcIn * RAM_SCOOP.wearHpPerPc * RAM_SCOOP.wearMult),
      0,
    );
  });
});

describe('W9e — jump_primer et kedge_winch', () => {
  it('jump_primer : charge LIBRE requise (1 h–10 j) ; au terme, boost ×1,5 pendant 3× la charge', async () => {
    const primed = await shipAt(`v-prime-${run}`, ['jump_primer'], starX + 200, starY + 200);
    await expect(
      setConversion(pool, owner, primed, { itemKey: 'jump_primer', runPct: 100 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' }); // durée manquante
    await setConversion(
      pool, owner, primed,
      { itemKey: 'jump_primer', runPct: 100, hours: 2 },
      { timeScale: 1 },
    );
    await forceBatchTerm(primed, 'jump_primer');
    const mid = await ship(primed);
    expect(mid.conversions.jump_primer.boostUntilMs).toBeGreaterThan(Date.now());
    // Boosté vs nu : même distance, arrivée ~×1,5 plus tôt.
    const bare = await shipAt(`v-nb-${run}`, [], starX + 240, starY + 200);
    const t0 = Date.now();
    const rB = await moveShip(pool, owner, bare, { x: starX + 240, y: starY + 240 }, FAST);
    const rP = await moveShip(pool, owner, primed, { x: starX + 200, y: starY + 240 }, FAST);
    expect(rP.arrivesAt.getTime() - t0).toBeLessThan(
      (rB.arrivesAt.getTime() - t0) * 0.75,
    );
  });

  it('kedge_winch : 5 pc SANS carburant vers la cible ; MODE BOOST (< 1 u) : tout brûlé, 10 pc', async () => {
    const k1 = await shipAt(`v-k1-${run}`, ['kedge_winch'], starX + 400, starY);
    await expect(
      setConversion(pool, owner, k1, { itemKey: 'kedge_winch', runPct: 100 }, { timeScale: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' }); // cible manquante
    await setConversion(
      pool, owner, k1,
      { itemKey: 'kedge_winch', runPct: 100, target: { x: starX + 500, y: starY } },
      { timeScale: 1 },
    );
    const fuelMid = Number((await ship(k1)).fuel.cold);
    expect(fuelMid).toBeCloseTo(200, 1); // AUCUN carburant consommé
    await forceBatchTerm(k1, 'kedge_winch');
    const s1 = await ship(k1);
    expect(Number(s1.x)).toBeCloseTo(starX + 405, 1); // 5 pc vers la cible
    // MODE BOOST : < 1 u restant — tout brûlé, dérive 10 pc.
    const k2 = await shipAt(`v-k2-${run}`, ['kedge_winch'], starX + 400, starY + 20, { fuel: 0.5 });
    await setConversion(
      pool, owner, k2,
      { itemKey: 'kedge_winch', runPct: 100, target: { x: starX + 500, y: starY + 20 } },
      { timeScale: 1 },
    );
    expect(Number((await ship(k2)).fuel.cold ?? 0)).toBe(0); // tout brûlé
    await forceBatchTerm(k2, 'kedge_winch');
    const s2 = await ship(k2);
    expect(Number(s2.x)).toBeCloseTo(starX + 410, 1); // 10 pc
  });
});

describe('W9e — cryostase et scan profond', () => {
  it('cryo L1 : stase = survie GELÉE + coque immobilisée ; réveil en 10 min', async () => {
    const pod = await shipAt(`v-cryo-${run}`, ['cryo_stasis_pod'], starX + 420, starY + 40);
    const { rows: npc } = await pool.query(
      `SELECT id FROM npcs WHERE owner_id = $1 AND role = 'pilot' LIMIT 1`,
      [owner],
    );
    await pool.query(
      `UPDATE npcs SET bound_host_type = 'ship', bound_host_id = $2 WHERE id = $1`,
      [npc[0].id, pod],
    );
    await pool.query(
      `UPDATE ships SET survival = '{"food": 1, "water": 1}' WHERE id = $1`,
      [pod],
    );
    await setConversion(
      pool, owner, pod,
      { itemKey: 'cryo_stasis_pod', runPct: 100 },
      { timeScale: 1 },
    );
    const frozen = await ship(pod);
    expect(Number(frozen.survival_rate_t_per_day)).toBe(0); // gelée
    await expect(
      moveShip(pool, owner, pod, { x: starX + 460, y: starY + 40 }, { timeScale: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' }); // immobile (L1)
    // Réveil : runPct 0 → échéance de réveil (10 min), toujours gelé.
    const r = await setConversion(
      pool, owner, pod,
      { itemKey: 'cryo_stasis_pod', runPct: 0 },
      { timeScale: 1 },
    );
    expect(r.state?.waking).toBe(true);
    expect(Number((await ship(pod)).survival_rate_t_per_day)).toBe(0);
    await forceBatchTerm(pod, 'cryo_stasis_pod');
    const awake = await ship(pod);
    expect(awake.conversions.cryo_stasis_pod).toBeUndefined();
    expect(Number(awake.survival_rate_t_per_day)).toBeLessThan(0); // réarmée
  });

  it('cryo L2 (enhanced) : durée choisie, VOYAGE autorisé en stase, irréveillable', async () => {
    const auto = await shipAt(
      `v-auto-${run}`,
      ['cryo_stasis_pod_enhanced'],
      starX + 420, starY + 80,
    );
    await expect(
      setConversion(pool, owner, auto, { itemKey: 'cryo_stasis_pod_enhanced', runPct: 100 }, { timeScale: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' }); // durée requise
    await setConversion(
      pool, owner, auto,
      { itemKey: 'cryo_stasis_pod_enhanced', runPct: 100, hours: 48 },
      { timeScale: 1 },
    );
    await expect(
      setConversion(pool, owner, auto, { itemKey: 'cryo_stasis_pod_enhanced', runPct: 0 }, { timeScale: 1 }),
    ).rejects.toMatchObject({ code: 'not_available' }); // irréveillable
    // AUTOPILOTE : le voyage part malgré la stase.
    const r = await moveShip(pool, owner, auto, { x: starX + 460, y: starY + 80 }, FAST);
    expect(r.arrivesAt).toBeTruthy();
  });

  it('deep_scan_pulse : instantané L3 PERSISTÉ du corps sous scan le plus proche', async () => {
    // Un monde étranger : le starter d'un SECOND souverain.
    const b = await registerPlayer(pool, {
      email: `ac2-b-${run}@test.local`,
      password: 'motdepasse-solide-2',
      displayName: 'Rival',
      politics: 'militarist',
      universeSeed: `ac2-universe-${run}`,
    });
    const { rows: foreign } = await pool.query(
      `SELECT id, x, y FROM bodies WHERE id = $1`,
      [b.spawn.starterPlanetId],
    );
    expect(foreign[0]).toBeTruthy();
    const fx = Number(foreign[0].x);
    const fy = Number(foreign[0].y);
    const scanner = await shipAt(`v-scan-${run}`, ['deep_scan_pulse'], fx + 10, fy);
    await setConversion(
      pool, owner, scanner,
      { itemKey: 'deep_scan_pulse', runPct: 100 },
      { timeScale: 1 },
    );
    await forceBatchTerm(scanner, 'deep_scan_pulse');
    const { rows: snap } = await pool.query(
      `SELECT tier FROM player_body_intel WHERE player_id = $1 AND body_id = $2`,
      [owner, foreign[0].id],
    );
    expect(Number(snap[0]?.tier)).toBe(3);
    // Et l'intel SERT le plancher — même sans présence ni télescope.
    await pool.query(`UPDATE ships SET x = x + 5000 WHERE id = $1`, [scanner]);
    const intel = await bodyIntel(pool, owner, foreign[0].id, Date.now());
    expect(intel.tier).toBeGreaterThanOrEqual(3);
  });
});

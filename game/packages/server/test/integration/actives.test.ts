/** @verifies This test file verifies: docs/GEAR_CATALOG.md §2–§3; docs/MASTER_PLAN.md §W9e; JOURNAL 2026-07-22. */
/**
 * Intégration W9e (partie 1 — actifs « recette ») : cell_cracker
 * (soute-réservoir CONTINUE, carburant crédité au réservoir, borné au
 * plein → starvation), arc_furnace (junk → steel_l), med_synth
 * (bi-intrant), fab_bay (auto-réparation à l'acier de soute — bord de
 * PLEIN de coque → 0 %), smelting_run (batch +10 %), hull_patch_kit
 * (batch : +25 % des HP max au terme).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { HULLS } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import { setConversion } from '../../src/services/conversions.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';

const FAST = { timeScale: 1_000_000 };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function shipWith(
  name: string,
  accessories: string[],
  cargo: object,
  extra: { fuel?: number; hullHp?: number } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, hull_size, name, x, y,
        status, fuel, engine_type, accessories, cargo, hull_hp, hull_as_of)
     VALUES ($1, 'cargo', 'l',  $2,
        (SELECT x FROM bodies WHERE id = $3),
        (SELECT y FROM bodies WHERE id = $3),
        'idle', $4, 'cold', $5, $6, $7::numeric,
        CASE WHEN $7::numeric IS NULL THEN NULL::timestamptz ELSE now() END)
     RETURNING id`,
    [
      owner,
      name,
      starter,
      JSON.stringify({ cold: extra.fuel ?? 100 }),
      JSON.stringify(accessories),
      JSON.stringify(cargo),
      extra.hullHp ?? null,
    ],
  );
  return rows[0]!.id;
}

async function drainEdges(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 60));
    await processDueEvents(pool, baseHandlers(1_000_000));
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'conversion_edge'`,
    );
    if (rows[0].n === 0) return;
  }
}

/** Fixture §15 : force le terme d'un batch à MAINTENANT puis traite. */
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
    email: `act-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Artificer',
    politics: 'scientific',
    universeSeed: `act-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
});

afterAll(async () => {
  await pool.end();
});

describe('W9e — continus « recette »', () => {
  it('arc_furnace : junk de soute → steel_l (2:1), starvation → 0 %', async () => {
    const id = await shipWith(`a-arc-${run}`, ['arc_furnace'], { junk: 8 });
    await setConversion(pool, owner, id, { itemKey: 'arc_furnace', runPct: 100 }, FAST);
    await drainEdges();
    const s = await ship(id);
    expect(s.cargo.junk ?? 0).toBeLessThan(0.1);
    expect(s.cargo.steel_l).toBeCloseTo(4, 1);
    expect(s.conversions.arc_furnace.runPct).toBe(0);
  });

  it('med_synth : eau + phosphore (bi-intrant) → med_1 ; le phosphore épuise en premier', async () => {
    const id = await shipWith(`a-med-${run}`, ['med_synth'], { water: 6, phosphor: 2 });
    await setConversion(pool, owner, id, { itemKey: 'med_synth', runPct: 100 }, FAST);
    await drainEdges();
    const s = await ship(id);
    // 2 T de phosphore / 0,5 par réf = 4 réfs → 4 med_1, eau restante 2.
    expect(s.cargo.med_1).toBeCloseTo(4, 1);
    expect(s.cargo.water).toBeCloseTo(2, 1);
    expect(s.conversions.med_synth.runPct).toBe(0);
  });

  it('cell_cracker : fuel_cells → carburant MOTEUR au réservoir, borné au PLEIN (starvation)', async () => {
    // cargo_l : réservoir 400 u. Départ 390 u : 1 cell = 40 u → borne à 400.
    const id = await shipWith(`a-crack-${run}`, ['cell_cracker'], { fuel_cells: 3 }, { fuel: 390 });
    await setConversion(pool, owner, id, { itemKey: 'cell_cracker', runPct: 100 }, FAST);
    await drainEdges();
    const s = await ship(id);
    // Plein atteint : ≤ 400, starvation → 0 %, cells non toutes consommées.
    expect(Number(s.fuel.cold)).toBeGreaterThan(395);
    expect(Number(s.fuel.cold)).toBeLessThanOrEqual(400.01);
    expect(s.conversions.cell_cracker.runPct).toBe(0);
    expect(Number(s.cargo.fuel_cells)).toBeGreaterThan(1.5);
  });

  it('fab_bay : répare 1 %/h × runPct à l\'acier de SOUTE, s\'arrête au PLEIN de coque', async () => {
    const maxHp = HULLS.cargo_l.armorHp;
    const start = maxHp / 2;
    const id = await shipWith(`a-bay-${run}`, ['fab_bay'], { steel_l: 30 }, { hullHp: start });
    const before = await ship(id);
    expect(Number(before.hull_hp)).toBe(start);
    await setConversion(pool, owner, id, { itemKey: 'fab_bay', runPct: 100 }, FAST);
    await drainEdges();
    const s = await ship(id);
    // Plein : hull_hp = maxHp, runPct → 0, acier débité (0,5 T/%).
    expect(Number(s.hull_hp)).toBeCloseTo(maxHp, 0);
    expect(s.conversions.fab_bay.runPct).toBe(0);
    expect(Number(s.cargo.steel_l)).toBeLessThan(30);
  });
});

describe('W9e — batch « recette »', () => {
  it('smelting_run : 20 junk consommés à l\'activation → 11 steel_l au terme (zéro fuel)', async () => {
    const id = await shipWith(`a-smelt-${run}`, ['smelting_run'], { junk: 20 });
    const fuelBefore = Number((await ship(id)).fuel.cold);
    await setConversion(
      pool, owner, id,
      { itemKey: 'smelting_run', runPct: 100 },
      { timeScale: 1 },
    );
    expect((await ship(id)).cargo.junk ?? 0).toBe(0);
    await forceBatchTerm(id, 'smelting_run');
    const s = await ship(id);
    expect(s.conversions.smelting_run).toBeUndefined();
    expect(Number(s.cargo.steel_l)).toBeCloseTo(11, 6);
    expect(Number(s.fuel.cold)).toBeCloseTo(fuelBefore, 0);
  });

  it('hull_patch_kit : 1 T steel_l → +25 % des HP MAX au terme, borné au plein', async () => {
    const maxHp = HULLS.cargo_l.armorHp;
    const start = maxHp / 2;
    const id = await shipWith(`a-patch-${run}`, ['hull_patch_kit'], { steel_l: 2 }, { hullHp: start });
    await setConversion(
      pool, owner, id,
      { itemKey: 'hull_patch_kit', runPct: 100 },
      { timeScale: 1 },
    );
    const mid = await ship(id);
    expect(Number(mid.cargo.steel_l)).toBeCloseTo(1, 6);
    await forceBatchTerm(id, 'hull_patch_kit');
    const s = await ship(id);
    expect(Number(s.hull_hp)).toBeCloseTo(start + 0.25 * maxHp, 0);
    expect(s.conversions.hull_patch_kit).toBeUndefined();
  });
});

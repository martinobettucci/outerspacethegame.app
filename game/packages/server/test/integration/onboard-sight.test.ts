/** @verifies This test file verifies: docs/MASTER_PLAN.md §W4; docs/BACKLOG.md §P3 “Sondes v3”; GAME_BOOK.md §4/§14; DESIGN_GUIDE.md §8.1-v3. */
/**
 * Intégration W4 : vue de bord des sondes L2/L3 (MASTER_PLAN W4, JOURNAL
 * 2026-07-21) sur vraie base — une sonde L2+ embarque un télescope L1 :
 * ciel 260 pc CONTINU autour d'elle (y compris EN TRANSIT, position
 * interpolée) ; une L1 garde son scan d'arrivée 60 pc.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import { visibleBodies } from '../../src/services/world.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let starter = '';
/** Corps témoin loin de tout scope du joueur. */
let far = { id: '', x: 0, y: 0 };

/** Sonde posée à l'arrêt par SQL (fixture — le vol libre est couvert par
 *  ships.test ; ici on isole la règle de SCOPE). */
async function insertProbe(
  level: number,
  x: number,
  y: number,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ships (owner_id, hull_category, name, x, y, status,
                        probe_level, fuel)
     VALUES ($1, 'probe', 'Eye', $2, $3, 'idle', $4, '{"cold": 10}')
     RETURNING id`,
    [owner, x, y, level],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `sight-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Farseer',
    politics: 'scientific',
    universeSeed: `sight-universe-${run}`,
  });
  owner = a.playerId;
  starter = a.spawn.starterPlanetId;
  // Corps témoin : n'importe quel corps à > 400 pc du starter (hors de
  // tout scope de départ : ciel 60 + coques locales).
  const { rows } = await pool.query(
    `SELECT b.id, b.x, b.y FROM bodies b
     WHERE b.owner_id IS DISTINCT FROM $1
       AND (b.x - (SELECT x FROM bodies WHERE id = $2))^2
         + (b.y - (SELECT y FROM bodies WHERE id = $2))^2 > 400^2
     ORDER BY (b.x - (SELECT x FROM bodies WHERE id = $2))^2
            + (b.y - (SELECT y FROM bodies WHERE id = $2))^2
     LIMIT 1`,
    [owner, starter],
  );
  expect(rows[0]).toBeTruthy();
  far = { id: rows[0].id, x: Number(rows[0].x), y: Number(rows[0].y) };
});

afterAll(async () => {
  await pool.end();
});

describe('W4 — vue de bord des sondes L2/L3', () => {
  it('témoin : le corps lointain est INVISIBLE sans sonde à proximité', async () => {
    const seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far.id)).toBe(false);
  });

  it('L1 à 100 pc du témoin : toujours invisible (scan 60 pc)', async () => {
    const p = await insertProbe(1, far.x + 100, far.y);
    const seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far.id)).toBe(false);
    await pool.query(`DELETE FROM ships WHERE id = $1`, [p]);
  });

  it('L2 à 100 pc du témoin : VISIBLE (ciel de bord 260 pc) — et plus au-delà', async () => {
    const p = await insertProbe(2, far.x + 100, far.y);
    const seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far.id)).toBe(true);
    // Au-delà de 260 pc, le ciel de bord ne porte plus.
    await pool.query(`UPDATE ships SET x = $2 WHERE id = $1`, [p, far.x + 270]);
    const seen2 = await visibleBodies(pool, owner);
    expect(seen2.some((b) => b.id === far.id)).toBe(false);
    await pool.query(`DELETE FROM ships WHERE id = $1`, [p]);
  });

  it('CONTINU en transit : une L3 à mi-vol voit ce que son point médian couvre', async () => {
    // Mission traversant le voisinage du témoin : à mi-vol (interpolé),
    // la sonde est à 100 pc du corps — départ il y a 1 h, arrivée dans 1 h.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, name, x, y, status,
                          probe_level, fuel,
                          origin_x, origin_y, dest_x, dest_y,
                          departed_at, arrives_at)
       VALUES ($1, 'probe', 'Comet', $2, $3, 'transit', 3, '{"cold": 10}',
               $2, $3, $4, $5,
               now() - interval '1 hour', now() + interval '1 hour')
       RETURNING id`,
      [owner, far.x + 100 - 500, far.y, far.x + 100 + 500, far.y],
    );
    const seen = await visibleBodies(pool, owner);
    expect(seen.some((b) => b.id === far.id)).toBe(true);
    // La même mission au DÉPART (t0 = maintenant) : le point interpolé
    // est à 500 pc — rien.
    await pool.query(
      `UPDATE ships SET departed_at = now(), arrives_at = now() + interval '2 hour'
       WHERE id = $1`,
      [rows[0]!.id],
    );
    const seen2 = await visibleBodies(pool, owner);
    expect(seen2.some((b) => b.id === far.id)).toBe(false);
  });
});

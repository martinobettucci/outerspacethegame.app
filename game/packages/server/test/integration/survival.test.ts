/**
 * Intégration horloges de survie (GB §6, DG §3.5) : drain armé selon le
 * statut et l'équipage, alarme 25 % → auto-flee-home (armée par défaut,
 * désarmable), survival_out → équipage MORT (host-fate) + coque DERELICT
 * dépouillée (owner NULL, disparue de la flotte), refus directs (§10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { registerPlayer } from '../../src/services/players.js';
import {
  assignCrew,
  fleet,
  relocateShipForTest,
  setFleePolicy,
  setShipSurvivalForTest,
} from '../../src/services/ships.js';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers, survivalLow } from '../../src/sim/handlers.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let ownerStarter = '';
let cargo = '';
let other = '';

const handlers = { ...baseHandlers(), survival_low: survivalLow(7200) };

async function ship(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function pendingSurvivalEvents(id: string) {
  const { rows } = await pool.query(
    `SELECT kind, due_at FROM events
     WHERE processed_at IS NULL AND kind IN ('survival_low', 'survival_out')
       AND payload->>'shipId' = $1 ORDER BY due_at`,
    [id],
  );
  return rows;
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `sv-owner-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Survivor',
    politics: 'industrialist',
    universeSeed: `sv-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `sv-other-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Other',
    politics: 'mercantile',
    universeSeed: `sv-universe-${run}`,
  });
  owner = a.playerId;
  ownerStarter = a.spawn.starterPlanetId;
  cargo = a.spawn.cargoShipId;
  other = b.playerId;
  // Le pilote de départ embarque (équipage = 1) — vraie commande.
  const { rows: npcs } = await pool.query(
    `SELECT id FROM npcs WHERE owner_id = $1 AND role = 'pilot' LIMIT 1`,
    [owner],
  );
  await assignCrew(pool, owner, cargo, npcs[0].id);
});

afterAll(async () => {
  await pool.end();
});

describe('drain selon statut et équipage', () => {
  it('à quai : aucun drain ; en survol de SON monde SERVI : exempt (chunk AE)', async () => {
    let s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBe(0);
    // Le monde nourrit (chunk AE) : familles food+water en stock, puis
    // entrée en survol par l'instrumentation (recompute inclus, §15).
    for (const res of ['food_1', 'water']) {
      await pool.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, 300, now())
         ON CONFLICT (body_id, resource)
           DO UPDATE SET amount_t = 300, rate_t_per_day = 0, as_of = now()`,
        [ownerStarter, res],
      );
    }
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 2, waterT: 2 });
    await relocateShipForTest(pool, owner, cargo, ownerStarter);
    s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBe(0); // servi : exempt
  });

  it('en survol ÉTRANGER : −0.01 T/j par membre, bords low + out planifiés', async () => {
    const { rows: foreign } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id = $1 AND body_type = 'planet' LIMIT 1`,
      [other],
    );
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL,
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [cargo, foreign[0].id],
    );
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 0.1, waterT: 0.1 });
    const s = await ship(cargo);
    expect(Number(s.survival_rate_t_per_day)).toBeCloseTo(-0.01, 9);
    const events = await pendingSurvivalEvents(cargo);
    expect(events.map((e) => e.kind)).toEqual(['survival_low', 'survival_out']);
  });

  it('§10 : l\'instrumentation et la politique ne touchent pas la coque d\'autrui', async () => {
    await expect(
      setShipSurvivalForTest(pool, other, cargo, { foodT: 5, waterT: 5 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(setFleePolicy(pool, other, cargo, false)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

describe('alarme 25 % : auto-flee-home (anti-extorsion DG §3.5)', () => {
  it('armée : la coque prend la route du monde possédé le plus proche', async () => {
    // Survol d'un monde SAUVAGE de SA poche (≤ 60 pc garanti au spawn) :
    // la fuite est À PORTÉE quel que soit le roll — le voisin étranger
    // (150-240 pc) pourrait dépasser l'autonomie.
    const { rows: wild } = await pool.query(
      `SELECT b.id FROM bodies b
       WHERE b.owner_id IS NULL AND b.body_type = 'planet'
       ORDER BY (b.x - (SELECT x FROM bodies WHERE id = $1))^2
              + (b.y - (SELECT y FROM bodies WHERE id = $1))^2 LIMIT 1`,
      [ownerStarter],
    );
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL,
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [cargo, wild[0].id],
    );
    // Provisions au-dessus du seuil (cap Cargo S = 14 j × 0.01 = 0.14 T ;
    // seuil 25 % = 0.035 T) — l'alarme est planifiée, on la force à MAINTENANT.
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 0.05, waterT: 0.05 });
    await pool.query(
      `UPDATE ships SET fuel = '{"cold": 40}' WHERE id = $1`,
      [cargo],
    );
    await pool.query(
      `UPDATE events SET due_at = now() - interval '1 second'
       WHERE processed_at IS NULL AND kind = 'survival_low'
         AND payload->>'shipId' = $1`,
      [cargo],
    );
    await processDueEvents(pool, handlers);
    const s = await ship(cargo);
    expect(s.status).toBe('transit');
    expect(s.dest_body_id).toBe(ownerStarter);
    // La survie court toujours en transit.
    expect(Number(s.survival_rate_t_per_day)).toBeCloseTo(-0.01, 9);
  });

  it('désarmée : l\'alarme ne fait rien (le propriétaire assume)', async () => {
    // Retour en survol étranger, politique désarmée.
    const { rows: foreign } = await pool.query(
      `SELECT id FROM bodies WHERE owner_id = $1 AND body_type = 'planet' LIMIT 1`,
      [other],
    );
    await pool.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, origin_x = NULL, dest_x = NULL,
         dest_body_id = NULL, departed_at = NULL, arrives_at = NULL,
         x = (SELECT x FROM bodies WHERE id = $2),
         y = (SELECT y FROM bodies WHERE id = $2)
       WHERE id = $1`,
      [cargo, foreign[0].id],
    );
    await setFleePolicy(pool, owner, cargo, false);
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 0.05, waterT: 0.05 });
    await pool.query(
      `UPDATE events SET due_at = now() - interval '1 second'
       WHERE processed_at IS NULL AND kind = 'survival_low'
         AND payload->>'shipId' = $1`,
      [cargo],
    );
    await processDueEvents(pool, handlers);
    const s = await ship(cargo);
    expect(s.status).toBe('hovering'); // pas de fuite
  });
});

describe('survival_out : host-fate + derelict dépouillé', () => {
  it('équipage mort, owner NULL, disparue de la flotte, drains désarmés', async () => {
    await setShipSurvivalForTest(pool, owner, cargo, { foodT: 1e-8, waterT: 1e-8 });
    // L'échéance réelle est à ~86 ms (1e-8 T à 0.01 T/j) : on la laisse
    // venir — la forcer AVANT as_of ferait remonter l'évaluation
    // au-dessus de la garde d'idempotence du handler.
    await new Promise((r) => setTimeout(r, 300));
    await processDueEvents(pool, handlers);
    const s = await ship(cargo);
    expect(s.status).toBe('derelict');
    expect(s.owner_id).toBeNull();
    expect(Number(s.survival_rate_t_per_day)).toBe(0);
    expect(Number(s.fuel_rate_u_per_day)).toBe(0);
    const { rows: crew } = await pool.query(
      `SELECT 1 FROM npcs WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
      [cargo],
    );
    expect(crew).toHaveLength(0);
    const mine = await fleet(pool, owner);
    expect(mine.find((sh) => sh.id === cargo)).toBeUndefined();
  });

  it('idempotent : un second survival_out ne fait rien', async () => {
    await pool.query(
      `INSERT INTO events (due_at, kind, payload)
       VALUES (now() - interval '1 second', 'survival_out', $1)`,
      [JSON.stringify({ shipId: cargo })],
    );
    await processDueEvents(pool, handlers);
    const s = await ship(cargo);
    expect(s.status).toBe('derelict');
  });
});

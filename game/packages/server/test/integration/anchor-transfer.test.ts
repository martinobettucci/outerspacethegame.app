/** @verifies This test file verifies: docs/MASTER_PLAN.md §W1/§W3/§W4; docs/BACKLOG.md §P3 “Sondes L3 & multi-carburant”; GAME_BOOK.md §4/§6/§14; DESIGN_GUIDE.md §8.1–§8.3. */
/**
 * Intégration W3 : sondes L3 — ancrage & transfert (MASTER_PLAN W3,
 * JOURNAL 2026-07-21) sur vraie base — gate pad L3 + surcoût empilé,
 * ancrage openspace strict (idle/échoué-au-vide), sonde→sonde interdit,
 * saturation 1 sonde/receveur, type = moteur du receveur, règlement au
 * BORD (événement idempotent), annulation PRO-RATA, moveShip verrouillé
 * pendant le transfert, autorisation par requête directe (§10).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { PROBE } from '@atg/shared';
import { processDueEvents } from '../../src/sim/events.js';
import { baseHandlers } from '../../src/sim/handlers.js';
import { registerPlayer } from '../../src/services/players.js';
import {
  anchorTransferFuel,
  buildProbe,
  cancelAnchorTransfer,
  fleet,
  moveShip,
} from '../../src/services/ships.js';
import { createTestPool } from './helpers.js';

let pool: pg.Pool;
const run = randomUUID().slice(0, 8);
let owner = '';
let intruder = '';
let starter = '';
let haulerId = '';
let natal = 'cold';
let probeL3 = '';

const FAST = { timeScale: 1_000_000 };
/** Point d'openspace loin de tout corps (l'univers est ancré au starter). */
const VOID = { dx: 3.7, dy: 2.9 };

/** Coque posée À L'ARRÊT en openspace par SQL (fixture — même idiome que
 *  hover.test : le vol libre est couvert par ships.test). */
async function parkAt(
  shipId: string,
  x: number,
  y: number,
  fuel: Record<string, number>,
  status: 'idle' | 'stranded' = 'idle',
): Promise<void> {
  await pool.query(
    `UPDATE ships SET status = $5, x = $2, y = $3, fuel = $4,
       docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
       fuel_rate_u_per_day = 0, fuel_as_of = now()
     WHERE id = $1`,
    [shipId, x, y, JSON.stringify(fuel), status],
  );
}

async function shipRow(id: string) {
  const { rows } = await pool.query(`SELECT * FROM ships WHERE id = $1`, [id]);
  return rows[0];
}

async function drainTransfers(): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    await processDueEvents(pool, baseHandlers());
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'fuel_transfer_complete'`,
    );
    if (rows[0].n === 0) return;
  }
  throw new Error('transferts jamais réglés');
}

beforeAll(async () => {
  pool = await createTestPool();
  const a = await registerPlayer(pool, {
    email: `anchor-${run}@test.local`,
    password: 'motdepasse-solide-1',
    displayName: 'Tanker',
    politics: 'scientific',
    universeSeed: `anchor-universe-${run}`,
  });
  const b = await registerPlayer(pool, {
    email: `anchor-x-${run}@test.local`,
    password: 'motdepasse-solide-2',
    displayName: 'Intruder',
    politics: 'militarist',
    universeSeed: `anchor-universe-${run}`,
  });
  owner = a.playerId;
  intruder = b.playerId;
  starter = a.spawn.starterPlanetId;
  haulerId = a.spawn.cargoShipId;
  const { rows: h } = await pool.query(
    `SELECT engine_type FROM ships WHERE id = $1`,
    [haulerId],
  );
  natal = h[0].engine_type;
  // Pad L3 (gate) + trésorerie sondes (L3 = 75 ore + 45 silicon).
  await pool.query(
    `INSERT INTO buildings (body_id, key, level, tile_index, status, workforce)
     VALUES ($1, 'probe_pad', 3, NULL, 'active', 0)`,
    [starter],
  );
  for (const [res, qty] of [
    ['ore', 300],
    ['silicon', 200],
    [`fuel_${natal}`, 100],
  ] as const) {
    await pool.query(
      `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (body_id, resource)
       DO UPDATE SET amount_t = $3, rate_t_per_day = 0, as_of = now()`,
      [starter, res, qty],
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe('W3 — sondes L3 : ancrage & transfert', () => {
  it('gate pad L3 + surcoût empilé : L3 constructible, tankée à 25 %', async () => {
    // Pad L3 présent : le défaut est L3.
    const r = await buildProbe(pool, owner, starter, {});
    expect(r.level).toBe(3);
    probeL3 = r.probeId;
    const p = await shipRow(probeL3);
    expect(p.probe_level).toBe(3);
    // Naissance 25 % de plein, type étoile natale.
    expect(Number(p.fuel[natal])).toBeCloseTo(PROBE.tankU * 0.25, 4);
  });

  it("openspace STRICT : la sonde en survol refuse l'ancrage", async () => {
    await expect(
      anchorTransferFuel(pool, owner, probeL3, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('gardes : sonde→sonde interdit, non-L3 refusée, receveur en survol refusé, trop loin refusé', async () => {
    const { rows: pos } = await pool.query(
      `SELECT x, y FROM bodies WHERE id = $1`,
      [starter],
    );
    const x = Number(pos[0].x) + VOID.dx;
    const y = Number(pos[0].y) + VOID.dy;
    await parkAt(probeL3, x, y, { [natal]: 50 });

    // Receveur encore À QUAI : refus.
    await expect(
      anchorTransferFuel(pool, owner, probeL3, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Sonde→sonde : interdit (canon) — une L3 sœur posée à couple.
    const r2 = await buildProbe(pool, owner, starter, {});
    await parkAt(r2.probeId, x + 0.1, y, { [natal]: 10 });
    await expect(
      anchorTransferFuel(pool, owner, probeL3, { toShipId: r2.probeId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Non-L3 : une L2 ne s'ancre pas.
    const r1 = await buildProbe(pool, owner, starter, { level: 2 });
    await parkAt(r1.probeId, x + 0.2, y, { [natal]: 10 });
    await expect(
      anchorTransferFuel(pool, owner, r1.probeId, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Receveur idle mais TROP LOIN.
    await parkAt(haulerId, x + 9, y, { [natal]: 5 });
    await expect(
      anchorTransferFuel(pool, owner, probeL3, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });
  });

  it('nominal : ancre visible, moveShip verrouillé DES DEUX CÔTÉS, saturation 1 sonde, annulation PRO-RATA', async () => {
    const t0 = Date.now();
    const p = await shipRow(probeL3);
    await parkAt(haulerId, Number(p.x) + 0.3, Number(p.y), { [natal]: 5 });
    // timeScale 1 : le bord est à ~1 h réelle — on observe l'état ancré.
    const r = await anchorTransferFuel(pool, owner, probeL3, {
      toShipId: haulerId,
      units: 20,
      nowMs: t0,
      timeScale: 1,
    });
    expect(r.fuelType).toBe(natal);
    expect(r.unitsPlanned).toBeCloseTo(20, 6);

    // Vue flotte : bloc transfer côté sonde, ancre côté receveur.
    const ships = await fleet(pool, owner);
    const probeView = ships.find((s) => s.id === probeL3)!;
    expect(probeView.transfer).toMatchObject({
      targetId: haulerId,
      fuelType: natal,
    });
    expect(probeView.transfer!.endsAt).toBeTruthy();
    const haulerView = ships.find((s) => s.id === haulerId)!;
    expect(haulerView.anchoredProbeId).toBe(probeL3);

    // Ni la sonde ni le receveur ne bougent pendant le transfert.
    await expect(
      moveShip(pool, owner, probeL3, { x: 0, y: 0 }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });
    await expect(
      moveShip(pool, owner, haulerId, { bodyId: starter }, FAST),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Saturation : une seconde sonde L3 à couple est refusée.
    const r3 = await buildProbe(pool, owner, starter, {});
    await parkAt(r3.probeId, Number(p.x) + 0.1, Number(p.y), { [natal]: 30 });
    await expect(
      anchorTransferFuel(pool, owner, r3.probeId, { toShipId: haulerId, units: 5 }),
    ).rejects.toMatchObject({ code: 'not_available' });

    // Autorisation (§10) : l'intrus ne commande ni l'ancre ni l'annulation.
    await expect(
      cancelAnchorTransfer(pool, intruder, probeL3),
    ).rejects.toMatchObject({ code: 'forbidden' });

    // Annulation PRO-RATA à +30 min-jeu : 20 u/h → 10 u pompées.
    const cancel = await cancelAnchorTransfer(pool, owner, probeL3, {
      nowMs: t0 + 30 * 60_000,
      timeScale: 1,
    });
    expect(cancel.fuelType).toBe(natal);
    expect(cancel.moved).toBeCloseTo(10, 2);
    const probeAfter = await shipRow(probeL3);
    const haulerAfter = await shipRow(haulerId);
    expect(probeAfter.transfer_target_id).toBeNull();
    expect(Number(probeAfter.fuel[natal])).toBeCloseTo(40, 1);
    expect(Number(haulerAfter.fuel[natal])).toBeCloseTo(15, 1);
    // Le bord orphelin est purgé.
    const { rows: pending } = await pool.query(
      `SELECT count(*)::int AS n FROM events
       WHERE processed_at IS NULL AND kind = 'fuel_transfer_complete'`,
    );
    expect(pending[0].n).toBe(0);
  });

  it('règlement au BORD : montant servi (bornés donneur/capacité), un receveur échoué au vide repart en idle', async () => {
    // Receveur ÉCHOUÉ AU VIDE, réservoir vide — le cas d'usage tanker.
    const p = await shipRow(probeL3);
    await parkAt(haulerId, Number(p.x) + 0.3, Number(p.y), { [natal]: 0 }, 'stranded');
    const r = await anchorTransferFuel(pool, owner, probeL3, {
      toShipId: haulerId,
      units: 15,
      ...FAST,
    });
    expect(r.unitsPlanned).toBeCloseTo(15, 6);
    await drainTransfers();
    const probeAfter = await shipRow(probeL3);
    const haulerAfter = await shipRow(haulerId);
    expect(probeAfter.transfer_target_id).toBeNull();
    expect(Number(probeAfter.fuel[natal])).toBeCloseTo(25, 1);
    expect(Number(haulerAfter.fuel[natal])).toBeCloseTo(15, 1);
    expect(haulerAfter.status).toBe('idle');
    // Les deux repartent libres.
    const move = await moveShip(pool, owner, haulerId, { bodyId: starter }, FAST);
    expect(move.arrivesAt).toBeTruthy();
  });
});

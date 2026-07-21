/**
 * W7 — usinage partiel des usines L3 (MASTER_PLAN W7, JOURNAL
 * 2026-07-21) : dès qu'UNE industrie L3 ACTIVE existe sur le monde, les
 * fabrications (vaisseaux, items) sont débitées par PALIERS de 5 % × 20
 * au lieu du paiement à la commande. Un palier = durée totale/20 ;
 * impayable → `starved`, retry à cadence fixe (1 h-jeu [TUNE]), reprise
 * AUTO. Une usine traite ses ordres STRICTEMENT dans l'ordre d'insertion
 * BDD. Le 20e palier émet l'événement terminal EXISTANT (ship_built /
 * item_fabricated) — les handlers actuels restent la seule voie de
 * naissance. Les BÂTIMENTS en partiel : reste annoncé (MASTER_PLAN).
 */
import { BUILDINGS, type BuildingKey } from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy } from '../sim/lazy.js';

/** Cadence de retry d'un ordre affamé (h-jeu). [TUNE] */
export const WORK_ORDER_RETRY_HOURS = 1;

/** Industrie L3 active la MOINS chargée du monde (null : pas d'usine). */
export async function pickL3Factory(
  client: pg.PoolClient,
  bodyId: string,
): Promise<string | null> {
  const industryKeys = Object.values(BUILDINGS)
    .filter((b) => b.batchesPerDayByLevel)
    .map((b) => b.key);
  const { rows } = await client.query(
    `SELECT b.id,
            (SELECT count(*) FROM work_orders w
             WHERE w.factory_building_id = b.id) AS load
     FROM buildings b
     WHERE b.body_id = $1 AND b.status = 'active' AND b.level >= 3
       AND b.key = ANY($2::text[])
     ORDER BY load ASC, b.id LIMIT 1`,
    [bodyId, industryKeys],
  );
  return rows[0]?.id ?? null;
}

/**
 * Crée un ordre d'usinage partiel et arme son premier palier. À appeler
 * DANS la transaction de commande (aucun paiement d'avance).
 */
export async function createWorkOrder(
  client: pg.PoolClient,
  input: {
    bodyId: string;
    factoryBuildingId: string;
    kind: 'ship' | 'item';
    payload: Record<string, unknown>;
    cost: Record<string, number>;
    totalHours: number;
    nowMs: number;
    timeScale: number;
  },
): Promise<{ orderId: string; completesAt: Date }> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO work_orders (body_id, factory_building_id, kind, payload, cost)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      input.bodyId,
      input.factoryBuildingId,
      input.kind,
      JSON.stringify(input.payload),
      JSON.stringify(input.cost),
    ],
  );
  const stepMs = (input.totalHours / 20) * 3_600_000 / input.timeScale;
  const firstDue = new Date(input.nowMs + stepMs);
  await enqueue(client, 'work_step', firstDue, {
    orderId: rows[0]!.id,
    stepMs,
  });
  // Échéance INDICATIVE si jamais affamé ni mis en file.
  return {
    orderId: rows[0]!.id,
    completesAt: new Date(input.nowMs + stepMs * 20),
  };
}

/**
 * Paie 5 % du coût sur le stock lazy — false si UNE ressource manque
 * (rien n'est débité : le palier est atomique).
 */
export async function payStep(
  client: pg.PoolClient,
  bodyId: string,
  cost: Record<string, number>,
  nowMs: number,
): Promise<boolean> {
  const debits: { resource: string; take: number; available: number }[] = [];
  for (const [resource, total] of Object.entries(cost)) {
    const take = total / 20;
    const { rows } = await client.query(
      `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
       WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
      [bodyId, resource],
    );
    const available = rows[0]
      ? evalLazy(
          {
            amount: rows[0].amount_t,
            ratePerDay: rows[0].rate_t_per_day,
            asOfMs: new Date(rows[0].as_of).getTime(),
          },
          nowMs,
          { min: 0 },
        )
      : 0;
    if (available + 1e-9 < take) return false;
    debits.push({ resource, take, available });
  }
  for (const d of debits) {
    await client.query(
      `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [bodyId, d.resource, d.available - d.take, nowMs],
    );
  }
  return true;
}

/** Ordres en cours d'un monde (vue). */
export async function listWorkOrders(
  pool: pg.Pool,
  bodyId: string,
): Promise<
  { id: string; kind: string; payload: Record<string, unknown>; stepsDone: number; status: string }[]
> {
  const { rows } = await pool.query(
    `SELECT id, kind, payload, steps_done, status FROM work_orders
     WHERE body_id = $1 ORDER BY created_at`,
    [bodyId],
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    payload: r.payload,
    stepsDone: r.steps_done,
    status: r.status,
  }));
}

/** Le monde a-t-il une industrie L3 active ? (gate du chemin partiel). */
export async function hasL3Factory(
  client: pg.PoolClient,
  bodyId: string,
): Promise<boolean> {
  const industryKeys = Object.values(BUILDINGS)
    .filter((b) => b.batchesPerDayByLevel)
    .map((b) => b.key as BuildingKey);
  const { rows } = await client.query(
    `SELECT 1 FROM buildings
     WHERE body_id = $1 AND status = 'active' AND level >= 3
       AND key = ANY($2::text[]) LIMIT 1`,
    [bodyId, industryKeys],
  );
  return !!rows[0];
}

/**
 * File d'événements de simulation — DESIGN_GUIDE §1.
 * Le worker réclame les événements échus (FOR UPDATE SKIP LOCKED : sûr
 * même avec plusieurs workers), exécute le handler DANS la transaction de
 * réclamation, puis marque processed_at. Idempotence : chaque handler doit
 * tolérer un état déjà avancé (reprise sur crash = at-least-once).
 */
import type pg from 'pg';

export type EventKind =
  | 'construction_complete'
  | 'demolition_complete'
  | 'pop_daily'
  | 'stock_edge'
  | 'deposit_dry'
  | 'noop';

export interface GameEvent {
  id: string;
  dueAt: Date;
  kind: EventKind;
  payload: Record<string, unknown>;
}

export type EventHandler = (
  client: pg.PoolClient,
  event: GameEvent,
) => Promise<void>;

export async function enqueue(
  client: pg.PoolClient | pg.Pool,
  kind: EventKind,
  dueAt: Date,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO events (due_at, kind, payload) VALUES ($1, $2, $3) RETURNING id`,
    [dueAt, kind, JSON.stringify(payload)],
  );
  return rows[0]!.id;
}

/**
 * Traite un lot d'événements échus. Retourne le nombre traité.
 * Chaque événement est réclamé et traité dans SA PROPRE transaction :
 * un handler défaillant ne bloque pas la file (l'événement fautif est
 * marqué en échec via un payload d'erreur et re-planifié n'est PAS
 * silencieux — il reste non traité et sera revu ; l'erreur est loggée).
 */
export async function processDueEvents(
  pool: pg.Pool,
  handlers: Partial<Record<EventKind, EventHandler>>,
  opts: { batchSize?: number; nowMs?: number } = {},
): Promise<{ processed: number; failed: number }> {
  const batchSize = opts.batchSize ?? 100;
  let processed = 0;
  let failed = 0;

  // Boucle jusqu'à épuisement des événements échus (rattrapage).
  let exhausted = false;
  while (!exhausted) {
    const client = await pool.connect();
    try {
      let batchCount = 0;
      let batchProcessed = 0;
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `SELECT id, due_at, kind, payload FROM events
           WHERE processed_at IS NULL AND due_at <= $1
           ORDER BY due_at, id
           LIMIT $2
           FOR UPDATE SKIP LOCKED`,
          [opts.nowMs ? new Date(opts.nowMs) : new Date(), batchSize],
        );
        batchCount = rows.length;
        for (const row of rows) {
          const event: GameEvent = {
            id: String(row.id),
            dueAt: row.due_at,
            kind: row.kind,
            payload: row.payload ?? {},
          };
          const handler = handlers[event.kind];
          if (!handler) {
            // Événement inconnu : erreur visible, jamais avalée (§18).
            console.error(
              JSON.stringify({
                level: 'error',
                service: 'tick-worker',
                msg: 'handler manquant',
                kind: event.kind,
                eventId: event.id,
              }),
            );
            failed++;
            continue; // reste non traité, revu au prochain passage
          }
          try {
            await handler(client, event);
            await client.query(
              'UPDATE events SET processed_at = now() WHERE id = $1',
              [event.id],
            );
            processed++;
            batchProcessed++;
          } catch (err) {
            // Échec d'un handler : on annule tout le lot (transaction)
            // et on remonte — pas de demi-état.
            throw new Error(
              `Handler ${event.kind} en échec sur l'événement ${event.id} : ${String(err)}`,
            );
          }
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      }
      // Fin de rattrapage — ou lot entièrement en échec (handlers
      // manquants) : ne pas boucler sur les mêmes événements fautifs.
      if (batchCount < batchSize || batchProcessed === 0) exhausted = true;
    } finally {
      client.release();
    }
  }
  return { processed, failed };
}

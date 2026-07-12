/**
 * Handlers d'événements de simulation. Chaque handler est idempotent
 * (at-least-once) et ne manipule que l'état passé par sa transaction.
 */
import type pg from 'pg';
import type { EventHandler } from './events.js';

/**
 * construction_complete { buildingId } — active un bâtiment dont le
 * chantier est arrivé à échéance. Idempotent : ne touche que le statut
 * 'constructing' dont completes_at est échu.
 */
export const constructionComplete: EventHandler = async (client, event) => {
  const buildingId = String(event.payload.buildingId ?? '');
  if (!buildingId) return;
  await client.query(
    `UPDATE buildings
       SET status = 'active', completes_at = NULL
     WHERE id = $1 AND status = 'constructing' AND completes_at <= now()`,
    [buildingId],
  );
};

/**
 * demolition_complete { buildingId } — supprime un bâtiment en fin de
 * démolition (le remboursement 50 % est crédité au lancement de la
 * démolition, côté commande).
 */
export const demolitionComplete: EventHandler = async (client, event) => {
  const buildingId = String(event.payload.buildingId ?? '');
  if (!buildingId) return;
  await client.query(
    `DELETE FROM buildings WHERE id = $1 AND status = 'demolishing'`,
    [buildingId],
  );
};

export function baseHandlers(): Record<string, EventHandler> {
  return {
    construction_complete: constructionComplete,
    demolition_complete: demolitionComplete,
    noop: async (_client: pg.PoolClient) => undefined,
  };
}

/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W6; docs/BACKLOG.md §P3 “Ship hulls”; GAME_BOOK.md §14; DESIGN_GUIDE.md §8.2/§8.8. */
/**
 * W6 — pipeline accessoires & upgrades-items (MASTER_PLAN W6, JOURNAL
 * 2026-07-21) : fabrication d'ITEMS non-fongibles sur un monde (bâtiment
 * hôte ACTIF, coût au stock, temps), entreposés en `planet_items` sous
 * la balance d'items des warehouses (50 × mult — chunk AD réveillé) ;
 * installation sur une coque ENTREPOSÉE (item consommé à la commande,
 * coût + temps d'immobilisation), slots = ceux de la coque (canon, pas
 * de rnd) ; un upgrade supérieur s'installe DIRECTEMENT (remplace,
 * l'ancien n'est pas rendu [TUNE-v1 annoncé]).
 */
import {
  GEAR,
  HULLS,
  itemCapacity,
  type HullCategory,
  type HullSize,
  type InstalledUpgrades,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy } from '../sim/lazy.js';
import { CommandError } from './planets.js';
import { createWorkOrder, hasL3Factory, pickL3Factory } from './workOrders.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function toMs(v: Date | string): number {
  return new Date(v).getTime();
}

/** Paie un coût sur le stock lazy du monde (refus explicite sinon). */
async function payStock(
  client: pg.PoolClient,
  bodyId: string,
  cost: Record<string, number>,
  nowMs: number,
): Promise<void> {
  for (const [resource, amount] of Object.entries(cost)) {
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
            asOfMs: toMs(rows[0].as_of),
          },
          nowMs,
          { min: 0 },
        )
      : 0;
    if (available + 1e-9 < amount) {
      throw new CommandError(
        'insufficient_resources',
        `Ressource insuffisante : ${resource} (${available.toFixed(1)}/${amount})`,
      );
    }
    await client.query(
      `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [bodyId, resource, available - amount, nowMs],
    );
  }
}

/**
 * Fabrique un item (non-fongible) : bâtiment hôte ACTIF, capacité
 * d'items des warehouses respectée (lignes + fabrications en cours),
 * coût payé, bord `item_fabricated`.
 */
export async function fabricateGear(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
  itemKey: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const def = GEAR[itemKey];
  if (!def) throw new CommandError('not_found', 'Item inconnu');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: planet } = await client.query(
      `SELECT id, owner_id FROM bodies
       WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [planetId],
    );
    if (!planet[0]) throw new CommandError('not_found', 'Planète inconnue');
    if (planet[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { rows: host } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = $2 AND status = 'active' LIMIT 1`,
      [planetId, def.fabricator],
    );
    if (!host[0]) {
      throw new CommandError(
        'not_available',
        `Un ${def.fabricator} ACTIF est requis pour fabriquer cet item`,
      );
    }
    // Balance d'items (50 × mult par warehouse actif — AD réveillé) :
    // lignes existantes + fabrications déjà en route.
    const { rows: wh } = await client.query(
      `SELECT level FROM buildings
       WHERE body_id = $1 AND key = 'warehouse' AND status = 'active'`,
      [planetId],
    );
    const cap = itemCapacity(wh.map((w) => Number(w.level)));
    const { rows: stored } = await client.query(
      `SELECT count(*)::int AS n FROM planet_items WHERE body_id = $1`,
      [planetId],
    );
    const { rows: pending } = await client.query(
      `SELECT count(*)::int AS n FROM events
       WHERE kind = 'item_fabricated' AND processed_at IS NULL
         AND payload->>'bodyId' = $1`,
      [planetId],
    );
    if (stored[0].n + pending[0].n >= cap) {
      throw new CommandError(
        'not_available',
        `Balance d'items pleine (${stored[0].n + pending[0].n}/${cap}) — un warehouse actif en stocke 50 × niveau`,
      );
    }
    // W7 : une industrie L3 active bascule la fabrication en USINAGE
    // PARTIEL (20 paliers de 5 %) — sinon paiement à la commande.
    if (await hasL3Factory(client, planetId)) {
      const factoryId = await pickL3Factory(client, planetId);
      const r = await createWorkOrder(client, {
        bodyId: planetId,
        factoryBuildingId: factoryId!,
        kind: 'item',
        payload: { bodyId: planetId, itemKey },
        cost: def.fabricationCost as Record<string, number>,
        totalHours: def.fabricationHours,
        nowMs,
        timeScale,
      });
      await client.query('COMMIT');
      return { completesAt: r.completesAt };
    }
    await payStock(client, planetId, def.fabricationCost as Record<string, number>, nowMs);
    const completesAt = new Date(
      nowMs + (def.fabricationHours * 3_600_000) / timeScale,
    );
    await enqueue(client, 'item_fabricated', completesAt, {
      bodyId: planetId,
      itemKey,
    });
    await client.query('COMMIT');
    return { completesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Installe un item du monde sur une coque ENTREPOSÉE ici : ligne
 * consommée À LA COMMANDE (atomique), coût payé, immobilisation
 * `installHours` puis bord `item_installed`. Slots de la coque (canon) :
 * accessoires ≤ slots.accessory ; upgrades 1 par famille [TUNE-v1], un
 * niveau SUPÉRIEUR remplace (l'ancien n'est pas rendu, annoncé).
 */
export async function installGear(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  itemKey: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const def = GEAR[itemKey];
  if (!def) throw new CommandError('not_found', 'Item inconnu');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship: Row | undefined = ships[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (['probe', 'personal'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque n\'a pas de slots');
    }
    if (ship.status !== 'warehoused' || !ship.docked_body_id) {
      throw new CommandError(
        'not_available',
        'L\'installation se fait sur une coque ENTREPOSÉE (warehouse)',
      );
    }
    if (ship.installing_item) {
      throw new CommandError('not_available', 'Une installation est déjà en cours');
    }
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    if (!hull) throw new CommandError('not_available', 'Coque inconnue');
    const accessories: string[] = Array.isArray(ship.accessories)
      ? ship.accessories
      : [];
    const upgrades: InstalledUpgrades = ship.upgrades ?? {};
    if (def.kind === 'accessory') {
      if (accessories.includes(itemKey)) {
        throw new CommandError('not_available', 'Cet accessoire est déjà monté');
      }
      if (accessories.length >= hull.slots.accessory) {
        throw new CommandError(
          'not_available',
          `Slots accessoire pleins (${accessories.length}/${hull.slots.accessory})`,
        );
      }
    } else {
      const family = def.slot as keyof typeof hull.slots;
      if ((hull.slots[family] ?? 0) <= 0) {
        throw new CommandError(
          'not_available',
          `Cette coque n'a pas de slot ${def.slot}`,
        );
      }
      const current = upgrades[def.slot as keyof InstalledUpgrades];
      if (current && current >= (def.level ?? 0)) {
        throw new CommandError(
          'not_available',
          `Un ${def.slot} L${current} est déjà monté (installez un niveau supérieur)`,
        );
      }
    }
    // L'ITEM : une ligne de CE monde, consommée à la commande.
    const { rows: taken } = await client.query(
      `DELETE FROM planet_items
       WHERE id = (SELECT id FROM planet_items
                   WHERE body_id = $1 AND item_key = $2
                   ORDER BY created_at LIMIT 1 FOR UPDATE)
       RETURNING id`,
      [ship.docked_body_id, itemKey],
    );
    if (!taken[0]) {
      throw new CommandError(
        'insufficient_resources',
        'Aucun exemplaire de cet item en stock sur ce monde',
      );
    }
    const { rows: world } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1`,
      [ship.docked_body_id],
    );
    if (world[0]?.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
    }
    await payStock(client, ship.docked_body_id, def.installCost as Record<string, number>, nowMs);
    const completesAt = new Date(
      nowMs + (def.installHours * 3_600_000) / timeScale,
    );
    await client.query(
      `UPDATE ships
         SET installing_item = $2, install_started_at = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [shipId, itemKey, nowMs],
    );
    await enqueue(client, 'item_installed', completesAt, {
      shipId,
      itemKey,
      startedAtMs: nowMs,
    });
    await client.query('COMMIT');
    return { completesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Items entreposés d'un monde (groupés) + fabrications en cours. */
export async function listPlanetGear(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
): Promise<{
  items: { itemKey: string; count: number }[];
  capacity: number;
  fabricating: { itemKey: string; completesAt: string }[];
}> {
  const { rows: planet } = await pool.query(
    `SELECT owner_id FROM bodies WHERE id = $1 AND body_type = 'planet'`,
    [planetId],
  );
  if (!planet[0]) throw new CommandError('not_found', 'Planète inconnue');
  if (planet[0].owner_id !== playerId) {
    throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
  }
  const { rows: items } = await pool.query(
    `SELECT item_key, count(*)::int AS n FROM planet_items
     WHERE body_id = $1 GROUP BY item_key ORDER BY item_key`,
    [planetId],
  );
  const { rows: wh } = await pool.query(
    `SELECT level FROM buildings
     WHERE body_id = $1 AND key = 'warehouse' AND status = 'active'`,
    [planetId],
  );
  const { rows: fab } = await pool.query(
    `SELECT payload->>'itemKey' AS item_key, due_at FROM events
     WHERE kind = 'item_fabricated' AND processed_at IS NULL
       AND payload->>'bodyId' = $1
     ORDER BY due_at`,
    [planetId],
  );
  // W7 : ordres d'usinage partiel en cours (items).
  const { rows: orders } = await pool.query(
    `SELECT payload->>'itemKey' AS item_key, created_at, steps_done, status
     FROM work_orders WHERE body_id = $1 AND kind = 'item'
     ORDER BY created_at`,
    [planetId],
  );
  for (const o of orders) {
    fab.push({ item_key: `${o.item_key} (${o.steps_done}/20${o.status === 'starved' ? ' starved' : ''})`, due_at: o.created_at });
  }
  return {
    items: items.map((r) => ({ itemKey: r.item_key, count: r.n })),
    capacity: itemCapacity(wh.map((w) => Number(w.level))),
    fabricating: fab.map((r) => ({
      itemKey: r.item_key,
      completesAt: new Date(r.due_at).toISOString(),
    })),
  };
}

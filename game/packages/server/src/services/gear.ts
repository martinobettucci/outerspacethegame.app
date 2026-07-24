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
  canFitGear,
  containersUsedTotal,
  CRUSADER,
  DISASSEMBLE_REFUND_FRACTION,
  effectiveContainers,
  GEAR,
  HULLS,
  isCrusader,
  itemCapacity,
  UNINSTALL_HOURS,
  type HullCategory,
  type HullSize,
  type InstalledUpgrades,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { config } from '../config.js';
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
          config.TIME_SCALE,
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
    const minLevel = def.fabricatorMinLevel ?? 1;
    const { rows: host } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = $2 AND status = 'active'
         AND level >= $3 LIMIT 1`,
      [planetId, def.fabricator, minLevel],
    );
    if (!host[0]) {
      throw new CommandError(
        'not_available',
        `Un ${def.fabricator} ACTIF${minLevel > 1 ? ` L${minLevel}+` : ''} est requis pour fabriquer cet item`,
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
 * W8e — fabrication À BORD du Crusader : ADN COMPLET (canon) — TOUT
 * hôte est réputé actif L3 (grades enhanced fabricables d'office),
 * usinage partiel D'OFFICE (paliers de 5 % payés sur crusader_stock,
 * FIFO par Crusader), balance d'items de bord = 3 warehouses L3
 * (itemCapacity 450 [TUNE]). PAS de markets à bord (structurel).
 */
export async function fabricateGearAboard(
  pool: pg.Pool,
  playerId: string,
  crusaderId: string,
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
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [crusaderId],
    );
    const ship = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (!isCrusader(ship.hull_category, ship.hull_size) || !ship.crusader_infra) {
      throw new CommandError('not_available', 'Seul un Crusader fabrique à bord');
    }
    // Balance de bord : items stockés + ordres/événements en route.
    const cap = itemCapacity(CRUSADER.infra.warehouses as unknown as number[]);
    const items = (ship.crusader_items ?? {}) as Record<string, number>;
    const stored = Object.values(items).reduce((n, c) => n + c, 0);
    const { rows: pendingOrders } = await client.query(
      `SELECT count(*)::int AS n FROM work_orders
       WHERE ship_id = $1 AND kind = 'item'`,
      [crusaderId],
    );
    const { rows: pendingEvents } = await client.query(
      `SELECT count(*)::int AS n FROM events
       WHERE kind = 'item_fabricated' AND processed_at IS NULL
         AND payload->>'shipId' = $1`,
      [crusaderId],
    );
    if (stored + pendingOrders[0].n + pendingEvents[0].n >= cap) {
      throw new CommandError(
        'not_available',
        `Balance d'items de bord pleine (${stored + pendingOrders[0].n + pendingEvents[0].n}/${cap})`,
      );
    }
    // ADN complet : aucune gate d'hôte — usinage partiel D'OFFICE.
    const r = await createWorkOrder(client, {
      bodyId: null,
      factoryBuildingId: null,
      shipId: crusaderId,
      kind: 'item',
      payload: { shipId: crusaderId, itemKey },
      cost: def.fabricationCost as Record<string, number>,
      totalHours: def.fabricationHours,
      nowMs,
      timeScale,
    });
    await client.query('COMMIT');
    return { completesAt: r.completesAt };
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
    // W8e : une coque AMARRÉE à un Crusader (docks volants) s'équipe à
    // bord — items et coût pris sur la balance/le stock du bord.
    const hostCrusaderId =
      ship.status === 'docked' && !ship.docked_body_id && ship.follow_ship_id
        ? String(ship.follow_ship_id)
        : null;
    if (!hostCrusaderId && (ship.status !== 'warehoused' || !ship.docked_body_id)) {
      throw new CommandError(
        'not_available',
        'L\'installation se fait sur une coque ENTREPOSÉE (warehouse) ou AMARRÉE à un Crusader',
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
    // W9c : familles de slots PARTAGÉES — upgrades ET accessoires
    // consomment la capacité de LEUR famille (HULLS.slots).
    if (def.kind === 'accessory' && accessories.includes(itemKey)) {
      throw new CommandError('not_available', 'Cet accessoire est déjà monté');
    }
    if (def.kind === 'upgrade') {
      const current = upgrades[def.slot as keyof InstalledUpgrades];
      if (current && current >= (def.level ?? 0)) {
        throw new CommandError(
          'not_available',
          `Un ${def.slot} L${current} est déjà monté (installez un niveau supérieur)`,
        );
      }
    }
    const fit = canFitGear(
      def,
      accessories,
      upgrades as Record<string, number>,
      hull.slots as unknown as Record<string, number>,
    );
    if (!fit.ok) {
      throw new CommandError('not_available', `Montage refusé : ${fit.reason}`);
    }
    if (hostCrusaderId) {
      // W8e : item et coût pris sur le BORD (balance + stock du Crusader).
      const { rows: hostRows } = await client.query(
        `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
        [hostCrusaderId],
      );
      const host = hostRows[0];
      if (!host || !isCrusader(host.hull_category, host.hull_size)) {
        throw new CommandError('not_available', 'L\'hôte n\'est pas un Crusader');
      }
      if (host.owner_id !== playerId) {
        throw new CommandError('forbidden', 'Ce Crusader ne vous obéit pas');
      }
      const items = { ...((host.crusader_items ?? {}) as Record<string, number>) };
      if ((items[itemKey] ?? 0) < 1) {
        throw new CommandError(
          'insufficient_resources',
          'Aucun exemplaire de cet item dans la balance de bord',
        );
      }
      items[itemKey]! -= 1;
      if (items[itemKey]! <= 0) delete items[itemKey];
      const stock = { ...((host.crusader_stock ?? {}) as Record<string, number>) };
      for (const [resource, amount] of Object.entries(def.installCost)) {
        if ((stock[resource] ?? 0) + 1e-9 < (amount as number)) {
          throw new CommandError(
            'insufficient_resources',
            `Stock de bord : ${resource} ${Number(stock[resource] ?? 0).toFixed(1)}/${amount} T`,
          );
        }
      }
      for (const [resource, amount] of Object.entries(def.installCost)) {
        stock[resource] = Math.max(0, (stock[resource] ?? 0) - (amount as number));
        if (stock[resource]! <= 1e-9) delete stock[resource];
      }
      await client.query(
        `UPDATE ships SET crusader_items = $2, crusader_stock = $3 WHERE id = $1`,
        [hostCrusaderId, JSON.stringify(items), JSON.stringify(stock)],
      );
    } else {
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
    }
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

/**
 * W6c-b1 — CHARGE un item en soute (acheminement par cargo) : coque
 * DOCKÉE sur un monde possédé (une ligne planet_items consommée) ou
 * AMARRÉE à un Crusader (balance de bord décrémentée). Un item occupe
 * UN conteneur [TUNE-v1] — la capacité est vérifiée via
 * containersUsedTotal. Opération instantanée (patron fret fongible).
 */
export async function loadItemCargo(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  itemKey: string,
): Promise<{ itemCargo: string[] }> {
  const def = GEAR[itemKey];
  if (!def) throw new CommandError('not_found', 'Item inconnu');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship: Row | undefined = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (['probe', 'personal'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque n\'a pas de soute');
    }
    const aboardCrusaderId =
      ship.status === 'docked' && !ship.docked_body_id && ship.follow_ship_id
        ? String(ship.follow_ship_id)
        : null;
    if (!aboardCrusaderId && !(ship.status === 'docked' && ship.docked_body_id)) {
      throw new CommandError(
        'not_available',
        'Le fret d\'items se charge À QUAI (monde possédé ou Crusader)',
      );
    }
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    const capacity = effectiveContainers(
      hull?.containers ?? 0,
      Array.isArray(ship.accessories) ? ship.accessories : [],
    );
    const itemCargo: string[] = Array.isArray(ship.item_cargo) ? [...ship.item_cargo] : [];
    const used = containersUsedTotal(
      (ship.cargo ?? {}) as Record<string, number>,
      itemCargo,
    );
    if (used + 1 > capacity) {
      throw new CommandError(
        'not_available',
        `Conteneurs insuffisants (${used}/${capacity}) — un item occupe un conteneur`,
      );
    }
    if (aboardCrusaderId) {
      const { rows: hostRows } = await client.query(
        `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
        [aboardCrusaderId],
      );
      const host = hostRows[0];
      if (!host?.crusader_infra || host.owner_id !== playerId) {
        throw new CommandError('not_available', 'Hôte de bord indisponible');
      }
      const items = { ...((host.crusader_items ?? {}) as Record<string, number>) };
      if ((items[itemKey] ?? 0) < 1) {
        throw new CommandError('insufficient_resources', 'Aucun exemplaire dans la balance de bord');
      }
      items[itemKey]! -= 1;
      if (items[itemKey]! <= 0) delete items[itemKey];
      await client.query(`UPDATE ships SET crusader_items = $2 WHERE id = $1`, [
        aboardCrusaderId,
        JSON.stringify(items),
      ]);
    } else {
      const { rows: world } = await client.query(
        `SELECT owner_id FROM bodies WHERE id = $1`,
        [ship.docked_body_id],
      );
      if (world[0]?.owner_id !== playerId) {
        throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
      }
      const { rows: taken } = await client.query(
        `DELETE FROM planet_items
         WHERE id = (SELECT id FROM planet_items
                     WHERE body_id = $1 AND item_key = $2
                     ORDER BY created_at LIMIT 1 FOR UPDATE)
         RETURNING id`,
        [ship.docked_body_id, itemKey],
      );
      if (!taken[0]) {
        throw new CommandError('insufficient_resources', 'Aucun exemplaire de cet item ici');
      }
    }
    itemCargo.push(itemKey);
    await client.query(`UPDATE ships SET item_cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(itemCargo),
    ]);
    await client.query('COMMIT');
    return { itemCargo };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * W6c-b1 — DÉCHARGE un item de la soute vers la balance du lieu de
 * quai. Balance PLEINE → REFUS (le fret ne désassemble jamais — c'est
 * un choix d'entrepôt, pas une perte).
 */
export async function unloadItemCargo(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  itemKey: string,
): Promise<{ itemCargo: string[] }> {
  const def = GEAR[itemKey];
  if (!def) throw new CommandError('not_found', 'Item inconnu');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship: Row | undefined = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    const itemCargo: string[] = Array.isArray(ship.item_cargo) ? [...ship.item_cargo] : [];
    const at = itemCargo.indexOf(itemKey);
    if (at === -1) {
      throw new CommandError('insufficient_resources', 'Cet item n\'est pas en soute');
    }
    const aboardCrusaderId =
      ship.status === 'docked' && !ship.docked_body_id && ship.follow_ship_id
        ? String(ship.follow_ship_id)
        : null;
    if (!aboardCrusaderId && !(ship.status === 'docked' && ship.docked_body_id)) {
      throw new CommandError(
        'not_available',
        'Le fret d\'items se décharge À QUAI (monde possédé ou Crusader)',
      );
    }
    if (aboardCrusaderId) {
      const { rows: hostRows } = await client.query(
        `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
        [aboardCrusaderId],
      );
      const host = hostRows[0];
      if (!host?.crusader_infra || host.owner_id !== playerId) {
        throw new CommandError('not_available', 'Hôte de bord indisponible');
      }
      const items = { ...((host.crusader_items ?? {}) as Record<string, number>) };
      const stored = Object.values(items).reduce((n, c) => n + c, 0);
      const cap = itemCapacity(CRUSADER.infra.warehouses as unknown as number[]);
      if (stored + 1 > cap) {
        throw new CommandError('not_available', `Balance de bord pleine (${stored}/${cap})`);
      }
      items[itemKey] = (items[itemKey] ?? 0) + 1;
      await client.query(`UPDATE ships SET crusader_items = $2 WHERE id = $1`, [
        aboardCrusaderId,
        JSON.stringify(items),
      ]);
    } else {
      const { rows: world } = await client.query(
        `SELECT owner_id FROM bodies WHERE id = $1`,
        [ship.docked_body_id],
      );
      if (world[0]?.owner_id !== playerId) {
        throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
      }
      const { rows: wh } = await client.query(
        `SELECT level FROM buildings
         WHERE body_id = $1 AND key = 'warehouse' AND status = 'active'`,
        [ship.docked_body_id],
      );
      const cap = itemCapacity(wh.map((w) => Number(w.level)));
      const { rows: stored } = await client.query(
        `SELECT count(*)::int AS n FROM planet_items WHERE body_id = $1`,
        [ship.docked_body_id],
      );
      if (stored[0].n + 1 > cap) {
        throw new CommandError(
          'not_available',
          `Balance d'items pleine (${stored[0].n}/${cap}) — un warehouse actif en stocke 50 × niveau`,
        );
      }
      await client.query(
        `INSERT INTO planet_items (body_id, item_key) VALUES ($1, $2)`,
        [ship.docked_body_id, itemKey],
      );
    }
    itemCargo.splice(at, 1);
    await client.query(`UPDATE ships SET item_cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(itemCargo),
    ]);
    await client.query('COMMIT');
    return { itemCargo };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * W9a — DÉMONTE un accessoire d'une coque ENTREPOSÉE : temps [TUNE],
 * l'item retourne à la balance d'items du monde (refus si pleine).
 * Démonter la coque métamorphose EFFACE l'adaptation climatique active
 * [interp annoncée] ; démonter un rig éteint son booléen d'effet.
 */
export async function uninstallGear(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  itemKey: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const def = GEAR[itemKey];
  if (!def || def.kind !== 'accessory') {
    throw new CommandError('not_found', 'Accessoire inconnu');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship: Row | undefined = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    // W8e : le démontage vaut aussi pour une coque AMARRÉE à un
    // Crusader — l'item retourne à la balance de bord.
    const aboardCrusader =
      ship.status === 'docked' && !ship.docked_body_id && !!ship.follow_ship_id;
    if (!aboardCrusader && (ship.status !== 'warehoused' || !ship.docked_body_id)) {
      throw new CommandError(
        'not_available',
        'Le démontage se fait sur une coque ENTREPOSÉE (warehouse) ou AMARRÉE à un Crusader',
      );
    }
    if (ship.installing_item) {
      throw new CommandError('not_available', 'Un chantier d\'item est déjà en cours');
    }
    const accessories: string[] = Array.isArray(ship.accessories)
      ? ship.accessories
      : [];
    if (!accessories.includes(itemKey)) {
      throw new CommandError('not_available', 'Cet accessoire n\'est pas monté');
    }
    // [Interp annoncée 2026-07-22] Si la balance d'items du monde ne
    // peut pas accueillir l'accessoire démonté, il est DÉSASSEMBLÉ sur
    // place à la fin du démontage (50 % du coût rendu) — l'arbitrage de
    // slots ne se bloque jamais.
    const completesAt = new Date(nowMs + (UNINSTALL_HOURS * 3_600_000) / timeScale);
    await client.query(
      `UPDATE ships
         SET installing_item = $2, install_started_at = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [shipId, `uninstall:${itemKey}`, nowMs],
    );
    await enqueue(client, 'item_uninstalled', completesAt, {
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

/**
 * W9a — DÉSASSEMBLE un item ENTREPOSÉ : la ligne est détruite,
 * 50 % du coût de fabrication revient au stock [TUNE-v1 interp].
 */
export async function disassembleGear(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
  itemKey: string,
  opts: { nowMs?: number } = {},
): Promise<{ refunded: Record<string, number> }> {
  const nowMs = opts.nowMs ?? Date.now();
  const def = GEAR[itemKey];
  if (!def) throw new CommandError('not_found', 'Item inconnu');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: planet } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [planetId],
    );
    if (!planet[0]) throw new CommandError('not_found', 'Planète inconnue');
    if (planet[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { rows: taken } = await client.query(
      `DELETE FROM planet_items
       WHERE id = (SELECT id FROM planet_items
                   WHERE body_id = $1 AND item_key = $2
                   ORDER BY created_at LIMIT 1 FOR UPDATE)
       RETURNING id`,
      [planetId, itemKey],
    );
    if (!taken[0]) {
      throw new CommandError('insufficient_resources', 'Aucun exemplaire à désassembler ici');
    }
    const refunded: Record<string, number> = {};
    for (const [resource, amount] of Object.entries(def.fabricationCost)) {
      const back = (amount as number) * DISASSEMBLE_REFUND_FRACTION;
      refunded[resource] = back;
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = planet_stock.amount_t + $3,
                       as_of = to_timestamp($4 / 1000.0)`,
        [planetId, resource, back, nowMs],
      );
    }
    await client.query('COMMIT');
    return { refunded };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

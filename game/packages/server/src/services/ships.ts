/**
 * Flotte & vol libre — GB §6/§14/§21, DG §8/§9.1.
 *
 * v1 (documentée, JOURNAL session 30) :
 * - segment droit origine→destination, position interpolée à la lecture ;
 * - carburant : type unique par vaisseau (celui de l'étoile natale),
 *   efficacité matrice = 1.0 [TUNE-v1], PRÉ-BRÛLAGE au départ (pas encore
 *   de panne sèche en vol — les horloges de mort arrivent avec P3 complet) ;
 * - auto-chargement du réservoir depuis le stock de la planète au départ
 *   d'un monde possédé ;
 * - vaisseau personnel : destinations = mondes POSSÉDÉS uniquement (canon
 *   §21 ; alliés en P4) ; sondes : toute coordonnée, sans carburant.
 */
import {
  GAME_DAY_SECONDS,
  HULLS,
  PROBE,
  UNIVERSE_SIZE_PC,
  type HullCategory,
  type HullSize,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy } from '../sim/lazy.js';
import { CommandError } from './planets.js';

export interface ShipView {
  id: string;
  hullCategory: string;
  hullSize: string | null;
  name: string;
  x: number;
  y: number;
  status: string;
  dockedBodyId: string | null;
  fuel: Record<string, number>;
  mission: {
    originX: number;
    originY: number;
    destX: number;
    destY: number;
    destBodyId: string | null;
    departedAt: string;
    arrivesAt: string;
  } | null;
}

const toMs = (d: Date | string) => new Date(d).getTime();

/** Position interpolée d'un vaisseau (pure). */
export function shipPosition(
  row: {
    x: number;
    y: number;
    status: string;
    origin_x: number | null;
    origin_y: number | null;
    dest_x: number | null;
    dest_y: number | null;
    departed_at: Date | string | null;
    arrives_at: Date | string | null;
  },
  nowMs: number,
): { x: number; y: number } {
  if (
    row.status !== 'transit' ||
    row.origin_x === null ||
    row.dest_x === null ||
    !row.departed_at ||
    !row.arrives_at
  ) {
    return { x: row.x, y: row.y };
  }
  const t0 = toMs(row.departed_at);
  const t1 = toMs(row.arrives_at);
  const f = Math.min(1, Math.max(0, (nowMs - t0) / Math.max(1, t1 - t0)));
  return {
    x: row.origin_x + (row.dest_x - row.origin_x) * f,
    y: (row.origin_y ?? 0) + ((row.dest_y ?? 0) - (row.origin_y ?? 0)) * f,
  };
}

export async function fleet(
  pool: pg.Pool,
  playerId: string,
  nowMs = Date.now(),
): Promise<ShipView[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ships WHERE owner_id = $1 ORDER BY created_at`,
    [playerId],
  );
  return rows.map((r) => {
    const pos = shipPosition(r, nowMs);
    return {
      id: r.id,
      hullCategory: r.hull_category,
      hullSize: r.hull_size,
      name: r.name,
      x: pos.x,
      y: pos.y,
      status: r.status,
      dockedBodyId: r.docked_body_id,
      fuel: r.fuel ?? {},
      mission:
        r.status === 'transit' && r.departed_at
          ? {
              originX: r.origin_x,
              originY: r.origin_y,
              destX: r.dest_x,
              destY: r.dest_y,
              destBodyId: r.dest_body_id,
              departedAt: new Date(r.departed_at).toISOString(),
              arrivesAt: new Date(r.arrives_at).toISOString(),
            }
          : null,
    };
  });
}

/** Stats de déplacement d'une coque (v1 : loadFrac 0, matrice 1.0). */
function hullStats(category: string, size: string | null): {
  speed: number;
  burnPerPc: number;
  tank: number;
} {
  if (category === 'probe') {
    return { speed: PROBE.speedPcPerDay, burnPerPc: 0, tank: 0 };
  }
  if (category === 'personal') {
    // Invulnérable, ne consomme rien (canon §21) ; vitesse d'un Civil-S.
    return { speed: HULLS.civil_s.speedPcPerDay, burnPerPc: 0, tank: 0 };
  }
  const hull = HULLS[`${category}_${size}` as `${HullCategory}_${HullSize}`];
  if (!hull) throw new CommandError('not_found', 'Coque inconnue');
  return {
    speed: hull.speedPcPerDay,
    burnPerPc: hull.burnUPerPc,
    tank: hull.tankU,
  };
}

/**
 * Lance un vol libre vers un corps ou une coordonnée (GB §6).
 */
export async function moveShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  dest: { bodyId: string } | { x: number; y: number },
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ arrivesAt: Date; fuelBurned: number; distancePc: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = rows[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (!['docked', 'hovering', 'idle'].includes(ship.status)) {
      throw new CommandError('not_available', `Vaisseau indisponible (${ship.status})`);
    }

    // Résolution de la destination.
    let destX: number;
    let destY: number;
    let destBodyId: string | null = null;
    if ('bodyId' in dest) {
      const { rows: bodies } = await client.query(
        'SELECT id, x, y, owner_id FROM bodies WHERE id = $1',
        [dest.bodyId],
      );
      if (!bodies[0]) throw new CommandError('not_found', 'Corps céleste inconnu');
      destX = bodies[0].x;
      destY = bodies[0].y;
      destBodyId = bodies[0].id;
      if (ship.hull_category === 'personal' && bodies[0].owner_id !== playerId) {
        // Canon §21 : le vaisseau personnel ne va que sur vos mondes (alliés P4).
        throw new CommandError('forbidden', 'Le vaisseau personnel ne rejoint que vos mondes');
      }
    } else {
      if (ship.hull_category === 'personal') {
        throw new CommandError('forbidden', 'Le vaisseau personnel ne rejoint que vos mondes');
      }
      destX = dest.x;
      destY = dest.y;
      if (
        !Number.isFinite(destX) ||
        !Number.isFinite(destY) ||
        destX < 0 ||
        destY < 0 ||
        destX >= UNIVERSE_SIZE_PC ||
        destY >= UNIVERSE_SIZE_PC
      ) {
        throw new CommandError('not_available', 'Coordonnées hors de l\'univers');
      }
    }

    const origin = shipPosition(ship, nowMs);
    const distance = Math.hypot(destX - origin.x, destY - origin.y);
    if (distance < 0.5) {
      throw new CommandError('not_available', 'Destination trop proche');
    }

    const stats = hullStats(ship.hull_category, ship.hull_size);
    let fuelBurned = 0;
    if (stats.burnPerPc > 0) {
      const needed = distance * stats.burnPerPc; // matrice 1.0 [TUNE-v1]
      const fuelObj: Record<string, number> = ship.fuel ?? {};
      const fuelType = Object.keys(fuelObj)[0] ?? 'cold';
      let inTank = fuelObj[fuelType] ?? 0;
      // Auto-chargement au départ d'un monde possédé (v1 documentée).
      if (inTank < needed && ship.docked_body_id) {
        const { rows: owned } = await client.query(
          'SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2',
          [ship.docked_body_id, playerId],
        );
        if (owned[0]) {
          const resource = `fuel_${fuelType}`;
          const { rows: stockRows } = await client.query(
            `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
             WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
            [ship.docked_body_id, resource],
          );
          const available = stockRows[0]
            ? evalLazy(
                {
                  amount: stockRows[0].amount_t,
                  ratePerDay: stockRows[0].rate_t_per_day,
                  asOfMs: toMs(stockRows[0].as_of),
                },
                nowMs,
                { min: 0 },
              )
            : 0;
          const load = Math.min(stats.tank - inTank, needed - inTank, available);
          if (load > 0) {
            await client.query(
              `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
               WHERE body_id = $1 AND resource = $2`,
              [ship.docked_body_id, resource, available - load, nowMs],
            );
            inTank += load;
          }
        }
      }
      if (inTank + 1e-9 < needed) {
        throw new CommandError(
          'insufficient_resources',
          `Carburant insuffisant : ${Math.floor(inTank)}/${Math.ceil(needed)} u (${fuelType})`,
        );
      }
      fuelBurned = needed;
      fuelObj[fuelType] = inTank - needed; // pré-brûlage v1
      await client.query('UPDATE ships SET fuel = $2 WHERE id = $1', [
        shipId,
        JSON.stringify(fuelObj),
      ]);
    }

    const travelDays = distance / stats.speed;
    const arrivesAt = new Date(
      nowMs + (travelDays * GAME_DAY_SECONDS * 1000) / timeScale,
    );
    await client.query(
      `UPDATE ships SET status = 'transit', docked_body_id = NULL,
         origin_x = $2, origin_y = $3, dest_x = $4, dest_y = $5,
         dest_body_id = $6, departed_at = to_timestamp($7 / 1000.0),
         arrives_at = $8
       WHERE id = $1`,
      [shipId, origin.x, origin.y, destX, destY, destBodyId, nowMs, arrivesAt],
    );
    await enqueue(client, 'ship_arrival', arrivesAt, { shipId });
    await client.query('COMMIT');
    return { arrivesAt, fuelBurned, distancePc: distance };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Cap de sondes : 5/jour/pad actif [TUNE, DG §8.1]. */
export async function launchProbe(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
  dest: { x: number; y: number },
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ probeId: string; arrivesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: planet } = await client.query(
      `SELECT id, x, y, owner_id, climate FROM bodies
       WHERE id = $1 AND body_type = 'planet' FOR UPDATE`,
      [planetId],
    );
    if (!planet[0]) throw new CommandError('not_found', 'Planète inconnue');
    if (planet[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Cette planète ne vous appartient pas');
    }
    const { rows: pads } = await client.query(
      `SELECT count(*)::int AS n FROM buildings
       WHERE body_id = $1 AND key = 'probe_pad' AND status = 'active'`,
      [planetId],
    );
    if (pads[0].n === 0) {
      throw new CommandError('not_available', 'Aucun probe_pad actif ici');
    }
    const { rows: today } = await client.query(
      `SELECT count(*)::int AS n FROM ships
       WHERE owner_id = $1 AND hull_category = 'probe'
         AND created_at > now() - interval '1 day'`,
      [playerId],
    );
    if (today[0].n >= PROBE.buildCapPerDayPerPad * pads[0].n) {
      throw new CommandError('not_available', 'Cap de sondes du jour atteint');
    }
    // Coût payé sur le stock planétaire (mêmes règles que les bâtiments).
    for (const [resource, amount] of Object.entries(PROBE.buildCost)) {
      const { rows: stockRows } = await client.query(
        `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
         WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
        [planetId, resource],
      );
      const available = stockRows[0]
        ? evalLazy(
            {
              amount: stockRows[0].amount_t,
              ratePerDay: stockRows[0].rate_t_per_day,
              asOfMs: toMs(stockRows[0].as_of),
            },
            nowMs,
            { min: 0 },
          )
        : 0;
      if (available < (amount as number)) {
        throw new CommandError(
          'insufficient_resources',
          `Ressource insuffisante : ${resource}`,
        );
      }
      await client.query(
        `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
         WHERE body_id = $1 AND resource = $2`,
        [planetId, resource, available - (amount as number), nowMs],
      );
    }
    const { rows: created } = await client.query<{ id: string }>(
      `INSERT INTO ships (owner_id, hull_category, name, x, y, status, docked_body_id)
       VALUES ($1, 'probe', 'Probe', $2, $3, 'docked', $4) RETURNING id`,
      [playerId, planet[0].x, planet[0].y, planetId],
    );
    await client.query('COMMIT');
    const move = await moveShip(pool, playerId, created[0]!.id, dest, opts);
    return { probeId: created[0]!.id, arrivesAt: move.arrivesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

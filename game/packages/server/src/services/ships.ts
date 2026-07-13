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
  ALL_RESOURCE_IDS,
  buildableSizes,
  canLand,
  containersUsed,
  GAME_DAY_SECONDS,
  HULLS,
  PROBE,
  SHIP_BUILD_HOURS,
  shipBuildCost,
  UNIVERSE_SIZE_PC,
  type HullCategory,
  type HullSize,
  type LandingPolicy,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy } from '../sim/lazy.js';
import { loadProductionSnapshot, recomputePlanetRates } from '../sim/rebase.js';
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
  hoverBodyId: string | null;
  cargo: Record<string, number>;
  containers: number;
  settlers: number;
  settlersPax: number;
  colonyKit: boolean;
  establishesAt: string | null;
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
  // Ordre TOTAL et sémantique : le personnel d'abord (c'est le Souverain),
  // puis cargo/civil/combat/sondes — created_at seul est instable (même
  // transaction ⇒ même timestamp, l'ordre du tas flippait après UPDATE et
  // déplaçait les marqueurs de l'éventail).
  const { rows } = await pool.query(
    `SELECT * FROM ships WHERE owner_id = $1
     ORDER BY CASE hull_category
        WHEN 'personal' THEN 0 WHEN 'cargo' THEN 1 WHEN 'civil' THEN 2
        WHEN 'combat' THEN 3 ELSE 4 END,
       created_at, id`,
    [playerId],
  );
  // Comptes à rebours d'établissement des coques en 'colonizing'.
  const { rows: establishing } = await pool.query(
    `SELECT payload->>'shipId' AS ship_id, due_at FROM events
     WHERE kind = 'colony_established' AND processed_at IS NULL`,
  );
  const establishesBy = new Map(
    establishing.map((e) => [e.ship_id, new Date(e.due_at).toISOString()]),
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
      hoverBodyId: r.hover_body_id,
      cargo: r.cargo ?? {},
      containers: hullContainers(r.hull_category, r.hull_size),
      settlers: r.settlers ?? 0,
      settlersPax:
        HULLS[`${r.hull_category}_${r.hull_size}` as `${HullCategory}_${HullSize}`]
          ?.pax ?? 0,
      colonyKit: !!r.colony_kit,
      establishesAt: establishesBy.get(r.id) ?? null,
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

/** Capacité de fret d'une coque (0 pour sonde et personnel — v1). */
function hullContainers(category: string, size: string | null): number {
  if (category === 'probe' || category === 'personal') return 0;
  const hull = HULLS[`${category}_${size}` as `${HullCategory}_${HullSize}`];
  return hull?.containers ?? 0;
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
      if ((ship.settlers ?? 0) > 0) {
        // v1 [décision annoncée] : des settlers à bord imposent une
        // destination planétaire — pas de cohorte abandonnée dans le vide.
        throw new CommandError(
          'not_available',
          'Des settlers à bord : visez une planète, pas le vide',
        );
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
         hover_body_id = NULL,
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

/** Verrouille un vaisseau et vérifie sa propriété. */
async function lockOwnedShip(
  client: pg.PoolClient,
  playerId: string,
  shipId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const { rows } = await client.query(
    `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
    [shipId],
  );
  const ship = rows[0];
  if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
  if (ship.owner_id !== playerId) {
    throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
  }
  return ship;
}

/**
 * Atterrir (GB §9) : acte explicite depuis le survol d'un monde. v1 :
 * ses mondes accueillent toujours ; monde étranger = spaceport ACTIF avec
 * politique `everyone` ; monde sauvage = personne pour vous accueillir.
 * L'usure d'atterrissage (DG §8.6) attend le suivi d'armure — gap documenté.
 */
export async function landShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
): Promise<{ bodyId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (ship.hull_category === 'probe') {
      throw new CommandError('not_available', 'Une sonde ne se pose pas');
    }
    if (ship.status !== 'hovering' || !ship.hover_body_id) {
      throw new CommandError('not_available', 'Aucun monde sous la coque');
    }
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id, body_type FROM bodies WHERE id = $1`,
      [ship.hover_body_id],
    );
    const body = bodies[0];
    if (!body || body.body_type !== 'planet') {
      throw new CommandError('not_available', 'On ne se pose que sur une planète');
    }
    const owned = body.owner_id === playerId;
    let hasActiveSpaceport = false;
    let policy: LandingPolicy = 'self';
    if (!owned) {
      if (!body.owner_id) {
        // Monde sauvage : pas d'infrastructure d'accueil (colonisation P4).
        throw new CommandError('not_available', 'Monde sauvage : rien pour vous accueillir');
      }
      const { rows: ports } = await client.query(
        `SELECT config FROM buildings
         WHERE body_id = $1 AND key = 'spaceport' AND status = 'active'`,
        [body.id],
      );
      hasActiveSpaceport = ports.length > 0;
      // Plusieurs spaceports : la politique la plus permissive prévaut.
      policy = ports.some((p) => p.config?.landing === 'everyone')
        ? 'everyone'
        : 'self';
    }
    if (!canLand({ owned, hasActiveSpaceport, policy })) {
      throw new CommandError(
        'forbidden',
        hasActiveSpaceport
          ? 'Le spaceport ne vous accepte pas (politique d\'atterrissage)'
          : 'Aucun spaceport actif ne vous accueille ici',
      );
    }
    await client.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2, hover_body_id = NULL
       WHERE id = $1`,
      [shipId, body.id],
    );
    await client.query('COMMIT');
    return { bodyId: body.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Décoller : docked → hovering au-dessus du même monde. */
export async function undockShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
): Promise<{ bodyId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'Le vaisseau n\'est pas à quai');
    }
    await client.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = docked_body_id,
         docked_body_id = NULL
       WHERE id = $1`,
      [shipId],
    );
    await client.query('COMMIT');
    return { bodyId: ship.docked_body_id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Fret (GB §13 « goods are hauled » ; DG §7) : chargement/déchargement à
 * quai sur un monde POSSÉDÉ (l'échange sur monde étranger, c'est le
 * commerce — chunk marché). 1 conteneur = 1 T d'un fongible ; les tonnes
 * partielles monopolisent leur conteneur.
 */
export async function transferCargo(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  input: { resource: string; tons: number; direction: 'load' | 'unload' },
  opts: { nowMs?: number } = {},
): Promise<{ cargo: Record<string, number> }> {
  const nowMs = opts.nowMs ?? Date.now();
  const { resource, direction } = input;
  const tons = Number(input.tons);
  if (!ALL_RESOURCE_IDS.includes(resource as ResourceId)) {
    throw new CommandError('not_found', 'Ressource inconnue');
  }
  if (!Number.isFinite(tons) || tons <= 0) {
    throw new CommandError('not_available', 'Quantité invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'Le fret se manutentionne à quai');
    }
    const bodyId = ship.docked_body_id as string;
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
      [bodyId, playerId],
    );
    if (!owned[0]) {
      throw new CommandError(
        'forbidden',
        'Fret réservé à vos mondes (échanger ailleurs, c\'est commercer)',
      );
    }
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };

    if (direction === 'load') {
      const capacity = hullContainers(ship.hull_category, ship.hull_size);
      const next = { ...cargo, [resource]: (cargo[resource] ?? 0) + tons };
      if (containersUsed(next) > capacity) {
        throw new CommandError(
          'not_available',
          `Conteneurs insuffisants (${containersUsed(next)}/${capacity})`,
        );
      }
      const { rows: stockRows } = await client.query(
        `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
         WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
        [bodyId, resource],
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
      if (available + 1e-9 < tons) {
        throw new CommandError(
          'insufficient_resources',
          `Stock insuffisant : ${resource} (${available.toFixed(1)} T)`,
        );
      }
      await client.query(
        `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
         WHERE body_id = $1 AND resource = $2`,
        [bodyId, resource, available - tons, nowMs],
      );
      cargo[resource] = (cargo[resource] ?? 0) + tons;
    } else {
      if ((cargo[resource] ?? 0) + 1e-9 < tons) {
        throw new CommandError(
          'insufficient_resources',
          `Soute insuffisante : ${resource}`,
        );
      }
      // Cap de stockage : refus EXPLICITE plutôt qu'une perte silencieuse.
      const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
        forUpdate: true,
      });
      if (!snap) throw new CommandError('not_found', 'Planète inconnue');
      const usedT = Object.values(snap.stocks).reduce(
        (s, v) => s + (v ?? 0),
        0,
      );
      if (usedT + tons > snap.storageCapT + 1e-9) {
        throw new CommandError(
          'not_available',
          `Stockage plein (${Math.round(usedT)}/${snap.storageCapT} T)`,
        );
      }
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
         DO UPDATE SET amount_t = $5, as_of = to_timestamp($4 / 1000.0)`,
        [
          bodyId,
          resource,
          tons,
          nowMs,
          (snap.stocks[resource as ResourceId] ?? 0) + tons,
        ],
      );
      const left = (cargo[resource] ?? 0) - tons;
      if (left <= 1e-9) delete cargo[resource];
      else cargo[resource] = left;
    }

    await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
      shipId,
      JSON.stringify(cargo),
    ]);
    // Les bords de stockage (frein §3.3b) dépendent du niveau de stock :
    // on rebase pour garder les événements honnêtes.
    await recomputePlanetRates(client, bodyId, nowMs);
    await client.query('COMMIT');
    return { cargo };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Chantier naval (GB §14, DG §381) : L1 construit S+M, L2 = M à −25 %,
 * L3 construit L. Le coût se paie au lancement ; le vaisseau naît À QUAI,
 * réservoirs et soute vides, à la fin du chantier (événement ship_built).
 * ÉQUIPAGE : l'enforcement MIN_CREW est DIFFÉRÉ (annoncé — cohérent avec
 * les vaisseaux du spawn ; arrive avec le lifecycle NPC, backlog P4).
 */
export async function buildShip(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
  input: { category: string; size: string; name: string },
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ completesAt: Date; cost: Record<string, number> }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  if (!['combat', 'cargo', 'civil'].includes(input.category)) {
    throw new CommandError('not_found', 'Catégorie de coque inconnue');
  }
  const hull =
    HULLS[`${input.category}_${input.size}` as `${HullCategory}_${HullSize}`];
  if (!hull) throw new CommandError('not_found', 'Coque inconnue');
  const name = input.name.trim();
  if (name.length < 2 || name.length > 40) {
    throw new CommandError('not_available', 'Nom de vaisseau invalide (2–40 caractères)');
  }
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
    const { rows: yards } = await client.query(
      `SELECT level FROM buildings
       WHERE body_id = $1 AND key = 'shipyard' AND status = 'active'
       ORDER BY level DESC LIMIT 1`,
      [planetId],
    );
    if (!yards[0]) {
      throw new CommandError('not_available', 'Aucun chantier naval actif ici');
    }
    const level = yards[0].level as 1 | 2 | 3;
    if (!buildableSizes(level).includes(hull.size)) {
      throw new CommandError(
        'not_available',
        `Un chantier L${level} ne construit pas les coques ${hull.size.toUpperCase()} (L3 requis)`,
      );
    }
    const cost = shipBuildCost(hull, level);
    for (const [resource, amount] of Object.entries(cost)) {
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
      if (available + 1e-9 < (amount as number)) {
        throw new CommandError(
          'insufficient_resources',
          `Ressource insuffisante : ${resource} (${available.toFixed(1)}/${amount})`,
        );
      }
      await client.query(
        `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
         WHERE body_id = $1 AND resource = $2`,
        [planetId, resource, available - (amount as number), nowMs],
      );
    }
    const completesAt = new Date(
      nowMs + (SHIP_BUILD_HOURS[hull.size] * 3600 * 1000) / timeScale,
    );
    await enqueue(client, 'ship_built', completesAt, {
      planetId,
      playerId,
      category: input.category,
      size: input.size,
      name,
    });
    await client.query('COMMIT');
    return { completesAt, cost: cost as Record<string, number> };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Chantiers en cours d'une planète (événements ship_built non traités). */
export async function pendingShipBuilds(
  pool: pg.Pool,
  playerId: string,
  planetId: string,
): Promise<{ category: string; size: string; name: string; completesAt: string }[]> {
  const { rows } = await pool.query(
    `SELECT e.payload, e.due_at FROM events e
     WHERE e.kind = 'ship_built' AND e.processed_at IS NULL
       AND e.payload->>'planetId' = $1 AND e.payload->>'playerId' = $2
     ORDER BY e.due_at`,
    [planetId, playerId],
  );
  return rows.map((r) => ({
    category: String(r.payload.category),
    size: String(r.payload.size),
    name: String(r.payload.name),
    completesAt: new Date(r.due_at).toISOString(),
  }));
}

/** NPCs du joueur (main + liés), avec leurs rolls individuels (GB §12). */
export async function listNpcs(
  pool: pg.Pool,
  playerId: string,
): Promise<
  {
    id: string;
    people: string;
    role: string;
    rarity: string;
    statRolls: Record<string, number>;
    boundHostType: string | null;
    boundHostId: string | null;
  }[]
> {
  const { rows } = await pool.query(
    `SELECT id, people, role, rarity, stat_rolls, bound_host_type, bound_host_id
     FROM npcs WHERE owner_id = $1 ORDER BY created_at, id`,
    [playerId],
  );
  return rows.map((r) => ({
    id: r.id,
    people: r.people,
    role: r.role,
    rarity: r.rarity,
    statRolls: r.stat_rolls ?? {},
    boundHostType: r.bound_host_type,
    boundHostId: r.bound_host_id,
  }));
}

/**
 * Lie un NPC pilote à un vaisseau — liaison PERMANENTE (canon GB §12 :
 * « binding is permanent and shares the host's fate » ; la seule sortie
 * est l'entrepôt, chunk warehouse). v1 : rôle pilot, 1 membre max.
 */
export async function assignCrew(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  npcId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ships } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [shipId],
    );
    const ship = ships[0];
    if (!ship) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (ship.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (ship.hull_category === 'probe') {
      throw new CommandError('not_available', 'Une sonde est sans équipage (canon)');
    }
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'L\'équipage embarque à quai');
    }
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
      [ship.docked_body_id, playerId],
    );
    if (!owned[0]) {
      throw new CommandError('forbidden', 'L\'équipage embarque sur vos mondes');
    }
    const { rows: npcs } = await client.query(
      `SELECT * FROM npcs WHERE id = $1 FOR UPDATE`,
      [npcId],
    );
    const npc = npcs[0];
    if (!npc) throw new CommandError('not_found', 'Personnage inconnu');
    if (npc.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce personnage ne vous suit pas');
    }
    if (npc.bound_host_id) {
      throw new CommandError(
        'not_available',
        'Liaison permanente : ce personnage est déjà lié (GB §12)',
      );
    }
    if (npc.role !== 'pilot') {
      throw new CommandError('not_available', 'v1 : seul un pilote embarque');
    }
    const { rows: crew } = await client.query(
      `SELECT count(*)::int AS n FROM npcs
       WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
      [shipId],
    );
    if (crew[0].n >= 1) {
      throw new CommandError('not_available', 'v1 : un seul membre d\'équipage');
    }
    await client.query(
      `UPDATE npcs SET bound_host_type = 'ship', bound_host_id = $2 WHERE id = $1`,
      [npcId, shipId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

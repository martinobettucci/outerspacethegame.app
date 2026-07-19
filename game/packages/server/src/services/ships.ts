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
  canAcceptLanding,
  canLand,
  containersUsed,
  DOCK_DWELL_HOURS_DEFAULT,
  DOCK_RESERVED_SELF_DEFAULT,
  fitsVehicleSlot,
  FOOD_RESOURCES,
  FUEL_TRANSFER_RADIUS_PC,
  GAME_DAY_SECONDS,
  type HullCategory,
  HULLS,
  type HullSize,
  type LandingPolicy,
  occupiesDock,
  PROBE,
  type ResourceId,
  SHIP_BUILD_HOURS,
  SHIP_RETRIEVE_HOURS,
  shipBuildCost,
  survivalCapacityT,
  UNIVERSE_SIZE_PC,
  vehicleCapacity,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { evalLazy } from '../sim/lazy.js';
import { loadProductionSnapshot, recomputePlanetRates } from '../sim/rebase.js';
import { evalShipFuel, evalShipSurvival, rebaseShipDrain, rebaseShipSurvival } from '../sim/shipDrain.js';
import { releaseHarvest } from './harvest.js';
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
  /** Redéploiement warehouse→quai en cours : ISO de fin, sinon null. */
  retrievesAt: string | null;
  /** Harvest rig monté (GB §22, DG §8.8). */
  harvestRig: boolean;
  /** Étoile en cours de récolte (id), sinon null. */
  harvestingStarId: string | null;
  /** Réservoir ÉVALUÉ à la lecture (mono-type v1). */
  fuel: Record<string, number>;
  fuelType: string;
  fuelRatePerDay: number;
  fuelAsOf: string | null;
  tankU: number;
  /** Provisions de survie ÉVALUÉES (food/water T), équipage et politique. */
  survival: { food: number; water: number; ratePerDay: number };
  crewCount: number;
  fleeArmed: boolean;
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
  // Comptes à rebours de redéploiement des coques 'warehoused' (chunk AD).
  const { rows: retrieving } = await pool.query(
    `SELECT payload->>'shipId' AS ship_id, due_at FROM events
     WHERE kind = 'ship_retrieved' AND processed_at IS NULL`,
  );
  const retrievesBy = new Map(
    retrieving.map((e) => [e.ship_id, new Date(e.due_at).toISOString()]),
  );
  const { rows: crewCounts } = await pool.query(
    `SELECT bound_host_id AS ship_id, count(*)::int AS crew FROM npcs
     WHERE bound_host_type = 'ship' GROUP BY bound_host_id`,
  );
  const crewBy = new Map(crewCounts.map((c) => [c.ship_id, Number(c.crew)]));
  return rows.map((r) => {
    const pos = shipPosition(r, nowMs);
    const tank = evalShipFuel(r, nowMs);
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
      retrievesAt: retrievesBy.get(r.id) ?? null,
      harvestRig: !!r.harvest_rig,
      harvestingStarId: r.harvesting_star_id ?? null,
      survival: (() => {
        const sv = evalShipSurvival(r, nowMs);
        return {
          food: Math.floor(sv.food * 1000) / 1000,
          water: Math.floor(sv.water * 1000) / 1000,
          ratePerDay: sv.ratePerDay,
        };
      })(),
      crewCount: crewBy.get(r.id) ?? 0,
      fleeArmed: !!r.flee_armed,
      fuel: { [tank.type]: tank.units },
      fuelType: tank.type,
      fuelRatePerDay: Number(r.fuel_rate_u_per_day ?? 0),
      fuelAsOf: r.fuel_as_of ? new Date(r.fuel_as_of).toISOString() : null,
      tankU:
        r.hull_category === 'probe' || r.hull_category === 'personal'
          ? 0
          : (HULLS[
              `${r.hull_category}_${r.hull_size}` as `${HullCategory}_${HullSize}`
            ]?.tankU ?? 0),
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
    // Départ = fin de récolte (le gréement se replie — GB §22) : réservoir
    // matérialisé, l'étoile récupère ce rendement.
    if (ship.harvesting_star_id) {
      await releaseHarvest(client, ship, nowMs);
      ship.harvesting_star_id = null;
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
    let stockMutatedBodyId: string | null = null;
    if (stats.burnPerPc > 0) {
      const needed = distance * stats.burnPerPc; // matrice 1.0 [TUNE-v1]
      // Réservoir ÉVALUÉ : le drain de loitering a pu l'entamer.
      const tank = evalShipFuel(ship, nowMs);
      const fuelType = tank.type;
      const fuelObj: Record<string, number> = { [fuelType]: tank.units };
      let inTank = tank.units;
      // Auto-chargement au départ d'un monde possédé (v1 documentée) :
      // PLEIN réservoir — charger juste le trajet échouerait la coque dès
      // l'arrivée (le loitering consomme, GB §7).
      if (inTank < stats.tank && ship.docked_body_id) {
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
          const load = Math.min(stats.tank - inTank, available);
          if (load > 0) {
            await client.query(
              `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
               WHERE body_id = $1 AND resource = $2`,
              [ship.docked_body_id, resource, available - load, nowMs],
            );
            inTank += load;
            stockMutatedBodyId = ship.docked_body_id;
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
      // Transit : drain désarmé (le vol paie en pré-brûlage, pas en taux).
      await client.query(
        `UPDATE ships SET fuel = $2, fuel_rate_u_per_day = 0,
            fuel_as_of = to_timestamp($3 / 1000.0)
         WHERE id = $1`,
        [shipId, JSON.stringify(fuelObj), nowMs],
      );
    }

    const travelDays = distance / stats.speed;
    const arrivesAt = new Date(
      nowMs + (travelDays * GAME_DAY_SECONDS * 1000) / timeScale,
    );
    const wasHoverOwnBodyId = ship.status === 'hovering' ? ship.hover_body_id : null;
    await client.query(
      `UPDATE ships SET status = 'transit', docked_body_id = NULL,
         hover_body_id = NULL, docked_at = NULL,
         origin_x = $2, origin_y = $3, dest_x = $4, dest_y = $5,
         dest_body_id = $6, departed_at = to_timestamp($7 / 1000.0),
         arrives_at = $8
       WHERE id = $1`,
      [shipId, origin.x, origin.y, destX, destY, destBodyId, nowMs, arrivesAt],
    );
    await enqueue(client, 'ship_arrival', arrivesAt, { shipId });
    // Le départ désarme le drain de loitering : purge du bord obsolète, et
    // rebase des mondes dont le stock ou la charge de survol a changé
    // (auto-chargement, fin d'un survol possédé servi par la planète).
    await client.query(
      `DELETE FROM events WHERE processed_at IS NULL
         AND kind = 'ship_fuel_out' AND payload->>'shipId' = $1`,
      [shipId],
    );
    const toRebase = new Set(
      [stockMutatedBodyId, wasHoverOwnBodyId].filter((v): v is string => !!v),
    );
    for (const bodyId of toRebase) {
      const { rows: owned } = await client.query(
        `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
        [bodyId, playerId],
      );
      if (owned[0]) await recomputePlanetRates(client, bodyId, nowMs);
    }
    // Horloge de survie : l'équipage mange AUSSI en transit (GB §6 — le
    // vol a une horloge de mort ; le fuel, lui, est pré-brûlé v1).
    await rebaseShipSurvival(client, { ...ship, status: 'transit' }, nowMs);
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
      `INSERT INTO ships (owner_id, hull_category, name, x, y, status, docked_body_id, docked_at)
       VALUES ($1, 'probe', 'Probe', $2, $3, 'docked', $4, now()) RETURNING id`,
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
 * monde étranger = spaceport ACTIF avec politique `everyone` ; monde
 * sauvage = personne pour vous accueillir. Docks (DG §5.1/§8.6) : dès
 * qu'un spaceport actif existe, la capacité S/M/L s'applique à TOUS
 * (propriétaire compris) — exemptions canon : personnel, Combat-S ;
 * les docks réservés « pour soi » sont retirés du pool visiteurs.
 * Exception bootstrap [TUNE-v1, JOURNAL] : SON monde SANS spaceport
 * actif accueille toujours (le canon strict bloquerait le début de
 * partie : le starter naît sans bâtiment).
 * Un VISITEUR reçoit une éviction de séjour (dwell, défaut 24 h [TUNE]) ;
 * l'usure d'atterrissage (DG §8.6) attend le suivi d'armure — gap documenté.
 * Verrou corps AVANT vaisseau (convention anti-deadlock, DAT §8) : les
 * atterrissages concurrents sur un même monde se sérialisent sur le corps.
 */
export async function landShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ bodyId: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Pré-lecture sans verrou pour connaître le monde survolé, puis verrou
    // corps → vaisseau ; l'état du vaisseau est re-vérifié après verrou.
    // La PROPRIÉTÉ se vérifie avant tout état (§10 : pas d'oracle d'état
    // sur la coque d'autrui) ; lockOwnedShip la re-vérifie sous verrou.
    const { rows: pre } = await client.query(
      `SELECT owner_id, hover_body_id FROM ships WHERE id = $1`,
      [shipId],
    );
    if (!pre[0]) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (pre[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce vaisseau ne vous obéit pas');
    }
    if (!pre[0].hover_body_id) {
      throw new CommandError('not_available', 'Aucun monde sous la coque');
    }
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id, body_type FROM bodies WHERE id = $1 FOR UPDATE`,
      [pre[0].hover_body_id],
    );
    const body = bodies[0];
    if (!body || body.body_type !== 'planet') {
      throw new CommandError('not_available', 'On ne se pose que sur une planète');
    }
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (ship.hull_category === 'probe') {
      throw new CommandError('not_available', 'Une sonde ne se pose pas');
    }
    if (ship.status !== 'hovering' || ship.hover_body_id !== body.id) {
      throw new CommandError('not_available', 'Aucun monde sous la coque');
    }
    const owned = body.owner_id === playerId;
    const { rows: ports } = await client.query(
      `SELECT level, config FROM buildings
       WHERE body_id = $1 AND key = 'spaceport' AND status = 'active'`,
      [body.id],
    );
    const hasActiveSpaceport = ports.length > 0;
    // Plusieurs spaceports : la politique la plus permissive prévaut.
    const policy: LandingPolicy = ports.some(
      (p) => p.config?.landing === 'everyone',
    )
      ? 'everyone'
      : 'self';
    // Combat-S : « se pose n'importe où, sans dock » (GB §14) — ignore la
    // politique d'atterrissage et l'absence d'infrastructure [interp
    // annoncée, JOURNAL ; le sanctuaire/siège arbitrera en P5].
    const landsAnywhere =
      ship.hull_category === 'combat' && ship.hull_size === 's';
    if (!owned && !landsAnywhere) {
      if (!body.owner_id) {
        // Monde sauvage : pas d'infrastructure d'accueil (la coque colonie
        // passe par la commande colonize, GB §19).
        throw new CommandError('not_available', 'Monde sauvage : rien pour vous accueillir');
      }
      if (!canLand({ owned, hasActiveSpaceport, policy })) {
        throw new CommandError(
          'forbidden',
          hasActiveSpaceport
            ? 'Le spaceport ne vous accepte pas (politique d\'atterrissage)'
            : 'Aucun spaceport actif ne vous accueille ici',
        );
      }
    }

    // Capacité de dock (DG §5.1) — seulement si la coque occupe un dock et
    // qu'un spaceport actif existe (sinon : exception bootstrap sur SON
    // monde, déjà refusé ailleurs).
    const occupies = occupiesDock(ship.hull_category, ship.hull_size);
    if (occupies && hasActiveSpaceport) {
      const spConfigs = ports.map((p) => ({
        level: Number(p.level),
        reservedForSelf: Number(
          p.config?.reservedForSelf ?? DOCK_RESERVED_SELF_DEFAULT,
        ),
      }));
      const { rows: occupants } = await client.query(
        `SELECT hull_category, hull_size, owner_id FROM ships
         WHERE docked_body_id = $1 AND status = 'docked'`,
        [body.id],
      );
      const docked = occupants
        .filter((o) => occupiesDock(o.hull_category, o.hull_size))
        .map((o) => ({
          size: o.hull_size as HullSize,
          isOwner: o.owner_id === body.owner_id,
        }));
      const verdict = canAcceptLanding(spConfigs, docked, {
        size: ship.hull_size as HullSize,
        isOwner: ship.owner_id === body.owner_id,
      });
      if (!verdict.ok) {
        const size = String(ship.hull_size).toUpperCase();
        const cap =
          ship.hull_size === 'l'
            ? verdict.total.l
            : ship.hull_size === 'm'
              ? verdict.total.m + verdict.total.l
              : verdict.total.s + verdict.total.m + verdict.total.l;
        throw new CommandError(
          'not_available',
          cap === 0
            ? `Aucun dock ${size} ici (niveau de spaceport insuffisant)`
            : `Docks saturés : aucun dock libre pour une coque ${size}`,
        );
      }
    }

    await client.query(
      `UPDATE ships SET status = 'docked', docked_body_id = $2,
         hover_body_id = NULL, docked_at = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [shipId, body.id, nowMs],
    );
    // Visiteur sur un monde POSSÉDÉ par autrui : séjour au sol borné
    // (anti-DoS) — pour TOUTE coque, dock ou pas [TUNE-v1 interp, JOURNAL :
    // sinon un Combat-S exempt camperait à quai sans payer le survol]. Le
    // dwell le plus généreux des spaceports actifs prévaut (cohérent avec
    // la politique la plus permissive) ; sans spaceport, défaut canon.
    if (!owned && body.owner_id) {
      const dwellHours = ports.length
        ? Math.max(
            ...ports.map((p) =>
              Number(p.config?.dwellHours ?? DOCK_DWELL_HOURS_DEFAULT),
            ),
          )
        : DOCK_DWELL_HOURS_DEFAULT;
      await enqueue(
        client,
        'dock_eviction',
        new Date(nowMs + (dwellHours * 3600 * 1000) / timeScale),
        { shipId, bodyId: body.id, landedAtMs: nowMs },
      );
    }
    // À quai : drain désarmé (réservoir matérialisé, taux 0, bord purgé) ;
    // sur SON monde, rebase — la planète cesse de payer le survol.
    await rebaseShipDrain(client, ship, nowMs, 'none');
    if (owned) await recomputePlanetRates(client, body.id, nowMs);
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
         docked_body_id = NULL, docked_at = NULL
       WHERE id = $1`,
      [shipId],
    );
    // Armer le drain de loitering (GB §7) : sur SON monde le rebase
    // planétaire décide (stock ou réservoir) ; ailleurs le réservoir paie.
    const nowMs = Date.now();
    const { rows: over } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1`,
      [ship.docked_body_id],
    );
    if (over[0]?.owner_id === playerId) {
      await recomputePlanetRates(client, ship.docked_body_id, nowMs);
    } else {
      await rebaseShipDrain(client, { ...ship, status: 'hovering' }, nowMs, 'tank');
    }
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
 * Ravitaillement depuis un monde POSSÉDÉ (GB §13) — à quai, en survol ou
 * échoué au-dessus. v1 : jamais depuis le monde d'autrui (le commerce de
 * carburant passe par le marché/l'hospitalité). Un échoué ravitaillé
 * repasse en survol. Verrou corps AVANT vaisseau (convention anti-deadlock,
 * DAT §8).
 */
export async function refuelShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { units?: number; nowMs?: number } = {},
): Promise<{ loaded: number; fuelType: string; units: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Pré-lecture sans verrou pour connaître le corps source, puis verrou
    // corps → vaisseau ; l'état du vaisseau est re-vérifié après verrou.
    const { rows: pre } = await client.query(
      `SELECT docked_body_id, hover_body_id FROM ships WHERE id = $1`,
      [shipId],
    );
    if (!pre[0]) throw new CommandError('not_found', 'Vaisseau inconnu');
    const sourceBodyId = pre[0].docked_body_id ?? pre[0].hover_body_id;
    if (!sourceBodyId) {
      throw new CommandError('not_available', 'Aucun monde sous la coque');
    }
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id FROM bodies WHERE id = $1 FOR UPDATE`,
      [sourceBodyId],
    );
    if (!bodies[0] || bodies[0].owner_id !== playerId) {
      throw new CommandError(
        'forbidden',
        'Ravitaillement sur vos mondes seulement (v1)',
      );
    }
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (
      (ship.docked_body_id ?? ship.hover_body_id) !== sourceBodyId ||
      !['docked', 'hovering', 'stranded'].includes(ship.status)
    ) {
      throw new CommandError('not_available', `Vaisseau indisponible (${ship.status})`);
    }
    if (ship.hull_category === 'probe' || ship.hull_category === 'personal') {
      throw new CommandError('not_available', 'Cette coque n\'a pas de réservoir');
    }
    const tankU =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`]
        ?.tankU ?? 0;
    const tank = evalShipFuel(ship, nowMs);
    const resource = `fuel_${tank.type}`;
    const capLeft = tankU - tank.units;
    const want = Math.min(opts.units ?? Number.POSITIVE_INFINITY, capLeft);
    if (want <= 1e-9) {
      throw new CommandError('not_available', 'Réservoir déjà plein');
    }
    const { rows: stockRows } = await client.query(
      `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
       WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
      [sourceBodyId, resource],
    );
    const available = stockRows[0]
      ? evalLazy(
          {
            amount: stockRows[0].amount_t,
            ratePerDay: stockRows[0].rate_t_per_day,
            asOfMs: new Date(stockRows[0].as_of).getTime(),
          },
          nowMs,
          { min: 0 },
        )
      : 0;
    const take = Math.min(want, available);
    if (take <= 1e-9) {
      throw new CommandError(
        'insufficient_resources',
        `Pas de ${resource} dans le stock de ce monde`,
      );
    }
    await client.query(
      `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
       WHERE body_id = $1 AND resource = $2`,
      [sourceBodyId, resource, available - take, nowMs],
    );
    if (ship.status === 'stranded') {
      await client.query(
        `UPDATE ships SET status = 'hovering', hover_body_id = $2
         WHERE id = $1`,
        [shipId, sourceBodyId],
      );
    }
    // Réservoir écrit figé ; le rebase planétaire qui suit décide de la
    // vraie cible (servi par le stock, ou réservoir si le monde est à sec).
    await rebaseShipDrain(client, ship, nowMs, 'none', {
      setUnits: tank.units + take,
    });
    await recomputePlanetRates(client, sourceBodyId, nowMs);
    await client.query('COMMIT');
    return { loaded: take, fuelType: tank.type, units: tank.units + take };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Avitaillement de SURVIE (GB §6/§7, DG §3.5) : depuis SON monde
 * (à quai, en survol, ou échoué — miroir du ravitaillement fuel), les
 * familles food (food_1→3) et water du stock remplissent les provisions
 * de la coque jusqu'à la capacité de coque (survivalCrewDays × 0.01 ×
 * équipage). Partiel si le stock manque ; refusé sans équipage (capacité
 * nulle) ou si tout est déjà plein.
 */
export async function provisionShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ loadedFood: number; loadedWater: number; food: number; water: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: pre } = await client.query(
      `SELECT docked_body_id, hover_body_id FROM ships WHERE id = $1`,
      [shipId],
    );
    if (!pre[0]) throw new CommandError('not_found', 'Vaisseau inconnu');
    const sourceBodyId = pre[0].docked_body_id ?? pre[0].hover_body_id;
    if (!sourceBodyId) {
      throw new CommandError('not_available', 'Aucun monde sous la coque');
    }
    const { rows: bodies } = await client.query(
      `SELECT id, owner_id FROM bodies WHERE id = $1 FOR UPDATE`,
      [sourceBodyId],
    );
    if (!bodies[0] || bodies[0].owner_id !== playerId) {
      throw new CommandError(
        'forbidden',
        'Avitaillement sur vos mondes seulement (v1)',
      );
    }
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (
      (ship.docked_body_id ?? ship.hover_body_id) !== sourceBodyId ||
      !['docked', 'hovering', 'stranded'].includes(ship.status)
    ) {
      throw new CommandError('not_available', `Vaisseau indisponible (${ship.status})`);
    }
    if (ship.hull_category === 'probe' || ship.hull_category === 'personal') {
      throw new CommandError('not_available', 'Cette coque n\'embarque pas de vivres');
    }
    const { rows: crewRows } = await client.query(
      `SELECT count(*)::int AS crew FROM npcs
       WHERE bound_host_type = 'ship' AND bound_host_id = $1`,
      [shipId],
    );
    const crew = Number(crewRows[0]?.crew ?? 0);
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    const capPerRes = survivalCapacityT(hull?.survivalCrewDays ?? 0, crew);
    if (capPerRes <= 1e-9) {
      throw new CommandError('not_available', 'Aucun équipage à nourrir');
    }
    const sv = evalShipSurvival(ship, nowMs);
    const wantFood = Math.max(0, capPerRes - sv.food);
    const wantWater = Math.max(0, capPerRes - sv.water);
    if (wantFood <= 1e-9 && wantWater <= 1e-9) {
      throw new CommandError('not_available', 'Provisions déjà pleines');
    }
    // Prélèvement par FAMILLE (mêmes familles que la survie au sol),
    // dans l'ordre du catalogue — food_1 d'abord, comme la population.
    const drawFamily = async (
      family: readonly string[],
      want: number,
    ): Promise<number> => {
      let drawn = 0;
      for (const resource of family) {
        if (drawn >= want - 1e-9) break;
        const { rows: stockRows } = await client.query(
          `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
           WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
          [sourceBodyId, resource],
        );
        if (!stockRows[0]) continue;
        const available = evalLazy(
          {
            amount: stockRows[0].amount_t,
            ratePerDay: stockRows[0].rate_t_per_day,
            asOfMs: new Date(stockRows[0].as_of).getTime(),
          },
          nowMs,
          { min: 0 },
        );
        const take = Math.min(want - drawn, available);
        if (take <= 1e-9) continue;
        await client.query(
          `UPDATE planet_stock SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)
           WHERE body_id = $1 AND resource = $2`,
          [sourceBodyId, resource, available - take, nowMs],
        );
        drawn += take;
      }
      return drawn;
    };
    const loadedFood = await drawFamily(FOOD_RESOURCES, wantFood);
    const loadedWater = await drawFamily(['water'], wantWater);
    if (loadedFood <= 1e-9 && loadedWater <= 1e-9) {
      throw new CommandError(
        'insufficient_resources',
        'Ni vivres ni eau dans le stock de ce monde',
      );
    }
    // Provisions écrites figées ; le rebase planétaire qui suit décide du
    // vrai taux (servi par le stock en survol, ou horloge armée).
    await rebaseShipSurvival(client, ship, nowMs, {
      setFoodT: sv.food + loadedFood,
      setWaterT: sv.water + loadedWater,
    });
    await recomputePlanetRates(client, sourceBodyId, nowMs);
    await client.query('COMMIT');
    return {
      loadedFood,
      loadedWater,
      food: sv.food + loadedFood,
      water: sv.water + loadedWater,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Transfert de carburant vaisseau→vaisseau (GB §13) : v1 entre VOS coques,
 * à ≤ FUEL_TRANSFER_RADIUS_PC [TUNE-GAP], même type de carburant, cap du
 * réservoir receveur, instantané [TUNE-v1]. Un receveur échoué repart en
 * survol (ou à l'arrêt dans le vide). Verrouillage des deux coques par id
 * CROISSANT (anti-deadlock).
 */
export async function transferFuel(
  pool: pg.Pool,
  playerId: string,
  fromShipId: string,
  opts: { toShipId: string; units: number; nowMs?: number },
): Promise<{ transferred: number; fuelType: string }> {
  const nowMs = opts.nowMs ?? Date.now();
  if (fromShipId === opts.toShipId) {
    throw new CommandError('not_available', 'Un vaisseau ne se ravitaille pas lui-même');
  }
  if (!(opts.units > 0)) {
    throw new CommandError('not_available', 'Quantité invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ships WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
      [[fromShipId, opts.toShipId]],
    );
    const from = rows.find((r) => r.id === fromShipId);
    const to = rows.find((r) => r.id === opts.toShipId);
    if (!from || !to) throw new CommandError('not_found', 'Vaisseau inconnu');
    if (from.owner_id !== playerId || to.owner_id !== playerId) {
      throw new CommandError('forbidden', 'v1 : transfert entre VOS coques seulement');
    }
    for (const s of [from, to]) {
      if (!['docked', 'hovering', 'idle', 'stranded'].includes(s.status)) {
        throw new CommandError('not_available', `Vaisseau indisponible (${s.status})`);
      }
      if (s.hull_category === 'probe' || s.hull_category === 'personal') {
        throw new CommandError('not_available', 'Cette coque n\'a pas de réservoir');
      }
    }
    const fromTank = evalShipFuel(from, nowMs);
    const toTank = evalShipFuel(to, nowMs);
    if (fromTank.type !== toTank.type) {
      throw new CommandError(
        'not_available',
        `Types de carburant incompatibles (${fromTank.type} → ${toTank.type})`,
      );
    }
    const a = shipPosition(from, nowMs);
    const b = shipPosition(to, nowMs);
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    if (distance > FUEL_TRANSFER_RADIUS_PC + 1e-9) {
      throw new CommandError(
        'not_available',
        `Trop loin pour transférer : ${distance.toFixed(2)} pc (max ${FUEL_TRANSFER_RADIUS_PC} pc)`,
      );
    }
    const toTankU =
      HULLS[`${to.hull_category}_${to.hull_size}` as `${HullCategory}_${HullSize}`]
        ?.tankU ?? 0;
    const capLeft = toTankU - toTank.units;
    const take = Math.min(opts.units, fromTank.units, capLeft);
    if (capLeft <= 1e-9) {
      throw new CommandError('not_available', 'Réservoir receveur déjà plein');
    }
    if (take <= 1e-9) {
      throw new CommandError('insufficient_resources', 'Réservoir donneur vide');
    }

    // Receveur échoué : il repart (survol si un monde est dessous, sinon
    // à l'arrêt dans le vide).
    let toStatus = to.status;
    if (to.status === 'stranded' && take > 1e-9) {
      toStatus = to.hover_body_id ? 'hovering' : 'idle';
      await client.query(`UPDATE ships SET status = $2 WHERE id = $1`, [
        to.id,
        toStatus,
      ]);
    }

    // Écritures + re-armement : cible réservoir pour les coques en
    // loitering hors monde possédé ; les survols de MONDES POSSÉDÉS sont
    // rebasés par recomputePlanetRates (le stock décide).
    const ownHoverBodies = new Set<string>();
    const applyDrain = async (
      shipRow: Record<string, unknown>,
      status: string,
      units: number,
    ) => {
      const hoverBodyId = shipRow.hover_body_id as string | null;
      let overOwn = false;
      if (status === 'hovering' && hoverBodyId) {
        const { rows: over } = await client.query(
          `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
          [hoverBodyId, playerId],
        );
        overOwn = !!over[0];
        if (overOwn) ownHoverBodies.add(hoverBodyId);
      }
      const target =
        !overOwn && (status === 'hovering' || status === 'idle') ? 'tank' : 'none';
      await rebaseShipDrain(
        client,
        shipRow as Parameters<typeof rebaseShipDrain>[1],
        nowMs,
        target,
        { setUnits: units },
      );
    };
    await applyDrain(from, from.status, fromTank.units - take);
    await applyDrain(to, toStatus, toTank.units + take);
    for (const bodyId of ownHoverBodies) {
      await recomputePlanetRates(client, bodyId, nowMs);
    }
    await client.query('COMMIT');
    return { transferred: take, fuelType: fromTank.type };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Instrumentation §15 (ATG_TEST_ENDPOINTS uniquement — la route n'existe
 * pas hors test) : fixe le réservoir au u près puis RE-ARME le drain selon
 * l'état réel — l'échouage E2E devient déterministe sans attendre des
 * jours réels de drain.
 */
export async function setShipFuelForTest(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { units: number; nowMs?: number },
): Promise<void> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    let overOwn = false;
    if (ship.status === 'hovering' && ship.hover_body_id) {
      const { rows } = await client.query(
        `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2`,
        [ship.hover_body_id, playerId],
      );
      overOwn = !!rows[0];
    }
    if (overOwn) {
      await rebaseShipDrain(client, ship, nowMs, 'none', { setUnits: opts.units });
      await recomputePlanetRates(client, ship.hover_body_id, nowMs);
    } else {
      const target =
        ship.status === 'hovering' || ship.status === 'idle' ? 'tank' : 'none';
      await rebaseShipDrain(client, ship, nowMs, target, { setUnits: opts.units });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Instrumentation E2E (§15, jamais en prod — route gated
 * ATG_TEST_ENDPOINTS) : téléporte SON vaisseau en survol d'un corps.
 * Les poches de spawn sont disjointes et l'autonomie v1 d'un Cargo S rend
 * le vol inter-poches non déterministe (distance roulée par le seed) —
 * l'atterrissage, lui, reste le VRAI chemin (politique + docks). L'état
 * simulé reste cohérent : drain de survol armé sur le réservoir.
 */
/**
 * Entrepose une coque À QUAI sur SON monde (GB §9, DG §6 round 6) :
 * balances de véhicules par taille (Σ warehouses actifs × mult(niveau) +
 * tampon au sol 2M/2S — jamais de L sans warehouse), zéro consommation en
 * entrepôt, et LIBÉRATION de l'équipage — le seul point de sortie du lien
 * permanent (GB §12) : les PNJ retournent à la main du joueur. Exclusions
 * [interp annoncée, JOURNAL] : personnal (le Souverain ne se remise pas),
 * probe (jamais à quai au sens dock).
 */
export async function warehouseShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ bodyId: string; crewReleased: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (['personal', 'probe'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque ne se remise pas');
    }
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'On remise depuis le quai');
    }
    const { rows: owned } = await client.query(
      `SELECT 1 FROM bodies WHERE id = $1 AND owner_id = $2 FOR UPDATE`,
      [ship.docked_body_id, playerId],
    );
    if (!owned[0]) {
      throw new CommandError(
        'forbidden',
        'On remise sur SES mondes (parking allié : P4)',
      );
    }
    const { rows: whRows } = await client.query(
      `SELECT level FROM buildings
       WHERE body_id = $1 AND key = 'warehouse' AND status = 'active'`,
      [ship.docked_body_id],
    );
    const capacity = vehicleCapacity(whRows.map((w) => Number(w.level)));
    const { rows: storedRows } = await client.query(
      `SELECT hull_size, count(*)::int AS n FROM ships
       WHERE docked_body_id = $1 AND status = 'warehoused'
       GROUP BY hull_size`,
      [ship.docked_body_id],
    );
    const stored = { s: 0, m: 0, l: 0 };
    for (const r of storedRows) {
      stored[r.hull_size as 's' | 'm' | 'l'] = Number(r.n);
    }
    const size = ship.hull_size as 's' | 'm' | 'l';
    if (!fitsVehicleSlot(size, stored, capacity)) {
      throw new CommandError(
        'not_available',
        capacity[size] === 0
          ? 'Aucune balance L ici — le lourd exige un warehouse actif'
          : `Balances ${size.toUpperCase()} pleines (${stored[size]}/${capacity[size]})`,
      );
    }
    // Libération d'équipage — le SEUL point de sortie du lien (GB §12).
    const { rows: released } = await client.query(
      `UPDATE npcs SET bound_host_type = NULL, bound_host_id = NULL
       WHERE bound_host_type = 'ship' AND bound_host_id = $1
       RETURNING id`,
      [shipId],
    );
    await client.query(
      `UPDATE ships SET status = 'warehoused', docked_at = NULL WHERE id = $1`,
      [shipId],
    );
    // Zéro consommation (canon) : drains désarmés, équipage déjà parti.
    await rebaseShipDrain(client, { ...ship, status: 'warehoused' }, nowMs, 'none');
    await client.query('COMMIT');
    return { bodyId: ship.docked_body_id, crewReleased: released.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Redéploiement warehouse → quai (DG §6) : exige un DOCK LIBRE au
 * lancement (capacité chunk S, côté propriétaire) et dure 1/3/6 h par
 * taille [TUNE interp du « 1–6 h » canon] ÷ timeScale — l'événement
 * ship_retrieved repose la coque à quai. Un redéploiement à la fois.
 */
export async function retrieveShip(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ readyAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (ship.status !== 'warehoused' || !ship.docked_body_id) {
      throw new CommandError('not_available', "Cette coque n'est pas en entrepôt");
    }
    const { rows: pendingRows } = await client.query(
      `SELECT 1 FROM events WHERE processed_at IS NULL
         AND kind = 'ship_retrieved' AND payload->>'shipId' = $1`,
      [shipId],
    );
    if (pendingRows[0]) {
      throw new CommandError('not_available', 'Redéploiement déjà en cours');
    }
    // Dock libre exigé (canon « needs a free dock ») — même règle que
    // l'atterrissage ; sans spaceport actif : exception bootstrap sur SON
    // monde (cohérent avec landShip).
    const { rows: bodyRows } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1 FOR UPDATE`,
      [ship.docked_body_id],
    );
    const { rows: ports } = await client.query(
      `SELECT level, config FROM buildings
       WHERE body_id = $1 AND key = 'spaceport' AND status = 'active'`,
      [ship.docked_body_id],
    );
    if (occupiesDock(ship.hull_category, ship.hull_size) && ports.length > 0) {
      const spConfigs = ports.map((p) => ({
        level: Number(p.level),
        reservedForSelf: Number(
          p.config?.reservedForSelf ?? DOCK_RESERVED_SELF_DEFAULT,
        ),
      }));
      const { rows: occupants } = await client.query(
        `SELECT hull_category, hull_size, owner_id FROM ships
         WHERE docked_body_id = $1 AND status = 'docked'`,
        [ship.docked_body_id],
      );
      const docked = occupants
        .filter((o) => occupiesDock(o.hull_category, o.hull_size))
        .map((o) => ({
          size: o.hull_size as HullSize,
          isOwner: o.owner_id === bodyRows[0]?.owner_id,
        }));
      const verdict = canAcceptLanding(spConfigs, docked, {
        size: ship.hull_size as HullSize,
        isOwner: ship.owner_id === bodyRows[0]?.owner_id,
      });
      if (!verdict.ok) {
        throw new CommandError(
          'not_available',
          'Aucun dock libre pour le redéploiement',
        );
      }
    }
    const hours = SHIP_RETRIEVE_HOURS[ship.hull_size as 's' | 'm' | 'l'] ?? 1;
    const readyAt = new Date(nowMs + (hours * 3_600_000) / timeScale);
    await enqueue(client, 'ship_retrieved', readyAt, { shipId });
    await client.query('COMMIT');
    return { readyAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Instrumentation E2E (§15) : fixe les provisions de survie de SON
 * vaisseau puis rebase l'horloge (l'échéance réelle en découle). */
export async function setShipSurvivalForTest(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { foodT: number; waterT: number; nowMs?: number },
): Promise<void> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    await rebaseShipSurvival(client, ship, nowMs, {
      setFoodT: opts.foodT,
      setWaterT: opts.waterT,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Arme/désarme la politique auto-flee-home (DG §3.5, anti-extorsion). */
export async function setFleePolicy(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  armed: boolean,
): Promise<void> {
  const { rows } = await pool.query(
    `UPDATE ships SET flee_armed = $3
     WHERE id = $1 AND owner_id = $2 RETURNING id`,
    [shipId, playerId, armed],
  );
  if (!rows[0]) throw new CommandError('not_found', 'Vaisseau inconnu');
}

export async function relocateShipForTest(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  bodyId: string,
  nowMs = Date.now(),
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!['docked', 'hovering', 'idle'].includes(ship.status)) {
      throw new CommandError('not_available', `Vaisseau indisponible (${ship.status})`);
    }
    const { rows: bodies } = await client.query(
      `SELECT id, x, y FROM bodies WHERE id = $1 AND body_type = 'planet'`,
      [bodyId],
    );
    if (!bodies[0]) throw new CommandError('not_found', 'Planète inconnue');
    await client.query(
      `UPDATE ships SET status = 'hovering', hover_body_id = $2,
         docked_body_id = NULL, docked_at = NULL, x = $3, y = $4
       WHERE id = $1`,
      [shipId, bodyId, bodies[0].x, bodies[0].y],
    );
    await rebaseShipDrain(client, { ...ship, status: 'hovering' }, nowMs, 'tank');
    // État COHÉRENT (§15) : sur un monde possédé, le recompute décide qui
    // paie (stock servi ⇒ exemptions fuel/survie) — comme les vraies
    // commandes d'entrée en survol.
    const { rows: over } = await client.query(
      `SELECT owner_id FROM bodies WHERE id = $1`,
      [bodyId],
    );
    if (over[0]?.owner_id === ship.owner_id) {
      await recomputePlanetRates(client, bodyId, nowMs);
    }
    await client.query('COMMIT');
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
      // Canon §3.3b (aligné chunk Y) : « swaps/deliveries may overfill
      // (physics) ; only production halts at cap » — la décharge atterrit
      // TOUJOURS (rien ne se perd) ; le frein/halt de production absorbe
      // le trop-plein, visible au census et à l'écran de stats.
      const snap = await loadProductionSnapshot(client, bodyId, nowMs, {
        forUpdate: true,
      });
      if (!snap) throw new CommandError('not_found', 'Planète inconnue');
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
    accountBoundUntil: string | null;
  }[]
> {
  const { rows } = await pool.query(
    `SELECT id, people, role, rarity, stat_rolls, bound_host_type, bound_host_id,
            account_bound_until
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
    accountBoundUntil: r.account_bound_until
      ? new Date(r.account_bound_until).toISOString()
      : null,
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
    if (
      !['docked', 'warehoused'].includes(ship.status) ||
      !ship.docked_body_id
    ) {
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
    // L'équipage vient de changer : l'horloge de survie se rebase.
  const { rows: shipNow } = await client.query(
    `SELECT * FROM ships WHERE id = $1`,
    [shipId],
  );
  if (shipNow[0]) await rebaseShipSurvival(client, shipNow[0], Date.now());
  await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

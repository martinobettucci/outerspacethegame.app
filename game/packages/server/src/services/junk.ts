/**
 * Champs de junk (GB §22, DG §10.4) — larguer, fusionner, décroître,
 * collecter. Le junk est une ARME de déni de zone (dégâts de présence via
 * l'usure de coque) autant qu'une matière (tier salvage → recycleur §6).
 * Trou noir ≤ 5 pc = puits sans conséquence (canon). Zone interdite de
 * dump : 50 pc autour de TOUT starter [TUNE]. 5 dumps/jour RÉEL/coque.
 * Collecte : UN scoop de 30 T par 24 h-jeu [TUNE-v1, discrétisation
 * annoncée du « 30 T/day »] dans la limite des conteneurs libres.
 */
import {
  CLAIM_HOURS,
  CLAIM_RADIUS_PC,
  CLAIM_RIG_COST,
  containersUsed,
  evalJunkAmount,
  HULLS,
  JUNK_CELL_PC,
  JUNK_COLLECTOR_COST,
  JUNK_DUMPS_PER_DAY,
  JUNK_FIELD_EPSILON_T,
  JUNK_NO_DUMP_STARTER_PC,
  JUNK_SCOOP_COOLDOWN_HOURS,
  JUNK_SCOOP_T,
  JUNK_SINK_RADIUS_PC,
  junkCellOf,
  type HullCategory,
  type HullSize,
  type ResourceId,
} from '@atg/shared';
import type pg from 'pg';
import { CommandError, payCost } from './planets.js';
import { rebaseShipDrain } from '../sim/shipDrain.js';
import { enqueue } from '../sim/events.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function lockOwnedShip(
  client: pg.PoolClient,
  playerId: string,
  shipId: string,
): Promise<Row> {
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
 * Verse du junk dans la cellule de (x, y) — fusion avec le champ existant
 * (max un champ par cellule, canon), tonnage matérialisé avant l'apport.
 * S'exécute dans la transaction appelante.
 */
export async function depositJunkAt(
  client: pg.PoolClient,
  x: number,
  y: number,
  tons: number,
  nowMs: number,
  createdBy: string | null,
): Promise<void> {
  if (tons <= 0) return;
  const cellX = junkCellOf(x);
  const cellY = junkCellOf(y);
  const { rows } = await client.query(
    `SELECT * FROM junk_fields WHERE cell_x = $1 AND cell_y = $2 FOR UPDATE`,
    [cellX, cellY],
  );
  if (rows[0]) {
    const current = evalJunkAmount(
      Number(rows[0].amount_t),
      new Date(rows[0].as_of).getTime(),
      nowMs,
    );
    await client.query(
      `UPDATE junk_fields SET amount_t = $2, as_of = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [rows[0].id, current + tons, nowMs],
    );
  } else {
    await client.query(
      `INSERT INTO junk_fields (cell_x, cell_y, x, y, amount_t, as_of, created_by)
       VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0), $7)`,
      [
        cellX,
        cellY,
        (cellX + 0.5) * JUNK_CELL_PC,
        (cellY + 0.5) * JUNK_CELL_PC,
        tons,
        nowMs,
        createdBy,
      ],
    );
  }
}

/**
 * Largue du fret par-dessus bord (GB §22) : en survol/idle/échoué, hors
 * de la zone starter (50 pc), 5 fois par jour réel et par coque [TUNE].
 * À ≤ 5 pc d'un trou noir : le fret DISPARAÎT (puits canon) — sinon il
 * devient un champ de junk dans la cellule (1 T = 1 T [TUNE-v1]).
 */
export async function dumpCargo(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  input: { resource: string; tons: number },
  opts: { nowMs?: number } = {},
): Promise<{ dumped: number; sunk: boolean }> {
  const nowMs = opts.nowMs ?? Date.now();
  const tons = Number(input.tons);
  if (!Number.isFinite(tons) || tons <= 0) {
    throw new CommandError('not_available', 'Tonnage invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!['hovering', 'idle', 'stranded'].includes(ship.status)) {
      throw new CommandError(
        'not_available',
        'On largue dans le vide (survol, arrêt ou échouage)',
      );
    }
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    const held = Number(cargo[input.resource] ?? 0);
    if (held < tons - 1e-9) {
      throw new CommandError('insufficient_resources', 'Soute insuffisante');
    }
    // Quota 5/jour RÉEL [TUNE] — compteur par coque, remis au changement
    // de jour UTC.
    // Jour UTC en TEXTE (une colonne date re-lue par pg dérive d'un jour
    // selon la TZ locale du process — leçon de test, chunk AI).
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const sameDay = ship.dump_day === today;
    const count = sameDay ? Number(ship.dump_count ?? 0) : 0;
    if (count >= JUNK_DUMPS_PER_DAY) {
      throw new CommandError(
        'not_available',
        `Quota de largage atteint (${JUNK_DUMPS_PER_DAY}/jour)`,
      );
    }
    // Zone interdite : 50 pc autour de TOUT starter (anti-grief canon).
    const { rows: starters } = await client.query(
      `SELECT 1 FROM bodies
       WHERE is_starter = true
         AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4
         AND sqrt(power(x - $5, 2) + power(y - $6, 2)) < $7
       LIMIT 1`,
      [
        Number(ship.x) - JUNK_NO_DUMP_STARTER_PC,
        Number(ship.x) + JUNK_NO_DUMP_STARTER_PC,
        Number(ship.y) - JUNK_NO_DUMP_STARTER_PC,
        Number(ship.y) + JUNK_NO_DUMP_STARTER_PC,
        ship.x,
        ship.y,
        JUNK_NO_DUMP_STARTER_PC,
      ],
    );
    if (starters[0]) {
      throw new CommandError(
        'forbidden',
        'Zone protégée : aucun largage à moins de 50 pc d\'un monde starter',
      );
    }
    // Puits d'un trou noir ≤ 5 pc : le fret disparaît proprement (canon).
    const { rows: sinks } = await client.query(
      `SELECT 1 FROM bodies
       WHERE body_type = 'black_hole'
         AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4
         AND sqrt(power(x - $5, 2) + power(y - $6, 2)) <= $7
       LIMIT 1`,
      [
        Number(ship.x) - JUNK_SINK_RADIUS_PC,
        Number(ship.x) + JUNK_SINK_RADIUS_PC,
        Number(ship.y) - JUNK_SINK_RADIUS_PC,
        Number(ship.y) + JUNK_SINK_RADIUS_PC,
        ship.x,
        ship.y,
        JUNK_SINK_RADIUS_PC,
      ],
    );
    const sunk = !!sinks[0];
    if (held - tons < 1e-9) delete cargo[input.resource];
    else cargo[input.resource] = held - tons;
    await client.query(
      `UPDATE ships SET cargo = $2, dump_day = $3, dump_count = $4
       WHERE id = $1`,
      [shipId, JSON.stringify(cargo), today, count + 1],
    );
    if (!sunk) {
      await depositJunkAt(client, Number(ship.x), Number(ship.y), tons, nowMs, playerId);
    }
    // Le largueur s'attarde DANS sa propre cellule : l'usure s'arme.
    await rebaseShipDrain(client, { ...ship, cargo }, nowMs, 'tank');
    await client.query('COMMIT');
    return { dumped: tons, sunk };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Monte le junk collector (atelier L2, 15 steelL + 5 silicon [TUNE]). */
export async function fitJunkCollector(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ cost: typeof JUNK_COLLECTOR_COST }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (['probe', 'personal'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque ne collecte pas');
    }
    if (ship.junk_collector) {
      throw new CommandError('not_available', 'Le collecteur est déjà monté');
    }
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'Le collecteur se monte à quai');
    }
    const { rows: worlds } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
      [ship.docked_body_id],
    );
    if (!worlds[0] || worlds[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
    }
    const { rows: shop } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'workshop' AND status = 'active'
         AND level >= 2`,
      [ship.docked_body_id],
    );
    if (!shop[0]) {
      throw new CommandError('not_available', 'Un workshop L2 actif est requis');
    }
    await payCost(client, worlds[0].id, worlds[0].climate, JUNK_COLLECTOR_COST, nowMs);
    await client.query(
      `UPDATE ships SET junk_collector = true WHERE id = $1`,
      [shipId],
    );
    await client.query('COMMIT');
    return { cost: JUNK_COLLECTOR_COST };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Un scoop de collecte (30 T [TUNE-v1] par 24 h-jeu) dans la cellule où
 * la coque s'attarde — limité par les conteneurs libres (1 T = 1
 * conteneur) et le champ ; le champ matérialisé descend, se dissipe sous
 * l'epsilon.
 */
export async function collectJunk(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ collected: number; fieldLeftT: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!ship.junk_collector) {
      throw new CommandError('not_available', 'Aucun junk collector sur cette coque');
    }
    if (!['hovering', 'idle'].includes(ship.status)) {
      throw new CommandError('not_available', 'La collecte se fait sur zone');
    }
    const cooldownMs = (JUNK_SCOOP_COOLDOWN_HOURS * 3_600_000) / timeScale;
    if (
      ship.last_junk_scoop &&
      nowMs - new Date(ship.last_junk_scoop).getTime() < cooldownMs - 1
    ) {
      throw new CommandError(
        'not_available',
        'Collecteur en cycle (un scoop par 24 h de jeu)',
      );
    }
    const { rows: fields } = await client.query(
      `SELECT * FROM junk_fields WHERE cell_x = $1 AND cell_y = $2 FOR UPDATE`,
      [junkCellOf(Number(ship.x)), junkCellOf(Number(ship.y))],
    );
    const field = fields[0];
    const available = field
      ? evalJunkAmount(
          Number(field.amount_t),
          new Date(field.as_of).getTime(),
          nowMs,
        )
      : 0;
    if (available <= JUNK_FIELD_EPSILON_T) {
      throw new CommandError('not_available', 'Aucun champ de junk ici');
    }
    const hull =
      HULLS[`${ship.hull_category}_${ship.hull_size}` as `${HullCategory}_${HullSize}`];
    const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
    const freeT = Math.max(
      0,
      (hull?.containers ?? 0) -
        containersUsed(cargo as Partial<Record<ResourceId, number>>),
    );
    const scoop = Math.min(JUNK_SCOOP_T, available, freeT);
    if (scoop <= 1e-9) {
      throw new CommandError('not_available', 'Soute pleine — aucun conteneur libre');
    }
    cargo.junk = Number(cargo.junk ?? 0) + scoop;
    await client.query(
      `UPDATE ships SET cargo = $2, last_junk_scoop = to_timestamp($3 / 1000.0)
       WHERE id = $1`,
      [shipId, JSON.stringify(cargo), nowMs],
    );
    const left = available - scoop;
    if (left <= JUNK_FIELD_EPSILON_T) {
      await client.query(`DELETE FROM junk_fields WHERE id = $1`, [field.id]);
    } else {
      await client.query(
        `UPDATE junk_fields SET amount_t = $2, as_of = to_timestamp($3 / 1000.0)
         WHERE id = $1`,
        [field.id, left, nowMs],
      );
    }
    // Cellule allégée (voire dissipée) : l'usure de présence se rebase.
    await rebaseShipDrain(client, { ...ship, cargo }, nowMs, 'tank');
    await client.query('COMMIT');
    return {
      collected: Math.round(scoop * 100) / 100,
      fieldLeftT: Math.round(Math.max(0, left) * 100) / 100,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Monte le claim rig (atelier L2, 25 steelL + 5 gold [TUNE]). */
export async function fitClaimRig(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  opts: { nowMs?: number } = {},
): Promise<{ cost: typeof CLAIM_RIG_COST }> {
  const nowMs = opts.nowMs ?? Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (['probe', 'personal'].includes(ship.hull_category)) {
      throw new CommandError('not_available', 'Cette coque ne réclame pas');
    }
    if (ship.claim_rig) {
      throw new CommandError('not_available', 'Le claim rig est déjà monté');
    }
    if (ship.status !== 'docked' || !ship.docked_body_id) {
      throw new CommandError('not_available', 'Le rig se monte à quai');
    }
    const { rows: worlds } = await client.query(
      `SELECT * FROM bodies WHERE id = $1 FOR UPDATE`,
      [ship.docked_body_id],
    );
    if (!worlds[0] || worlds[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce monde ne vous appartient pas');
    }
    const { rows: shop } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'workshop' AND status = 'active'
         AND level >= 2`,
      [ship.docked_body_id],
    );
    if (!shop[0]) {
      throw new CommandError('not_available', 'Un workshop L2 actif est requis');
    }
    await payCost(client, worlds[0].id, worlds[0].climate, CLAIM_RIG_COST, nowMs);
    await client.query(`UPDATE ships SET claim_rig = true WHERE id = $1`, [shipId]);
    await client.query('COMMIT');
    return { cost: CLAIM_RIG_COST };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Démarre une réclamation (GB §6 « no honor ») : coque STATIONNAIRE
 * (survol/idle) à ≤ 1 pc [TUNE-v1] d'une épave SANS propriétaire, claim
 * rig monté, une réclamation à la fois. L'événement salvage_claimed
 * (2 h de jeu [TUNE]) RE-VÉRIFIE tout à l'échéance — bouger annule.
 */
export async function startClaim(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  targetId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ claimsAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!ship.claim_rig) {
      throw new CommandError('not_available', 'Aucun claim rig sur cette coque');
    }
    if (!['hovering', 'idle'].includes(ship.status)) {
      throw new CommandError('not_available', 'On réclame immobile, sur zone');
    }
    if (ship.claiming_target_id) {
      throw new CommandError('not_available', 'Réclamation déjà en cours');
    }
    const { rows: targets } = await client.query(
      `SELECT * FROM ships WHERE id = $1 FOR UPDATE`,
      [targetId],
    );
    const target = targets[0];
    if (!target || target.owner_id !== null || target.status !== 'derelict') {
      throw new CommandError('not_available', 'Ceci n\'est pas une épave réclamable');
    }
    const d = Math.hypot(ship.x - target.x, ship.y - target.y);
    if (d > CLAIM_RADIUS_PC) {
      throw new CommandError(
        'not_available',
        `Trop loin de l'épave (≤ ${CLAIM_RADIUS_PC} pc)`,
      );
    }
    const claimsAt = new Date(nowMs + (CLAIM_HOURS * 3_600_000) / timeScale);
    await client.query(
      `UPDATE ships SET claiming_target_id = $2 WHERE id = $1`,
      [shipId, targetId],
    );
    await enqueue(client, 'salvage_claimed', claimsAt, {
      shipId,
      targetId,
    });
    await client.query('COMMIT');
    return { claimsAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Détache une réclamation en cours (départ, arrêt) : lien + événement
 * purgés. S'exécute dans la transaction appelante (ships verrouillé).
 */
export async function releaseClaim(
  client: pg.PoolClient,
  ship: Row,
): Promise<void> {
  if (!ship.claiming_target_id) return;
  await client.query(
    `DELETE FROM events WHERE processed_at IS NULL
       AND kind = 'salvage_claimed' AND payload->>'shipId' = $1`,
    [ship.id],
  );
  await client.query(
    `UPDATE ships SET claiming_target_id = NULL WHERE id = $1`,
    [ship.id],
  );
}

/** Épaves SANS propriétaire visibles d'un joueur (mêmes scopes). */
export async function visibleDerelicts(
  pool: pg.Pool,
  playerId: string,
  scopes: { baseSkyPc: number; telescopePcPerLevel: number; probePc: number; shipPc: number },
): Promise<
  { id: string; x: number; y: number; name: string; hullCategory: string; hullSize: string | null }[]
> {
  const { rows } = await pool.query(
    `
    WITH scopes AS (
      SELECT b.x, b.y,
             $2::float + COALESCE((
               SELECT sum($3::float * t.level)
               FROM buildings t
               WHERE t.body_id = b.id AND t.key = 'telescope'
                 AND t.status = 'active'
             ), 0) AS radius
      FROM bodies b
      WHERE b.owner_id = $1
      UNION ALL
      SELECT s.x, s.y,
             CASE WHEN s.hull_category = 'probe' THEN $4::float ELSE $5::float END
      FROM ships s
      WHERE s.owner_id = $1 AND s.status IN ('hovering', 'idle', 'docked', 'stranded')
    )
    SELECT d.id, d.x, d.y, d.name, d.hull_category, d.hull_size
    FROM ships d
    WHERE d.owner_id IS NULL AND d.status = 'derelict'
      AND EXISTS (
        SELECT 1 FROM scopes s
        WHERE (d.x - s.x)^2 + (d.y - s.y)^2 <= s.radius^2
      )
    `,
    [
      playerId,
      scopes.baseSkyPc,
      scopes.telescopePcPerLevel,
      scopes.probePc,
      scopes.shipPc,
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    x: Number(r.x),
    y: Number(r.y),
    name: r.name,
    hullCategory: r.hull_category,
    hullSize: r.hull_size,
  }));
}

/** Champs visibles d'un joueur (mêmes règles de vision que /galaxy). */
export async function visibleJunkFields(
  pool: pg.Pool,
  playerId: string,
  scopes: { baseSkyPc: number; telescopePcPerLevel: number; probePc: number; shipPc: number },
  nowMs = Date.now(),
): Promise<{ id: string; x: number; y: number; amountT: number }[]> {
  const { rows } = await pool.query(
    `
    WITH scopes AS (
      SELECT b.x, b.y,
             $2::float + COALESCE((
               SELECT sum($3::float * t.level)
               FROM buildings t
               WHERE t.body_id = b.id AND t.key = 'telescope'
                 AND t.status = 'active'
             ), 0) AS radius
      FROM bodies b
      WHERE b.owner_id = $1
      UNION ALL
      SELECT s.x, s.y,
             CASE WHEN s.hull_category = 'probe' THEN $4::float ELSE $5::float END
      FROM ships s
      WHERE s.owner_id = $1 AND s.status IN ('hovering', 'idle', 'docked', 'stranded')
    )
    SELECT j.id, j.x, j.y, j.amount_t, j.as_of
    FROM junk_fields j
    WHERE EXISTS (
      SELECT 1 FROM scopes s
      WHERE (j.x - s.x)^2 + (j.y - s.y)^2 <= s.radius^2
    )
    `,
    [
      playerId,
      scopes.baseSkyPc,
      scopes.telescopePcPerLevel,
      scopes.probePc,
      scopes.shipPc,
    ],
  );
  return rows
    .map((r) => ({
      id: r.id,
      x: Number(r.x),
      y: Number(r.y),
      amountT:
        Math.round(
          evalJunkAmount(Number(r.amount_t), new Date(r.as_of).getTime(), nowMs) * 10,
        ) / 10,
    }))
    .filter((f) => f.amountT > JUNK_FIELD_EPSILON_T);
}

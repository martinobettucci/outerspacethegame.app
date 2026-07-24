/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P3 “Stargates”; GAME_BOOK.md §6; DESIGN_GUIDE.md §9.3–§9.4. */
/**
 * Stargates (GB §6, DG §9.3–9.4) — le raccourci sûr du réseau.
 *
 * v1 MÊME PROPRIÉTAIRE [annoncé] : les deux endpoints appartiennent au
 * bâtisseur (le partage 50/50 avec consentement inter-joueurs — canon —
 * arrive avec son flux de consentement dédié). Construction au
 * stargate_yard ACTIF (1 chantier concurrent par niveau), coût payé au
 * monde du yard. Traversée INSTANTANÉE : péage « hard gate » depuis la
 * SOUTE pour les non-propriétaires (encaissé au stock du monde
 * d'ENTRÉE [interp]), capacité 1 vaisseau/tick/direction [TUNE],
 * sortie dispersée U(0–15) pc (hash seedé shipId+tick — DG §9.3).
 */
import {
  gateTollMult,
  ALL_RESOURCE_IDS,
  STARGATE_BUILD_HOURS,
  STARGATE_COST,
  STARGATE_PROPOSAL_TTL_HOURS,
  STARGATE_SPLIT_COST,
  stargateExitOffset,
} from '@atg/shared';
import type pg from 'pg';
import { enqueue } from '../sim/events.js';
import { config } from '../config.js';
import { evalLazy } from '../sim/lazy.js';
import { rebaseShipDrain } from '../sim/shipDrain.js';
import { releaseClaim } from './junk.js';
import { releaseHarvest } from './harvest.js';
import { CommandError, payCost } from './planets.js';

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

/** Construit un gate entre le monde du yard et un AUTRE monde possédé. */
export async function buildStargate(
  pool: pg.Pool,
  playerId: string,
  yardBodyId: string,
  destBodyId: string,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ gateId: string; completesAt: Date }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  if (yardBodyId === destBodyId) {
    throw new CommandError('not_available', 'Un gate relie DEUX mondes distincts');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Verrou des deux mondes par id CROISSANT (anti-deadlock).
    const ids = [yardBodyId, destBodyId].sort();
    const { rows: bodies } = await client.query(
      `SELECT * FROM bodies WHERE id = ANY($1) AND body_type = 'planet'
       ORDER BY id FOR UPDATE`,
      [ids],
    );
    const origin = bodies.find((b) => b.id === yardBodyId);
    const dest = bodies.find((b) => b.id === destBodyId);
    if (!origin || !dest) throw new CommandError('not_found', 'Monde inconnu');
    for (const b of [origin, dest]) {
      if (b.owner_id !== playerId) {
        throw new CommandError(
          'forbidden',
          'v1 : les DEUX endpoints doivent être à vous (partage 50/50 : à venir)',
        );
      }
      if (b.config?.annihilated) {
        throw new CommandError('not_available', 'Ce monde n\'existe plus (cendre)');
      }
    }
    const { rows: yards } = await client.query(
      `SELECT level FROM buildings
       WHERE body_id = $1 AND key = 'stargate_yard' AND status = 'active'`,
      [yardBodyId],
    );
    if (!yards[0]) {
      throw new CommandError('not_available', 'Un stargate_yard ACTIF est requis ici');
    }
    // Doublon d'abord (refus le plus précis), saturation ensuite.
    const { rows: dup } = await client.query(
      `SELECT 1 FROM stargates
       WHERE (a_body_id = $1 AND b_body_id = $2)
          OR (a_body_id = $2 AND b_body_id = $1)`,
      [yardBodyId, destBodyId],
    );
    if (dup[0]) {
      throw new CommandError('not_available', 'Un gate existe déjà entre ces mondes');
    }
    const capacity = yards.reduce((t, y) => t + Number(y.level), 0);
    const { rows: building } = await client.query(
      `SELECT count(*)::int AS n FROM stargates
       WHERE status = 'building' AND (a_body_id = $1 OR b_body_id = $1)`,
      [yardBodyId],
    );
    if (Number(building[0].n) >= capacity) {
      throw new CommandError(
        'not_available',
        `Chantiers de gate saturés (${building[0].n}/${capacity} — 1 par niveau de yard)`,
      );
    }
    await payCost(client, yardBodyId, origin.climate, STARGATE_COST, nowMs);
    const completesAt = new Date(
      nowMs + (STARGATE_BUILD_HOURS * 3_600_000) / timeScale,
    );
    const { rows: created } = await client.query(
      `INSERT INTO stargates (a_body_id, b_body_id, owner_id, status, completes_at)
       VALUES ($1, $2, $3, 'building', $4) RETURNING id`,
      [yardBodyId, destBodyId, playerId, completesAt],
    );
    await enqueue(client, 'stargate_built', completesAt, {
      gateId: created[0]!.id,
    });
    await client.query('COMMIT');
    return { gateId: created[0]!.id, completesAt };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Configure le péage (propriétaire seulement — DG §9.4). */
export async function setStargateToll(
  pool: pg.Pool,
  playerId: string,
  gateId: string,
  input: { resource: string | null; amount: number },
): Promise<void> {
  if (
    input.resource !== null &&
    !ALL_RESOURCE_IDS.includes(input.resource as (typeof ALL_RESOURCE_IDS)[number])
  ) {
    throw new CommandError('not_available', 'Ressource de péage inconnue');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new CommandError('not_available', 'Montant de péage invalide');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM stargates WHERE id = $1 FOR UPDATE`,
      [gateId],
    );
    if (!rows[0]) throw new CommandError('not_found', 'Gate inconnu');
    if (rows[0].owner_id !== playerId) {
      throw new CommandError('forbidden', 'Ce gate ne vous appartient pas');
    }
    await client.query(
      `UPDATE stargates SET toll_resource = $2, toll_amount = $3 WHERE id = $1`,
      [gateId, input.resource, input.amount],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Traverse un gate ACTIF depuis l'un de ses endpoints (à quai ou en
 * survol) : péage hard pour les non-propriétaires (soute → stock du
 * monde d'ENTRÉE), capacité 1/tick/direction, sortie dispersée à l'idle
 * près du monde de destination. Instantané, zéro carburant (canon).
 */
export async function traverseStargate(
  pool: pg.Pool,
  playerId: string,
  shipId: string,
  gateId: string,
  opts: { nowMs?: number; tickMs?: number } = {},
): Promise<{ x: number; y: number; scatterPc: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const tickMs = Math.max(1, opts.tickMs ?? 500);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ship = await lockOwnedShip(client, playerId, shipId);
    if (!['docked', 'hovering'].includes(ship.status)) {
      throw new CommandError('not_available', 'On traverse depuis un endpoint');
    }
    const at = ship.docked_body_id ?? ship.hover_body_id;
    const { rows: gates } = await client.query(
      `SELECT * FROM stargates WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [gateId],
    );
    const gate = gates[0];
    if (!gate) throw new CommandError('not_found', 'Gate inconnu ou en chantier');
    if (at !== gate.a_body_id && at !== gate.b_body_id) {
      throw new CommandError('not_available', 'Cette coque n\'est pas à un endpoint');
    }
    const entering = at === gate.a_body_id ? 'a_to_b' : 'b_to_a';
    const destId = at === gate.a_body_id ? gate.b_body_id : gate.a_body_id;
    // GB §21 : le vaisseau personnel ne se rend que sur SES mondes.
    const { rows: dests } = await client.query(
      `SELECT * FROM bodies WHERE id = $1`,
      [destId],
    );
    if (!dests[0] || dests[0].config?.annihilated) {
      throw new CommandError('not_available', 'L\'endpoint de sortie n\'existe plus');
    }
    if (
      ship.hull_category === 'personal' &&
      dests[0].owner_id !== playerId
    ) {
      throw new CommandError(
        'forbidden',
        'Le vaisseau personnel ne voyage que vers VOS mondes (canon)',
      );
    }
    // Capacité 1 vaisseau/tick/direction [TUNE].
    const lastCol = entering === 'a_to_b' ? 'last_a_to_b' : 'last_b_to_a';
    const last = gate[lastCol] ? new Date(gate[lastCol]).getTime() : 0;
    if (nowMs - last < tickMs) {
      throw new CommandError(
        'not_available',
        'Le gate recharge (1 vaisseau par tick et par direction)',
      );
    }
    // Péage « hard gate » (canon) : non-propriétaires seulement [interp],
    // payé depuis la SOUTE, encaissé au stock du monde d'ENTRÉE.
    const { rows: endpointOwners } = await client.query(
      `SELECT owner_id FROM bodies WHERE id IN ($1, $2)`,
      [gate.a_body_id, gate.b_body_id],
    );
    const isStakeholder =
      gate.owner_id === playerId ||
      endpointOwners.some((e) => e.owner_id === playerId);
    if (
      !isStakeholder &&
      gate.toll_resource &&
      Number(gate.toll_amount) > 0
    ) {
      const cargo: Record<string, number> = { ...(ship.cargo ?? {}) };
      const held = Number(cargo[gate.toll_resource] ?? 0);
      // W9d stargate_caller : péage étranger réduit [TUNE].
      const toll =
        Number(gate.toll_amount) *
        gateTollMult(Array.isArray(ship.accessories) ? ship.accessories : []);
      if (held < toll - 1e-9) {
        throw new CommandError(
          'insufficient_resources',
          `Péage impayable : ${toll} ${gate.toll_resource} exigés (hard gate)`,
        );
      }
      if (held - toll < 1e-9) delete cargo[gate.toll_resource];
      else cargo[gate.toll_resource] = held - toll;
      ship.cargo = cargo;
      await client.query(`UPDATE ships SET cargo = $2 WHERE id = $1`, [
        shipId,
        JSON.stringify(cargo),
      ]);
      const { rows: stockRows } = await client.query(
        `SELECT amount_t, rate_t_per_day, as_of FROM planet_stock
         WHERE body_id = $1 AND resource = $2 FOR UPDATE`,
        [at, gate.toll_resource],
      );
      const current = stockRows[0]
        ? evalLazy(
            {
              amount: stockRows[0].amount_t,
              ratePerDay: stockRows[0].rate_t_per_day,
              asOfMs: new Date(stockRows[0].as_of).getTime(),
            },
            nowMs,
            config.TIME_SCALE,
            { min: 0 },
          )
        : 0;
      await client.query(
        `INSERT INTO planet_stock (body_id, resource, amount_t, as_of)
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
         ON CONFLICT (body_id, resource)
           DO UPDATE SET amount_t = $3, as_of = to_timestamp($4 / 1000.0)`,
        [at, gate.toll_resource, current + toll, nowMs],
      );
    }
    // Départ : récolte/réclamation abandonnées (on quitte la zone).
    if (ship.harvesting_star_id) await releaseHarvest(client, ship, nowMs);
    if (ship.claiming_target_id) await releaseClaim(client, ship);
    // Sortie dispersée : U(0–15) pc, hash seedé (shipId, tick) — DG §9.3.
    const tick = Math.floor(nowMs / tickMs);
    const { dx, dy } = stargateExitOffset(shipId, tick);
    const x = Number(dests[0].x) + dx;
    const y = Number(dests[0].y) + dy;
    await client.query(
      `UPDATE stargates SET ${lastCol} = to_timestamp($2 / 1000.0)
       WHERE id = $1`,
      [gateId, nowMs],
    );
    await client.query(
      `UPDATE ships SET status = 'idle', x = $2, y = $3,
         docked_body_id = NULL, docked_at = NULL, hover_body_id = NULL,
         harvesting_star_id = NULL, claiming_target_id = NULL
       WHERE id = $1`,
      [shipId, x, y],
    );
    await rebaseShipDrain(
      client,
      {
        ...ship,
        status: 'idle',
        x,
        y,
        docked_body_id: null,
        hover_body_id: null,
        harvesting_star_id: null,
        claiming_target_id: null,
      },
      nowMs,
      'tank',
    );
    await client.query('COMMIT');
    return { x, y, scatterPc: Math.hypot(dx, dy) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Gates dont l'un des endpoints est VISIBLE du joueur (scopes standard). */
export async function visibleStargates(
  pool: pg.Pool,
  playerId: string,
  scopes: { baseSkyPc: number; telescopePcPerLevel: number; probePc: number; shipPc: number },
): Promise<
  {
    id: string;
    aBodyId: string;
    bBodyId: string;
    ownerId: string;
    status: string;
    tollResource: string | null;
    tollAmount: number;
  }[]
> {
  const { rows } = await pool.query(
    `
    WITH scopes AS (
      SELECT b.x, b.y,
             $2::float + COALESCE((
               SELECT max($3::float * t.level)
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
    SELECT g.* FROM stargates g
    WHERE EXISTS (
      SELECT 1 FROM scopes s, bodies e
      WHERE e.id IN (g.a_body_id, g.b_body_id)
        AND (e.x - s.x)^2 + (e.y - s.y)^2 <= s.radius^2
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
    aBodyId: r.a_body_id,
    bBodyId: r.b_body_id,
    ownerId: r.owner_id,
    status: r.status,
    tollResource: r.toll_resource,
    tollAmount: Number(r.toll_amount ?? 0),
  }));
}


/**
 * Propose un gate 50/50 vers le monde d'AUTRUI (canon « both consent ») :
 * yard ACTIF côté proposeur, cible possédée par un AUTRE joueur, aucune
 * paire existante (gate ou proposition ouverte). L'acceptation paiera
 * LES DEUX moitiés — rien n'est débité à la proposition.
 */
export async function proposeStargate(
  pool: pg.Pool,
  playerId: string,
  fromBodyId: string,
  toBodyId: string,
): Promise<{ proposalId: string }> {
  if (fromBodyId === toBodyId) {
    throw new CommandError('not_available', 'Un gate relie DEUX mondes distincts');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = [fromBodyId, toBodyId].sort();
    const { rows: bodies } = await client.query(
      `SELECT * FROM bodies WHERE id = ANY($1) AND body_type = 'planet'
       ORDER BY id FOR UPDATE`,
      [ids],
    );
    const origin = bodies.find((b) => b.id === fromBodyId);
    const dest = bodies.find((b) => b.id === toBodyId);
    if (!origin || !dest) throw new CommandError('not_found', 'Monde inconnu');
    if (origin.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Le monde de départ doit être à vous');
    }
    if (!dest.owner_id) {
      throw new CommandError('not_available', 'La cible est un monde sauvage');
    }
    if (dest.owner_id === playerId) {
      throw new CommandError(
        'not_available',
        'Vos deux mondes : construisez directement (pas de consentement à demander)',
      );
    }
    if (origin.config?.annihilated || dest.config?.annihilated) {
      throw new CommandError('not_available', 'Un des mondes n\'existe plus');
    }
    const { rows: yards } = await client.query(
      `SELECT 1 FROM buildings
       WHERE body_id = $1 AND key = 'stargate_yard' AND status = 'active'`,
      [fromBodyId],
    );
    if (!yards[0]) {
      throw new CommandError('not_available', 'Un stargate_yard ACTIF est requis ici');
    }
    const { rows: dupGate } = await client.query(
      `SELECT 1 FROM stargates
       WHERE (a_body_id = $1 AND b_body_id = $2)
          OR (a_body_id = $2 AND b_body_id = $1)`,
      [fromBodyId, toBodyId],
    );
    if (dupGate[0]) {
      throw new CommandError('not_available', 'Un gate existe déjà entre ces mondes');
    }
    const { rows: dupProp } = await client.query(
      `SELECT 1 FROM stargate_proposals
       WHERE status = 'open'
         AND ((from_body_id = $1 AND to_body_id = $2)
           OR (from_body_id = $2 AND to_body_id = $1))`,
      [fromBodyId, toBodyId],
    );
    if (dupProp[0]) {
      throw new CommandError(
        'not_available',
        'Une proposition est déjà ouverte entre ces mondes',
      );
    }
    const { rows: created } = await client.query(
      `INSERT INTO stargate_proposals (proposer_id, from_body_id, to_body_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [playerId, fromBodyId, toBodyId],
    );
    await client.query('COMMIT');
    return { proposalId: created[0]!.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Balayage paresseux du TTL (48 h réelles [TUNE-v1]). */
async function expireStaleProposals(client: pg.PoolClient): Promise<void> {
  await client.query(
    `UPDATE stargate_proposals SET status = 'expired', resolved_at = now()
     WHERE status = 'open'
       AND created_at < now() - ($1 || ' hours')::interval`,
    [String(STARGATE_PROPOSAL_TTL_HOURS)],
  );
}

/**
 * Répond à une proposition (propriétaire du monde CIBLE uniquement —
 * §10). Accepter re-vérifie tout (yard, doublon, concurrence), paie LES
 * DEUX moitiés — chacune sur SON monde, cristal résolu par SON climat —
 * puis lance le chantier (l'événement stargate_built activera).
 */
export async function respondStargateProposal(
  pool: pg.Pool,
  playerId: string,
  proposalId: string,
  accept: boolean,
  opts: { nowMs?: number; timeScale?: number } = {},
): Promise<{ gateId: string | null }> {
  const nowMs = opts.nowMs ?? Date.now();
  const timeScale = Math.max(opts.timeScale ?? 1, 1e-9);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expireStaleProposals(client);
    const { rows: props } = await client.query(
      `SELECT * FROM stargate_proposals WHERE id = $1 FOR UPDATE`,
      [proposalId],
    );
    const prop = props[0];
    if (!prop || prop.status !== 'open') {
      throw new CommandError('not_found', 'Proposition close ou inconnue');
    }
    const ids = [prop.from_body_id, prop.to_body_id].sort();
    const { rows: bodies } = await client.query(
      `SELECT * FROM bodies WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      [ids],
    );
    const origin = bodies.find((b) => b.id === prop.from_body_id);
    const dest = bodies.find((b) => b.id === prop.to_body_id);
    if (!dest || dest.owner_id !== playerId) {
      throw new CommandError('forbidden', 'Seul le propriétaire du monde cible répond');
    }
    if (!accept) {
      await client.query(
        `UPDATE stargate_proposals SET status = 'declined', resolved_at = now()
         WHERE id = $1`,
        [proposalId],
      );
      await client.query('COMMIT');
      return { gateId: null };
    }
    if (!origin || origin.owner_id !== prop.proposer_id) {
      throw new CommandError(
        'not_available',
        'Le monde du proposeur a changé de mains — proposition caduque',
      );
    }
    if (origin.config?.annihilated || dest.config?.annihilated) {
      throw new CommandError('not_available', 'Un des mondes n\'existe plus');
    }
    const { rows: yards } = await client.query(
      `SELECT level FROM buildings
       WHERE body_id = $1 AND key = 'stargate_yard' AND status = 'active'`,
      [prop.from_body_id],
    );
    if (!yards[0]) {
      throw new CommandError('not_available', 'Le yard du proposeur n\'est plus actif');
    }
    const { rows: dupGate } = await client.query(
      `SELECT 1 FROM stargates
       WHERE (a_body_id = $1 AND b_body_id = $2)
          OR (a_body_id = $2 AND b_body_id = $1)`,
      [prop.from_body_id, prop.to_body_id],
    );
    if (dupGate[0]) {
      throw new CommandError('not_available', 'Un gate existe déjà entre ces mondes');
    }
    const capacity = yards.reduce((t, y) => t + Number(y.level), 0);
    const { rows: building } = await client.query(
      `SELECT count(*)::int AS n FROM stargates
       WHERE status = 'building' AND (a_body_id = $1 OR b_body_id = $1)`,
      [prop.from_body_id],
    );
    if (Number(building[0].n) >= capacity) {
      throw new CommandError(
        'not_available',
        'Chantiers du yard proposeur saturés — réessayez plus tard',
      );
    }
    // LES DEUX moitiés, chacune chez soi (cristal résolu par climat).
    await payCost(client, prop.from_body_id, origin.climate, STARGATE_SPLIT_COST, nowMs);
    await payCost(client, prop.to_body_id, dest.climate, STARGATE_SPLIT_COST, nowMs);
    const completesAt = new Date(
      nowMs + (STARGATE_BUILD_HOURS * 3_600_000) / timeScale,
    );
    const { rows: created } = await client.query(
      `INSERT INTO stargates (a_body_id, b_body_id, owner_id, status, completes_at)
       VALUES ($1, $2, $3, 'building', $4) RETURNING id`,
      [prop.from_body_id, prop.to_body_id, prop.proposer_id, completesAt],
    );
    await enqueue(client, 'stargate_built', completesAt, {
      gateId: created[0]!.id,
    });
    await client.query(
      `UPDATE stargate_proposals SET status = 'accepted', resolved_at = now()
       WHERE id = $1`,
      [proposalId],
    );
    await client.query('COMMIT');
    return { gateId: created[0]!.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Annule SA proposition ouverte. */
export async function cancelStargateProposal(
  pool: pg.Pool,
  playerId: string,
  proposalId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM stargate_proposals WHERE id = $1 FOR UPDATE`,
      [proposalId],
    );
    if (!rows[0] || rows[0].status !== 'open') {
      throw new CommandError('not_found', 'Proposition close ou inconnue');
    }
    if (rows[0].proposer_id !== playerId) {
      throw new CommandError('forbidden', 'Cette proposition n\'est pas la vôtre');
    }
    await client.query(
      `UPDATE stargate_proposals SET status = 'cancelled', resolved_at = now()
       WHERE id = $1`,
      [proposalId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Propositions me concernant (entrantes par monde cible + sortantes). */
export async function listStargateProposals(
  pool: pg.Pool,
  playerId: string,
): Promise<{
  incoming: {
    id: string;
    fromBodyId: string;
    fromBodyName: string;
    toBodyId: string;
    proposerName: string;
    createdAt: string;
  }[];
  outgoing: {
    id: string;
    fromBodyId: string;
    toBodyId: string;
    toBodyName: string;
    status: string;
  }[];
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expireStaleProposals(client);
    const { rows: incoming } = await client.query(
      `SELECT p.id, p.from_body_id, fb.name AS from_name, p.to_body_id,
              pl.display_name AS proposer_name, p.created_at
       FROM stargate_proposals p
       JOIN bodies tb ON tb.id = p.to_body_id
       JOIN bodies fb ON fb.id = p.from_body_id
       JOIN players pl ON pl.id = p.proposer_id
       WHERE p.status = 'open' AND tb.owner_id = $1
       ORDER BY p.created_at DESC`,
      [playerId],
    );
    const { rows: outgoing } = await client.query(
      `SELECT p.id, p.from_body_id, p.to_body_id, tb.name AS to_name, p.status
       FROM stargate_proposals p
       JOIN bodies tb ON tb.id = p.to_body_id
       WHERE p.proposer_id = $1
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [playerId],
    );
    await client.query('COMMIT');
    return {
      incoming: incoming.map((r) => ({
        id: r.id,
        fromBodyId: r.from_body_id,
        fromBodyName: r.from_name,
        toBodyId: r.to_body_id,
        proposerName: r.proposer_name,
        createdAt: new Date(r.created_at).toISOString(),
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        fromBodyId: r.from_body_id,
        toBodyId: r.to_body_id,
        toBodyName: r.to_name,
        status: r.status,
      })),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

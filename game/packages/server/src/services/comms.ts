/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Ping/ping-back”; GAME_BOOK.md §4/§5; DESIGN_GUIDE.md §15. */
/**
 * Pings & canaux — GB §5 : « un ping doit être répondu par un ping-back
 * pour que le contact s'établisse ; aucun contact unilatéral. »
 * Quota : 20 pings/jour [TUNE, DG §15]. Cible : un monde POSSÉDÉ visible
 * dans le scope de l'émetteur (vérifié côté serveur, jamais l'UI).
 */
import type pg from 'pg';
import { CommandError } from './planets.js';
import { visibleBodies } from './world.js';

export const PINGS_PER_DAY = 20;
export const MESSAGE_MAX_CHARS = 2000;

/**
 * Paire canonique d'un canal : ordre lexicographique STRICT (player_a <
 * player_b), miroir de la contrainte SQL `channel_pair_order` — un seul
 * canal possible par couple, quel que soit le sens du ping-back.
 */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Corps de message normalisé, ou null s'il est irrecevable (vide/trop long). */
export function normalizeMessageBody(body: string): string | null {
  const text = body.trim();
  if (text.length === 0 || text.length > MESSAGE_MAX_CHARS) return null;
  return text;
}

export async function sendPing(
  pool: pg.Pool,
  playerId: string,
  bodyId: string,
): Promise<{ pingId: string; toPlayer: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: bodyRows } = await client.query(
      `SELECT id, owner_id FROM bodies WHERE id = $1 AND body_type = 'planet'`,
      [bodyId],
    );
    if (!bodyRows[0]) throw new CommandError('not_found', 'Monde inconnu');
    const toPlayer = bodyRows[0].owner_id;
    if (!toPlayer) {
      throw new CommandError('not_available', 'Ce monde est sauvage : personne à héler');
    }
    if (toPlayer === playerId) {
      throw new CommandError('not_available', 'Ce monde est déjà à vous');
    }
    // Portée : le monde doit être dans le ciel connu de l'émetteur (GB §4).
    const visible = await visibleBodies(pool, playerId);
    if (!visible.some((b) => b.id === bodyId)) {
      throw new CommandError('not_available', 'Hors de portée de vos télescopes');
    }
    const { rows: quota } = await client.query(
      `SELECT count(*)::int AS n FROM pings
       WHERE from_player = $1 AND created_at > now() - interval '1 day'`,
      [playerId],
    );
    if (quota[0].n >= PINGS_PER_DAY) {
      throw new CommandError('not_available', `Quota de pings atteint (${PINGS_PER_DAY}/jour)`);
    }
    // Un seul hail en attente par couple (anti-spam).
    const { rows: dup } = await client.query(
      `SELECT 1 FROM pings WHERE from_player = $1 AND to_player = $2 AND status = 'sent'`,
      [playerId, toPlayer],
    );
    if (dup[0]) {
      throw new CommandError('not_available', 'Un hail attend déjà leur réponse');
    }
    const { rows: created } = await client.query<{ id: string }>(
      `INSERT INTO pings (from_player, to_player, body_id) VALUES ($1, $2, $3)
       RETURNING id`,
      [playerId, toPlayer, bodyId],
    );
    await client.query('COMMIT');
    return { pingId: created[0]!.id, toPlayer };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Ping-back : ouvre (ou retrouve) le canal — l'événement historique. */
export async function pingBack(
  pool: pg.Pool,
  playerId: string,
  pingId: string,
): Promise<{ channelId: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM pings WHERE id = $1 FOR UPDATE`,
      [pingId],
    );
    const ping = rows[0];
    if (!ping) throw new CommandError('not_found', 'Hail inconnu');
    if (ping.to_player !== playerId) {
      throw new CommandError('forbidden', 'Ce hail ne vous est pas adressé');
    }
    if (ping.status !== 'sent') {
      throw new CommandError('not_available', 'Hail déjà traité');
    }
    await client.query(
      `UPDATE pings SET status = 'answered', answered_at = now() WHERE id = $1`,
      [pingId],
    );
    const [a, b] = canonicalPair(ping.from_player, ping.to_player);
    const { rows: channel } = await client.query<{ id: string }>(
      `INSERT INTO channels (player_a, player_b) VALUES ($1, $2)
       ON CONFLICT (player_a, player_b) DO UPDATE SET player_a = EXCLUDED.player_a
       RETURNING id`,
      [a, b],
    );
    await client.query('COMMIT');
    return { channelId: channel[0]!.id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function listComms(pool: pg.Pool, playerId: string) {
  const { rows: incoming } = await pool.query(
    `SELECT p.id, p.body_id, p.created_at, pl.display_name AS from_name,
            b.name AS body_name
     FROM pings p
     JOIN players pl ON pl.id = p.from_player
     JOIN bodies b ON b.id = p.body_id
     WHERE p.to_player = $1 AND p.status = 'sent'
     ORDER BY p.created_at DESC`,
    [playerId],
  );
  const { rows: outgoing } = await pool.query(
    `SELECT p.id, p.status, p.created_at, b.name AS body_name
     FROM pings p JOIN bodies b ON b.id = p.body_id
     WHERE p.from_player = $1
     ORDER BY p.created_at DESC LIMIT 20`,
    [playerId],
  );
  const { rows: channels } = await pool.query(
    `SELECT c.id, c.opened_at,
            CASE WHEN c.player_a = $1 THEN pb.display_name ELSE pa.display_name END AS with_name
     FROM channels c
     JOIN players pa ON pa.id = c.player_a
     JOIN players pb ON pb.id = c.player_b
     WHERE c.player_a = $1 OR c.player_b = $1
     ORDER BY c.opened_at DESC`,
    [playerId],
  );
  return {
    incoming: incoming.map((r) => ({
      id: r.id,
      fromName: r.from_name,
      bodyName: r.body_name,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    outgoing: outgoing.map((r) => ({
      id: r.id,
      status: r.status,
      bodyName: r.body_name,
      createdAt: new Date(r.created_at).toISOString(),
    })),
    channels: channels.map((r) => ({
      id: r.id,
      withName: r.with_name,
      openedAt: new Date(r.opened_at).toISOString(),
    })),
  };
}

async function requireMember(
  client: pg.PoolClient | pg.Pool,
  playerId: string,
  channelId: string,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT 1 FROM channels WHERE id = $1 AND (player_a = $2 OR player_b = $2)`,
    [channelId, playerId],
  );
  if (!rows[0]) {
    throw new CommandError('forbidden', 'Ce canal ne vous est pas ouvert');
  }
}

export async function listMessages(
  pool: pg.Pool,
  playerId: string,
  channelId: string,
) {
  await requireMember(pool, playerId, channelId);
  const { rows } = await pool.query(
    `SELECT m.id, m.body, m.created_at, p.display_name AS author_name,
            m.author = $2 AS mine
     FROM messages m JOIN players p ON p.id = m.author
     WHERE m.channel_id = $1
     ORDER BY m.id DESC LIMIT 100`,
    [channelId, playerId],
  );
  return rows.reverse().map((r) => ({
    id: String(r.id),
    body: r.body,
    authorName: r.author_name,
    mine: r.mine,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function postMessage(
  pool: pg.Pool,
  playerId: string,
  channelId: string,
  body: string,
): Promise<void> {
  const text = normalizeMessageBody(body);
  if (text === null) {
    throw new CommandError('not_available', 'Message vide ou trop long');
  }
  await requireMember(pool, playerId, channelId);
  await pool.query(
    `INSERT INTO messages (channel_id, author, body) VALUES ($1, $2, $3)`,
    [channelId, playerId, text],
  );
}

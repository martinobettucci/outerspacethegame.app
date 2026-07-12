/**
 * Sessions serveur — jeton opaque en cookie httpOnly ; seul le hash SHA-256
 * du jeton est stocké (un dump de base ne donne aucune session utilisable).
 * Durée 30 jours [TUNE]. Autorisation : chaque route authentifiée résout le
 * joueur via ce service — jamais de confiance dans le client (CLAUDE.md §10).
 */
import { createHash, randomBytes } from 'node:crypto';
import type pg from 'pg';

export const SESSION_DAYS = 30;

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export async function createSession(
  pool: pg.Pool,
  playerId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await pool.query(
    `INSERT INTO sessions (token_hash, player_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hash(token), playerId, expiresAt],
  );
  return { token, expiresAt };
}

export interface SessionPlayer {
  id: string;
  email: string;
  displayName: string;
  politics: string;
}

export async function resolveSession(
  pool: pg.Pool,
  token: string | undefined,
): Promise<SessionPlayer | null> {
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT p.id, p.email, p.display_name, p.politics
     FROM sessions s JOIN players p ON p.id = s.player_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hash(token)],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    email: rows[0].email,
    displayName: rows[0].display_name,
    politics: rows[0].politics,
  };
}

export async function destroySession(
  pool: pg.Pool,
  token: string | undefined,
): Promise<void> {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
}

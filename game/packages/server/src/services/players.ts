/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Auth + account lifecycle”; GAME_BOOK.md §19; docs/DAT.md §5. */
/**
 * Cycle de vie des comptes — inscription = création du joueur + spawn du
 * système starter, dans UNE transaction (GB §19 : chaque joueur démarre
 * gratuitement avec une planète et de quoi construire).
 *
 * Ce service est utilisé PAR L'API et PAR LE SEED de dev : les données de
 * démonstration passent par le vrai flux applicatif (CLAUDE.md §8).
 */
import type pg from 'pg';
import type { Archetype } from '@atg/shared';
import { SpawnSaturationError, spawnStarterSystem, type SpawnResult } from '../gen/spawn.js';
import { hashPassword } from './passwords.js';

/**
 * Poivre de luck de REPLI (dev/test) — identique au défaut de config, pour
 * que seed, dev et tests partagent UN seul poivre déterministe. La prod
 * passe TOUJOURS `config.LUCK_PEPPER` explicitement (server.ts) ; ce repli
 * n'est atteint que si un appelant l'omet (jamais en prod). [dev-only]
 */
export const FALLBACK_LUCK_PEPPER = 'dev-only-luck-pepper-change-me-0123456789';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  politics: Archetype;
  universeSeed: string;
  /** Secret du tirage de pocket-luck (§2.2b PATCH 10-5) ; repli dev si omis. */
  luckPepper?: string;
}

export interface RegisterResult {
  playerId: string;
  spawn: SpawnResult;
}

export class RegistrationError extends Error {
  constructor(
    public readonly code: 'email_taken' | 'invalid_input' | 'universe_saturated',
    message: string,
  ) {
    super(message);
  }
}

export async function registerPlayer(
  pool: pg.Pool,
  input: RegisterInput,
): Promise<RegisterResult> {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new RegistrationError('invalid_input', 'E-mail invalide');
  }
  if (input.password.length < 10) {
    throw new RegistrationError(
      'invalid_input',
      'Mot de passe trop court (10 caractères minimum)',
    );
  }
  if (input.displayName.trim().length < 2) {
    throw new RegistrationError('invalid_input', 'Nom d\'affichage trop court');
  }

  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT 1 FROM players WHERE email = $1',
      [input.email.toLowerCase()],
    );
    if (existing.rowCount) {
      throw new RegistrationError('email_taken', 'E-mail déjà utilisé');
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO players (email, password_hash, display_name, politics)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        input.email.toLowerCase(),
        passwordHash,
        input.displayName.trim(),
        input.politics,
      ],
    );
    const playerId = rows[0]!.id;
    const spawn = await spawnStarterSystem(client, {
      playerId,
      playerKey: input.email.toLowerCase(),
      universeSeed: input.universeSeed,
      luckPepper: input.luckPepper ?? FALLBACK_LUCK_PEPPER,
    });
    await client.query('COMMIT');
    return { playerId, spawn };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    // R4 : univers saturé — état de jeu, erreur TYPÉE (le joueur
    // fantôme est annulé par le ROLLBACK ci-dessus).
    if (err instanceof SpawnSaturationError) {
      throw new RegistrationError(
        'universe_saturated',
        'L\'univers ne laisse plus de place pour un nouveau monde natal — réessayez plus tard',
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

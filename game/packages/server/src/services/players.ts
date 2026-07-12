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
import { spawnStarterSystem, type SpawnResult } from '../gen/spawn.js';
import { hashPassword } from './passwords.js';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  politics: Archetype;
  universeSeed: string;
}

export interface RegisterResult {
  playerId: string;
  spawn: SpawnResult;
}

export class RegistrationError extends Error {
  constructor(
    public readonly code: 'email_taken' | 'invalid_input',
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
    });
    await client.query('COMMIT');
    return { playerId, spawn };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** @verifies This test file verifies: CLAUDE.md §15; docs/DAT.md §6. */
/**
 * Base de test dédiée (atg_test) sur la MÊME instance Postgres locale que
 * le dev — vraie base, vraies migrations (CLAUDE.md §15), sans polluer
 * l'univers de démonstration seedé de la base `atg`.
 */
import type pg from 'pg';
import { loadConfig } from '../../src/config.js';
import { runMigrations } from '../../src/db/migrate.js';
import { createPool } from '../../src/db/pool.js';

export async function createTestPool(): Promise<pg.Pool> {
  const config = loadConfig(process.env);
  const url = new URL(config.DATABASE_URL);
  const testUrl = new URL(config.DATABASE_URL);
  testUrl.pathname = '/atg_test';

  // Crée la base de test si absente (via la base d'administration).
  const admin = createPool(url.toString());
  try {
    const { rowCount } = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = 'atg_test'",
    );
    if (!rowCount) {
      await admin.query('CREATE DATABASE atg_test');
    }
  } finally {
    await admin.end();
  }

  const pool = createPool(testUrl.toString());
  await runMigrations(pool);
  // Isolation entre fichiers de test (exécution sérielle) : chaque fichier
  // démarre sur un univers vierge.
  await pool.query('TRUNCATE events, npcs, ships, bodies, players CASCADE');
  return pool;
}

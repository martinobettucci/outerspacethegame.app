/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Migrations framework”; docs/SCHEMA.md §Conventions; CLAUDE.md §24. */
/**
 * Migrateur SQL minimal et explicite (CLAUDE.md §24) : applique dans l'ordre
 * les fichiers `migrations/NNN_nom.sql` non encore enregistrés dans
 * `schema_migrations`, chacun dans sa transaction.
 *
 * Usage : `pnpm --filter @atg/server migrate` (DATABASE_URL du .env).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { createPool } from './pool.js';

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../migrations',
);

export async function runMigrations(
  pool: pg.Pool,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  const applied: string[] = [];
  const files = (await readdir(dir))
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    // Verrou consultatif : deux migrateurs concurrents ne s'entrelacent pas.
    await client.query('SELECT pg_advisory_lock(727001)');
    try {
      const { rows } = await client.query<{ name: string }>(
        'SELECT name FROM schema_migrations',
      );
      const done = new Set(rows.map((r) => r.name));
      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(dir, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1)',
            [file],
          );
          await client.query('COMMIT');
          applied.push(file);
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`Échec de la migration ${file} : ${String(err)}`);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(727001)');
    }
  } finally {
    client.release();
  }
  return applied;
}

// Exécution directe en CLI.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const pool = createPool();
  runMigrations(pool)
    .then((applied) => {
      console.log(
        applied.length > 0
          ? `Migrations appliquées : ${applied.join(', ')}`
          : 'Base à jour — aucune migration à appliquer.',
      );
      return pool.end();
    })
    .catch((err) => {
      console.error(String(err));
      process.exitCode = 1;
      return pool.end();
    });
}

/**
 * Migration 025 sur un schéma legacy minimal et isolé : on exécute le vrai
 * fichier SQL, sans recopier son algorithme dans le test. Les trois chemins
 * contractuels sont prouvés : plus petite tuile libre, doublons refusés et
 * monde plein refusé sans suppression/agrandissement silencieux.
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { createTestPool } from './helpers.js';

const migrationPath = fileURLToPath(
  new URL('../../migrations/025_telescope_tile.sql', import.meta.url),
);

let pool: pg.Pool;
let migrationSql = '';

beforeAll(async () => {
  pool = await createTestPool();
  migrationSql = await readFile(migrationPath, 'utf8');
});

afterAll(async () => {
  await pool.end();
});

async function withLegacySchema(
  run: (client: pg.PoolClient) => Promise<void>,
): Promise<void> {
  const schema = `migration_025_${randomUUID().replace(/-/g, '')}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`
      CREATE TABLE bodies (
        id text PRIMARY KEY,
        tiles integer NOT NULL
      );
      CREATE TABLE buildings (
        id text PRIMARY KEY,
        body_id text NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
        key text NOT NULL,
        tile_index integer,
        UNIQUE (body_id, tile_index)
      );
    `);
    await run(client);
  } finally {
    await client.query('RESET search_path');
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    client.release();
  }
}

describe('migration 025 — télescope unique sur tuile', () => {
  it('attribue au télescope legacy la plus petite tuile libre et pose les gardes DB', async () => {
    await withLegacySchema(async (client) => {
      await client.query(`
        INSERT INTO bodies (id, tiles) VALUES ('world', 4);
        INSERT INTO buildings (id, body_id, key, tile_index) VALUES
          ('mine', 'world', 'mine', 0),
          ('probe', 'world', 'probe_pad', NULL),
          ('telescope', 'world', 'telescope', NULL),
          ('depot', 'world', 'depot', 2);
      `);

      await client.query(migrationSql);

      const { rows } = await client.query(
        `SELECT tile_index FROM buildings WHERE id = 'telescope'`,
      );
      expect(rows[0].tile_index).toBe(1);

      await expect(
        client.query(
          `INSERT INTO buildings (id, body_id, key, tile_index)
           VALUES ('duplicate', 'world', 'telescope', 3)`,
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        client.query(
          `INSERT INTO buildings (id, body_id, key, tile_index)
           VALUES ('tileless', 'world', 'market', NULL)`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        client.query(
          `INSERT INTO buildings (id, body_id, key, tile_index)
           VALUES ('tiled-probe', 'world', 'probe_pad', 3)`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('abandonne explicitement face à plusieurs télescopes legacy', async () => {
    await withLegacySchema(async (client) => {
      await client.query(`
        INSERT INTO bodies (id, tiles) VALUES ('world', 3);
        INSERT INTO buildings (id, body_id, key, tile_index) VALUES
          ('telescope-a', 'world', 'telescope', NULL),
          ('telescope-b', 'world', 'telescope', NULL);
      `);

      await expect(client.query(migrationSql)).rejects.toThrow(
        /plusieurs telescopes legacy/i,
      );
      const { rows } = await client.query(
        `SELECT count(*)::int AS count FROM buildings WHERE key = 'telescope'`,
      );
      expect(rows[0].count).toBe(2);
    });
  });

  it("abandonne explicitement si le monde legacy n'a aucune tuile libre", async () => {
    await withLegacySchema(async (client) => {
      await client.query(`
        INSERT INTO bodies (id, tiles) VALUES ('world', 1);
        INSERT INTO buildings (id, body_id, key, tile_index) VALUES
          ('mine', 'world', 'mine', 0),
          ('telescope', 'world', 'telescope', NULL);
      `);

      await expect(client.query(migrationSql)).rejects.toThrow(
        /sans tuile libre/i,
      );
      const { rows } = await client.query(
        `SELECT tile_index FROM buildings WHERE id = 'telescope'`,
      );
      expect(rows[0].tile_index).toBeNull();
    });
  });
});

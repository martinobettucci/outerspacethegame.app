/**
 * Seed de développement — contrat maintenu (CLAUDE.md §8).
 *
 * Chunk A : la base n'a pas encore de schéma applicatif ; le seed vérifie
 * seulement la connexion. La génération de l'univers et du compte de
 * démonstration (via les vrais flux applicatifs) arrive aux chunks B/C.
 */
import { createPool } from './pool.js';

const pool = createPool();
try {
  await pool.query('SELECT 1');
  console.log('Seed : base joignable — rien à seeder au stade actuel (pré-schéma).');
} finally {
  await pool.end();
}

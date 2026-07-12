/**
 * Seed de développement — contrat maintenu (CLAUDE.md §8).
 * Passe par le VRAI flux applicatif (registerPlayer → spawn starter) :
 * aucune donnée fabriquée hors des services du jeu.
 *
 * Comptes de démonstration (documentés au README) :
 * - demo@atg.local / demo-password-1 (politique : industrialist)
 * - neighbor@atg.local / demo-password-2 (politique : mercantile) —
 *   spawn APRÈS le premier : matérialise la garantie du voisin 150–240 pc.
 * Idempotent : ne recrée pas les comptes existants.
 */
import { config } from '../config.js';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { registerPlayer } from '../services/players.js';
import { setInnateOffers } from '../services/market.js';

export const DEMO_ACCOUNTS = [
  {
    email: 'demo@atg.local',
    password: 'demo-password-1',
    displayName: 'Sovereign Demo',
    politics: 'industrialist',
  },
  {
    email: 'neighbor@atg.local',
    password: 'demo-password-2',
    displayName: 'Sovereign Neighbor',
    politics: 'mercantile',
  },
] as const;

export async function seed(databaseUrl?: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    for (const account of DEMO_ACCOUNTS) {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM players WHERE email = $1',
        [account.email],
      );
      if (rowCount) {
        console.log(`Seed : ${account.email} existe déjà — inchangé.`);
        continue;
      }
      const result = await registerPlayer(pool, {
        ...account,
        universeSeed: config.UNIVERSE_SEED,
      });
      console.log(
        `Seed : ${account.email} créé — starter ${result.spawn.starterPlanetId} ` +
          `@ (${result.spawn.pocketCenter.x.toFixed(0)}, ${result.spawn.pocketCenter.y.toFixed(0)})`,
      );
      // Le monde marchand de démonstration publie son hospitalité (GB §9)
      // via la VRAIE commande — le seed démontre chaque fonctionnalité (§8).
      if (account.politics === 'mercantile') {
        await setInnateOffers(pool, result.playerId, result.spawn.starterPlanetId, [
          { sell: 'water', want: 'ore', price: 2, keepFloorT: 10 },
        ]);
        console.log(`Seed : ${account.email} — offre innée publiée (water @ 2 ore/T).`);
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  seed().catch((err) => {
    console.error(String(err));
    process.exitCode = 1;
  });
}

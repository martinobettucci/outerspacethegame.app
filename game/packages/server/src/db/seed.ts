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
import { planetDetail } from '../services/planets.js';

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

async function logDemoPyramid(
  pool: ReturnType<typeof createPool>,
  playerId: string,
  starterId: string,
  fresh: boolean,
): Promise<void> {
  const detail = await planetDetail(pool, playerId, starterId);
  const { children, actives, seniors } = detail.pyramid;
  const sum = children + actives + seniors;
  if (Math.abs(sum - detail.population) > 1e-6) {
    throw new Error(
      `Seed incohérent : pyramide ${sum} != population ${detail.population} (${starterId})`,
    );
  }
  if (fresh && (children !== 64 || actives !== 191 || seniors !== 95)) {
    throw new Error(
      `Seed incohérent : starter frais attendu C/A/S 64/191/95, reçu ${children}/${actives}/${seniors}`,
    );
  }
  console.log(
    `Seed : pyramide réelle ${starterId} — C/A/S ${children}/${actives}/${seniors} (P=${detail.population}).`,
  );
}

export async function seed(databaseUrl?: string): Promise<void> {
  const pool = createPool(databaseUrl);
  try {
    await runMigrations(pool);
    for (const account of DEMO_ACCOUNTS) {
      const { rows: existing } = await pool.query(
        `SELECT p.id AS player_id, b.id AS starter_id
           FROM players p
           LEFT JOIN bodies b ON b.owner_id = p.id AND b.is_starter = true
          WHERE p.email = $1`,
        [account.email],
      );
      if (existing[0]) {
        console.log(`Seed : ${account.email} existe déjà — inchangé.`);
        if (existing[0].starter_id) {
          await logDemoPyramid(
            pool,
            existing[0].player_id,
            existing[0].starter_id,
            false,
          );
        }
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
      await logDemoPyramid(
        pool,
        result.playerId,
        result.spawn.starterPlanetId,
        true,
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

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Seed contract”; GAME_BOOK.md §19; DESIGN_GUIDE.md §2.2; CLAUDE.md §8. */
/**
 * Seed de développement — contrat maintenu (CLAUDE.md §8).
 * Passe par le VRAI flux applicatif (registerPlayer → spawn starter) :
 * aucune donnée fabriquée hors des services du jeu.
 *
 * Comptes de démonstration (documentés au README) :
 * - demo@atg.local / demo-password-1 (politique : industrialist)
 * - neighbor@atg.local / demo-password-2 (politique : mercantile) —
 *   spawn APRÈS le premier : matérialise la garantie du voisin 150–240 pc.
 * - lucky-N@atg.local / demo-password-3 (politique : civic) — N est
 *   BALAYÉ déterministiquement (même flux de luck que la prod, §2.2b)
 *   jusqu'au premier e-mail à ≥ 2 starters : le multi-starter est
 *   démontré par le vrai flux, jamais fabriqué.
 * Idempotent : ne recrée pas les comptes existants.
 */
import { config } from '../config.js';
import { createPool } from './pool.js';
import { runMigrations } from './migrate.js';
import { registerPlayer } from '../services/players.js';
import { setInnateOffers } from '../services/market.js';
import { planetDetail } from '../services/planets.js';
import { pocketLuckStream, rollPocketLuck } from '../gen/rolls.js';

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

/**
 * §2.2b : e-mail de démo « chanceux » — premier `lucky-N@atg.local` dont le
 * flux de poche (identique à la prod) tire ≥ 2 starters. Déterministe pour
 * un UNIVERSE_SEED donné : le seed reste un contrat reproductible (§8).
 */
export function findLuckyDemoEmail(luckPepper: string): string {
  for (let i = 0; i < 200_000; i++) {
    const email = `lucky-${i}@atg.local`;
    const luck = rollPocketLuck(pocketLuckStream(luckPepper, email));
    if (luck.starters >= 2) return email;
  }
  throw new Error('Seed : aucun e-mail chanceux trouvé (balayage 200k)');
}

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
    const accounts = [
      ...DEMO_ACCOUNTS,
      {
        email: findLuckyDemoEmail(config.LUCK_PEPPER),
        password: 'demo-password-3',
        displayName: 'Sovereign Lucky',
        politics: 'civic',
      } as const,
    ];
    for (const account of accounts) {
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
        luckPepper: config.LUCK_PEPPER,
      });
      console.log(
        `Seed : ${account.email} créé — starter ${result.spawn.starterPlanetId} ` +
          `@ (${result.spawn.pocketCenter.x.toFixed(0)}, ${result.spawn.pocketCenter.y.toFixed(0)})` +
          (result.spawn.starterPlanetIds.length > 1
            ? ` — POCKET LUCK §2.2b : ${result.spawn.starterPlanetIds.length} starters`
            : '') +
          ` — ${result.spawn.bonusPlanetIds.length} monde(s) bonus latent(s)`,
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

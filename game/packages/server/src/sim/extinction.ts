/**
 * Transition canonique d'extinction (GB §10, DG §3.2-v2 k, chunk BD).
 *
 * Toutes les voies menant à P=0 passent ici : le monde redevient sauvage,
 * les gouverneurs installés meurent, mais bâtiments/techs/stocks/gisements
 * restent en place pour une éventuelle recolonisation.
 */
import {
  normalizeDemographicCounters,
  type DemographicCounters,
  type Pyramid,
} from '@atg/shared';
import type pg from 'pg';
import { recomputePlanetRates } from './rebase.js';

export interface ExtinctionSnapshot {
  bodyId: string;
  pyramid: Pyramid;
  demoCounters?: unknown;
}

export interface ExtinctionResult {
  counters: DemographicCounters;
  governorsKilled: number;
}

export async function extinguishPlanet(
  client: pg.PoolClient,
  snap: ExtinctionSnapshot,
  nowMs: number,
  opts: { countRemainingAsDeaths?: boolean } = {},
): Promise<ExtinctionResult> {
  const counters = normalizeDemographicCounters(snap.demoCounters);
  if (opts.countRemainingAsDeaths ?? true) {
    counters.deaths.children += Math.max(0, snap.pyramid.children);
    counters.deaths.actives += Math.max(0, snap.pyramid.actives);
    counters.deaths.seniors += Math.max(0, snap.pyramid.seniors);
  }

  const { rows: governors } = await client.query(
    `DELETE FROM npcs
     WHERE bound_host_type = 'planet' AND bound_host_id = $1
     RETURNING id`,
    [snap.bodyId],
  );
  await client.query(
    `UPDATE buildings SET workforce = 0
     WHERE body_id = $1 AND workforce <> 0`,
    [snap.bodyId],
  );
  await client.query(
    `UPDATE bodies
        SET owner_id = NULL,
            is_starter = false,
            account_bound_until = NULL,
            colonized_at = NULL,
            population = 0,
            pop_children = 0,
            pop_seniors = 0,
            illness = 0,
            unemp_over_days = 0,
            clock_deadlines = '{}'::jsonb,
            demo_counters = $2,
            config = COALESCE(config, '{}'::jsonb) - 'innateOffers',
            pop_as_of = to_timestamp($3 / 1000.0)
      WHERE id = $1 AND body_type = 'planet'`,
    [snap.bodyId, JSON.stringify(counters), nowMs],
  );
  await client.query(
    `DELETE FROM events
     WHERE processed_at IS NULL AND kind IN ('pop_daily', 'pop_clock')
       AND payload->>'bodyId' = $1`,
    [snap.bodyId],
  );

  // Matérialise les stocks au moment exact de l'extinction, force tous les
  // taux à zéro et purge/replanifie proprement les bords non-population.
  await recomputePlanetRates(client, snap.bodyId, nowMs);
  return { counters, governorsKilled: governors.length };
}

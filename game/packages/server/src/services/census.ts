/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Global census”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.5. */
/**
 * Census publié en jeu (GB §13, DG §11.5) : totaux GLOBAUX par ressource
 * UNIQUEMENT — la ventilation par source (stocks vs soutes) et, plus
 * tard, par entrepôt reste SERVEUR (règle backend, CLAUDE.md §10 : les
 * contenus privés comptent dans les valorisations mais ne sont jamais
 * énumérés aux autres joueurs).
 */
import type pg from 'pg';
import type { ResourceId } from '@atg/shared';

export interface CensusView {
  takenAt: string;
  totals: Record<ResourceId, number>;
}

export async function latestCensus(pool: pg.Pool): Promise<CensusView | null> {
  const { rows } = await pool.query(
    `SELECT taken_at, totals FROM census_snapshots
     ORDER BY taken_at DESC, id DESC LIMIT 1`,
  );
  if (!rows[0]) return null;
  const totals: Record<string, number> = {};
  for (const [res, bucket] of Object.entries(
    rows[0].totals as Record<string, { totalT: number }>,
  )) {
    totals[res] = Number(bucket?.totalT ?? 0);
  }
  return {
    takenAt: new Date(rows[0].taken_at).toISOString(),
    totals: totals as Record<ResourceId, number>,
  };
}

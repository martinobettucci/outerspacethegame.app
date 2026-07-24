/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Global census”; GAME_BOOK.md §13; DESIGN_GUIDE.md §11.5. */
/**
 * Census global de l'offre (GB §13, DG §11.5) — agrégation PURE des deux
 * sources : stocks planétaires (évalués lazy à l'instant du snapshot) +
 * soutes (statiques, tous statuts — la soute existe physiquement partout)
 * + réserves des pools AMM (chunk U — « stocks + cargo + pools + escrow »,
 * DG §11.5 ; l'escrow d'enchères rejoindra la somme avec son chunk, gap
 * enregistré dans meta.sources). Les gisements sont EXCLUS délibérément :
 * non extraits ≠ offre.
 *
 * Sortie EXHAUSTIVE sur ALL_RESOURCE_IDS (zéros inclus — règle de
 * complétude : ni l'UI ni le pricing des pods ne devinent les absents).
 * Pas de clamp au cap de stockage : les bords stock_edge rebasent déjà,
 * le dépassement résiduel est borné par la latence d'un tick (annoncé).
 */
import { ALL_RESOURCE_IDS, type ResourceId } from '@atg/shared';
import { config } from '../config.js';
import { evalLazy } from './lazy.js';

export interface CensusTotals {
  totalT: number;
  planetStockT: number;
  shipCargoT: number;
  ammPoolT: number;
}

export function aggregateCensus(
  stockRows: {
    resource: string;
    amountT: number;
    ratePerDayT: number;
    asOfMs: number;
  }[],
  shipCargos: Record<string, number>[],
  nowMs: number,
  poolBundles: Record<string, number>[] = [],
): Record<ResourceId, CensusTotals> {
  const totals = Object.fromEntries(
    ALL_RESOURCE_IDS.map((r) => [
      r,
      { totalT: 0, planetStockT: 0, shipCargoT: 0, ammPoolT: 0 },
    ]),
  ) as Record<ResourceId, CensusTotals>;

  for (const row of stockRows) {
    const bucket = totals[row.resource as ResourceId];
    if (!bucket) continue; // clé hors catalogue : ignorée (défensif, testé)
    bucket.planetStockT += evalLazy(
      { amount: row.amountT, ratePerDay: row.ratePerDayT, asOfMs: row.asOfMs },
      nowMs,
      config.TIME_SCALE,
      { min: 0 },
    );
  }
  for (const cargo of shipCargos) {
    for (const [res, tons] of Object.entries(cargo ?? {})) {
      const bucket = totals[res as ResourceId];
      if (!bucket) continue;
      bucket.shipCargoT += Math.max(0, Number(tons) || 0);
    }
  }
  for (const bundle of poolBundles) {
    for (const [res, tons] of Object.entries(bundle ?? {})) {
      const bucket = totals[res as ResourceId];
      if (!bucket) continue;
      bucket.ammPoolT += Math.max(0, Number(tons) || 0);
    }
  }
  for (const bucket of Object.values(totals)) {
    bucket.totalT = bucket.planetStockT + bucket.shipCargoT + bucket.ammPoolT;
  }
  return totals;
}

/**
 * Docks de spaceport (GB §9/§14, DG §5.1/§8.6) — règles PURES.
 *
 * Canon : docks CUMULATIFS par niveau — L1 = 2 S ; L2 = +2 M ; L3 = +2 L
 * [TUNE] ; un dock accepte les coques ≤ sa taille ; les docks sont le
 * débit commercial (max de visiteurs au sol simultanés) et sont
 * réservables pour soi (« ready to depart », plancher anti-DoS 1–2).
 * Exemptions (GB §14) : vaisseau personnel (toujours), Combat-S
 * (n'importe où, sans dock), sonde (ne se pose pas), coque colonie sur
 * monde sauvage (chemin de colonisation).
 *
 * Séjour au sol (anti-DoS, DG round 7) : dwell max configurable par le
 * propriétaire (défaut 24 h [TUNE]), éviction auto vers le survol
 * (hors-siège — le siège n'existe pas encore, annoncé).
 *
 * [TUNE-v1 interp, JOURNAL] : les docks réservés sont soustraits du pool
 * VISITEURS en commençant par les plus petits (S avant M avant L) —
 * déterministe ; le propriétaire ignore les réservations. Défaut
 * reservedForSelf = 0 [TUNE — le canon suggère 1–2, choix par défaut
 * conservateur documenté].
 */
import type { HullSize } from './types.js';

/** Dwell au sol par défaut avant éviction d'un visiteur (heures). [TUNE] */
export const DOCK_DWELL_HOURS_DEFAULT = 24;
export const DOCK_DWELL_HOURS_MIN = 1;
export const DOCK_DWELL_HOURS_MAX = 720;
/** Docks réservables pour soi par spaceport (plancher anti-DoS). [TUNE] */
export const DOCK_RESERVED_SELF_MAX = 2;
export const DOCK_RESERVED_SELF_DEFAULT = 0;

export interface DockCounts {
  s: number;
  m: number;
  l: number;
}

/** Docks d'UN spaceport actif à ce niveau (cumulatif canon [TUNE]). */
export function spaceportDocks(level: number): DockCounts {
  return {
    s: level >= 1 ? 2 : 0,
    m: level >= 2 ? 2 : 0,
    l: level >= 3 ? 2 : 0,
  };
}

/** La coque occupe-t-elle un dock ? (exemptions GB §14/§21.) */
export function occupiesDock(category: string, size: string | null): boolean {
  if (category === 'personal' || category === 'probe') return false;
  if (category === 'combat' && size === 's') return false;
  return size === 's' || size === 'm' || size === 'l';
}

const SIZE_ORDER: readonly HullSize[] = ['s', 'm', 'l'];

function addCounts(a: DockCounts, b: DockCounts): DockCounts {
  return { s: a.s + b.s, m: a.m + b.m, l: a.l + b.l };
}

/**
 * Faisabilité gloutonne : les coques L n'entrent qu'en docks L ; les M
 * débordent sur L ; les S débordent sur M puis L. Correct pour 3 tailles
 * ordonnées (échange d'arguments standard).
 */
export function fitsInDocks(hullSizes: readonly HullSize[], docks: DockCounts): boolean {
  const need = { s: 0, m: 0, l: 0 };
  for (const size of hullSizes) need[size]++;
  if (need.l > docks.l) return false;
  const lFree = docks.l - need.l;
  if (need.m > docks.m + lFree) return false;
  const mSpill = Math.max(0, need.m - docks.m);
  const freeAfterM = docks.s + (docks.m - Math.min(need.m, docks.m)) + (lFree - mSpill);
  return need.s <= freeAfterM;
}

export interface DockedHull {
  size: HullSize;
  isOwner: boolean;
}

export interface SpaceportDockConfig {
  level: number;
  reservedForSelf: number;
}

/**
 * Un atterrissage entre-t-il ? Les docks réservés sont retirés du pool
 * visiteurs (plus petits d'abord) ; le propriétaire utilise TOUT.
 * Vérification en deux temps : (1) l'ensemble {occupants + entrant} tient
 * dans le total ; (2) les coques VISITEUSES seules tiennent dans le pool
 * non réservé (les coques du propriétaire absorbent les docks réservés
 * en priorité — c'est leur raison d'être).
 */
export function canAcceptLanding(
  spaceports: readonly SpaceportDockConfig[],
  docked: readonly DockedHull[],
  incoming: DockedHull,
): { ok: boolean; total: DockCounts; visitorPool: DockCounts } {
  let total: DockCounts = { s: 0, m: 0, l: 0 };
  let reserved = 0;
  for (const sp of spaceports) {
    total = addCounts(total, spaceportDocks(sp.level));
    reserved += Math.max(
      0,
      Math.min(DOCK_RESERVED_SELF_MAX, Math.floor(sp.reservedForSelf)),
    );
  }
  const visitorPool: DockCounts = { ...total };
  let toReserve = reserved;
  for (const size of SIZE_ORDER) {
    const take = Math.min(visitorPool[size], toReserve);
    visitorPool[size] -= take;
    toReserve -= take;
  }
  const everyone = [...docked, incoming];
  const okTotal = fitsInDocks(everyone.map((h) => h.size), total);
  const visitors = everyone.filter((h) => !h.isOwner).map((h) => h.size);
  const okVisitors = fitsInDocks(visitors, visitorPool);
  return { ok: okTotal && okVisitors, total, visitorPool };
}

/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P3 “Settlers & colonization”; docs/GAME_BOOK.md §12/§19; docs/DESIGN_GUIDE.md §3.2-v2/§12. */
/**
 * Colonisation — règles pures (GB §19/§14/§12/§3, DG §12/§3.2/§10.3).
 *
 * Canon : coloniser un monde inhabité exige un vaisseau Civil M/L équipé
 * du fitting colonie (le fitting donne le droit d'atterrir sauvage — DG
 * §8.6), ≥ 200 settlers embarqués et le stock d'amorçage ; 72 h
 * d'établissement ; « the ship is spent ». Le trajet des settlers paie un
 * péage DÉTERMINISTE (accumulateur fractionnaire par route persistante —
 * « no free sub-20 cohorts », DG §3.2). Les colonies fraîches portent une
 * grâce de 14 jours (pas de conquête ni d'a2g — DG §10.3).
 */
import type { Pyramid } from './popv2.js';
import type { HullCategory, HullSize } from './types.js';

/** Risque de trajet de base : 5 % [TUNE, DG §3.2]. */
export const SETTLER_TRIP_RISK_BASE = 0.05;

/** Grâce d'une colonie fraîche : 14 jours [TUNE, DG §10.3]. */
export const COLONY_GRACE_DAYS = 14;

/**
 * Tuiles consommées par la conversion de coque : depot L1 (tuile 0) +
 * spaceport L1 (tuile 1) — la « spaceport_S » du guide se traduit dans le
 * catalogue à 3 niveaux en spaceport L1 [TUNE interp, JOURNAL].
 */
export const COLONY_CONVERTED_TILES = [0, 1] as const;

/**
 * Risque effectif d'un trajet : base − Σ réductions des pilotes Civil de
 * l'équipage. v1 : la réduction vient de la stat individuelle seedée
 * `settler_risk_reduction` (rolls du spawn) — l'échelle « 2 % ×
 * civilPilotLevel » par rareté reste [TUNE-GAP] pour le chunk NPC/pods.
 */
export function settlerTripRisk(reductions: number[]): number {
  const total = reductions.reduce((s, r) => s + Math.max(0, r), 0);
  return Math.max(0, SETTLER_TRIP_RISK_BASE - total);
}

/**
 * Péage déterministe d'une cohorte : l'espérance (settlers × risque)
 * s'ajoute au report fractionnaire de LA ROUTE ; les morts sont la partie
 * entière, le reste re-devient le report. Aucun dé — un coût connu.
 */
export function settlerLosses(
  settlers: number,
  risk: number,
  carryIn: number,
): { deaths: number; carryOut: number } {
  // Quantifié à 1e-9 : un péage DÉTERMINISTE ne dépend pas de la poussière
  // binaire (300 × 0,03 = 8,999999… en IEEE 754 → 9 morts, pas 8).
  const expected =
    Math.round((settlers * Math.max(0, risk) + Math.max(0, carryIn)) * 1e9) / 1e9;
  const deaths = Math.min(settlers, Math.floor(expected));
  return { deaths, carryOut: Math.max(0, expected - deaths) };
}

/** Manifeste entier C/A/S porté par une coque Civil (chunk BD). */
export type SettlerManifest = Pyramid;

export function settlerManifestTotal(manifest: SettlerManifest): number {
  return manifest.children + manifest.actives + manifest.seniors;
}

/**
 * Ventile le péage entier d'une route proportionnellement sur C/A/S par
 * méthode du plus fort reste. Le départage stable C→A→S rend le résultat
 * totalement déterministe et conserve exactement le nombre de morts.
 * [TUNE-v1 interp, POP_V2_PLAN chunk BD]
 */
export function allocateSettlerDeaths(
  manifest: SettlerManifest,
  deaths: number,
): SettlerManifest {
  const keys = ['children', 'actives', 'seniors'] as const;
  const clean: SettlerManifest = {
    children: Math.max(0, Math.floor(manifest.children)),
    actives: Math.max(0, Math.floor(manifest.actives)),
    seniors: Math.max(0, Math.floor(manifest.seniors)),
  };
  const total = settlerManifestTotal(clean);
  const target = Math.min(total, Math.max(0, Math.floor(deaths)));
  if (target === 0 || total === 0) {
    return { children: 0, actives: 0, seniors: 0 };
  }

  const shares = keys.map((key, index) => {
    const exact = (clean[key] * target) / total;
    return {
      key,
      index,
      deaths: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let left = target - shares.reduce((sum, share) => sum + share.deaths, 0);
  for (const share of shares
    .slice()
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)) {
    if (left > 0 && share.deaths < clean[share.key]) {
      share.deaths += 1;
      left -= 1;
    }
  }

  return {
    children: shares.find((share) => share.key === 'children')!.deaths,
    actives: shares.find((share) => share.key === 'actives')!.deaths,
    seniors: shares.find((share) => share.key === 'seniors')!.deaths,
  };
}

export function colonyGraceUntilMs(colonizedAtMs: number): number {
  return colonizedAtMs + COLONY_GRACE_DAYS * 24 * 3600 * 1000;
}

export function isInColonyGrace(colonizedAtMs: number, nowMs: number): boolean {
  return nowMs < colonyGraceUntilMs(colonizedAtMs);
}

/**
 * Un corps est-il colonisable ? Poison et cendre de supernova sont
 * inconstructibles à jamais (GB §3/§22).
 */
export function canColonizeBody(body: {
  bodyType: string;
  ownerId: string | null;
  climate: string | null;
  annihilated?: boolean;
}): { ok: boolean; reason?: string } {
  if (body.bodyType !== 'planet') return { ok: false, reason: 'not_planet' };
  if (body.ownerId) return { ok: false, reason: 'owned' };
  if (body.annihilated) return { ok: false, reason: 'annihilated' };
  if (body.climate === 'poison') return { ok: false, reason: 'poison_unbuildable' };
  return { ok: true };
}

/** La coque peut-elle porter/utiliser un colonisateur ? (DG §8.6 : Civil M/L.) */
export function canFitColonyKit(ship: {
  category: HullCategory | string;
  size: HullSize | string | null;
}): boolean {
  return ship.category === 'civil' && (ship.size === 'm' || ship.size === 'l');
}

/**
 * Clé de l'item colonisateur (réforme anti-soft-lock 2026-07-24, GB §19.3).
 * Le colonisateur remplace le booléen `colony_kit` : coloniser exige que la
 * coque PORTE un colonisateur en soute (`item_cargo`), fabriqué au spaceport L1
 * ou reçu gratuitement (le premier par monde).
 */
export const COLONIZER_ITEM_KEY = 'colonizer';

/** La soute d'une coque contient-elle au moins un colonisateur ? */
export function hullCarriesColonizer(
  itemCargo: readonly string[] | null | undefined,
): boolean {
  return Array.isArray(itemCargo) && itemCargo.includes(COLONIZER_ITEM_KEY);
}

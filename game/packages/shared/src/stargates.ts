/**
 * Stargates (GB §6, DG §9.3–9.4) — règles PURES.
 *
 * Le raccourci OPTIONNEL et sûr du réseau : traversée INSTANTANÉE entre
 * deux mondes-endpoints, au prix d'un péage « hard gate » si le gate est
 * public (pas de ressource ⇒ pas de passage, point final). La sortie
 * DISPERSE les arrivées : U(0–15) pc autour du point fixe, par hash
 * seedé (shipId, tick d'arrivée) — déterministe mais imprévisible pour
 * les campeurs (bat le plus large rayon d'engagement ~4,5 pc). Le gate
 * MEURT avec l'un ou l'autre endpoint (canon).
 */
import { SeededStream } from './rng.js';
import type { ResourceId } from './resources.js';

/** Coût de construction d'un gate (DG §9.3) [TUNE]. */
export const STARGATE_COST: Partial<Record<ResourceId | 'crystal_any', number>> = {
  fuel_cells: 250,
  steel_h: 400,
  crystal_any: 100,
};
/** Durée du chantier (heures de jeu) [TUNE-v1 — non chiffrée par le
 * guide ; le yard limite la CONCURRENCE (1/niveau), pas la durée]. */
export const STARGATE_BUILD_HOURS = 48;
/** Dispersion maximale de sortie (pc) [TUNE — canon U(0–15)]. */
export const STARGATE_EXIT_SCATTER_MAX_PC = 15;

/**
 * Décalage de sortie d'une traversée — hash seedé (shipId, tick
 * d'arrivée) : DÉTERMINISTE (rejouable, pas de RNG vivant — DG §9.3),
 * imprévisible sans connaître le tick exact.
 */
export function stargateExitOffset(
  shipId: string,
  arrivalTick: number,
): { dx: number; dy: number } {
  const stream = new SeededStream(`${shipId}:${arrivalTick}`, 'gate-exit');
  const r = stream.uniform(0, STARGATE_EXIT_SCATTER_MAX_PC);
  const theta = stream.uniform(0, 2 * Math.PI);
  return { dx: r * Math.cos(theta), dy: r * Math.sin(theta) };
}

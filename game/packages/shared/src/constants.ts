/**
 * Constantes globales du jeu — DESIGN_GUIDE.md §0 (v0.9.2).
 *
 * Toute valeur marquée [TUNE] dans le guide reste centralisée ici (jamais
 * codée en dur ailleurs) ; un tour d'équilibrage peut la modifier sans
 * toucher au code métier.
 */

/** Durée canonique d'un tick de simulation, en secondes. [TUNE] DG §0 */
export const TICK_SECONDS = 60;

/** Pourcentages stockés en points de base (convention héritée). DG §0 */
export const BPS_BASE = 10_000;

/** Taille de l'univers : coordonnées dans [0, UNIVERSE_SIZE)² pc. [TUNE] DG §0 */
export const UNIVERSE_SIZE_PC = 1_000_000;

/** 1 jour de jeu = 1 jour réel (canon : risque temporel du combat). DG §0 */
export const GAME_DAY_SECONDS = 86_400;

/** Densités de corps célestes (1 corps pour N pc²). [TUNE] DG §0 */
export const BODY_DENSITY = {
  settledBelt: 2_500,
  deepVoid: 40_000,
} as const;

/** Index spatial : taille de maille du grid hash, en pc. [TUNE] DG §9.2 */
export const SPATIAL_GRID_CELL_PC = 64;

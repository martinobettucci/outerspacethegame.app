/**
 * Champs de junk (GB §22, DG §10.4) — règles PURES.
 *
 * Un dump ou un kill dépose du junk dans une CELLULE de 0,5 pc (max un
 * champ par cellule — les apports fusionnent) ; le champ inflige des
 * dégâts de coque à qui s'y attarde, DÉCROÎT de 10 %/jour, se collecte
 * au junk collector (30 T/jour), et disparaît près d'un trou noir (puits
 * canon sans conséquence). Zone interdite de dump : 50 pc autour de tout
 * starter [TUNE]. Le junk est aussi une ARME de déni de zone (canon).
 */
import type { ResourceId } from './resources.js';

/** Côté d'une cellule de champ (pc) [TUNE — DG §10.4 « 0.5 pc cell »]. */
export const JUNK_CELL_PC = 0.5;
/** Décroissance du champ : fraction restante après un jour [TUNE]. */
export const JUNK_DECAY_KEEP_PER_DAY = 0.9;
/** Dégâts de présence : 15 HP/jour par 30 T présents [TUNE-v1 interp du
 * « hazard 15 HP per 30 T » — appliqué en taux aux coques QUI S'Y
 * ATTARDENT ; la traversée de transit arrive avec l'interception P5]. */
export const JUNK_HAZARD_HP_PER_T_PER_DAY = 15 / 30;
/** Dumps par jour RÉEL et par coque [TUNE]. */
export const JUNK_DUMPS_PER_DAY = 5;
/** Zone interdite de dump autour de TOUT starter (pc) [TUNE]. */
export const JUNK_NO_DUMP_STARTER_PC = 50;
/** Rayon du puits d'un trou noir : dump sans conséquence (canon). */
export const JUNK_SINK_RADIUS_PC = 5;
/** Un coup de collecte (v1 : le « 30 T/day » du collector, discrétisé en
 * UN scoop par 24 h-jeu [TUNE-v1 annoncé]). */
export const JUNK_SCOOP_T = 30;
export const JUNK_SCOOP_COOLDOWN_HOURS = 24;
/** En deçà, le champ est réputé dissipé (nettoyage paresseux). */
export const JUNK_FIELD_EPSILON_T = 0.05;

/** Coût du junk collector (accessoire atelier L2 — DG §8.8) [TUNE]. */
export const JUNK_COLLECTOR_COST: Partial<Record<ResourceId, number>> = {
  steel_l: 15,
  silicon: 5,
};

/** Indice de cellule d'une coordonnée (grille fixe alignée sur 0). */
export function junkCellOf(coordPc: number): number {
  return Math.floor(coordPc / JUNK_CELL_PC);
}

/** Tonnage ÉVALUÉ d'un champ à nowMs — décroissance EXPONENTIELLE
 * (0,9^jours), jamais négative. */
export function evalJunkAmount(
  amountT: number,
  asOfMs: number,
  nowMs: number,
): number {
  if (amountT <= 0) return 0;
  const days = Math.max(0, nowMs - asOfMs) / 86_400_000;
  return amountT * Math.pow(JUNK_DECAY_KEEP_PER_DAY, days);
}

/** Taux de dégâts de présence d'un champ (HP/jour) pour son tonnage. */
export function junkHazardHpPerDay(amountT: number): number {
  return Math.max(0, amountT) * JUNK_HAZARD_HP_PER_T_PER_DAY;
}

/** Carcasse d'une coque détruite (T de junk) par taille [TUNE-v1] —
 * s'ajoute au fret qui se répand (GB §22 « destroyed ships become junk »). */
export const JUNK_CARCASS_T: Record<string, number> = { s: 10, m: 20, l: 40 };

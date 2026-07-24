/** @spec All declarations and algorithms in this file implement: docs/GEAR_CATALOG.md §1; JOURNAL 2026-07-22 (« go pour tout »). */
/**
 * W9d — effets des accessoires PASSIFS (chiffres [TUNE] jusqu'au tour
 * d'équilibrage W9f). Chaque helper lit la liste `accessories` d'une
 * coque et rend le modificateur applicable ; le grade ENHANCED est la
 * variante `<key>_enhanced` (fabriquée sur bâtiment hôte L3, figée à
 * la fabrication).
 */

function grade(
  accessories: readonly string[],
  key: string,
): 0 | 1 | 2 {
  if (accessories.includes(`${key}_enhanced`)) return 2;
  if (accessories.includes(key)) return 1;
  return 0;
}

/** heat_recycler : drain de survol ×0,85 / ×0,75. */
export function hoverDrainMult(accessories: readonly string[]): number {
  return [1, 0.85, 0.75][grade(accessories, 'heat_recycler')]!;
}

/** cryo_larder : capacité de provisions ×1,5 / ×2. */
export function survivalCapacityMult(accessories: readonly string[]): number {
  return [1, 1.5, 2][grade(accessories, 'cryo_larder')]!;
}

/** docking_clamps : séjour à quai étranger ×2 / ×3. */
export function dwellMult(accessories: readonly string[]): number {
  return [1, 2, 3][grade(accessories, 'docking_clamps')]!;
}

/** signal_mirror : rayon de scan du vaisseau (pc) — 20 de base. */
export function shipScanPc(accessories: readonly string[], basePc: number): number {
  return [basePc, 60, 100][grade(accessories, 'signal_mirror')]!;
}

/** survey_suite : +1 palier d'intel en survol, plafonné L2 / L3. */
export function surveyIntelCap(accessories: readonly string[]): 0 | 2 | 3 {
  return [0, 2, 3][grade(accessories, 'survey_suite')] as 0 | 2 | 3;
}

/** ballast_shielding : dégâts de junk ×0,5 / ×0,25. */
export function junkDamageMult(accessories: readonly string[]): number {
  return [1, 0.5, 0.25][grade(accessories, 'ballast_shielding')]!;
}

/** flare_dampers : usure champ stellaire/flare ×0,5 / ×0,25 —
 *  CUMULABLE avec la morphose appariée (qui annule déjà tout). */
export function starFieldWearMult(accessories: readonly string[]): number {
  return [1, 0.5, 0.25][grade(accessories, 'flare_dampers')]!;
}

/** trim_vanes : pénalité de charge (loadFrac, DG §8.2) ÷2 / ÷4. */
export function loadPenaltyMult(accessories: readonly string[]): number {
  return [1, 0.5, 0.25][grade(accessories, 'trim_vanes')]!;
}

/** berth_module : pax ×1,25 / ×1,5. */
export function paxMult(accessories: readonly string[]): number {
  return [1, 1.25, 1.5][grade(accessories, 'berth_module')]!;
}

/** course_optimizer : burn de trajet ×0,9 / ×0,85. */
export function travelBurnMult(accessories: readonly string[]): number {
  return [1, 0.9, 0.85][grade(accessories, 'course_optimizer')]!;
}

/** cargo_netting : +1 / +2 conteneurs. */
export function containerBonus(accessories: readonly string[]): number {
  return [0, 1, 2][grade(accessories, 'cargo_netting')]!;
}

/** mooring_winch : redéploiement d'entrepôt ÷2 / ÷3. */
export function retrieveTimeMult(accessories: readonly string[]): number {
  return [1, 0.5, 1 / 3][grade(accessories, 'mooring_winch')]!;
}

/** bilge_purifier : drain de survie équipage ×0,75 / ×0,5. */
export function survivalDrainMult(accessories: readonly string[]): number {
  return [1, 0.75, 0.5][grade(accessories, 'bilge_purifier')]!;
}

/** stargate_caller : péage de gate étranger ×0,75 / ×0,5. */
export function gateTollMult(accessories: readonly string[]): number {
  return [1, 0.75, 0.5][grade(accessories, 'stargate_caller')]!;
}

/** salvage_grapnel : temps de réclamation ×0,5 / ×0,25. */
export function claimTimeMult(accessories: readonly string[]): number {
  return [1, 0.5, 0.25][grade(accessories, 'salvage_grapnel')]!;
}

/** haggler_matrix : prix du négoce inné ×0,9 / ×0,85. */
export function innatePriceMult(accessories: readonly string[]): number {
  return [1, 0.9, 0.85][grade(accessories, 'haggler_matrix')]!;
}

/** ore_hopper : scoop de junk ×1,5 / ×2. */
export function junkScoopMult(accessories: readonly string[]): number {
  return [1, 1.5, 2][grade(accessories, 'ore_hopper')]!;
}

/** solar_sails : rayon (pc) de survol GRATUIT autour d'une étoile. */
export function solarSailFreeHoverPc(accessories: readonly string[]): number {
  return [0, 8, 15][grade(accessories, 'solar_sails')]!;
}

/** escape_thrusters : fraction d'alarme d'auto-fuite (base 0,25). */
export function fleeAlarmFraction(
  accessories: readonly string[],
  baseFraction: number,
): number {
  return [baseFraction, 0.4, 0.5][grade(accessories, 'escape_thrusters')]!;
}

/**
 * Coefficients de pénalité de charge (DG §8.2). À charge pleine (loadFrac = 1,
 * sans accessoire), la vitesse chute de `LOAD_SPEED_PENALTY` et la consommation
 * grimpe de `LOAD_BURN_PENALTY`. Nommés pour que le Codex les rende EN DIRECT
 * (contrat anti-dérive, facts.ts) — jamais dupliqués en littéral. [TUNE] DG §8.2
 */
export const LOAD_SPEED_PENALTY = 0.15;
export const LOAD_BURN_PENALTY = 0.5;

/**
 * Pénalité de CHARGE (DG §8.2 — livrée avec W9d) : loadFrac =
 * conteneurs utilisés / conteneurs. speedEff = v×(1 − 0,15×f×mult),
 * burnEff = b×(1 + 0,5×f×mult) — trim_vanes divise la pénalité.
 */
export function loadFracPenalty(
  usedContainers: number,
  totalContainers: number,
  accessories: readonly string[],
): { speedMult: number; burnMult: number; loadFrac: number } {
  const f =
    totalContainers > 0
      ? Math.min(1, Math.max(0, usedContainers / totalContainers))
      : 0;
  const mult = loadPenaltyMult(accessories);
  return {
    loadFrac: f,
    speedMult: 1 - LOAD_SPEED_PENALTY * f * mult,
    burnMult: 1 + LOAD_BURN_PENALTY * f * mult,
  };
}

/** W9d cargo_netting : conteneurs EFFECTIFS d'une coque. */
export function effectiveContainers(
  baseContainers: number,
  accessories: readonly string[],
): number {
  return baseContainers + containerBonus(accessories);
}

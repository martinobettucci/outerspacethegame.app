/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (taxonomie définitive des accessoires). */
/**
 * W9b — ACTIFS de conversion (taxonomie DÉFINITIVE, responsable
 * 2026-07-22) :
 * - CONTINUS : fonctionnent PARTOUT (survol, transit, arrêt),
 *   modulables par pas de 5 %, intrants tirés de la SOUTE au fil de
 *   l'eau, MAIS brûlent activement du carburant (moins efficients) ;
 *   starvation d'un intrant/carburant → 0 % automatique.
 * - BATCH : intrants CONSOMMÉS À L'ACTIVATION, exigent L'ARRÊT et un
 *   TEMPS DE PROCÉDÉ figé (coque immobilisée), mais NE BRÛLENT PAS de
 *   carburant (seul le drain normal du navire court) et sont PLUS
 *   efficaces. Pas de throttle : une opération = temps figé,
 *   entrées→sorties figées. [TUNE]
 */
import type { ResourceId } from './resources.js';

export interface ContinuousDef {
  itemKey: string;
  mode: 'continuous';
  /** Intrants consommés par tonne de référence. */
  input: Partial<Record<ResourceId, number>>;
  output: Partial<Record<ResourceId, number>>;
  /** Tonnes de référence converties par h-jeu à 100 %. [TUNE] */
  ratePerHourAt100: number;
  /** Carburant brûlé par h-jeu à 100 % (u, type moteur). [TUNE] */
  fuelUPerHourAt100: number;
  reversible?: boolean;
}

export interface BatchDef {
  itemKey: string;
  mode: 'batch';
  /** Entrées consommées À L'ACTIVATION (tonnes ; 'fuel' interdit ici). */
  input: Partial<Record<ResourceId, number>>;
  /** Sorties au terme du procédé. `fuel: n` = n unités du TYPE MOTEUR
   *  directement au réservoir. */
  output: Partial<Record<ResourceId | 'fuel', number>>;
  /** Durée du procédé (h-jeu), coque À L'ARRÊT et immobilisée. [TUNE] */
  processHours: number;
}

export type ConversionDef = ContinuousDef | BatchDef;

export const CONVERSIONS: Record<string, ConversionDef> = {
  // CONTINUS (mobiles, gourmands) — correction 2026-07-22 : les
  // électrolyseurs sont CONTINUS (eau tirée de la soute au fil de l'eau).
  electrolyzer: {
    itemKey: 'electrolyzer',
    mode: 'continuous',
    input: { water: 1 },
    output: { oxygen: 1, hydrogen: 1 },
    ratePerHourAt100: 20,
    fuelUPerHourAt100: 1,
  },
  electrolyzer_l2: {
    itemKey: 'electrolyzer_l2',
    mode: 'continuous',
    input: { water: 1 },
    output: { oxygen: 1, hydrogen: 1 },
    ratePerHourAt100: 20,
    fuelUPerHourAt100: 1,
    reversible: true,
  },
  vivarium: {
    itemKey: 'vivarium',
    mode: 'continuous',
    input: { oxygen: 0.5 },
    output: { food_1: 1 },
    ratePerHourAt100: 5,
    fuelUPerHourAt100: 1,
  },
  // BATCH (immobiles, efficaces, zéro carburant brûlé) — exemple canon.
  cell_decompressor: {
    itemKey: 'cell_decompressor',
    mode: 'batch',
    input: { fuel_cells: 1 },
    output: { fuel: 50 },
    processHours: 24,
  },
};

/** Grades ENHANCED (fabriqués sur bâtiment hôte L3) : débit ×1,5
 *  (continus) ou procédé ÷1,5 (batch). */
export const ENHANCED_RATE_MULT = 1.5;
export const ENHANCED_SUFFIX = '_enhanced';

export function conversionOf(itemKey: string): ConversionDef | null {
  if (CONVERSIONS[itemKey]) return CONVERSIONS[itemKey];
  if (itemKey.endsWith(ENHANCED_SUFFIX)) {
    const base = CONVERSIONS[itemKey.slice(0, -ENHANCED_SUFFIX.length)];
    if (base) {
      if (base.mode === 'continuous') {
        return { ...base, itemKey, ratePerHourAt100: base.ratePerHourAt100 * ENHANCED_RATE_MULT };
      }
      return { ...base, itemKey, processHours: base.processHours / ENHANCED_RATE_MULT };
    }
  }
  return null;
}

/** Pas de réglage des actifs continus (décision responsable). */
export const RUN_PCT_STEP = 5;

/** Réglage valide : 0–100 par pas de RUN_PCT_STEP. */
export function isValidRunPct(runPct: number): boolean {
  return (
    Number.isInteger(runPct) &&
    runPct >= 0 &&
    runPct <= 100 &&
    runPct % RUN_PCT_STEP === 0
  );
}

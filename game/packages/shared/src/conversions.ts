/** @spec All declarations and algorithms in this file implement: docs/MASTER_PLAN.md §W9b; JOURNAL 2026-07-22 (système d'accessoires validé). */
/**
 * W9b — ACTIFS de conversion (décisions responsable 2026-07-22) :
 * processus MODULÉS par pas de 5 % (0–100 %), fonctionnant PARTOUT
 * (survol, transit, arrêt) ; la STARVATION d'un intrant met le réglage
 * à 0 % automatiquement. Deux modes :
 * - BATCH (électrolyse) : le montant d'intrant est SACRIFIÉ au
 *   lancement (retiré de la soute), la production est réglée au BORD
 *   (pro-rata aux ajustements/pauses) ;
 * - CONTINU (vivarium) : consomme les intrants de soute tant qu'ils
 *   suivent.
 * Le débit de référence est en T/h-jeu À 100 % ; le carburant de
 * fonctionnement est puisé au réservoir de la coque. [TUNE]
 */
import type { ResourceId } from './resources.js';

export interface ConversionDef {
  /** Item GEAR porteur (l'accessoire DOIT être monté). */
  itemKey: string;
  mode: 'batch' | 'continuous';
  /** Intrants consommés par tonne de RÉFÉRENCE convertie. */
  input: Partial<Record<ResourceId, number>>;
  /** Sorties produites par tonne de référence. */
  output: Partial<Record<ResourceId, number>>;
  /** Tonnes de référence converties par h-jeu à 100 %. [TUNE] */
  ratePerHourAt100: number;
  /** Carburant brûlé par h-jeu à 100 % (u, type moteur). [TUNE] */
  fuelUPerHourAt100: number;
  /** Sens inverse disponible (electrolyzer_l2). */
  reversible?: boolean;
}

export const CONVERSIONS: Record<string, ConversionDef> = {
  electrolyzer: {
    itemKey: 'electrolyzer',
    mode: 'batch',
    input: { water: 1 },
    output: { oxygen: 1, hydrogen: 1 },
    ratePerHourAt100: 20,
    fuelUPerHourAt100: 1,
  },
  electrolyzer_l2: {
    itemKey: 'electrolyzer_l2',
    mode: 'batch',
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
};

/** Grades ENHANCED (fabriqués sur bâtiment hôte L3) : débit ×1,5. */
export const ENHANCED_RATE_MULT = 1.5;
export const ENHANCED_SUFFIX = '_enhanced';

/** Déf de conversion d'un item, grades enhanced compris. */
export function conversionOf(itemKey: string): ConversionDef | null {
  if (CONVERSIONS[itemKey]) return CONVERSIONS[itemKey];
  if (itemKey.endsWith(ENHANCED_SUFFIX)) {
    const base = CONVERSIONS[itemKey.slice(0, -ENHANCED_SUFFIX.length)];
    if (base) {
      return {
        ...base,
        itemKey,
        ratePerHourAt100: base.ratePerHourAt100 * ENHANCED_RATE_MULT,
      };
    }
  }
  return null;
}

/** Réglage valide : 0–100 par pas de 5 (décision responsable). */
export function isValidRunPct(runPct: number): boolean {
  return (
    Number.isInteger(runPct) && runPct >= 0 && runPct <= 100 && runPct % 5 === 0
  );
}

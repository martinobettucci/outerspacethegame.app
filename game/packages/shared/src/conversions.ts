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

/** Clés de sortie SPÉCIALES (W9e) : `fuel` = unités du TYPE MOTEUR
 *  directement au réservoir (bornées à la capacité effective) ;
 *  `hp_pct` = % des HP MAX de la coque réparés (borné au plein). */
export type ConversionOutputKey = ResourceId | 'fuel' | 'hp_pct';

export interface ContinuousDef {
  itemKey: string;
  mode: 'continuous';
  /** Intrants consommés par tonne de référence. */
  input: Partial<Record<ResourceId, number>>;
  output: Partial<Record<ConversionOutputKey, number>>;
  /** Tonnes de référence converties par h-jeu à 100 %. [TUNE] */
  ratePerHourAt100: number;
  /** Carburant brûlé par h-jeu à 100 % (u, type moteur). [TUNE] */
  fuelUPerHourAt100: number;
  reversible?: boolean;
  /** W9e — STANCE de déplacement (rate 0 : le throttle est un réglage
   *  lu par moveShip, pas un flux de soute). */
  stance?: 'ram_scoop' | 'gravity_sling';
}

export interface BatchDef {
  itemKey: string;
  mode: 'batch';
  /** Entrées consommées À L'ACTIVATION (tonnes ; 'fuel' interdit ici). */
  input: Partial<Record<ResourceId, number>>;
  /** Sorties au terme du procédé (clés spéciales : voir ci-dessus). */
  output: Partial<Record<ConversionOutputKey, number>>;
  /** Durée du procédé (h-jeu), coque À L'ARRÊT et immobilisée. [TUNE] */
  processHours: number;
  /** W9e jump_primer : charge LIBRE (le joueur choisit la durée entre
   *  min et max) ; au terme, boost vitesse ×boostSpeedMult pendant
   *  boostDurationMult × la durée de charge. */
  charge?: {
    minHours: number;
    maxHours: number;
    boostSpeedMult: number;
    boostDurationMult: number;
  };
  /** W9e kedge_winch : au terme, déplace la coque de `pc` VERS la cible
   *  fournie à l'activation — sans carburant. MODE BOOST : lancé avec
   *  < 1 u restant, tout est brûlé et la dérive passe à `boostPc`. */
  kedge?: { pc: number; boostPc: number };
  /** W9e deep_scan_pulse : au terme, instantané d'intel du palier `tier`
   *  sur le corps SOUS SCAN le plus proche (figé à l'activation). */
  scanSnapshotTier?: 2 | 3;
  /** W9e cryo_stasis_pod : stase — survie (et vieillissement) GELÉE
   *  pendant le procédé ; réveil à la demande en `wakeMinutes` (L1).
   *  Le grade enhanced (L2) autorise le VOYAGE en stase (autopilote,
   *  durée choisie, irréveillable avant le terme). */
  stasis?: { wakeMinutes: number; maxHours: number };
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
  // W9e — CONTINUS restants (chiffres [TUNE] jusqu'à W9f).
  /** La soute-réservoir : craque des fuel_cells en carburant MOTEUR en
   *  route — moins efficient que le décompresseur batch (40 < 50). */
  cell_cracker: {
    itemKey: 'cell_cracker',
    mode: 'continuous',
    input: { fuel_cells: 1 },
    output: { fuel: 40 },
    ratePerHourAt100: 0.1,
    fuelUPerHourAt100: 0.5,
  },
  /** Fonderie d'arc : junk de soute → acier léger (2:1). */
  arc_furnace: {
    itemKey: 'arc_furnace',
    mode: 'continuous',
    input: { junk: 2 },
    output: { steel_l: 1 },
    ratePerHourAt100: 5,
    fuelUPerHourAt100: 1,
  },
  /** Synthétiseur médical : eau + phosphore → médecine de campagne. */
  med_synth: {
    itemKey: 'med_synth',
    mode: 'continuous',
    input: { water: 1, phosphor: 0.5 },
    output: { med_1: 1 },
    ratePerHourAt100: 2,
    fuelUPerHourAt100: 1,
  },
  /** Baie de fabrication : auto-réparation 1 %/h × runPct à l'acier de
   *  SOUTE + carburant — la voie de réparation du Crusader (W9g). */
  fab_bay: {
    itemKey: 'fab_bay',
    mode: 'continuous',
    input: { steel_l: 0.5 },
    output: { hp_pct: 1 },
    ratePerHourAt100: 1,
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
  // W9e — contreparties BATCH (rendement +10 % vs continu, 12 h). [TUNE]
  electrolysis_vat: {
    itemKey: 'electrolysis_vat',
    mode: 'batch',
    input: { water: 20 },
    output: { oxygen: 22, hydrogen: 22 },
    processHours: 12,
  },
  hydroponic_run: {
    itemKey: 'hydroponic_run',
    mode: 'batch',
    input: { oxygen: 10 },
    output: { food_1: 22 },
    processHours: 12,
  },
  smelting_run: {
    itemKey: 'smelting_run',
    mode: 'batch',
    input: { junk: 20 },
    output: { steel_l: 11 },
    processHours: 12,
  },
  apothecary_still: {
    itemKey: 'apothecary_still',
    mode: 'batch',
    input: { water: 10, phosphor: 5 },
    output: { med_1: 11 },
    processHours: 12,
  },
  /** Kit de colmatage : 1 T d'acier symbolique → +25 % des HP max. */
  hull_patch_kit: {
    itemKey: 'hull_patch_kit',
    mode: 'batch',
    input: { steel_l: 1 },
    output: { hp_pct: 25 },
    processHours: 12,
  },
  // W9e partie 2 — actifs couplés au DÉPLACEMENT et au TEMPS. [TUNE]
  /** Écope à bélier : STANCE — en TRANSIT dans un champ stellaire du
   *  type moteur, récolte du carburant ∝ runPct CONTRE une usure de
   *  traversée (×2 std, ×1,5 enhanced — voir RAM_SCOOP). */
  ram_scoop: {
    itemKey: 'ram_scoop',
    mode: 'continuous',
    input: {},
    output: {},
    ratePerHourAt100: 0,
    fuelUPerHourAt100: 0,
    stance: 'ram_scoop',
  },
  /** Fronde gravitationnelle : STANCE — départ ≤ 8 pc d'une étoile,
   *  vitesse ×(1 + runPct/2) contre des dégâts ∝ runPct (GRAVITY_SLING). */
  gravity_sling: {
    itemKey: 'gravity_sling',
    mode: 'continuous',
    input: {},
    output: {},
    ratePerHourAt100: 0,
    fuelUPerHourAt100: 0,
    stance: 'gravity_sling',
  },
  /** Amorce de saut : charge libre 1 h–10 j, GRATUITE — au terme, boost
   *  vitesse ×1,5 pendant 3 × le temps de charge. */
  jump_primer: {
    itemKey: 'jump_primer',
    mode: 'batch',
    input: {},
    output: {},
    processHours: 0,
    charge: { minHours: 1, maxHours: 240, boostSpeedMult: 1.5, boostDurationMult: 3 },
  },
  /** Treuil d'ancre : 1 j → 5 pc SANS carburant vers la cible fournie ;
   *  MODE BOOST (< 1 u restant) : tout brûlé, dérive 10 pc/j. */
  kedge_winch: {
    itemKey: 'kedge_winch',
    mode: 'batch',
    input: {},
    output: {},
    processHours: 24,
    kedge: { pc: 5, boostPc: 10 },
  },
  /** Impulsion de scan profond : 12 h → un instantané d'intel L3 du
   *  corps sous scan le plus proche (figé à l'activation). */
  deep_scan_pulse: {
    itemKey: 'deep_scan_pulse',
    mode: 'batch',
    input: {},
    output: {},
    processHours: 12,
    scanSnapshotTier: 3,
  },
  /** Capsule de cryostase : survie (et vieillissement) GELÉE 7 j ;
   *  réveil à la demande en 10 min. L2 (enhanced) : autopilote
   *  cryostatique — voyage en stase, durée choisie, irréveillable. */
  cryo_stasis_pod: {
    itemKey: 'cryo_stasis_pod',
    mode: 'batch',
    input: {},
    output: {},
    processHours: 168,
    stasis: { wakeMinutes: 10, maxHours: 2400 },
  },
};

/** W9e ram_scoop — récolte et usure PAR PC de champ traversé (réglées
 *  au départ, comme le pré-brûlage) : fuel = pc × u/pc × runPct ;
 *  usure supplémentaire = pc × HP/pc × mult (std ×2, enhanced ×1,5).
 *  PATCH 11-1 (BALANCE_LOG Round 11) : wearHpPerPc 0,5 → 0,1 — à 0,5,
 *  60 pc de champ coûtaient 75 % de la coque d'un cargo_s pour 30 u. */
export const RAM_SCOOP = {
  fuelUPerPcAt100: 0.5,
  wearHpPerPc: 0.1,
  wearMult: 2,
  wearMultEnhanced: 1.5,
} as const;

/** W9e gravity_sling — fenêtre de départ et dégâts au lancement :
 *  vitesse ×(1 + runPct/200), dégâts = HP × runPct/100 (enhanced ÷2). [TUNE] */
export const GRAVITY_SLING = {
  windowPc: 8,
  damageHpAt100: 10,
  damageMultEnhanced: 0.5,
} as const;

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

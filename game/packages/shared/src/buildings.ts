/**
 * Catalogue des bâtiments — DESIGN_GUIDE §5/§5.1/§6 (v0.10), COMPLET (29).
 * Clés = contrat d'assets (`building_{key}_l{n}.gif`).
 *
 * Règles transverses (canon/§6) :
 * - 1 bâtiment = 1 tuile exactement, sauf `probe_pad` (infrastructure,
 *   0 tuile) ; `telescope` est unique et sur tuile depuis la décision
 *   responsable 2026-07-20 ;
 * - 3 niveaux, montée de niveau sur place ;
 * - HP par niveau : 1 500 / 3 000 / 6 000 [round 4b] ;
 * - démolition : remboursement 50 %, tuile libérée, 6 h [TUNE] ;
 * - temps de construction 6 h / 24 h / 72 h par niveau [TUNE]
 *   (ingénieurs −10 %/palier de rareté) ;
 * - placement = 50 % du coût d'unlock sauf mention contraire [TUNE].
 *
 * Coûts de montée de niveau : lorsque le guide les chiffre (depot §3.3b,
 * warehouse §5.1, nœuds de niveau spaceport_l2/shipyard_l3/market_l2/
 * residential_l3), valeurs exactes ; sinon règle générique [TUNE-GAP,
 * proposition en attente d'un tour d'équilibrage, voir TUNE_GAPS] :
 * L2 = 3 × placement, L3 = 6 × placement (ratio du ladder depot).
 */
import type { CostBundle } from './resources.js';
import type { Archetype } from './types.js';

export type BuildingKey =
  | 'telescope'
  | 'probe_pad'
  | 'depot'
  | 'warehouse'
  | 'mine'
  | 'farm'
  | 'waterworks'
  | 'smelter'
  | 'crystal_extractor'
  | 'refinery'
  | 'fuelcell_plant'
  | 'spaceport'
  | 'workshop'
  | 'market'
  | 'residential'
  | 'lab'
  | 'clinic'
  | 'obs_station'
  | 'shipyard'
  | 'military_district'
  | 'weapon_foundry'
  | 'research_center'
  | 'diplomatic_district'
  | 'casino'
  | 'commerce_district'
  | 'faction_hq'
  | 'stargate_yard'
  | 'terraformer'
  | 'artificial_planet_yard';

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export interface BuildingDef {
  key: BuildingKey;
  tier: Tier;
  /** Politique requise pour la construction (null = masque commun). */
  politics: Archetype | null;
  /** Politique requise à partir d'un niveau donné (ex. market L2+ Mercantile). */
  politicsFromLevel?: { level: 2 | 3; archetype: Archetype };
  /** Consomme une tuile ? (`probe_pad` seul : non — infrastructure). */
  usesTile: boolean;
  /** Coût d'unlock du nœud tech (une fois par planète). [TUNE] */
  unlockCost: CostBundle;
  /** Coût de placement par instance ; défaut = 50 % de l'unlock. [TUNE] */
  placementCost: CostBundle;
  /** Coûts de montée de niveau [L2, L3]. */
  levelUpCost: [CostBundle, CostBundle];
  /** Nombre maximal d'instances par planète (telescope/clinic : 1). */
  maxInstances?: number;
  /**
   * Débit industriel par niveau (lots/jour × E) — uniquement pour les
   * bâtiments-industrie à recette (DG §6). [TUNE]
   */
  batchesPerDayByLevel?: [number, number, number];
  /** Description structurée des effets par niveau (source UI + moteur). */
  effects: string;
}

/** HP des bâtiments par niveau [round 4b ×10]. */
export const BUILDING_HP_BY_LEVEL = [1_500, 3_000, 6_000] as const;

/** Temps de construction par niveau (heures). [TUNE] DG §6 */
export const BUILD_HOURS_BY_LEVEL = [6, 24, 72] as const;

/** Démolition : part remboursée et durée (heures). [TUNE] DG §6 */
export const DEMOLISH_REFUND_RATIO = 0.5;
export const DEMOLISH_HOURS = 6;

/** Rééquipage d'une industrie : « re-targeting = 24 h retool ». [TUNE] */
export const RETOOL_HOURS = 24;
/** Gouvernance Industrialist : retool INSTANTANÉ, ≤ 1 switch par 24 h
 * (DG §4.1) — au-delà de la fenêtre, le retool standard s'applique
 * [TUNE-v1 interp]. */
export const INSTANT_RETOOL_WINDOW_HOURS = 24;

const half = (b: CostBundle): CostBundle =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, Math.ceil((v as number) / 2)]),
  ) as CostBundle;

const times = (b: CostBundle, f: number): CostBundle =>
  Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, Math.ceil((v as number) * f)]),
  ) as CostBundle;

/** Règle générique de montée de niveau [TUNE-GAP] : ×3 / ×6 du placement. */
const genericLevelUp = (
  placement: CostBundle,
): [CostBundle, CostBundle] => [times(placement, 3), times(placement, 6)];

function def(
  d: Omit<BuildingDef, 'placementCost' | 'levelUpCost'> & {
    placementCost?: CostBundle;
    levelUpCost?: [CostBundle, CostBundle];
  },
): BuildingDef {
  const placementCost = d.placementCost ?? half(d.unlockCost);
  return {
    ...d,
    placementCost,
    levelUpCost: d.levelUpCost ?? genericLevelUp(placementCost),
  };
}

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  telescope: def({
    key: 'telescope',
    tier: 0,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 20, silicon: 10 },
    maxInstances: 1,
    effects: 'scope +200 pc/level; max 1 instance; exactly 1 tile',
  }),
  probe_pad: def({
    key: 'probe_pad',
    tier: 0,
    politics: null,
    usesTile: false,
    unlockCost: { ore: 15, carbon: 10 },
    effects: 'builds probes; cap 5/day/level; no tile',
  }),
  depot: def({
    key: 'depot',
    tier: 0,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 10 },
    placementCost: { ore: 10 },
    // Ladder exact §3.3b : L2 30 ore + 10 steelL ; L3 60 ore + 30 steelL.
    levelUpCost: [
      { ore: 30, steel_l: 10 },
      { ore: 60, steel_l: 30 },
    ],
    effects: '+200/400/600 T fungible storage (see DG §3.3b)',
  }),
  warehouse: def({
    key: 'warehouse',
    tier: 1,
    politics: null,
    usesTile: true,
    // §5.1 : unlock 40 ore + 20 steelL ; L2 80+40 ; L3 160+80 [TUNE].
    unlockCost: { ore: 40, steel_l: 20 },
    levelUpCost: [
      { ore: 80, steel_l: 40 },
      { ore: 160, steel_l: 80 },
    ],
    effects:
      'vehicle+item reserve: L1 = 2 L / 4 M / 6 S vehicles + 50 items; L2 ×2, L3 ×3; allied parking configurable; contents consume nothing',
  }),
  mine: def({
    key: 'mine',
    tier: 0,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 15 },
    batchesPerDayByLevel: [10, 20, 40],
    effects: 'basic deposit extraction 10/20/40 T/day × E; max 1 extractor per deposit',
  }),
  farm: def({
    key: 'farm',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { carbon: 15, hydrogen: 5 },
    batchesPerDayByLevel: [10, 20, 40],
    effects: 'food 10/20/40 batches/day × E (one recipe per instance)',
  }),
  waterworks: def({
    key: 'waterworks',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 15, hydrogen: 5 },
    batchesPerDayByLevel: [10, 20, 40],
    effects: 'water 10/20/40 batches/day × E (one recipe per instance)',
  }),
  smelter: def({
    key: 'smelter',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 30, uranium: 5 },
    batchesPerDayByLevel: [10, 20, 40],
    effects: 'steel (L/H) 10/20/40 batches/day × E (one recipe per instance)',
  }),
  crystal_extractor: def({
    key: 'crystal_extractor',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 25, lithium: 10 },
    batchesPerDayByLevel: [8, 16, 32],
    effects: 'climate crystal 8/16/32 T/day × E; max 1 extractor per deposit',
  }),
  refinery: def({
    key: 'refinery',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 60, steel_l: 20 },
    batchesPerDayByLevel: [20, 40, 80],
    effects: 'fuel cells 20/40/80 batches/day × E (crystals → cells)',
  }),
  fuelcell_plant: def({
    key: 'fuelcell_plant',
    tier: 2,
    politics: null,
    usesTile: true,
    // « 20 crystal » : cristal climatique de la planète [TUNE interp].
    unlockCost: { ore: 120, steel_l: 40, crystal_any: 20 },
    batchesPerDayByLevel: [40, 80, 160],
    effects:
      'dedicated cells line 40/80/160 batches/day × E (2× same-level refinery); recipe yields unchanged',
  }),
  spaceport: def({
    key: 'spaceport',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 40, steel_l: 20 },
    // Nœuds de niveau : L2 = spaceport_l2 (T2, 120 ore + 60 steelL) ;
    // L3 [TUNE-GAP] : 240 ore + 120 steelL (double de L2).
    levelUpCost: [
      { ore: 120, steel_l: 60 },
      { ore: 240, steel_l: 120 },
    ],
    effects:
      'docks cumulative: L1 = 2 S; L2 = +2 M; L3 = +2 L; dock accepts hulls ≤ its size; docks = max simultaneous grounded visitors, reservable',
  }),
  workshop: def({
    key: 'workshop',
    tier: 1,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 30, silicon: 10 },
    effects:
      'repair 5%/h ×1/2/4; L2+: crafts accessories & terraform cores (politics-free)',
  }),
  market: def({
    key: 'market',
    tier: 1,
    politics: null,
    politicsFromLevel: { level: 2, archetype: 'mercantile' },
    usesTile: true,
    unlockCost: { ore: 25, carbon: 10 },
    // market_l2 (T2 Mercantile) : 100 ore + 40 carbon + 25 cells ;
    // market L3 [TUNE-GAP] : 200 ore + 80 carbon + 50 cells.
    levelUpCost: [
      { ore: 100, carbon: 40, fuel_cells: 25 },
      { ore: 200, carbon: 80, fuel_cells: 50 },
    ],
    effects:
      'trade slots = level (1/2/3); L1 fixed-rate; L2 AMM pools + auctions; L3 LP fee 25→20 bp',
  }),
  residential: def({
    key: 'residential',
    tier: 1,
    politics: null,
    politicsFromLevel: { level: 2, archetype: 'civic' },
    usesTile: true,
    unlockCost: { ore: 20, carbon: 20 },
    // residential_l3 (T3 Civic) : 150 ore + 150 carbon + 50 cells ;
    // L2 [TUNE-GAP] : règle générique.
    levelUpCost: [
      { ore: 30, carbon: 30 },
      { ore: 150, carbon: 150, fuel_cells: 50 },
    ],
    effects:
      'popCap +15 pp/level, additive (+45% at L3); UI must project the E(u) trough before build',
  }),
  lab: def({
    key: 'lab',
    tier: 2,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 80, silicon: 30, lithium: 10 },
    batchesPerDayByLevel: [10, 20, 40],
    effects: 'medicines 10/20/40 batches/day × E (one recipe per instance)',
  }),
  clinic: def({
    key: 'clinic',
    tier: 2,
    politics: null,
    usesTile: true,
    // [TUNE-v1] Le coût d'accès lie la clinique à la filière du lab ; la
    // population (pas le bâtiment) brûle ensuite la médecine optionnelle.
    // Placement = moitié arrondie comme le reste du catalogue.
    unlockCost: { ore: 80, silicon: 30, med_1: 10 },
    // Les réductions ne se cumulent pas : une seule clinique, dont le
    // niveau porte l'effet planétaire complet (DG §3.2-v2 h).
    maxInstances: 1,
    effects:
      'illness index reduction −0.10/−0.20/−0.35 by level (floor 0); one clinic per planet',
  }),
  obs_station: def({
    key: 'obs_station',
    tier: 2,
    politics: null,
    usesTile: true,
    unlockCost: { ore: 60, silicon: 40 },
    effects: 'ground OBS umbrella radius 5/8/12 pc',
  }),
  shipyard: def({
    key: 'shipyard',
    tier: 2,
    politics: null,
    politicsFromLevel: { level: 3, archetype: 'industrialist' },
    usesTile: true,
    unlockCost: { ore: 150, steel_l: 80, fuel_cells: 20 },
    // shipyard_l3 (T3 Industrialist) : 400 steelL + 100 steelH + 50 cells ;
    // L2 [TUNE-GAP] : règle générique.
    levelUpCost: [
      { ore: 225, steel_l: 120, fuel_cells: 30 },
      { steel_l: 400, steel_h: 100, fuel_cells: 50 },
    ],
    effects:
      'L1 builds S+M hulls; L2 bulk M (−25% cost); L3 builds L hulls (Industrialist)',
  }),
  military_district: def({
    key: 'military_district',
    tier: 3,
    politics: 'militarist',
    usesTile: true,
    unlockCost: { ore: 300, steel_h: 150, fuel_cells: 100 },
    effects:
      'enables conquest ops; garrison cap +50%/level; unit production 1 unit / 48·24·12 h × E by level (one queue; mints unit levels ≤ district level; per-unit cost paid at queue time)',
  }),
  weapon_foundry: def({
    key: 'weapon_foundry',
    tier: 3,
    politics: 'militarist',
    usesTile: true,
    unlockCost: { steel_h: 250, fuel_cells: 150, gold: 20 },
    effects: 'continuous derived-item mint: 1 item / 168·84·42 h × E',
  }),
  research_center: def({
    key: 'research_center',
    tier: 3,
    politics: 'scientific',
    usesTile: true,
    unlockCost: { ore: 300, silicon: 200, fuel_cells: 100 },
    effects:
      'unlock costs −10%/level; discounts multiply, best scientist only, total capped −50%',
  }),
  diplomatic_district: def({
    key: 'diplomatic_district',
    tier: 3,
    politics: 'diplomatic',
    usesTile: true,
    unlockCost: { ore: 250, steel_l: 100, fuel_cells: 100, gold: 20 },
    effects:
      'ping quota +10/day/level; share-grant slots +2/level; L3 required for sanctuary activation (earned status)',
  }),
  casino: def({
    key: 'casino',
    tier: 3,
    politics: 'mercantile',
    usesTile: true,
    unlockCost: { ore: 200, steel_l: 100, fuel_cells: 150, gold: 30 },
    effects: 'house-cut income +5% RELATIVE/level (never percentage points)',
  }),
  commerce_district: def({
    key: 'commerce_district',
    tier: 3,
    politics: 'mercantile',
    usesTile: true,
    unlockCost: { ore: 250, steel_l: 150, fuel_cells: 100 },
    effects: 'market daily limits +50%/level',
  }),
  faction_hq: def({
    key: 'faction_hq',
    tier: 3,
    politics: 'diplomatic',
    usesTile: true,
    unlockCost: { ore: 300, steel_l: 150, fuel_cells: 100 },
    effects: 'faction charter/moderation seat; banner broadcast',
  }),
  stargate_yard: def({
    key: 'stargate_yard',
    tier: 4,
    politics: null,
    usesTile: true,
    unlockCost: { steel_h: 1_000, fuel_cells: 500, crystal_any: 200 },
    effects: 'builds Stargates (DG §9.3); 1 concurrent build/level',
  }),
  terraformer: def({
    key: 'terraformer',
    tier: 4,
    politics: 'civic',
    usesTile: true,
    unlockCost: { steel_h: 2_000, fuel_cells: 1_500, crystal_any: 500 },
    effects: '+1 quality grade, once per world (terraform cores required)',
  }),
  artificial_planet_yard: def({
    key: 'artificial_planet_yard',
    tier: 5,
    politics: 'industrialist',
    usesTile: true,
    unlockCost: { steel_h: 5_000, fuel_cells: 3_000, crystal_any: 1_000 },
    effects: 'builds artificial planets (DG §13)',
  }),
};

export const ALL_BUILDING_KEYS = Object.keys(BUILDINGS) as BuildingKey[];

/**
 * Écarts [TUNE-GAP] assumés et visibles (règle de complétude CLAUDE.md) :
 * valeurs non chiffrées par le guide, proposées ici, à passer en tour
 * d'équilibrage avant d'être considérées fiables.
 */
export const TUNE_GAPS: readonly string[] = [
  'levelUpCost générique L2=3×/L3=6× placement (ratio ladder depot) pour les bâtiments sans coût de niveau chiffré',
  'spaceport L3 : 240 ore + 120 steelL (double du nœud L2 chiffré)',
  'market L3 : 200 ore + 80 carbon + 50 cells (double du nœud L2 chiffré)',
  'shipyard L2 : règle générique (seul L3 est chiffré par le guide)',
  'residential L2 : règle générique (seul L3 est chiffré par le guide)',
  'clinic : unlock 80 ore + 30 silicon + 10 med_1, max 1 instance ; placement et niveaux suivent les règles génériques',
];

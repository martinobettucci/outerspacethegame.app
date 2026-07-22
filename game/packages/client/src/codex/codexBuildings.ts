/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P2.codex; docs/MANUAL_PLAN.md §2–§7. */
/**
 * Codex — catalogue des TYPES de bâtiments (décision responsable
 * 2026-07-20, JOURNAL) : rôle en clair + politique d'instances VALIDÉE
 * (single = une seule instance utile/permise par monde ; multiple =
 * l'effet s'empile, plafonné par les tuiles/gisements). Table
 * EXHAUSTIVE (règle de complétude — 29 types, clinique incluse).
 *
 * NB : la table décrit la POLITIQUE validée ; l'application des caps
 * (`maxInstances`) est le chantier « télescope sur tuile + instances »
 * en cours côté responsable (migration 025).
 */

export type CodexInstances = 'single' | 'multiple';

export interface CodexBuildingEntry {
  /** Rôle du bâtiment, en une phrase joueur (sans spoiler). */
  role: string;
  instances: CodexInstances;
  /** Précision d'instance (pourquoi single / comment ça empile). */
  note: string;
}

export const BUILDING_CODEX: Record<string, CodexBuildingEntry> = {
  telescope: {
    role: 'Opens your sky: each level extends how far this world can see and read other worlds.',
    instances: 'single',
    note: 'One per world, on a tile — range grows by LEVELING the one telescope.',
  },
  probe_pad: {
    role: 'Builds crewless solar-sail probes that hover here until you send them to scout.',
    instances: 'multiple',
    note: 'Each pad adds daily probe production capacity (no tile needed).',
  },
  depot: {
    role: 'Fungible storage: raises the tonnage cap of this world.',
    instances: 'multiple',
    note: 'Every depot adds its storage bonus — they stack.',
  },
  warehouse: {
    role: 'Shelters vehicles and items outside the living economy: stored things consume nothing.',
    instances: 'multiple',
    note: 'Each warehouse adds vehicle and item balance — they stack.',
  },
  mine: {
    role: 'Extracts one basic resource from one deposit (or a slow trace without one).',
    instances: 'multiple',
    note: 'Stackable, but at most ONE extractor per deposit.',
  },
  farm: {
    role: 'Grows food — the first thing your colonists starve without.',
    instances: 'multiple',
    note: 'Each farm adds throughput.',
  },
  waterworks: {
    role: 'Synthesises water — the shortest death clock of them all.',
    instances: 'multiple',
    note: 'Each plant adds throughput.',
  },
  smelter: {
    role: 'Refines ore into structural steels for construction and hulls.',
    instances: 'multiple',
    note: 'Each smelter adds throughput.',
  },
  crystal_extractor: {
    role: 'Harvests this climate’s crystal from its deposit.',
    instances: 'multiple',
    note: 'Stackable, but at most ONE extractor per deposit.',
  },
  refinery: {
    role: 'Turns crystals into fuel cells — the currency of the spacelanes.',
    instances: 'multiple',
    note: 'Each refinery adds throughput.',
  },
  fuelcell_plant: {
    role: 'A dedicated fuel-cell line, twice the pace of a refinery.',
    instances: 'multiple',
    note: 'Each plant adds throughput.',
  },
  spaceport: {
    role: 'Landing rights: docks for visiting hulls, sized by level.',
    instances: 'multiple',
    note: 'Docks of every active spaceport add up.',
  },
  workshop: {
    role: 'Repairs docked hulls — billed in light steel, heavy steel covering any shortfall — and fabricates accessory items for warehoused hulls to install.',
    instances: 'single',
    note: 'Repair uses your BEST workshop — a second adds nothing.',
  },
  market: {
    role: 'Opens trade slots (fixed-rate, then liquidity pools at higher levels).',
    instances: 'multiple',
    note: 'Each market adds its own slots.',
  },
  residential: {
    role: 'Establishes natality: without it, a colony only ages.',
    instances: 'single',
    note: 'Birth rate follows the LEVEL of one district — build up, not out.',
  },
  lab: {
    role: 'Produces medicine, softening illness and its deaths.',
    instances: 'single',
    note: 'One lab per world.',
  },
  clinic: {
    role: 'Pushes the illness index down — the denser the world, the more it matters.',
    instances: 'single',
    note: 'One clinic per world; its LEVEL sets the reduction.',
  },
  obs_station: {
    role: 'Ground targeting dome improving orbital defence accuracy.',
    instances: 'single',
    note: 'One station per world.',
  },
  shipyard: {
    role: 'Lays keels: builds hulls up to its level’s size.',
    instances: 'multiple',
    note: 'Several yards run parallel keels.',
  },
  military_district: {
    role: 'Trains ground units and anchors your garrison.',
    instances: 'multiple',
    note: 'Districts stack production and garrison slots.',
  },
  weapon_foundry: {
    role: 'Forges heavy weaponry for units and hulls.',
    instances: 'multiple',
    note: 'Foundries stack production.',
  },
  research_center: {
    role: 'Deepens science output beyond the lab.',
    instances: 'single',
    note: 'One centre per world.',
  },
  diplomatic_district: {
    role: 'Hosts envoys and multi-party channels; the road to sanctuary.',
    instances: 'single',
    note: 'One district per world.',
  },
  casino: {
    role: 'A wager-house: attracts traffic and taxes fortune.',
    instances: 'single',
    note: 'One casino per world.',
  },
  commerce_district: {
    role: 'Civic commerce hub amplifying local trade.',
    instances: 'single',
    note: 'One district per world.',
  },
  faction_hq: {
    role: 'Seat of a faction charter — banners, membership, faction ping.',
    instances: 'single',
    note: 'One HQ per world.',
  },
  stargate_yard: {
    role: 'Assembles stargates: the safe instant shortcuts of the network.',
    instances: 'single',
    note: 'One yard per world (one gate build per level at a time).',
  },
  terraformer: {
    role: 'Raises the world’s quality — once, permanently.',
    instances: 'single',
    note: 'Its work is once-per-world; a second has nothing to do.',
  },
  artificial_planet_yard: {
    role: 'Endgame: constructs artificial worlds.',
    instances: 'single',
    note: 'One yard per world.',
  },
};

export const CODEX_BUILDING_KEYS = Object.keys(BUILDING_CODEX);

/**
 * Intel planétaire par paliers (GB §20 « depending on telescope level »,
 * DG §4.1/§5/§11.3) — règles PURES.
 *
 * Barème v1 [TUNE-GAP — le canon ne chiffre l'échelle L1/L2/L3 que pour
 * les vaisseaux (DG §9.2) ; l'affectation des champs planétaires aux
 * paliers est une proposition à valider en tour d'équilibrage] :
 * - 0 : le corps n'existe pas pour l'observateur (jamais publié) ;
 * - 1 « silhouette » : couverture de base (ciel 60 pc, scan vaisseau,
 *   télescope L1) — identité, position, taille, climat, propriétaire ;
 * - 2 « développement » (télescope L2) : tuiles, population estimée,
 *   spaceport ouvert/fermé, paires de marché, offres innées ;
 * - 3 « stratégique » (télescope L3) : bâtiments (clef/niveau/statut),
 *   défenses, PRÉSENCE des gisements (sans tonnage — DG §11.3) ;
 * - 4 « deep sight » : télescope L3 + source SCIENTIFIQUE (+1, plafonné
 *   à +1 au total — DG §4.1) OU sonde sur site [TUNE-GAP] : qualité,
 *   gisements détaillés, ADN tech. Le seed lui-même ne sort JAMAIS.
 *
 * Autres [TUNE-GAP] : indice = niveau du MEILLEUR instrument couvrant
 * (pas la somme) ; estimation de population à 2 chiffres significatifs.
 */
import type { IntelTier } from './types.js';

export const INTEL_TIER_NONE = 0 as const;
export const INTEL_TIER_SILHOUETTE = 1 as const;
export const INTEL_TIER_DEVELOPMENT = 2 as const;
export const INTEL_TIER_STRATEGIC = 3 as const;
export const INTEL_TIER_DEEP_SIGHT = 4 as const;

/** Bonus scientifique : +1 palier, JAMAIS cumulé (hard-cap DG §4.1). */
export const DEEP_SIGHT_BONUS_TIERS = 1;
/** Chiffres significatifs de l'estimation de population. [TUNE-GAP] */
export const POP_ESTIMATE_SIG_FIGS = 2;
/**
 * Clefs de bâtiments comptées comme DÉFENSES au palier 3. Vide tant que
 * le catalogue n'a pas de tourelles (chunk combat) — le contrat d'intel
 * est prêt, le compte vaut 0 aujourd'hui. [TUNE-GAP]
 */
export const DEFENSE_BUILDING_KEYS: readonly string[] = ['turret'];

export interface IntelSource {
  /** Niveau du meilleur télescope ACTIF du monde source couvrant. */
  telescopeLevel: 1 | 2 | 3;
  /** La gouvernance du monde source contient l'archétype scientifique. */
  scientificSource: boolean;
}

/**
 * Palier d'intel d'une cible : max par source de (niveau + bonus
 * scientifique, une seule fois), ≥ 1 si simplement visible (ciel de
 * base/scan vaisseau), 4 si une sonde est sur site, borné [0, 4].
 */
export function intelTierFromSources(
  sources: IntelSource[],
  presence: { visible: boolean; probeOnSite: boolean },
): IntelTier {
  if (presence.probeOnSite) return INTEL_TIER_DEEP_SIGHT;
  let tier = 0;
  for (const s of sources) {
    const bonus = s.scientificSource ? DEEP_SIGHT_BONUS_TIERS : 0;
    tier = Math.max(tier, s.telescopeLevel + bonus);
  }
  if (tier === 0 && presence.visible) tier = INTEL_TIER_SILHOUETTE;
  return Math.min(4, Math.max(0, tier)) as IntelTier;
}

/** Arrondi déterministe à `sigFigs` chiffres significatifs. */
export function estimatePopulation(pop: number, sigFigs = POP_ESTIMATE_SIG_FIGS): number {
  if (!(pop > 0)) return 0;
  const magnitude = Math.floor(Math.log10(pop));
  const factor = 10 ** Math.max(0, magnitude - sigFigs + 1);
  return Math.round(pop / factor) * factor;
}

/** Données COMPLÈTES côté serveur avant projection (jamais publiées telles quelles). */
export interface PlanetIntelFull {
  id: string;
  bodyType: string;
  name: string;
  x: number;
  y: number;
  size: string | null;
  climate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isStarter: boolean;
  tiles: number;
  tilesUsed: number;
  population: number;
  spaceportOpen: boolean | null;
  marketPairs: { give: string; get: string }[];
  innateOffers: { sell: string; want: string; price: number }[];
  buildings: { key: string; level: number; status: string }[];
  quality: string | null;
  deposits: {
    resource: string;
    remainingT: number;
    initialT: number;
    dryAt: string | null;
  }[];
  techDna: { available: string[]; maxLevel: Record<string, number> };
}

export interface PlanetIntel {
  tier: IntelTier;
  id: string;
  bodyType: string;
  name: string;
  x: number;
  y: number;
  size: string | null;
  climate: string | null;
  ownerId: string | null;
  ownerName: string | null;
  isStarter: boolean;
  // ≥ 2
  tiles?: number;
  tilesUsed?: number;
  populationEstimate?: number;
  spaceportOpen?: boolean | null;
  marketPairs?: { give: string; get: string }[];
  innateOffers?: { sell: string; want: string; price: number }[];
  // ≥ 3
  buildings?: { key: string; level: number; status: string }[];
  defenseCount?: number;
  depositsPresent?: string[];
  // = 4
  quality?: string | null;
  deposits?: {
    resource: string;
    remainingT: number;
    initialT: number;
    dryAt: string | null;
  }[];
  techDna?: { available: string[]; maxLevel: Record<string, number> };
}

/**
 * Projection par LISTE BLANCHE stricte — l'UNIQUE endroit qui décide
 * « quel champ à quel palier ». Les clefs des paliers supérieurs sont
 * ABSENTES (pas nulles) ; seed, stocks, recettes, workforce, config ne
 * figurent même pas dans PlanetIntelFull.
 */
export function projectPlanetIntel(tier: IntelTier, full: PlanetIntelFull): PlanetIntel {
  const out: PlanetIntel = {
    tier,
    id: full.id,
    bodyType: full.bodyType,
    name: full.name,
    x: full.x,
    y: full.y,
    size: full.size,
    climate: full.climate,
    ownerId: full.ownerId,
    ownerName: full.ownerName,
    isStarter: full.isStarter,
  };
  if (tier >= INTEL_TIER_DEVELOPMENT) {
    out.tiles = full.tiles;
    out.tilesUsed = full.tilesUsed;
    out.populationEstimate = estimatePopulation(full.population);
    out.spaceportOpen = full.spaceportOpen;
    out.marketPairs = full.marketPairs;
    out.innateOffers = full.innateOffers;
  }
  if (tier >= INTEL_TIER_STRATEGIC) {
    out.buildings = full.buildings;
    out.defenseCount = full.buildings.filter((b) =>
      DEFENSE_BUILDING_KEYS.includes(b.key),
    ).length;
    out.depositsPresent = full.deposits.map((d) => d.resource);
  }
  if (tier >= INTEL_TIER_DEEP_SIGHT) {
    out.quality = full.quality;
    out.deposits = full.deposits;
    out.techDna = full.techDna;
  }
  return out;
}

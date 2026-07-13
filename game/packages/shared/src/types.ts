/**
 * Types & énumérations du domaine — GAMEBOOK §3/§8/§11/§12/§14/§24.
 * Les identifiants textuels correspondent au contrat d'assets
 * (docs/ASSET_PIPELINE.md §4 — clés snake_case des stubs).
 */

export type BodyType = 'planet' | 'star' | 'black_hole';

export type PlanetSize = 's' | 'm' | 'l';
export type Climate = 'hot' | 'cold' | 'temperate' | 'poison';
export type Quality = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type StarClass = 's' | 'm' | 'l';
export type StarFuelType = 'cold' | 'hot' | 'gas';

/** Les six politiques de gouvernance — GB §11, DG §4.1. */
export type Archetype =
  | 'militarist'
  | 'industrialist'
  | 'mercantile'
  | 'scientific'
  | 'civic'
  | 'diplomatic';

export const ARCHETYPES: readonly Archetype[] = [
  'militarist',
  'industrialist',
  'mercantile',
  'scientific',
  'civic',
  'diplomatic',
] as const;

/** Les trois peuples — cosmétiques, jamais de gate (GB §12). */
export type People = 'human' | 'forged' | 'vess';
export const PEOPLES: readonly People[] = ['human', 'forged', 'vess'] as const;

/** Rôles NPC — DG §4.2. */
export type NpcRole =
  | 'pilot'
  | 'engineer'
  | 'merchant'
  | 'diplomat'
  | 'soldier'
  | 'scientist';

export const NPC_ROLES: readonly NpcRole[] = [
  'pilot',
  'engineer',
  'merchant',
  'diplomat',
  'soldier',
  'scientist',
] as const;

/** Correspondance rôle → archétype de gouvernance (DG §4.2) [TUNE]. */
export const ROLE_TO_ARCHETYPE: Record<NpcRole, Archetype> = {
  pilot: 'civic',
  soldier: 'militarist',
  merchant: 'mercantile',
  scientist: 'scientific',
  engineer: 'industrialist',
  diplomat: 'diplomatic',
};

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
] as const;

/** Taxonomie des vaisseaux — GB §14. */
export type HullCategory = 'combat' | 'cargo' | 'civil';
export type HullSize = 's' | 'm' | 'l';

/** Classes de taille des véhicules sol (DG §6, build ≠ install). */
export type VehicleSize = 's' | 'm' | 'l';

export interface Vec2 {
  x: number;
  y: number;
}

/** Palier d'intel planétaire (GB §20, DG §4.1) — 0 = inexistant pour l'observateur. */
export type IntelTier = 0 | 1 | 2 | 3 | 4;

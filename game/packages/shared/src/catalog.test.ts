/** @verifies This test file verifies: docs/BACKLOG.md §P2 “Building catalog” and “Card hand”; GAME_BOOK.md §9/§25; DESIGN_GUIDE.md §5.1/§6. */
/**
 * Tests de complétude du catalogue (règle de complétude CLAUDE.md) :
 * les ensembles énumérables du canon sont livrés EXHAUSTIVEMENT.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALL_BUILDING_KEYS, BUILDINGS } from './buildings.js';
import {
  ALL_ITEM_KEYS,
  ALL_RECIPE_IDS,
  RECIPES,
  recipesForBuilding,
} from './recipes.js';
import {
  ALL_RESOURCE_IDS,
  BASIC_RESOURCES,
  CRYSTAL_RESOURCES,
  PROPULSION_RESOURCES,
  REFINED_RESOURCES,
} from './resources.js';
import { ALL_HULL_KEYS, HULLS } from './ships.js';
import {
  ALL_TECH_KEYS,
  STARTER_PRE_UNLOCKED,
  TECH_NODES,
  archetypeAllows,
  effectiveMask,
  planetTechAvailability,
} from './techtree.js';
import { ALL_UNIT_KEYS } from './units.js';
import { ARCHETYPES } from './types.js';

describe('complétude des catalogues (GB §24/§25, DG §5.1/§8.1/§10.1)', () => {
  it('31 ressources : 12 basiques + 4 cristaux + 11 raffinées + 3 propulsions + 1 salvage', () => {
    expect(BASIC_RESOURCES).toHaveLength(12);
    expect(CRYSTAL_RESOURCES).toHaveLength(4);
    expect(REFINED_RESOURCES).toHaveLength(11);
    expect(PROPULSION_RESOURCES).toHaveLength(3);
    expect(ALL_RESOURCE_IDS).toHaveLength(31);
  });

  it('29 bâtiments, tous avec coûts, niveaux et effets', () => {
    expect(ALL_BUILDING_KEYS).toHaveLength(29);
    for (const key of ALL_BUILDING_KEYS) {
      const def = BUILDINGS[key];
      expect(Object.keys(def.unlockCost).length, key).toBeGreaterThan(0);
      expect(Object.keys(def.placementCost).length, key).toBeGreaterThan(0);
      expect(def.levelUpCost).toHaveLength(2);
      expect(def.effects.length, key).toBeGreaterThan(0);
    }
  });

  it('seul probe_pad reste sans tuile ; telescope est unique sur tuile', () => {
    const noTile = ALL_BUILDING_KEYS.filter((k) => !BUILDINGS[k].usesTile);
    expect(noTile).toEqual(['probe_pad']);
    expect(BUILDINGS.telescope.usesTile).toBe(true);
    expect(BUILDINGS.telescope.maxInstances).toBe(1);
  });

  it('les 27 stubs telescope L1-L3 base/hot/cold ont tous leurs companions', () => {
    const assets = fileURLToPath(
      new URL('../../../../assets/game/buildings/', import.meta.url),
    );
    const missing: string[] = [];
    for (const level of [1, 2, 3]) {
      for (const variant of ['', '.ov.hot', '.ov.cold']) {
        for (const companion of ['', '.bump', '.light']) {
          const name = `building_telescope_l${level}${variant}${companion}.gif`;
          if (!existsSync(`${assets}${name}`)) missing.push(name);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('6 types d\'unités sol, avec carte d\'unlock et classe de taille', () => {
    expect(ALL_UNIT_KEYS.sort()).toEqual([
      'cannon',
      'tank_antiair',
      'tank_combined',
      'tank_ground',
      'turret_heavy',
      'turret_light',
    ]);
  });

  it('9 coques + surnoms canon ; seuls les Combat ont des slots d\'armes ; seuls les Cargo ont des slots cargo > coque de base', () => {
    expect(ALL_HULL_KEYS).toHaveLength(9);
    for (const key of ALL_HULL_KEYS) {
      const hull = HULLS[key];
      if (hull.category !== 'combat') {
        expect(hull.slots.weapon, key).toBe(0);
      } else {
        expect(hull.slots.weapon, key).toBeGreaterThan(0);
      }
    }
    expect(HULLS.combat_s.nickname).toBe('bee');
    expect(HULLS.combat_m.nickname).toBe('bird');
    expect(HULLS.combat_l.nickname).toBe('crusader');
  });

  it('16 recettes fongibles + 9 items dérivés', () => {
    expect(ALL_RECIPE_IDS).toHaveLength(16);
    expect(ALL_ITEM_KEYS).toHaveLength(9);
    // Nox → 4 cellules, les autres cristaux → 2 (DG §6).
    expect(RECIPES.cells_from_nox.outputs.fuel_cells).toBe(4);
    expect(RECIPES.cells_from_temperate.outputs.fuel_cells).toBe(2);
  });

  it('chaque industrie à débit possède au moins une recette', () => {
    for (const key of ALL_BUILDING_KEYS) {
      if (BUILDINGS[key].batchesPerDayByLevel) {
        expect(recipesForBuilding(key).length, key).toBeGreaterThan(0);
      }
    }
  });
});

describe('arbre technologique (GB §18, DG §5)', () => {
  it('36 nœuds : 29 bâtiments + 6 cartes-unités + colony_program', () => {
    expect(ALL_TECH_KEYS).toHaveLength(36);
  });

  it('la clinique est T2, apolitique, unique et dépend du lab', () => {
    expect(BUILDINGS.clinic.tier).toBe(2);
    expect(BUILDINGS.clinic.politics).toBeNull();
    expect(BUILDINGS.clinic.maxInstances).toBe(1);
    expect(TECH_NODES.clinic.prerequisites).toEqual(['lab']);
  });

  it('le DAG est acyclique et toutes les arêtes pointent vers des nœuds existants', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (key: string): void => {
      if (done.has(key)) return;
      expect(visiting.has(key), `cycle via ${key}`).toBe(false);
      visiting.add(key);
      const node = TECH_NODES[key as keyof typeof TECH_NODES];
      expect(node, `nœud inconnu ${key}`).toBeDefined();
      for (const p of node.prerequisites) visit(p);
      visiting.delete(key);
      done.add(key);
    };
    for (const key of ALL_TECH_KEYS) visit(key);
  });

  it('le set jamais-masqué est exactement {telescope, probe_pad, depot, mine, colony_program}', () => {
    const never = ALL_TECH_KEYS.filter((k) => TECH_NODES[k].neverMasked);
    expect(never.sort()).toEqual([
      'colony_program',
      'depot',
      'mine',
      'probe_pad',
      'telescope',
    ]);
  });

  it('la disponibilité par seed est déterministe et contient toujours le set jamais-masqué', () => {
    const a = planetTechAvailability('planet-seed-123');
    const b = planetTechAvailability('planet-seed-123');
    expect([...a.available].sort()).toEqual([...b.available].sort());
    for (const k of ['telescope', 'probe_pad', 'depot', 'mine', 'colony_program'] as const) {
      expect(a.available.has(k), k).toBe(true);
      expect(a.maxLevel.get(k), k).toBe(3);
    }
  });

  it('un nœud conservé dont un prérequis est masqué est élagué (cohérence DAG)', () => {
    // Sur un grand nombre de seeds, aucun nœud disponible ne doit avoir de
    // prérequis indisponible.
    for (let i = 0; i < 200; i++) {
      const { available } = planetTechAvailability(`seed-${i}`);
      for (const key of available) {
        for (const p of TECH_NODES[key].prerequisites) {
          expect(available.has(p), `${key} sans ${p} (seed-${i})`).toBe(true);
        }
      }
    }
  });

  it('le masquage varie réellement selon le seed (spécialisation forcée)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      const { available } = planetTechAvailability(`div-${i}`);
      counts.set(String(available.size), (counts.get(String(available.size)) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(3);
  });
});

describe('masques de gouvernance (GB §11, DG §4.1)', () => {
  it('sans gouverneur : masque commun uniquement (pas de nœud politisé)', () => {
    const mask = effectiveMask([]);
    expect(mask.has('mine')).toBe(true);
    expect(mask.has('military_district')).toBe(false);
    expect(mask.has('casino')).toBe(false);
  });

  it("l'intersection est la plus restrictive : un gouverneur hors-politique forclôt la branche", () => {
    const militaristOnly = effectiveMask(['militarist']);
    expect(militaristOnly.has('military_district')).toBe(true);
    const mixed = effectiveMask(['militarist', 'civic']);
    expect(mixed.has('military_district')).toBe(false);
    expect(mixed.has('mine')).toBe(true);
  });

  it('chaque archétype débloque au moins un nœud au-delà du commun', () => {
    for (const a of ARCHETYPES) {
      const extra = ALL_TECH_KEYS.filter(
        (k) => TECH_NODES[k].politics === a && archetypeAllows(a, k),
      );
      expect(extra.length, a).toBeGreaterThan(0);
    }
  });
});

describe('savoir de départ du starter (GB §19 « starter knowledge »)', () => {
  it('les nœuds pré-débloqués sont exactement des T0 jamais-masqués, apolitiques, sans prérequis', () => {
    expect(STARTER_PRE_UNLOCKED.length).toBeGreaterThan(0);
    for (const key of STARTER_PRE_UNLOCKED) {
      const node = TECH_NODES[key];
      expect(node.tier, key).toBe(0);
      expect(node.neverMasked, key).toBe(true);
      expect(node.politics, key).toBeNull();
      expect(node.prerequisites.length, key).toBe(0);
      // Toujours dans le masque commun (aucun gouverneur requis).
      expect(effectiveMask([]).has(key), key).toBe(true);
    }
    // La mine EST dans le set — c'est elle qui casse le softlock.
    expect(STARTER_PRE_UNLOCKED).toContain('mine');
    // colony_program reste un unlock payant (objectif de milieu de partie).
    expect(STARTER_PRE_UNLOCKED).not.toContain('colony_program');
  });

  it('pré-débloqués = disponibles dans TOUT ADN de seed (jamais masqués en pratique)', () => {
    for (let i = 0; i < 25; i++) {
      const dna = planetTechAvailability(`starter-knowledge-probe-${i}`);
      for (const key of STARTER_PRE_UNLOCKED) {
        expect(dna.available.has(key), `${key} seed ${i}`).toBe(true);
      }
    }
  });
});

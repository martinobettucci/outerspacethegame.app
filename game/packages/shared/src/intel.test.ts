/**
 * Intel par paliers (GB §20, DG §4.1/§11.3) : calcul du palier (bonus
 * scientifique plafonné, sonde sur site, visibilité seule), projection
 * par liste blanche — JEU EXACT de clefs par palier (règle de
 * complétude), invariants négatifs (seed & détail opérationnel absents),
 * estimation de population.
 */
import { describe, expect, it } from 'vitest';
import {
  estimatePopulation,
  intelTierFromSources,
  projectPlanetIntel,
  type PlanetIntelFull,
} from './intel.js';

const FULL: PlanetIntelFull = {
  id: 'b1',
  bodyType: 'planet',
  name: 'Cible',
  x: 10,
  y: 20,
  size: 'm',
  climate: 'temperate',
  ownerId: 'p2',
  ownerName: 'Rival',
  isStarter: true,
  tiles: 12,
  tilesUsed: 5,
  population: 8_437,
  spaceportOpen: true,
  marketPairs: [{ give: 'ore', get: 'water' }],
  innateOffers: [{ sell: 'water', want: 'ore', price: 2 }],
  buildings: [
    { key: 'depot', level: 1, status: 'active' },
    { key: 'turret', level: 2, status: 'active' },
  ],
  demographicHistory: {
    deaths: { children: 3, actives: 5, seniors: 7 },
    exodus: { children: 11, actives: 13, seniors: 17 },
  },
  quality: 'good',
  deposits: [
    { resource: 'ore', remainingT: 1500, initialT: 2000, dryAt: null },
  ],
  techDna: { available: ['depot', 'mine'], maxLevel: { depot: 3 } },
};

const L1_KEYS = [
  'bodyType', 'climate', 'id', 'isStarter', 'name', 'ownerId', 'ownerName',
  'size', 'tier', 'x', 'y',
];
const L2_KEYS = [...L1_KEYS,
  'innateOffers', 'marketPairs', 'populationEstimate', 'spaceportOpen',
  'tiles', 'tilesUsed',
];
const L3_KEYS = [
  ...L2_KEYS,
  'buildings',
  'defenseCount',
  'demographicHistory',
  'depositsPresent',
];
const L4_KEYS = [...L3_KEYS, 'deposits', 'quality', 'techDna'];

describe('intelTierFromSources (DG §4.1)', () => {
  it('aucune source, invisible → 0 ; visible seul → 1', () => {
    expect(intelTierFromSources([], { visible: false, probeOnSite: false })).toBe(0);
    expect(intelTierFromSources([], { visible: true, probeOnSite: false })).toBe(1);
  });

  it('palier = meilleur télescope couvrant (L1/L2/L3)', () => {
    for (const lvl of [1, 2, 3] as const) {
      expect(
        intelTierFromSources(
          [{ telescopeLevel: lvl, scientificSource: false }],
          { visible: true, probeOnSite: false },
        ),
      ).toBe(lvl);
    }
  });

  it('+1 scientifique appliqué UNE fois, jamais cumulé (hard-cap)', () => {
    expect(
      intelTierFromSources(
        [
          { telescopeLevel: 2, scientificSource: true },
          { telescopeLevel: 2, scientificSource: true },
        ],
        { visible: true, probeOnSite: false },
      ),
    ).toBe(3);
    expect(
      intelTierFromSources(
        [{ telescopeLevel: 3, scientificSource: true }],
        { visible: true, probeOnSite: false },
      ),
    ).toBe(4);
  });

  it('sonde sur site → 4 quel que soit le reste ; clamp à 4', () => {
    expect(intelTierFromSources([], { visible: false, probeOnSite: true })).toBe(4);
    expect(
      intelTierFromSources(
        [{ telescopeLevel: 3, scientificSource: true }],
        { visible: true, probeOnSite: true },
      ),
    ).toBe(4);
  });
});

describe('projectPlanetIntel — listes blanches EXACTES par palier', () => {
  it.each([
    [1, L1_KEYS],
    [2, L2_KEYS],
    [3, L3_KEYS],
    [4, L4_KEYS],
  ] as const)('palier %i : jeu exact de clefs', (tier, keys) => {
    const out = projectPlanetIntel(tier, FULL);
    expect(Object.keys(out).sort()).toEqual([...keys].sort());
    expect(out.tier).toBe(tier);
  });

  it('invariants négatifs : ni seed, ni stocks, ni détail opérationnel', () => {
    const json = JSON.stringify(projectPlanetIntel(4, FULL));
    for (const banned of ['seed', 'starFuelStock', 'stock', 'recipe', 'workforce', 'runPct', 'config', 'whitelist', 'keepFloor']) {
      expect(json).not.toContain(banned);
    }
  });

  it('population estimée à 2 chiffres significatifs ; défenses comptées', () => {
    const out = projectPlanetIntel(3, FULL);
    expect(out.populationEstimate).toBe(8_400);
    expect(out.defenseCount).toBe(1);
    expect(out.depositsPresent).toEqual(['ore']);
    expect(out.demographicHistory).toEqual(FULL.demographicHistory);
    // Présence SANS tonnage (DG §11.3) : pas de deposits détaillés à L3.
    expect('deposits' in out).toBe(false);
  });

  it('morts/exodés absents sous L3, présents et complets à partir de L3', () => {
    expect('demographicHistory' in projectPlanetIntel(2, FULL)).toBe(false);
    expect(projectPlanetIntel(3, FULL).demographicHistory).toEqual({
      deaths: { children: 3, actives: 5, seniors: 7 },
      exodus: { children: 11, actives: 13, seniors: 17 },
    });
  });

  it('estimatePopulation : bornes', () => {
    expect(estimatePopulation(0)).toBe(0);
    expect(estimatePopulation(7)).toBe(7);
    expect(estimatePopulation(96)).toBe(96);
    expect(estimatePopulation(12_345)).toBe(12_000);
    expect(estimatePopulation(987_654)).toBe(990_000);
  });
});

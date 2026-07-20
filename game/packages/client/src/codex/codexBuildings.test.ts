/**
 * Codex bâtiments — exhaustivité (règle de complétude) et cohérence de
 * la politique d'instances VALIDÉE (responsable 2026-07-20, JOURNAL).
 */
import { describe, expect, it } from 'vitest';
import { ALL_BUILDING_KEYS } from '@atg/shared';
import { BUILDING_CODEX, CODEX_BUILDING_KEYS } from './codexBuildings.ts';

describe('Codex bâtiments', () => {
  it('EXHAUSTIF : chaque type du catalogue a son entrée (et aucune orpheline)', () => {
    for (const key of ALL_BUILDING_KEYS) {
      expect(BUILDING_CODEX[key], key).toBeDefined();
      expect(BUILDING_CODEX[key]!.role.length, key).toBeGreaterThan(10);
      expect(BUILDING_CODEX[key]!.note.length, key).toBeGreaterThan(5);
    }
    for (const key of CODEX_BUILDING_KEYS) {
      expect(ALL_BUILDING_KEYS as readonly string[], key).toContain(key);
    }
  });

  it('politique validée : la table single/multiple du 2026-07-20', () => {
    const single = CODEX_BUILDING_KEYS.filter(
      (k) => BUILDING_CODEX[k]!.instances === 'single',
    ).sort();
    expect(single).toEqual(
      [
        'artificial_planet_yard',
        'casino',
        'clinic',
        'commerce_district',
        'diplomatic_district',
        'faction_hq',
        'lab',
        'obs_station',
        'research_center',
        'residential',
        'stargate_yard',
        'telescope',
        'terraformer',
        'workshop',
      ].sort(),
    );
  });
});

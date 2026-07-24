/**
 * @verifies docs/BACKLOG.md §P0.3-audio “A — Audio layer” (completeness contract);
 * docs/AUDIO_PLAN.md §0/§1 (enumerable sets delivered exhaustively — one loop per
 * BuildingKey, one stinger per unit/hull, three BGM contexts) and §4 (bus levels,
 * ambience summing law). Proves the shared manifest cannot silently drop a member.
 */
import { describe, it, expect } from 'vitest';
import { ALL_BUILDING_KEYS } from './buildings.js';
import { ALL_UNIT_KEYS } from './units.js';
import { ALL_HULL_KEYS } from './ships.js';
import {
  AUDIO_AMBIENCE,
  AUDIO_SELECTION,
  AUDIO_BGM,
  ALL_BGM_CONTEXTS,
  ALL_SELECTABLE_KEYS,
  AUDIO_BUS_DEFAULTS,
  VIEW_BGM,
  ambienceVoiceGain,
  ambienceSources,
  selectionSources,
  bgmSources,
  defaultAudioPrefs,
} from './audio.js';

describe('audio manifest completeness', () => {
  it('has one ambience loop for every building (29, no gaps)', () => {
    expect(ALL_BUILDING_KEYS.length).toBe(29);
    for (const key of ALL_BUILDING_KEYS) {
      expect(AUDIO_AMBIENCE[key], `ambience for ${key}`).toBeTruthy();
    }
    expect(Object.keys(AUDIO_AMBIENCE).sort()).toEqual([...ALL_BUILDING_KEYS].sort());
  });

  it('has one selection stinger for every unit and hull (6 + 9 = 15)', () => {
    expect(ALL_UNIT_KEYS.length).toBe(6);
    expect(ALL_HULL_KEYS.length).toBe(9);
    expect(ALL_SELECTABLE_KEYS.length).toBe(15);
    for (const key of ALL_SELECTABLE_KEYS) {
      expect(AUDIO_SELECTION[key], `selection for ${key}`).toBeTruthy();
    }
  });

  it('has three BGM beds and maps every view to one of them', () => {
    expect(Object.keys(AUDIO_BGM).sort()).toEqual([...ALL_BGM_CONTEXTS].sort());
    for (const ctx of Object.values(VIEW_BGM)) {
      expect(ALL_BGM_CONTEXTS).toContain(ctx);
    }
    // comms/market reuse galaxy (documented reuse)
    expect(VIEW_BGM.comms).toBe('galaxy');
    expect(VIEW_BGM.market).toBe('galaxy');
  });
});

describe('audio mix model', () => {
  it('keeps music low (background volume) under sfx/ambience', () => {
    expect(AUDIO_BUS_DEFAULTS.master).toBe(1);
    expect(AUDIO_BUS_DEFAULTS.music).toBeLessThan(AUDIO_BUS_DEFAULTS.ambience);
    expect(AUDIO_BUS_DEFAULTS.music).toBeLessThan(AUDIO_BUS_DEFAULTS.sfx);
    expect(defaultAudioPrefs().muted).toBe(false);
  });

  it('normalizes ambience voice gain by 1/sqrt(n) and never exceeds 1', () => {
    expect(ambienceVoiceGain(1)).toBe(1);
    expect(ambienceVoiceGain(4)).toBeCloseTo(0.5, 6);
    expect(ambienceVoiceGain(0)).toBe(1); // guarded
    for (let n = 1; n <= 30; n++) expect(ambienceVoiceGain(n)).toBeLessThanOrEqual(1);
  });
});

describe('audio source resolution (dual codec, ogg preferred)', () => {
  it('emits /audio/<family>/<id>.{ogg,mp3} in preference order', () => {
    expect(bgmSources('menu')).toEqual(['/audio/bgm/menu.ogg', '/audio/bgm/menu.mp3']);
    expect(ambienceSources('mine')).toEqual([
      '/audio/ambience/mine.ogg',
      '/audio/ambience/mine.mp3',
    ]);
    expect(selectionSources('combat_m')).toEqual([
      '/audio/select/combat_m.ogg',
      '/audio/select/combat_m.mp3',
    ]);
  });
});

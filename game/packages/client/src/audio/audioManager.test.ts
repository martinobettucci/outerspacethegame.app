/**
 * @verifies docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md §4
 * (mix buses, ambience summing + cap, one-shot selection) and §5 (mute,
 * localStorage persistence only after an explicit action). Drives the manager
 * in SILENT mode (ctxCtor:null) so the state machine is verified without real
 * Web Audio — the same path unit tests and the E2E window hook rely on.
 */
import { describe, it, expect, vi } from 'vitest';
import { AudioManager } from './audioManager.js';
import { AUDIO_BUS_DEFAULTS, AUDIO_PREFS_KEY, defaultAudioPrefs } from '@atg/shared';

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function make() {
  const storage = fakeStorage();
  const mgr = new AudioManager({ ctxCtor: null, storage });
  return { mgr, storage };
}

describe('AudioManager state machine (silent mode)', () => {
  it('starts at shared defaults, not muted, no beds', () => {
    const { mgr } = make();
    const s = mgr.snapshot();
    expect(s.prefs).toEqual(defaultAudioPrefs());
    expect(s.bgm).toBeNull();
    expect(s.ambience).toEqual([]);
    expect(s.lastSelection).toBeNull();
    expect(s.ready).toBe(false);
  });

  it('tracks the BGM context', () => {
    const { mgr } = make();
    mgr.setBgm('planet');
    expect(mgr.snapshot().bgm).toBe('planet');
    mgr.setBgm('galaxy');
    expect(mgr.snapshot().bgm).toBe('galaxy');
    mgr.setBgm(null);
    expect(mgr.snapshot().bgm).toBeNull();
  });

  it('dedupes ambience keys to distinct building types', () => {
    const { mgr } = make();
    mgr.setAmbience(['mine', 'mine', 'smelter']);
    expect(mgr.snapshot().ambience.sort()).toEqual(['mine', 'smelter']);
  });

  it('caps ambience at 8 voices and warns', () => {
    const { mgr } = make();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mgr.setAmbience([
      'mine', 'smelter', 'refinery', 'farm', 'waterworks', 'spaceport',
      'shipyard', 'workshop', 'warehouse', 'depot', // 10 distinct
    ]);
    expect(mgr.snapshot().ambience.length).toBe(8);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('records the last selection (interrupt semantics on state)', () => {
    const { mgr } = make();
    mgr.playSelection('combat_m');
    expect(mgr.snapshot().lastSelection).toBe('combat_m');
    mgr.playSelection('cargo_l');
    expect(mgr.snapshot().lastSelection).toBe('cargo_l');
  });

  it('resume() is safe with no AudioContext', async () => {
    const { mgr } = make();
    mgr.setBgm('menu');
    await expect(mgr.resume()).resolves.toBeUndefined();
    expect(mgr.snapshot().ready).toBe(false); // no ctx → never "running"
  });
});

describe('AudioManager mixer + persistence (explicit actions only)', () => {
  it('clamps bus volume to [0,1] and persists on change', () => {
    const { mgr, storage } = make();
    mgr.setBusVolume('music', 1.7);
    expect(mgr.getPrefs().music).toBe(1);
    mgr.setBusVolume('music', -0.5);
    expect(mgr.getPrefs().music).toBe(0);
    const saved = JSON.parse(storage.getItem(AUDIO_PREFS_KEY)!);
    expect(saved.music).toBe(0);
  });

  it('toggles mute and persists it', () => {
    const { mgr, storage } = make();
    expect(mgr.getPrefs().muted).toBe(false);
    mgr.toggleMuted();
    expect(mgr.getPrefs().muted).toBe(true);
    expect(JSON.parse(storage.getItem(AUDIO_PREFS_KEY)!).muted).toBe(true);
  });

  it('does NOT write storage before any explicit action', () => {
    const storage = fakeStorage();
    const spy = vi.spyOn(storage, 'setItem');
    new AudioManager({ ctxCtor: null, storage });
    expect(spy).not.toHaveBeenCalled();
  });

  it('reloads persisted prefs on construction', () => {
    const storage = fakeStorage();
    storage.setItem(
      AUDIO_PREFS_KEY,
      JSON.stringify({ ...defaultAudioPrefs(), music: 0.1, muted: true }),
    );
    const mgr = new AudioManager({ ctxCtor: null, storage });
    expect(mgr.getPrefs().music).toBe(0.1);
    expect(mgr.getPrefs().muted).toBe(true);
    // default music differs, proving the reload took effect
    expect(mgr.getPrefs().music).not.toBe(AUDIO_BUS_DEFAULTS.music);
  });
});

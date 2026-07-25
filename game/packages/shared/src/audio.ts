/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §0–§5; docs/DESIGN_SYSTEM.md §13 Audio; docs/ASSET_PIPELINE.md §9; docs/DAT.md §2
 * “Audio subsystem”. Single source of truth (anti-drift): the mapping of every
 * building/unit/hull/screen to its audio clip id, the default mix-bus levels,
 * and the ambience summing law all live here — never hardcoded in the client,
 * and rendered live by the Codex (docs/MANUAL_PLAN.md §6.11).
 */
import { ALL_BUILDING_KEYS, type BuildingKey } from './buildings.js';
import { ALL_UNIT_KEYS, type UnitKey } from './units.js';
import { ALL_HULL_KEYS, HULLS } from './ships.js';

/** A ship hull identity, e.g. `combat_m`. */
export type HullKey = keyof typeof HULLS;

/** Anything that can be “selected” and fire a StarCraft-style stinger. */
export type SelectableKey = UnitKey | HullKey;

/** The three distinct background-music beds (AUDIO_PLAN §0). */
export type BgmContext = 'menu' | 'galaxy' | 'planet';

export const ALL_BGM_CONTEXTS: readonly BgmContext[] = ['menu', 'galaxy', 'planet'];

/**
 * Active screen (`state.tsx` View.kind, plus `menu` for the logged-out shell)
 * → BGM bed. `comms` and `market` deliberately reuse the `galaxy` bed
 * (documented reuse, AUDIO_PLAN §0 — not a silent gap).
 */
export type ViewKind = 'menu' | 'galaxy' | 'planet' | 'comms' | 'market';
export const VIEW_BGM: Record<ViewKind, BgmContext> = {
  menu: 'menu',
  galaxy: 'galaxy',
  planet: 'planet',
  comms: 'galaxy',
  market: 'galaxy',
};

/**
 * Mix buses and their default gains (0..1). `music` sits low on purpose — the
 * “background volume” the owner asked for; BGM never competes with SFX
 * (AUDIO_PLAN §4, DESIGN_SYSTEM §13).
 */
export const AUDIO_BUS_DEFAULTS = {
  master: 1,
  music: 0.35,
  ambience: 0.5,
  sfx: 0.7,
} as const;
export type AudioBus = keyof typeof AUDIO_BUS_DEFAULTS;
export const ALL_AUDIO_BUSES = Object.keys(AUDIO_BUS_DEFAULTS) as AudioBus[];

/** Persisted user preferences (localStorage `atg.audio`, only after an explicit action, §11). */
export interface AudioPrefs {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  muted: boolean;
}
export const AUDIO_PREFS_KEY = 'atg.audio';
export function defaultAudioPrefs(): AudioPrefs {
  return {
    master: AUDIO_BUS_DEFAULTS.master,
    music: AUDIO_BUS_DEFAULTS.music,
    ambience: AUDIO_BUS_DEFAULTS.ambience,
    sfx: AUDIO_BUS_DEFAULTS.sfx,
    muted: false,
  };
}

/** Cross-fade time between BGM beds on screen change (ms). */
export const AUDIO_CROSSFADE_MS = 300;

/** Target clip lengths (seconds) for generation + acceptance (AUDIO_PLAN §2/§3). */
export const AUDIO_DURATIONS = { bgm: 40, ambience: 10, selection: 1.2 } as const;

/** Clip-id manifests. The id doubles as the file basename under /audio/<family>/. */
export const AUDIO_BGM: Record<BgmContext, string> = {
  menu: 'menu',
  galaxy: 'galaxy',
  planet: 'planet',
};

export const AUDIO_AMBIENCE = Object.fromEntries(
  ALL_BUILDING_KEYS.map((k) => [k, k]),
) as Record<BuildingKey, string>;

export const ALL_SELECTABLE_KEYS: readonly SelectableKey[] = [
  ...ALL_UNIT_KEYS,
  ...(ALL_HULL_KEYS as HullKey[]),
];

export const AUDIO_SELECTION = Object.fromEntries(
  ALL_SELECTABLE_KEYS.map((k) => [k, k]),
) as Record<SelectableKey, string>;

/** Shipped codecs, in preference order (AUDIO_PLAN §3). */
export const AUDIO_EXTENSIONS = ['ogg', 'mp3'] as const;
export type AudioExt = (typeof AUDIO_EXTENSIONS)[number];
export const AUDIO_BASE_PATH = '/audio';

function sources(family: 'bgm' | 'ambience' | 'select', id: string): string[] {
  return AUDIO_EXTENSIONS.map((ext) => `${AUDIO_BASE_PATH}/${family}/${id}.${ext}`);
}
export const bgmSources = (ctx: BgmContext): string[] => sources('bgm', AUDIO_BGM[ctx]);
export const ambienceSources = (key: BuildingKey): string[] =>
  sources('ambience', AUDIO_AMBIENCE[key]);
export const selectionSources = (key: SelectableKey): string[] =>
  sources('select', AUDIO_SELECTION[key]);

/**
 * Per-voice gain when several distinct building ambiences are summed on a
 * planet — equal-power normalization so N loops never clip the ambience bus
 * (AUDIO_PLAN §4). All distinct present types are mixed (no silent drop); the
 * cap is a documented performance safety only.
 */
export const AMBIENCE_MAX_VOICES = 8;
export function ambienceVoiceGain(distinctCount: number): number {
  return 1 / Math.sqrt(Math.max(1, distinctCount));
}

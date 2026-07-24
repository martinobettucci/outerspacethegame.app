/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §4 (mix buses, background volume, ambience summing, one-shot selection),
 * §5 (autoplay-gesture gate, mute, localStorage persistence); docs/DAT.md §2
 * “Audio subsystem”; docs/DESIGN_SYSTEM.md §13. The building/unit/context→clip
 * mapping and default levels come from @atg/shared (anti-drift); this file owns
 * only the runtime Web Audio graph and the state machine.
 *
 * Testability: the state machine (bgm context, ambience set, last selection,
 * prefs) is independent of the audio nodes. When no AudioContext exists
 * (jsdom / SSR) the manager runs SILENT but still tracks state, so unit tests
 * and the E2E `window.__atgAudio` hook work without real playback.
 */
import {
  AUDIO_BUS_DEFAULTS,
  AUDIO_CROSSFADE_MS,
  AUDIO_PREFS_KEY,
  ambienceVoiceGain,
  AMBIENCE_MAX_VOICES,
  bgmSources,
  ambienceSources,
  selectionSources,
  defaultAudioPrefs,
  type AudioBus,
  type AudioPrefs,
  type BgmContext,
  type BuildingKey,
  type SelectableKey,
} from '@atg/shared';

type AudioContextCtor = typeof AudioContext;

export interface AudioSnapshot {
  prefs: AudioPrefs;
  bgm: BgmContext | null;
  ambience: BuildingKey[];
  lastSelection: SelectableKey | null;
  ready: boolean; // AudioContext resumed after a user gesture
}

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Pick the first source the browser can play (ogg preferred, mp3 fallback). */
function pickSource(sources: string[]): string {
  const fallback = sources[sources.length - 1] ?? sources[0] ?? '';
  if (typeof document === 'undefined') return sources[0] ?? fallback;
  const probe = document.createElement('audio');
  for (const src of sources) {
    const type = src.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg';
    if (probe.canPlayType(type)) return src;
  }
  return fallback;
}

interface Voice {
  el: HTMLAudioElement;
  src: MediaElementAudioSourceNode;
  gain: GainNode;
}

export class AudioManager {
  private prefs: AudioPrefs;
  private bgm: BgmContext | null = null;
  private ambienceKeys: BuildingKey[] = [];
  private lastSelection: SelectableKey | null = null;

  private ctxCtor: AudioContextCtor | null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Exclude<AudioBus, 'master'>, GainNode>> = {};

  private bgmVoice: Voice | null = null;
  private ambienceVoices = new Map<BuildingKey, Voice>();
  private selectionVoice: Voice | null = null;

  private listeners = new Set<(s: AudioSnapshot) => void>();
  private storage: Storage | null;

  constructor(opts: { ctxCtor?: AudioContextCtor | null; storage?: Storage | null } = {}) {
    this.ctxCtor = opts.ctxCtor !== undefined ? opts.ctxCtor : getAudioContextCtor();
    this.storage =
      opts.storage !== undefined
        ? opts.storage
        : typeof localStorage !== 'undefined'
          ? localStorage
          : null;
    this.prefs = this.loadPrefs();
  }

  // ---- state / persistence ----
  private loadPrefs(): AudioPrefs {
    const base = defaultAudioPrefs();
    try {
      const raw = this.storage?.getItem(AUDIO_PREFS_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
      return {
        master: clamp01(parsed.master ?? base.master),
        music: clamp01(parsed.music ?? base.music),
        ambience: clamp01(parsed.ambience ?? base.ambience),
        sfx: clamp01(parsed.sfx ?? base.sfx),
        muted: Boolean(parsed.muted ?? base.muted),
      };
    } catch {
      return base;
    }
  }

  /** Persist ONLY after an explicit user action (CLAUDE.md §11). */
  private savePrefs(): void {
    try {
      this.storage?.setItem(AUDIO_PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage unavailable / denied — audio still works at runtime */
    }
  }

  snapshot(): AudioSnapshot {
    return {
      prefs: { ...this.prefs },
      bgm: this.bgm,
      ambience: [...this.ambienceKeys],
      lastSelection: this.lastSelection,
      ready: this.ctx?.state === 'running',
    };
  }

  subscribe(fn: (s: AudioSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  // ---- gesture gate ----
  /** Resume the AudioContext after a user gesture, then (re)start current beds. */
  async resume(): Promise<void> {
    if (!this.ctxCtor) {
      this.emit();
      return;
    }
    if (!this.ctx) this.buildGraph();
    if (this.ctx && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    if (this.bgm) this.startBgm(this.bgm);
    this.syncAmbienceVoices();
    this.emit();
  }

  private buildGraph(): void {
    if (!this.ctxCtor) return;
    this.ctx = new this.ctxCtor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    for (const bus of ['music', 'ambience', 'sfx'] as const) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.buses[bus] = g;
    }
    this.applyGains();
  }

  private applyGains(): void {
    if (!this.master) return;
    this.master.gain.value = this.prefs.muted ? 0 : this.prefs.master;
    this.buses.music && (this.buses.music.gain.value = this.prefs.music);
    this.buses.ambience && (this.buses.ambience.gain.value = this.prefs.ambience);
    this.buses.sfx && (this.buses.sfx.gain.value = this.prefs.sfx);
  }

  private makeVoice(sources: string[], bus: GainNode, loop: boolean, initialGain: number): Voice | null {
    if (!this.ctx) return null;
    const el = new Audio();
    el.src = pickSource(sources);
    el.loop = loop;
    el.crossOrigin = 'anonymous';
    const src = this.ctx.createMediaElementSource(el);
    const gain = this.ctx.createGain();
    gain.gain.value = initialGain;
    src.connect(gain).connect(bus);
    void el.play().catch(() => undefined);
    return { el, src, gain };
  }

  private stopVoice(v: Voice | null): void {
    if (!v) return;
    try {
      v.el.pause();
      v.el.src = '';
      v.gain.disconnect();
      v.src.disconnect();
    } catch {
      /* ignore */
    }
  }

  private ramp(gain: GainNode, target: number, ms: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(target, now + ms / 1000);
  }

  // ---- BGM ----
  setBgm(context: BgmContext | null): void {
    if (this.bgm === context) return;
    this.bgm = context;
    if (context) this.startBgm(context);
    else this.stopBgm();
    this.emit();
  }

  private startBgm(context: BgmContext): void {
    if (!this.ctx || !this.buses.music) return; // silent mode: state only
    const prev = this.bgmVoice;
    const next = this.makeVoice(bgmSources(context), this.buses.music, true, 0);
    if (!next) return;
    this.bgmVoice = next;
    this.ramp(next.gain, 1, AUDIO_CROSSFADE_MS);
    if (prev) {
      this.ramp(prev.gain, 0, AUDIO_CROSSFADE_MS);
      setTimeout(() => this.stopVoice(prev), AUDIO_CROSSFADE_MS + 60);
    }
  }

  private stopBgm(): void {
    const prev = this.bgmVoice;
    this.bgmVoice = null;
    if (prev) {
      this.ramp(prev.gain, 0, AUDIO_CROSSFADE_MS);
      setTimeout(() => this.stopVoice(prev), AUDIO_CROSSFADE_MS + 60);
    }
  }

  // ---- ambience ----
  /** Set the ambience to the distinct building types present on the ground. */
  setAmbience(keys: BuildingKey[]): void {
    const distinct = Array.from(new Set(keys));
    // Documented performance safety: cap concurrent voices, keep the first N.
    const capped = distinct.slice(0, AMBIENCE_MAX_VOICES);
    if (capped.length < distinct.length) {
      console.warn(
        `[audio] ambience capped at ${AMBIENCE_MAX_VOICES} voices; dropped ${distinct.length - capped.length}`,
      );
    }
    this.ambienceKeys = capped;
    this.syncAmbienceVoices();
    this.emit();
  }

  private syncAmbienceVoices(): void {
    if (!this.ctx || !this.buses.ambience) return; // silent mode: state only
    const target = new Set(this.ambienceKeys);
    // remove voices no longer present
    for (const [key, voice] of this.ambienceVoices) {
      if (!target.has(key)) {
        this.stopVoice(voice);
        this.ambienceVoices.delete(key);
      }
    }
    // add missing voices
    const voiceGain = ambienceVoiceGain(this.ambienceKeys.length);
    for (const key of this.ambienceKeys) {
      if (!this.ambienceVoices.has(key)) {
        const v = this.makeVoice(ambienceSources(key), this.buses.ambience, true, 0);
        if (v) {
          this.ambienceVoices.set(key, v);
          this.ramp(v.gain, voiceGain, AUDIO_CROSSFADE_MS);
        }
      } else {
        // re-normalize existing voice for the new count
        this.ramp(this.ambienceVoices.get(key)!.gain, voiceGain, AUDIO_CROSSFADE_MS);
      }
    }
  }

  // ---- selection stinger (one-shot, interrupts previous) ----
  playSelection(key: SelectableKey): void {
    this.lastSelection = key;
    if (this.ctx && this.buses.sfx) {
      this.stopVoice(this.selectionVoice);
      this.selectionVoice = this.makeVoice(selectionSources(key), this.buses.sfx, false, 1);
    }
    this.emit();
  }

  // ---- mixer controls (explicit user actions → persist) ----
  setBusVolume(bus: AudioBus, value: number): void {
    this.prefs[bus] = clamp01(value);
    this.applyGains();
    this.savePrefs();
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.prefs.muted = muted;
    this.applyGains();
    this.savePrefs();
    this.emit();
  }

  toggleMuted(): void {
    this.setMuted(!this.prefs.muted);
  }

  getPrefs(): AudioPrefs {
    return { ...this.prefs };
  }

  dispose(): void {
    this.stopBgm();
    for (const v of this.ambienceVoices.values()) this.stopVoice(v);
    this.ambienceVoices.clear();
    this.stopVoice(this.selectionVoice);
    this.listeners.clear();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

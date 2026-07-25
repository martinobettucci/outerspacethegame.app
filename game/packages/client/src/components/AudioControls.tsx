/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §5 (mute + per-bus sliders, keyboard-accessible, persisted); docs/DESIGN_SYSTEM.md
 * §13 Audio + §6/§8 (interactive states, accessibility) + §9 (Lucide, no emoji).
 * Compact mixer in the GameShell ribbon: a mute toggle that opens a popover of
 * master/music/ambience/sfx sliders. Levels are read from the live AudioManager
 * snapshot (anti-drift with @atg/shared defaults).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import type { AudioBus } from '@atg/shared';
import { t } from '../i18n/en.js';
import { useAudio } from '../audio/useAudio.js';

const BUSES: { bus: AudioBus; label: string }[] = [
  { bus: 'master', label: t.audio.master },
  { bus: 'music', label: t.audio.music },
  { bus: 'ambience', label: t.audio.ambience },
  { bus: 'sfx', label: t.audio.sfx },
];

export function AudioControls() {
  const { manager, snapshot } = useAudio();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const muted = snapshot.prefs.muted;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="ls-audio" ref={rootRef}>
      <button
        type="button"
        className="ls-audio__toggle"
        aria-label={muted ? t.audio.unmute : t.audio.mute}
        aria-pressed={muted}
        title={muted ? t.audio.unmute : t.audio.mute}
        data-testid="audio-mute"
        onClick={() => manager.toggleMuted()}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>

      <button
        type="button"
        className="ls-audio__more"
        aria-label={t.audio.open}
        aria-expanded={open}
        aria-controls={panelId}
        title={t.audio.open}
        data-testid="audio-open"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="ls-audio__more-dot" aria-hidden="true" />
      </button>

      {open && (
        <div className="ls-audio__panel" id={panelId} role="group" aria-label={t.audio.open}>
          {BUSES.map(({ bus, label }) => (
            <label className="ls-audio__row" key={bus}>
              <span className="ls-audio__row-label">{label}</span>
              <input
                className="ls-audio__slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(snapshot.prefs[bus] * 100)}
                data-testid={`audio-slider-${bus}`}
                onChange={(e) => manager.setBusVolume(bus, Number(e.target.value) / 100)}
              />
              <span className="ls-audio__row-value">{Math.round(snapshot.prefs[bus] * 100)}</span>
            </label>
          ))}
          <p className="ls-audio__hint">{t.audio.hint}</p>
        </div>
      )}
    </div>
  );
}

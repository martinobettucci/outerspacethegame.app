/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio “A — Audio layer”; docs/AUDIO_PLAN.md
 * §5 (autoplay-gesture gate, controls, persistence). React binding around
 * AudioManager: one manager per app, a snapshot for the UI, a one-time gesture
 * listener that resumes the AudioContext, and a deterministic `window.__atgAudio`
 * hook for E2E (§15) that exposes state without needing real playback.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AudioManager, type AudioSnapshot } from './audioManager.js';

interface AudioApi {
  manager: AudioManager;
  snapshot: AudioSnapshot;
}

const Ctx = createContext<AudioApi | null>(null);

declare global {
  interface Window {
    __atgAudio?: {
      snapshot: () => AudioSnapshot;
      manager: AudioManager;
    };
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const managerRef = useRef<AudioManager | null>(null);
  if (!managerRef.current) managerRef.current = new AudioManager();
  const manager = managerRef.current;

  const [snapshot, setSnapshot] = useState<AudioSnapshot>(() => manager.snapshot());

  useEffect(() => {
    const unsub = manager.subscribe(setSnapshot);
    // Deterministic E2E hook (§15): read live audio state from the page.
    window.__atgAudio = { snapshot: () => manager.snapshot(), manager };

    // Autoplay policy: resume the AudioContext on the first user gesture.
    const onGesture = () => {
      void manager.resume();
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    return () => {
      unsub();
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      delete window.__atgAudio;
    };
  }, [manager]);

  const value = useMemo(() => ({ manager, snapshot }), [manager, snapshot]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudio(): AudioApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAudio hors AudioProvider');
  return ctx;
}

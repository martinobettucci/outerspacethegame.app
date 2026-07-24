/**
 * @spec Implements docs/BACKLOG.md §P0.3-audio; docs/AUDIO_PLAN.md §0 (screen→BGM
 * mapping — login=menu, galaxy, planet; comms/market reuse galaxy). Renders
 * nothing; drives the BGM bed from the active view via the shared VIEW_BGM map
 * (anti-drift). Mounted once inside the providers (App.tsx).
 */
import { useEffect } from 'react';
import { VIEW_BGM } from '@atg/shared';
import { useAppState } from '../state.js';
import { useAudio } from './useAudio.js';

export function BgmController(): null {
  const { me, view } = useAppState();
  const { manager } = useAudio();

  useEffect(() => {
    const context = !me ? VIEW_BGM.menu : VIEW_BGM[view.kind];
    manager.setBgm(context);
  }, [manager, me, view.kind]);

  return null;
}

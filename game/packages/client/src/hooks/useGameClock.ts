import { useSyncExternalStore } from 'react';

const TICK_MS = 1_000;

let snapshot = Date.now();
let ticker: number | null = null;
const listeners = new Set<() => void>();

function publishNow() {
  snapshot = Date.now();
  listeners.forEach((listener) => listener());
}

function stopTicker() {
  if (ticker === null || typeof window === 'undefined') return;
  window.clearInterval(ticker);
  ticker = null;
}

function startTicker() {
  if (
    ticker !== null ||
    typeof window === 'undefined' ||
    (typeof document !== 'undefined' && document.visibilityState === 'hidden')
  ) {
    return;
  }
  ticker = window.setInterval(publishNow, TICK_MS);
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    stopTicker();
    return;
  }
  publishNow();
  startTicker();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  if (listeners.size === 1 && typeof document !== 'undefined') {
    snapshot = Date.now();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    startTicker();
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof document !== 'undefined') {
      stopTicker();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  };
}

function getSnapshot() {
  return snapshot;
}

/**
 * A single shared client clock for presentation-only countdowns. The ticker
 * sleeps while the page is hidden and immediately catches up on return.
 */
export function useGameClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface RemainingDuration {
  milliseconds: number;
  overdue: boolean;
  display: string;
  accessible: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

const unit = (value: number, singular: string) =>
  `${value} ${singular}${value === 1 ? '' : 's'}`;

/** Pure formatter kept separate from the hook for deterministic tests. */
export function describeRemaining(
  completesAt: string | number | Date,
  nowMs: number,
): RemainingDuration | null {
  const targetMs =
    completesAt instanceof Date
      ? completesAt.getTime()
      : typeof completesAt === 'number'
        ? completesAt
        : Date.parse(completesAt);

  if (!Number.isFinite(targetMs)) return null;

  const milliseconds = Math.max(0, targetMs - nowMs);
  if (milliseconds <= 0) {
    return {
      milliseconds: 0,
      overdue: true,
      display: 'FINALIZING',
      accessible: 'Finalizing with the simulation',
    };
  }

  // Ceil prevents a misleading 00:00:00 before the authoritative deadline.
  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const display = days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const accessibleParts = [
    days > 0 ? unit(days, 'day') : null,
    hours > 0 ? unit(hours, 'hour') : null,
    minutes > 0 ? unit(minutes, 'minute') : null,
    unit(seconds, 'second'),
  ].filter((part): part is string => part !== null);

  return {
    milliseconds,
    overdue: false,
    display,
    accessible: `${accessibleParts.join(', ')} remaining`,
  };
}

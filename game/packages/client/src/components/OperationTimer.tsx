/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P1 “Deterministic sim core”; GAME_BOOK.md §15; DESIGN_GUIDE.md §1. */
import { useMemo } from 'react';
import { describeRemaining, useGameClock } from '../hooks/useGameClock.ts';

const DEADLINE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function OperationTimer({
  completesAt,
  label,
  tone = 'warning',
  compact = false,
  className,
}: {
  completesAt: string;
  label: string;
  tone?: 'warning' | 'danger' | 'violet';
  compact?: boolean;
  className?: string;
}) {
  const now = useGameClock();
  const target = useMemo(() => new Date(completesAt), [completesAt]);
  const countdown = describeRemaining(target, now);
  const validTarget = Number.isFinite(target.getTime());
  const deadline = validTarget
    ? DEADLINE_FORMATTER.format(target)
    : 'schedule unavailable';
  const state = !countdown
    ? 'unavailable'
    : countdown.overdue
      ? 'finalizing'
      : 'active';
  const classes = [
    'ls-operation-timer',
    compact ? 'ls-operation-timer--compact' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  const accessibleState = countdown?.accessible ?? 'Schedule unavailable';

  return (
    <span
      className={classes}
      data-tone={tone}
      data-state={state}
      role="timer"
      aria-live="off"
      aria-label={`${label}: ${accessibleState}. Due ${deadline}.`}
    >
      <span className="ls-operation-timer__signal" aria-hidden="true" />
      <span className="ls-operation-timer__copy">
        <span className="ls-operation-timer__label">{label}</span>
        <strong className="ls-operation-timer__value">
          {countdown?.display ?? 'TIME LINK LOST'}
        </strong>
      </span>
      {validTarget && (
        <time
          className="ls-operation-timer__deadline"
          dateTime={target.toISOString()}
          title={target.toLocaleString('en-US')}
        >
          DUE {deadline}
        </time>
      )}
    </span>
  );
}

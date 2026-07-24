/** @verifies This test file verifies: docs/BACKLOG.md §P1 “Deterministic sim core”; GAME_BOOK.md §15; DESIGN_GUIDE.md §1. */
import { describe, expect, it } from 'vitest';
import { describeRemaining } from './useGameClock.ts';

describe('describeRemaining', () => {
  it('formats multi-day operation windows with a stable clock layout', () => {
    const now = Date.UTC(2026, 6, 13, 12, 0, 0);
    const deadline = now + (((1 * 24 + 2) * 60 + 3) * 60 + 4) * 1_000;

    expect(describeRemaining(deadline, now)).toMatchObject({
      overdue: false,
      display: '1d 02:03:04',
      accessible: '1 day, 2 hours, 3 minutes, 4 seconds remaining',
    });
  });

  it('rounds upward so the UI never reaches zero before the deadline', () => {
    expect(describeRemaining(10_001, 10_000)?.display).toBe('00:00:01');
  });

  it('uses the finalizing state at and after the authoritative deadline', () => {
    expect(describeRemaining(10_000, 10_000)).toMatchObject({
      milliseconds: 0,
      overdue: true,
      display: 'FINALIZING',
    });
  });

  it('rejects invalid timestamps instead of displaying a false ETA', () => {
    expect(describeRemaining('not-a-date', Date.now())).toBeNull();
  });
});

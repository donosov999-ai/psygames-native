import {
  completedWarmupDateKeys,
  computeLongestStreak,
  WarmupHistoryEntry,
} from '@/src/services/warmup';

function entry(date: string, completed = true): WarmupHistoryEntry {
  return {
    date,
    completed,
    weekday: 1,
    duration_min: 5,
    track: 'training',
    total_score: 10,
    steps_done: completed ? 1 : 0,
    steps_total: 1,
  };
}

describe('streak calendar history', () => {
  it('keeps only unique valid completed training days', () => {
    const history = [
      entry('2026-08-03'),
      entry('2026-08-03'),
      entry('2026-08-04', false),
      entry('2026-02-30'),
      entry('not-a-date'),
      entry('2026-08-01'),
    ];

    expect(completedWarmupDateKeys(history)).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('computes the all-time best with the existing one-day grace policy', () => {
    const history = [
      entry('2026-01-01'),
      entry('2026-01-02'),
      entry('2026-01-04'), // one missed day: still the same streak
      entry('2026-01-07'), // two missed days: new streak
      entry('2026-01-08'),
    ];

    expect(computeLongestStreak(history)).toBe(3);
  });

  it('returns zero for an empty or unfinished history', () => {
    expect(computeLongestStreak([])).toBe(0);
    expect(computeLongestStreak([entry('2026-08-01', false)])).toBe(0);
  });
});

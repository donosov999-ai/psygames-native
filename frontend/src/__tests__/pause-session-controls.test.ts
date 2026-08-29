/* psygames-pause-session-controls-test · VER 1 · 29.08.2026 */
/**
 * Р3+Р5 (чек-лист зарядок 29.08): пропуск шага, продление, позиция сегмента.
 *
 * Классы багов: пропуск «в никуда» за концом таймлайна (вечное running) ·
 * продление, рвущее инварианты плана (шаг с endMs < startMs, дырка между
 * пиками) · сегмент 0/0 на пустом плане.
 */
import {
  createPracticePlan, createPracticeSession, startPracticeSession,
  skipToNextStepBoundary, extendCurrentStep, segmentPosition,
  getSessionFrame, tickPracticeSession,
} from '@/src/games/pause/core/engine';

function makeSession(durationMs = 120_000) {
  const plan = createPracticePlan({
    mode: 'solo',
    locale: 'ru',
    guideMode: 'both',
    context: 'home',
    durationMs,
    selections: [{ setId: 'breathing', programId: 'box' }],
    soloCompletions: { breathing: 3 },
    acknowledgedWarnings: ['breath-hold'],
  });
  return startPracticeSession(createPracticeSession(plan), 1_000);
}

describe('пропуск шага', () => {
  it('🔴 elapsed прыгает ровно к ближайшей границе, сессия остаётся running', () => {
    const s = makeSession();
    const ends = [...new Set(s.plan.timeline.map((t) => t.endMs))].sort((a, b) => a - b);
    const skipped = skipToNextStepBoundary(s, 2_000);
    expect(skipped.phase).toBe('running');
    expect(skipped.elapsedMs).toBe(ends[0]);
    // повторный пропуск — следующая граница, не та же
    const again = skipToNextStepBoundary(skipped, 3_000);
    expect(again.elapsedMs).toBeGreaterThan(skipped.elapsedMs);
  });

  it('пропуск за последней границей завершает сессию, а не вешает её', () => {
    let s = makeSession();
    for (let i = 0; i < 500 && s.phase !== 'completed'; i++) s = skipToNextStepBoundary(s, 2_000 + i);
    expect(s.phase).toBe('completed');
    expect(s.result).not.toBeNull();
    expect(s.elapsedMs).toBe(s.plan.durationMs);
  });
});

describe('продление «+30 сек»', () => {
  it('🔴 длительность растёт, инварианты шагов целы, прошедшие шаги не тронуты', () => {
    const s = tickPracticeSession(makeSession(), 30_000);   // elapsed 29с
    const before = s.plan;
    const ext = extendCurrentStep(s, 31_000, 30_000);
    expect(ext.plan.durationMs).toBe(before.durationMs + 30_000);
    for (const step of ext.plan.timeline) {
      expect(step.endMs).toBeGreaterThan(step.startMs);
      if (step.attentionPeakStartMs !== null) {
        expect(step.attentionPeakEndMs!).toBeGreaterThan(step.attentionPeakStartMs);
      }
    }
    // шаг, закончившийся до elapsed, не сдвинулся
    const pastBefore = before.timeline.filter((t) => t.endMs <= s.elapsedMs);
    const pastAfter = ext.plan.timeline.filter((t) => t.endMs <= s.elapsedMs);
    expect(pastAfter.map((t) => [t.startMs, t.endMs])).toEqual(pastBefore.map((t) => [t.startMs, t.endMs]));
    // фрейм после продления живой
    expect(getSessionFrame(ext, 32_000).cues.length).toBeGreaterThan(0);
  });

  it('нулевое/отрицательное продление — no-op', () => {
    const s = makeSession();
    expect(extendCurrentStep(s, 2_000, 0)).toBe(s);
    expect(extendCurrentStep(s, 2_000, -5)).toBe(s);
  });
});

describe('позиция сегмента для таймера («2/6»)', () => {
  it('идёт от 1/N к N/N и не выходит за края', () => {
    const s = makeSession();
    const first = segmentPosition(s.plan, 0);
    expect(first.index).toBe(1);
    expect(first.total).toBeGreaterThan(0);
    const last = segmentPosition(s.plan, s.plan.durationMs + 5_000);
    expect(last.index).toBe(last.total);
  });
});

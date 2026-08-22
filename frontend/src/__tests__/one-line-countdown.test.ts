/* psygames-one-line-countdown · VER 1 · 22.08.2026 */
/**
 * ОЧКИ «ОДНОЙ ЛИНИИ» — ЭТО ТАЙМЕР.
 *
 * Взято из игры-образца по прямому решению Дениса. Одно число на экране: сползает
 * от ста к нулю, торопит — и оно же уходит в рекорд уровня. Второе число рядом
 * заставило бы выбирать, на какое смотреть.
 *
 * ⚠️ ЧТО ЗДЕСЬ ЛОМАЕТСЯ МОЛЧА. Скорость сползания и рубеж замедления — два числа,
 * которые правятся «на глаз» и никак себя не проявляют, кроме как ощущением
 * «стало нечестно». Поэтому проверяется не совпадение с числом, а ПОВЕДЕНИЕ
 * кривой: убывает, ниже половины идёт вдвое медленнее, в минус не уходит.
 */
import { generateOneLinePuzzle } from '@/src/games/one-line/core/generator';
import {
  ONE_LINE_DRAIN_PER_SEC,
  ONE_LINE_SLOW_BELOW,
  ONE_LINE_START_SCORE,
  oneLineScoreAt,
  oneLineTimeIsUp,
  oneLineTimeLimitMs,
  isPassed,
  scoreOneLineCompletion,
} from '@/src/games/one-line/core/scoring';

const at = (seconds: number) => oneLineScoreAt(seconds * 1000);

describe('очки сползают', () => {
  it('партия начинается с полного счёта', () => {
    expect(at(0)).toBe(ONE_LINE_START_SCORE);
  });

  it('со временем только убывают, никогда не растут', () => {
    let previous = Infinity;
    for (let s = 0; s <= 200; s += 1) {
      const now = at(s);
      expect(now).toBeLessThanOrEqual(previous);
      previous = now;
    }
  });

  it('в минус не уходят и после конца остаются нулём', () => {
    expect(at(1000)).toBe(0);
    expect(at(100000)).toBe(0);
    expect(oneLineScoreAt(-5000)).toBe(ONE_LINE_START_SCORE);
  });
});

describe('🔴 ниже половины — вдвое медленнее', () => {
  /**
   * Ровная скорость добивает того, кто и так отстал: к середине задачи видно, что
   * не успеваешь, и человек бросает. Замедление даёт доиграть, а первая половина
   * остаётся напряжённой, потому что там скорость полная.
   */
  it('в первой половине теряется вдвое больше, чем во второй за то же время', () => {
    const fastLoss = at(0) - at(10);
    const slowStart = (ONE_LINE_START_SCORE - ONE_LINE_SLOW_BELOW) / ONE_LINE_DRAIN_PER_SEC;
    const slowLoss = at(slowStart + 10) - at(slowStart + 20);
    expect(fastLoss).toBeCloseTo(slowLoss * 2, 5);
  });

  it('перелом ровно на рубеже, а не раньше и не позже', () => {
    const boundary = (ONE_LINE_START_SCORE - ONE_LINE_SLOW_BELOW) / ONE_LINE_DRAIN_PER_SEC;
    expect(at(boundary)).toBeCloseTo(ONE_LINE_SLOW_BELOW, 5);
    // До рубежа — полная скорость.
    expect(at(boundary - 1) - at(boundary)).toBeCloseTo(ONE_LINE_DRAIN_PER_SEC, 5);
    // После — половина.
    expect(at(boundary) - at(boundary + 1)).toBeCloseTo(ONE_LINE_DRAIN_PER_SEC / 2, 5);
  });

  it('вторая половина длится дольше первой — в этом весь смысл замедления', () => {
    const boundary = (ONE_LINE_START_SCORE - ONE_LINE_SLOW_BELOW) / ONE_LINE_DRAIN_PER_SEC;
    expect(oneLineTimeLimitMs() / 1000 - boundary).toBeGreaterThan(boundary);
  });
});

describe('конец времени', () => {
  it('наступает ровно тогда, когда счёт дошёл до нуля', () => {
    const limit = oneLineTimeLimitMs();
    expect(oneLineTimeIsUp(limit - 1000)).toBe(false);
    expect(oneLineTimeIsUp(limit)).toBe(true);
    expect(oneLineTimeIsUp(limit + 1000)).toBe(true);
  });

  it('на партию даётся минуты, а не секунды и не часы', () => {
    expect(oneLineTimeLimitMs()).toBeGreaterThanOrEqual(90_000);
    expect(oneLineTimeLimitMs()).toBeLessThanOrEqual(600_000);
  });

  it('в начале партии время не кончилось', () => {
    expect(oneLineTimeIsUp(0)).toBe(false);
  });
});

/**
 * 🔴 СЧЁТ НА ЭКРАНЕ И СЧЁТ В ИТОГЕ — ОДНО И ТО ЖЕ ЧИСЛО.
 *
 * 22.08.2026 две мутации остались зелёными: зачёт перестал смотреть на истёкшее
 * время, и счёт партии снова стал производной от точности. Обе рушат ровно то,
 * ради чего таймер и вводили: человек полторы минуты смотрел, как число сползает,
 * а в итоге ему показали другое — и уровень при этом засчитали.
 */
describe('счёт партии — это остаток таймера', () => {
  const puzzle = generateOneLinePuzzle('countdown', 20);
  const clean = { undoCount: 0, hintsUsed: 0, invalidMoves: 0 };

  it('уложился быстро — счёт высокий; тянул — низкий', () => {
    const fast = scoreOneLineCompletion(puzzle, { ...clean, durationMs: 10_000 });
    const slow = scoreOneLineCompletion(puzzle, { ...clean, durationMs: 100_000 });
    expect(fast.score).toBe(Math.round(oneLineScoreAt(10_000)));
    expect(slow.score).toBe(Math.round(oneLineScoreAt(100_000)));
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('в итоге лежит РОВНО то число, что человек видел на экране', () => {
    for (const ms of [0, 5_000, 49_000, 51_000, 120_000]) {
      const m = scoreOneLineCompletion(puzzle, { ...clean, durationMs: ms });
      expect(m.specific.scoreLeft).toBe(Math.round(oneLineScoreAt(ms)));
      expect(m.score).toBe(m.specific.scoreLeft);
    }
  });

  it('время вышло — счёт ноль, даже если ходы были верные', () => {
    const m = scoreOneLineCompletion(puzzle, { ...clean, durationMs: 60_000, timedOut: true });
    expect(m.score).toBe(0);
    expect(m.specific.scoreLeft).toBe(0);
    expect(m.specific.timedOut).toBe(true);
  });

  it('🔴 время вышло — уровень НЕ засчитан, какой бы ни была точность', () => {
    const timedOut = scoreOneLineCompletion(puzzle, { ...clean, durationMs: 60_000, timedOut: true });
    expect(timedOut.accuracy).toBe(1);        // ходы были безупречные…
    expect(isPassed(timedOut)).toBe(false);   // …но фигура не закрыта
    const inTime = scoreOneLineCompletion(puzzle, { ...clean, durationMs: 60_000 });
    expect(isPassed(inTime)).toBe(true);
  });

  it('обычная партия истёкшей не помечается', () => {
    expect(scoreOneLineCompletion(puzzle, { ...clean, durationMs: 1000 }).specific.timedOut).toBe(false);
  });
});

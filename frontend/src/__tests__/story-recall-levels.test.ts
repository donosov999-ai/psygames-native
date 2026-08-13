/**
 * Уровни пересказа обязаны усложнять то, что делает задачу трудной, и оставлять
 * её выполнимой.
 *
 * ЗАЧЕМ. Уровень здесь крутит два условия: меньше времени на чтение, дольше помеха
 * перед пересказом. Легко сломать в обе стороны:
 *
 *   в одну — перепутать знак и дать НА ВЕРХАХ больше времени, то есть сделать легче;
 *   в другую — ужать чтение так, что короткий рассказ физически не прочитать,
 *              и трудность станет не про память, а про скорость глаз.
 *
 * ⚠️ НИЖНЯЯ ГРАНИЦА ЧТЕНИЯ — НЕ ПРИДИРКА. Самый короткий рассказ читается 30 секунд;
 * без границы на 15-м уровне осталось бы 18. Тест стережёт, что даже там даётся
 * не меньше 15 секунд.
 */
import {
  STORY_MAX_LEVEL,
  clampStoryLevel,
  storyLevel,
  readSecondsFor,
  distractorSecondsFor,
} from '../services/storyRecallLevels';

const ALL = Array.from({ length: STORY_MAX_LEVEL }, (_, i) => i + 1);
const SHORTEST_STORY = 30;   // самый короткий рассказ в наборе, секунд на чтение
const DISTRACTOR2 = 90;      // длинная помеха перед отложенным пересказом

describe('уровни пересказа', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(STORY_MAX_LEVEL).toBeGreaterThanOrEqual(10);
  });

  it('времени на чтение становится МЕНЬШЕ, помехи — БОЛЬШЕ', () => {
    const wrong: string[] = [];
    for (let n = 2; n <= STORY_MAX_LEVEL; n++) {
      const prev = storyLevel(n - 1), cur = storyLevel(n);
      if (!(cur.readMul < prev.readMul)) wrong.push(`уровень ${n}: чтение ${prev.readMul} → ${cur.readMul}`);
      if (!(cur.distractorMul > prev.distractorMul)) wrong.push(`уровень ${n}: помеха ${prev.distractorMul} → ${cur.distractorMul}`);
    }
    expect(wrong).toEqual([]);
  });

  it('первый уровень — нынешние условия, ничего не ужато', () => {
    expect(storyLevel(1)).toEqual({ readMul: 1, distractorMul: 1 });
    expect(readSecondsFor(SHORTEST_STORY, 1)).toBe(SHORTEST_STORY);
    expect(distractorSecondsFor(DISTRACTOR2, 1)).toBe(DISTRACTOR2);
  });

  it('даже на последнем уровне рассказ реально успеть прочитать', () => {
    const tooFast = ALL
      .map((n) => ({ n, sec: readSecondsFor(SHORTEST_STORY, n) }))
      .filter((x) => x.sec < 15)
      .map((x) => `уровень ${x.n}: ${x.sec} с`);
    expect(tooFast).toEqual([]);
  });

  it('помеха растёт, но не уходит в бесконечность', () => {
    expect(distractorSecondsFor(DISTRACTOR2, STORY_MAX_LEVEL)).toBe(180);
    const over = ALL.filter((n) => distractorSecondsFor(DISTRACTOR2, n) > 180);
    expect(over).toEqual([]);
  });

  it('числа круглые — иначе в сессии оседают хвосты', () => {
    const ugly = ALL
      .flatMap((n) => [storyLevel(n).readMul, storyLevel(n).distractorMul])
      .filter((v) => Math.abs(v * 100 - Math.round(v * 100)) > 1e-9);
    expect(ugly).toEqual([]);
  });

  it('секунды — целые: дробный обратный отсчёт показывать нечем', () => {
    const frac = ALL
      .flatMap((n) => [readSecondsFor(SHORTEST_STORY, n), distractorSecondsFor(DISTRACTOR2, n)])
      .filter((v) => !Number.isInteger(v));
    expect(frac).toEqual([]);
  });

  it('мусор на входе не роняет', () => {
    expect(clampStoryLevel(0)).toBe(1);
    expect(clampStoryLevel(999)).toBe(STORY_MAX_LEVEL);
    expect(clampStoryLevel(NaN)).toBe(1);
    expect(storyLevel(999)).toEqual(storyLevel(STORY_MAX_LEVEL));
  });
});

/* psygames-goal-suggest-gate · VER 1 · 07.09.2026 */
/**
 * ЦЕЛЬ ПРЕДЛАГАЕТСЯ ИЗ ЕГО ЦИФР — И НЕ ПРИДУМЫВАЕТСЯ, КОГДА ЦИФР НЕТ.
 *
 * Проверяется ИСПОЛНЕНИЕМ на настоящих наборах дней, а не чтением исходника.
 */
import { bestStreakFromDays, suggestGoal, suggestLabelKey } from '@/src/services/goalSuggest';
import { GOAL_DAYS } from '@/src/services/streakGoal';

/** Подряд идущие дни от 1 сентября. */
const подряд = (n: number, from = 1): string[] =>
  Array.from({ length: n }, (_, k) => `2026-9-${from + k}`);

describe('лучшая серия из журнала', () => {
  it('пустой журнал — нуль, а не выдуманная единица', () => {
    expect(bestStreakFromDays([])).toBe(0);
  });

  it('одна цепочка считается один раз, а не по числу дней в ней', () => {
    expect(bestStreakFromDays(подряд(4))).toBe(4);
  });

  it('берёт САМУЮ длинную, а не последнюю', () => {
    // Длинная в начале, короткая в конце: наивный проход вернул бы 2.
    const дни = [...подряд(6, 1), ...подряд(2, 20)];
    expect(bestStreakFromDays(дни)).toBe(6);
  });

  it('разрыв рвёт цепочку', () => {
    expect(bestStreakFromDays(['2026-9-1', '2026-9-2', '2026-9-4'])).toBe(2);
  });

  it('порядок в массиве не важен — журнал не отсортирован', () => {
    expect(bestStreakFromDays(['2026-9-3', '2026-9-1', '2026-9-2'])).toBe(3);
  });

  it('цепочка через границу месяца не рвётся', () => {
    expect(bestStreakFromDays(['2026-8-30', '2026-8-31', '2026-9-1'])).toBe(3);
  });

  it('повторы в журнале не раздувают серию', () => {
    expect(bestStreakFromDays(['2026-9-1', '2026-9-1', '2026-9-2'])).toBe(2);
  });
});

describe('что предложить', () => {
  it('🔴 рекорд 4 → 7, 8 → 14, 16 → 30: ступень СТРОГО выше достигнутого', () => {
    expect(suggestGoal({ days: подряд(4), hasSessions: true }).days).toBe(7);
    expect(suggestGoal({ days: подряд(8), hasSessions: true }).days).toBe(14);
    expect(suggestGoal({ days: подряд(16), hasSessions: true }).days).toBe(30);
  });

  it('ровно на ступени — предлагаем следующую, а не ту же', () => {
    // Взял 7 и дошёл: повторять то же самое — не рост.
    expect(suggestGoal({ days: подряд(7), hasSessions: true }).days).toBe(14);
    expect(suggestGoal({ days: подряд(14), hasSessions: true }).days).toBe(30);
  });

  it('верхняя ступень взята — выше в наборе нет, остаёмся на ней', () => {
    const s = suggestGoal({ days: подряд(30), hasSessions: true });
    expect(`${s.days}/${s.reason}`).toBe('30/at_top');
    expect(s.basis).toBe(30);
  });

  it('играл, но серий не было — начинаем с недели', () => {
    const s = suggestGoal({ days: ['2026-9-1', '2026-9-5', '2026-9-9'], hasSessions: true });
    expect(`${s.days}/${s.reason}`).toBe('7/start_week');
  });

  it('первый заход — неделя без обоснования', () => {
    const s = suggestGoal({ days: [], hasSessions: false });
    expect(`${s.days}/${s.reason}`).toBe('7/no_data');
  });

  it('предложение всегда из набора вариантов, а не произвольное число', () => {
    for (const n of [0, 1, 3, 6, 7, 9, 13, 14, 22, 29, 30, 44]) {
      const s = suggestGoal({ days: подряд(n), hasSessions: true });
      expect(`${n} → ${GOAL_DAYS.includes(s.days as never)}`).toBe(`${n} → true`);
    }
  });
});

describe('подпись под предложением', () => {
  it('🔴 нет замеренного основания — НЕТ и подписи', () => {
    // Иначе на первом экране появится цифра, взятая из воздуха, — ровно то, за
    // что мы отказались повторять «шансы вырастут в 2 раза».
    expect(suggestLabelKey(suggestGoal({ days: [], hasSessions: false }))).toBeNull();
    expect(suggestLabelKey(suggestGoal({ days: [], hasSessions: true }))).toBeNull();
    // Один день — заход, а не серия: подписи тоже нет (STREAK_COUNTS_FROM = 2).
    expect(suggestLabelKey(suggestGoal({ days: ['2026-9-1'], hasSessions: true }))).toBeNull();
    // Два дня подряд — уже серия, основание настоящее.
    expect(suggestLabelKey(suggestGoal({ days: подряд(2), hasSessions: true }))).not.toBeNull();
  });

  it('🔴 один день — не серия: подписи нет, но неделя предлагается', () => {
    const s = suggestGoal({ days: ['2026-9-1'], hasSessions: true });
    expect(`${s.days}/${s.reason}/${s.basis}`).toBe('7/start_week/null');
  });

  it('два дня подряд — уже серия', () => {
    const s = suggestGoal({ days: подряд(2), hasSessions: true });
    expect(`${s.days}/${s.reason}/${s.basis}`).toBe('7/best_streak/2');
  });

  it('есть основание — есть и число, на котором оно стоит', () => {
    const s = suggestGoal({ days: подряд(4), hasSessions: true });
    expect(`${s.basis} · ${suggestLabelKey(s)}`).toBe('4 · goalSuggest_best_streak');
  });
});

/* psygames-goal-suggest-gate · VER 1 · 07.09.2026 */
/**
 * ЦЕЛЬ ПРЕДЛАГАЕТСЯ ИЗ ЕГО ЦИФР — И НЕ ПРИДУМЫВАЕТСЯ, КОГДА ЦИФР НЕТ.
 *
 * Проверяется ИСПОЛНЕНИЕМ на настоящих наборах дней, а не чтением исходника.
 */
import { bestStreakFromDays, suggestGoal, suggestLabelKey } from '@/src/services/goalSuggest';
import { GOAL_DAYS } from '@/src/services/streakGoal';

declare const __dirname: string;
declare function require(id: string): any;

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

  /**
   * 🔴 СРЫВ: БЕРЁМ МЕНЬШЕ, И ЭТО НЕ УПРЁК. Числа заданы Денисом 07.09.2026
   * поимённо (30 → 14, 14 → 7, 7 → 7), поэтому проверяются ЛИТЕРАЛАМИ, а не
   * вычислением по тому же массиву, из которого их берёт сама функция: проба,
   * написанная через `GOAL_DAYS`, зеленела бы и на перевёрнутой лестнице.
   */
  describe('цель не вышла — предлагается меньшая', () => {
    it('тридцать → четырнадцать, четырнадцать → семь', () => {
      expect(suggestGoal({ days: [], hasSessions: true, brokenFrom: 30 }).days).toBe(14);
      expect(suggestGoal({ days: [], hasSessions: true, brokenFrom: 14 }).days).toBe(7);
    });

    it('семь → семь: ниже нижней ступени нет, но подпись объясняет почему', () => {
      const s = suggestGoal({ days: [], hasSessions: true, brokenFrom: 7 });
      expect(s.days).toBe(7);
      expect(s.reason).toBe('smaller');
      expect(suggestLabelKey(s)).toBe('goalSuggest_smaller');
    });

    it('🔴 основание — та цель, что не вышла, а не рекорд', () => {
      const s = suggestGoal({ days: [], hasSessions: true, brokenFrom: 30 });
      expect(s.basis).toBe(30);
    });

    it('🔴 срыв перебивает подбор по рекорду — иначе вернули бы ту же цель', () => {
      // Рекорд 25 дней: по «ступени вверх от рекорда» вышло бы снова 30 — ровно
      // то, что человек только что не удержал.
      const дни = подряд(25);
      expect(suggestGoal({ days: дни, hasSessions: true }).days).toBe(30);
      expect(suggestGoal({ days: дни, hasSessions: true, brokenFrom: 30 }).days).toBe(14);
    });

    it('ничего не рвалось — поле не мешает обычному подбору', () => {
      expect(suggestGoal({ days: [], hasSessions: true, brokenFrom: null }).reason).toBe('start_week');
      expect(suggestGoal({ days: [], hasSessions: false }).reason).toBe('no_data');
    });
  });
});
/**
 * 🔴 ПОДПИСЬ ПОСЛЕ СРЫВА — ВО ВСЕХ ДВЕНАДЦАТИ ЯЗЫКАХ БЕЗ УПРЁКА.
 *
 * ⚠️ Накладки переводов помечены «AUTO-GENERATED … регенерировать воркфлоу»:
 * когда их однажды пересоберут, эти строки перепишет машина — и «в прошлый раз
 * было 30» легко превратится в «ты не удержал 30». Гейт читает файлы как текст,
 * поэтому переживёт пересборку и покраснеет на упрёке, кто бы его ни написал.
 */
describe('подпись «возьмём поменьше» — факт, а не оценка', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const ЯЗЫКИ = ['de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'];
  const УПРЁКИ = [
    'не смог', 'не удержал', 'провалил', 'подвёл', 'failed', 'you lost', 'gescheitert',
    'fracasaste', 'échoué', 'fallito', 'falhou', '失败', '失敗', '실패', 'विफल', 'فشل',
  ];

  /**
   * ⚠️ Берётся ЦЕЛАЯ СТРОКА файла, а не разобранное значение: в базовом словаре
   * запись выглядит как `ключ: { ru: '…', en: '…' }`, а в накладках — как
   * `"ключ": "…"`. Один разборщик на две формы — это лишний способ ошибиться и
   * зазеленеть; строка целиком одинаково годится для обеих.
   */
  const строка = (файл: string, ключ: string): string => {
    const имя = файл.split('/').pop();
    const найдена = readFileSync(файл, 'utf8').split('\n').find((l: string) => l.includes(ключ)) ?? '';
    // Гейт обязан признаваться, что не нашёл, а не молча зеленеть.
    expect(`${имя}: ключ найден ${найдена !== ''}`).toBe(`${имя}: ключ найден true`);
    return найдена;
  };

  it('во всех двенадцати языках подпись есть, содержит число и не упрекает', () => {
    const файлы = [
      join(__dirname, '..', 'contexts', 'LanguageContext.tsx'),
      ...ЯЗЫКИ.map((l) => join(__dirname, '..', 'contexts', 'translations', `${l}.ts`)),
    ];
    for (const f of файлы) {
      const текст = строка(f, 'goalSuggest_smaller').toLowerCase();
      const имя = f.split('/').pop();
      expect(`${имя}: место под число ${текст.includes('{n}')}`).toBe(`${имя}: место под число true`);
      expect(`${имя}: ${УПРЁКИ.filter((u) => текст.includes(u)).join(', ') || 'без упрёка'}`)
        .toBe(`${имя}: без упрёка`);
    }
  });
});


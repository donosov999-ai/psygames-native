/**
 * ИСТОРИЯ ТРЕНИРОВОК — вкладка на экране статистики.
 *
 * ЗАЧЕМ ГЕЙТ. Здесь четыре места, где легко соврать человеку и не заметить глазами:
 *
 *  • НАПРАВЛЕНИЕ «ЛУЧШЕ». У Шульте результат — время, и меньше значит лучше; у всех
 *    остальных — очки, и лучше значит больше. Перепутанное направление выглядит на
 *    экране совершенно нормально: цифры есть, подпись есть, цвет есть — просто человеку,
 *    который ускорился на десять секунд, написано «хуже». Ровно на этом уже обжигались в
 *    лидерборде (`isBetter` знала «меньше лучше» для одной игры). Проверяем ОБЕ стороны
 *    у ОБЕИХ метрик — четыре случая, а не два.
 *
 *  • ПЕРВЫЙ РАЗ. Сравнивать не с чем — значит вердикта нет. Показать на первой партии
 *    «рост» проще всего: `prev ?? 0` пишется быстрее правильного кода и молча делает
 *    любой первый результат рекордом.
 *
 *  • ПОРЯДОК ДНЕЙ. Экран открывают ради свежего. Дни, отсортированные по строке
 *    «2026-08-19» в обратную сторону, выглядят как история — только чужая, годичной
 *    давности, и человек решает, что новые партии не записались.
 *
 *  • ПУСТОТА. У нового человека история пуста ВСЕГДА — это первый заход, а не редкий
 *    край. Пустой экран читается как поломка, поэтому решение «что показать вместо
 *    пустоты» проверяется прогоном, а не глазами.
 *
 * ⚠️ Проверяем ИСПОЛНЕНИЕМ, а не наличием слова в исходнике: почти всё ниже —
 * прогон функций на подстроенных сессиях. Два оставшихся структурных теста
 * (белый список «меньше лучше» и переключение вкладок) читают исходник ПОСЛЕ вырезания
 * комментариев — слово в комментарии не должно держать гейт зелёным.
 */
import {
  buildTrainingHistory,
  belongsToProfile,
  compare,
  entryValue,
  historyView,
  LOWER_IS_BETTER,
  MAX_HISTORY_DAYS,
  type HistorySession,
} from '@/src/services/trainingHistory';
import { GAMES } from '@/src/constants/games';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8') as string;
/** Комментарии вон: гейт обязан смотреть на код, а не на рассказ о коде. */
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Локальное время — история нарезается по локальным дням, как календарь серии. */
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 7, day, hour, minute).toISOString();

const round = (game: string, score: number, day: number, hour = 12): HistorySession =>
  ({ game_type: game, score, time_seconds: 30, timestamp: at(day, hour) });

const timed = (score: number, seconds: number, day: number, hour = 12): HistorySession =>
  ({ game_type: 'schulte_table', score, time_seconds: seconds, timestamp: at(day, hour) });

const flat = (days: ReturnType<typeof buildTrainingHistory>) => days.flatMap((d) => d.entries);

describe('сравнение с прошлым разом — очки, больше значит лучше', () => {
  it('результат вырос — «лучше», и на сколько именно', () => {
    const days = buildTrainingHistory([round('n_back', 50, 10), round('n_back', 80, 11)]);
    const fresh = days[0].entries[0];
    expect(fresh.verdict).toBe('better');
    expect(fresh.prev).toBe(50);
    expect(fresh.diff).toBe(30);
  });

  it('результат упал — «хуже», а не «изменился»', () => {
    const days = buildTrainingHistory([round('n_back', 80, 10), round('n_back', 50, 11)]);
    expect(days[0].entries[0].verdict).toBe('worse');
    expect(days[0].entries[0].diff).toBe(30);
  });

  it('результат тот же — «как в прошлый раз», а не «лучше»', () => {
    const days = buildTrainingHistory([round('n_back', 60, 10), round('n_back', 60, 11)]);
    expect(days[0].entries[0].verdict).toBe('same');
    expect(days[0].entries[0].diff).toBe(0);
  });
});

describe('сравнение с прошлым разом — время, МЕНЬШЕ значит лучше', () => {
  it('прошёл быстрее — «лучше», хотя число стало меньше', () => {
    const days = buildTrainingHistory([timed(25, 60, 10), timed(25, 45, 11)]);
    const fresh = days[0].entries[0];
    expect(fresh.unit).toBe('seconds');
    expect(fresh.value).toBe(45);
    expect(fresh.verdict).toBe('better');
    expect(fresh.diff).toBe(15);
  });

  it('прошёл медленнее — «хуже», хотя число выросло', () => {
    const days = buildTrainingHistory([timed(25, 45, 10), timed(25, 60, 11)]);
    expect(days[0].entries[0].verdict).toBe('worse');
  });

  it('🔴 у времени и у очков направления РАЗНЫЕ — одна и та же пара чисел даёт разный вердикт', () => {
    expect(compare('score', 80, 50)).toBe('better');
    expect(compare('seconds', 80, 50)).toBe('worse');
    expect(compare('score', 50, 80)).toBe('worse');
    expect(compare('seconds', 50, 80)).toBe('better');
  });

  it('у Шульте показываем время, а не очки: очки там не двигаются вовсе', () => {
    // score = клетки − ошибки, то есть на 5×5 это 25 и вчера, и сегодня.
    const days = buildTrainingHistory([timed(25, 60, 10), timed(25, 41, 11)]);
    expect(days[0].entries[0].unit).toBe('seconds');
    expect(days[0].entries[0].value).toBe(41);
    // По очкам это был бы «как в прошлый раз» — то есть молчание о девятнадцати секундах.
    expect(days[0].entries[0].verdict).toBe('better');
  });
});

describe('первый раз — это не рост', () => {
  it('единственная партия упражнения остаётся без вердикта', () => {
    const days = buildTrainingHistory([round('corsi', 700, 10)]);
    expect(days[0].entries[0].verdict).toBeNull();
    expect(days[0].entries[0].prev).toBeNull();
    expect(days[0].entries[0].diff).toBeNull();
  });

  it('первая партия остаётся без вердикта даже с нулевым результатом', () => {
    // `prev ?? 0` дал бы здесь «как в прошлый раз» — вердикт из воздуха.
    const days = buildTrainingHistory([round('corsi', 0, 10)]);
    expect(days[0].entries[0].verdict).toBeNull();
  });

  it('вердикта нет у ПЕРВОЙ партии каждого упражнения, а не только у самой первой', () => {
    const days = buildTrainingHistory([
      round('corsi', 100, 10), round('corsi', 200, 11), round('stroop', 5, 12),
    ]);
    const stroop = flat(days).find((e) => e.gameType === 'stroop')!;
    expect(stroop.verdict).toBeNull();
  });

  it('сравниваем со своим упражнением, а не с соседним по времени', () => {
    const days = buildTrainingHistory([
      round('corsi', 100, 10), round('stroop', 900, 11), round('corsi', 120, 12),
    ]);
    const corsiFresh = flat(days).find((e) => e.gameType === 'corsi' && e.value === 120)!;
    expect(corsiFresh.prev).toBe(100);
    expect(corsiFresh.verdict).toBe('better');
  });
});

describe('сравниваем только одинаковые партии', () => {
  const lvl = (game: string, level: number, score: number, day: number, seconds = 30): HistorySession =>
    ({ game_type: game, score, time_seconds: seconds, timestamp: at(day), details: { level } });

  it('🔴 взял следующий уровень — «новая сложность», а не «хуже»', () => {
    // Уровень 2 Шульте это 6×6 вместо 5×5: тридцать шесть клеток вместо двадцати пяти.
    // Время там всегда больше, и по одному имени упражнения вышло бы «хуже на 20 секунд»
    // ровно в тот момент, когда человек ВЫРОС.
    const days = buildTrainingHistory([
      lvl('schulte_table', 1, 25, 10, 42),
      lvl('schulte_table', 2, 36, 11, 71),
    ]);
    expect(days[0].entries[0].verdict).toBe('newTask');
    expect(days[0].entries[0].prev).toBeNull();
  });

  it('🔴 у очков та же ловушка: выше уровень — меньше попаданий, но это не провал', () => {
    const days = buildTrainingHistory([lvl('n_back', 1, 180, 10), lvl('n_back', 2, 90, 11)]);
    expect(days[0].entries[0].verdict).toBe('newTask');
  });

  it('вернулся на прежний уровень — сравнение с прошлым разом НА ЭТОМ уровне', () => {
    const days = buildTrainingHistory([
      lvl('schulte_table', 1, 25, 10, 60),
      lvl('schulte_table', 2, 36, 11, 90),
      lvl('schulte_table', 1, 25, 12, 48),
    ]);
    const fresh = days[0].entries[0];
    expect(fresh.prev).toBe(60);          // не 90 с шестёрочной сетки
    expect(fresh.verdict).toBe('better');
    expect(fresh.diff).toBe(12);
  });

  it('«новая сложность» — это НЕ «первый раз»: упражнение уже знакомо', () => {
    const days = buildTrainingHistory([lvl('corsi', 1, 100, 10), lvl('corsi', 2, 100, 11)]);
    expect(flat(days).find((e) => e.level === 2)!.verdict).toBe('newTask');
    expect(flat(days).find((e) => e.level === 1)!.verdict).toBeNull();
  });

  it('свободный режим без лестницы различается по настройкам партии', () => {
    // Уровня нет, но 4×4 и 7×7 — разные задачи: ключ собирает difficulty и mode.
    const free = (grid: string, seconds: number, day: number): HistorySession =>
      ({ game_type: 'schulte_table', score: 25, time_seconds: seconds, timestamp: at(day),
         difficulty: grid, mode: 'numbers_forward_bw' });
    const days = buildTrainingHistory([free('4x4', 20, 10), free('7x7', 95, 11), free('4x4', 17, 12)]);
    const fresh = flat(days).find((e) => e.value === 17)!;
    expect(fresh.prev).toBe(20);
    expect(fresh.verdict).toBe('better');
    expect(flat(days).find((e) => e.value === 95)!.verdict).toBe('newTask');
  });

  it('уровень попадает в строку — иначе «новая сложность» выглядит капризом', () => {
    expect(buildTrainingHistory([lvl('corsi', 7, 100, 10)])[0].entries[0].level).toBe(7);
    expect(buildTrainingHistory([round('corsi', 100, 10)])[0].entries[0].level).toBeNull();
  });
});

describe('порядок дней и партий', () => {
  it('дни идут от новых к старым', () => {
    const days = buildTrainingHistory([round('n_back', 1, 3), round('n_back', 2, 17), round('n_back', 3, 9)]);
    expect(days.map((d) => d.dateKey)).toEqual(['2026-08-17', '2026-08-09', '2026-08-03']);
  });

  it('порядок дней не ломается на смене месяца', () => {
    const days = buildTrainingHistory([
      { game_type: 'n_back', score: 1, timestamp: new Date(2026, 6, 30, 12).toISOString() },
      { game_type: 'n_back', score: 2, timestamp: new Date(2026, 7, 2, 12).toISOString() },
    ]);
    expect(days[0].dateKey).toBe('2026-08-02');
  });

  it('внутри дня свежие партии сверху', () => {
    const days = buildTrainingHistory([round('n_back', 10, 10, 9), round('n_back', 20, 10, 18)]);
    expect(days).toHaveLength(1);
    expect(days[0].entries.map((e) => e.value)).toEqual([20, 10]);
  });

  it('вторая партия за день сравнивается с первой партией того же дня', () => {
    const days = buildTrainingHistory([
      round('n_back', 10, 9), round('n_back', 30, 10, 9), round('n_back', 40, 10, 18),
    ]);
    expect(days[0].entries[0].prev).toBe(30);
  });

  it('показываем хвост дней, а не всё подряд', () => {
    const many = Array.from({ length: MAX_HISTORY_DAYS + 12 }, (_, i) => round('n_back', i, 1 + i));
    const days = buildTrainingHistory(many);
    expect(days).toHaveLength(MAX_HISTORY_DAYS);
    // Отрезан ДРЕВНИЙ хвост, а не свежий: первый день — самый новый из всех.
    const newest = new Date(2026, 7, MAX_HISTORY_DAYS + 12);
    expect(days[0].dateKey).toBe(
      `${newest.getFullYear()}-${String(newest.getMonth() + 1).padStart(2, '0')}-${String(newest.getDate()).padStart(2, '0')}`,
    );
    expect(buildTrainingHistory(many, { maxDays: 0 }).length).toBe(MAX_HISTORY_DAYS + 12);
  });
});

describe('мусор в данных не превращается в вердикт', () => {
  it('партия без метки времени не попадает в историю — её некуда поставить', () => {
    const days = buildTrainingHistory([{ game_type: 'n_back', score: 10 }, round('n_back', 20, 10)]);
    expect(flat(days)).toHaveLength(1);
  });

  it('битое время у Шульте (баг таймстампа ≈1.78e9) не становится результатом', () => {
    const days = buildTrainingHistory([timed(25, 1.78e9, 10)]);
    expect(days[0].entries[0].value).toBeNull();
    expect(days[0].entries[0].verdict).toBeNull();
  });

  it('🔴 битая партия не становится «прошлым разом» для следующей', () => {
    const days = buildTrainingHistory([timed(25, 50, 10), timed(25, 1.78e9, 11), timed(25, 45, 12)]);
    const fresh = flat(days).find((e) => e.value === 45)!;
    // Сравнение идёт с последним ПРИГОДНЫМ результатом (50 с), а не с дырой и не с нулём.
    expect(fresh.prev).toBe(50);
    expect(fresh.verdict).toBe('better');
  });

  it('пустой список сессий — пустая история, а не падение', () => {
    expect(buildTrainingHistory([])).toEqual([]);
  });
});

describe('чей это раунд', () => {
  it('чужой профиль в свою историю не попадает — иначе вердикт сравнит взрослого с ребёнком', () => {
    expect(belongsToProfile({ profile_id: 'kids' }, 'odv999')).toBe(false);
    expect(belongsToProfile({ profile_id: 'odv999' }, 'odv999')).toBe(true);
  });

  /**
   * 🔴 РАУНД БЕЗ МЕТКИ ВЛАДЕЛЬЦА — ЧУЖОЙ ДЛЯ ВСЕХ. Решение Дениса 20.08.2026.
   *
   * Прежняя проверка требовала обратного и была написана под рассуждение «выбросить
   * значит стереть человеку месяцы тренировок». Рассуждение оказалось про никого:
   * метка пишется с 20.06.2026, а в магазин приложение уехало в августе — партий без
   * метки нет ни у одного человека за пределами наших устройств.
   *
   * Держать ради этого догадку о прошлом нельзя: на семейном устройстве играли двое,
   * и «ничья» партия, засчитанная всем, ставит вердикт «хуже прошлого раза», сравнивая
   * взрослого с семилеткой.
   */
  it('🔴 раунд без метки владельца не принадлежит никому', () => {
    expect(belongsToProfile({}, 'odv999')).toBe(false);
    expect(belongsToProfile({}, 'kids')).toBe(false);
    expect(belongsToProfile({ profile_id: 'odv999' }, 'odv999')).toBe(true);
    expect(belongsToProfile({ profile_id: 'odv999' }, 'kids')).toBe(false);
  });
});

describe('пустая история не даёт пустого экрана', () => {
  it('нечего показать и нечего было играть — приглашение сыграть', () => {
    const v = historyView([], { anySessions: false, scoped: false });
    expect(v.kind).toBe('empty');
  });

  it('партии есть, но их спрятал фильтр профиля — это «не здесь», а не «пусто»', () => {
    const v = historyView([], { anySessions: true, scoped: true });
    expect(v.kind).toBe('scoped');
  });

  it('есть дни — показываем дни', () => {
    const days = buildTrainingHistory([round('n_back', 10, 10)]);
    expect(historyView(days, { anySessions: true, scoped: true }).kind).toBe('days');
  });

  it('🔴 у КАЖДОГО пустого состояния есть что сказать, и это есть в словаре', () => {
    const base = read('src/contexts/LanguageContext.tsx');
    const states = [
      historyView([], { anySessions: false, scoped: false }),
      historyView([], { anySessions: true, scoped: true }),
    ];
    const missing: string[] = [];
    for (const v of states) {
      if (v.kind === 'days') { missing.push('пустая история вернула «дни»'); continue; }
      for (const key of [v.titleKey, v.hintKey, v.ctaKey]) {
        if (!key) { missing.push(`${v.kind}: пустой ключ`); continue; }
        // Ключ обязан быть В СЛОВАРЕ: иначе t() отдаёт само имя ключа, и человек
        // читает на экране «historyEmptyHint» вместо текста.
        if (!new RegExp(`^ {2}${key}:\\s*\\{`, 'm').test(base)) missing.push(`${v.kind}: нет ключа ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('белый список «меньше значит лучше» держится честно', () => {
  it('в списке только настоящие упражнения — опечатка молча выключила бы правило', () => {
    const known = new Set(GAMES.map((g) => g.id));
    expect(Object.keys(LOWER_IS_BETTER).filter((id) => !known.has(id))).toEqual([]);
  });

  it('список не пуст — иначе ветка «меньше лучше» не работает ни для кого', () => {
    expect(Object.keys(LOWER_IS_BETTER).length).toBeGreaterThan(0);
  });

  it('🔴 в списке нет игр, у которых время УЖЕ входит в очки — иначе оно учтётся дважды', () => {
    const doubled: string[] = [];
    for (const id of Object.keys(LOWER_IS_BETTER)) {
      const route = GAMES.find((g) => g.id === id)?.route;
      if (!route) continue;
      const src = stripComments(read(`app${route}.tsx`));
      // Выражение очков этого упражнения — ровно то, что уходит в saveSession.
      for (const m of src.matchAll(/\bscore:\s*([^\n]+)/g)) {
        if (/time|elapsed|Time|Elapsed/.test(m[1])) doubled.push(`${id}: очки уже содержат время → ${m[1].trim()}`);
      }
    }
    expect(doubled).toEqual([]);
  });

  it('игра, у которой время уже в очках, отдаёт очки, а не секунды', () => {
    // trail_making: score = 1000 − время*5 − ошибки*30. Показывать её время отдельно
    // и сравнивать «меньше лучше» — значит учесть время дважды.
    expect(entryValue({ game_type: 'trail_making', score: 700, time_seconds: 60 }).unit).toBe('score');
    expect(entryValue({ game_type: 'schulte_table', score: 25, time_seconds: 60 }).unit).toBe('seconds');
  });
});

describe('экран статистики', () => {
  const screen = () => stripComments(read('app/statistics.tsx'));

  it('обе вкладки рисуются — сводка и история', () => {
    const src = screen();
    expect(/tab === 'summary'/.test(src)).toBe(true);
    expect(/tab === 'history'/.test(src)).toBe(true);
  });

  it('🔴 переключение вкладки не перезагружает экран', () => {
    const src = screen();
    // Загрузка висит на useEffect с ПУСТЫМ списком зависимостей; попадание `tab`
    // в зависимости любого эффекта означает поход в хранилище на каждый клик.
    const effectDeps = [...src.matchAll(/useEffect\([\s\S]*?\},\s*\[([^\]]*)\]\)/g)].map((m) => m[1]);
    expect(effectDeps.filter((d) => /\btab\b/.test(d))).toEqual([]);
    // И сама загрузка не должна зваться из обработчика переключения.
    expect(/setTab\([^)]*\);\s*loadStats\(/.test(src)).toBe(false);
  });

  it('🔴 экран рисует все три состояния истории, а не только заполненное', () => {
    const src = screen();
    const missing = (['days', 'empty', 'scoped'] as const).filter(
      (kind) => !new RegExp(`===\\s*'${kind}'|kind === '${kind}'`).test(src),
    );
    expect(missing).toEqual([]);
  });

  it('🔴 у каждого вердикта есть подпись — иначе «новая сложность» молча станет «первым разом»', () => {
    const src = screen();
    const base = read('src/contexts/LanguageContext.tsx');
    const bad: string[] = [];
    for (const key of ['historyNewTask', 'historyFirstRun', 'historySame', 'historyBetter', 'historyWorse', 'historyLevelShort']) {
      if (!new RegExp(`^ {2}${key}:\\s*\\{`, 'm').test(base)) bad.push(`нет ключа ${key} в словаре`);
      if (!src.includes(`'${key}'`)) bad.push(`экран не показывает ${key}`);
    }
    expect(bad).toEqual([]);
  });
});

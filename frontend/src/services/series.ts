/* psygames-series · VER 1 · 23.08.2026 */
/**
 * СЕРИЯ БЛОКОВ — одно упражнение, несколько правил подряд на ОДНОМ поле.
 *
 * ЗАЧЕМ. Замысел Дениса (22.08.2026): свести 72 игры к ~21 мультиигре — 2-3
 * упражнения в одном, чтобы в лёгкой форме давать более широкую нагрузку.
 * Направление выбрано: ПОСЛЕДОВАТЕЛЬНЫЕ БЛОКИ на одном поле, а не две задачи
 * одновременно.
 *
 * 🔴 МЕТОД, БЕЗ КОТОРОГО ЭТО ПРОСТО ТРИ ИГРЫ ПОДРЯД (аддитивный метод Стернберга).
 * Каждый следующий блок добавляет РОВНО ОДНО требование. Тогда РАЗНОСТЬ времени
 * между блоками и есть замер добавленного звена, а не ещё одно очко:
 *
 *   Шульте, блок 1 — найти 1…25 по порядку          → T₁ скорость поиска
 *   Шульте, блок 2 — то же поле, чередуя два ряда    → T₂ − T₁ = цена переключения
 *   Шульте, блок 3 — то же поле, пара с суммой S     → T₃ − T₁ = цена удержания в уме
 *
 * Отсюда три условия, и все три стережёт `series-core.test.ts`:
 *   1. блоки СТРОГО сопоставимы — то же поле, тот же размер. Иначе разность
 *      грязная: в неё попадает разница полей, а не цена правила.
 *   2. порядок блоков НЕ рандомизируется — он часть замера, а не оформление.
 *   3. сложность крутится РАЗМЕРОМ поля и числом блоков, а не долями проб.
 *
 * ⚠️ ПОЧЕМУ ОДНА СЕССИЯ НА ВСЮ СЕРИЮ, А НЕ ПО ОДНОЙ НА БЛОК. Три отдельные
 * записи — это три несвязанных числа: разность между ними не посчитать никогда,
 * потому что нечем доказать, что они из одного прогона по одному полю. Серия
 * пишет ОДНУ сессию с массивом блоков внутри.
 *
 * ⚠️ ПРЕРВАННАЯ СЕРИЯ НЕ ДАЁТ РАЗНОСТЕЙ. Вышел на середине — блоки сохраняем
 * (человек играл, это его время), но `series_complete: false` и НИКАКИХ
 * разностей. Неполная серия в статистике как замер — это выдуманная цифра.
 *
 * ⚠️ РАЗНОСТИ НЕСРАВНИМЫ МЕЖДУ УРОВНЯМИ и хранятся вместе с уровнем. Цена
 * переключения на поле 5×5 и на 7×7 — разные величины; та же ловушка уже
 * ловилась в `trainingHistory` («прошлый раз» по одному имени упражнения писал
 * «хуже» тому, кто только что взял следующий уровень).
 */

/** Один блок серии: правило, время, ошибки, дошёл ли человек до конца. */
export interface SeriesBlock {
  /** Ключ правила — 'order' | 'alternate' | 'sum' | 'sign' | 'word' | 'sense' и т.п. */
  key: string;
  /** Время блока в миллисекундах. Это и есть измеряемая величина. */
  timeMs: number;
  errors: number;
  /** Блок доведён до конца. Оборванный блок в разности не идёт. */
  done: boolean;
}

export interface SeriesRun {
  gameType: string;
  /** Размер поля — ОБЩИЙ для всех блоков серии. Часть ключа замера. */
  level: number;
  /** Заданный порядок блоков. Задаётся до старта и не меняется. */
  planned: readonly string[];
  blocks: readonly SeriesBlock[];
  startedAt: number;
}

/** Сколько раз подряд блок должен быть взят, чтобы считаться устойчивым. */
export const STABLE_RUNS = 2;

export function startSeries(gameType: string, level: number, planned: readonly string[], nowMs: number): SeriesRun {
  if (planned.length < 2) throw new Error('Серия — это минимум два блока: из одного разность не считается');
  return { gameType, level, planned, blocks: [], startedAt: nowMs };
}

/** Записать завершённый (или оборванный) блок. Возвращает новый прогон, старый не трогает. */
export function recordBlock(run: SeriesRun, block: SeriesBlock): SeriesRun {
  return { ...run, blocks: [...run.blocks, block] };
}

/**
 * Серия полна: сыграны ВСЕ запланированные блоки, в заданном порядке, и каждый
 * доведён до конца. Порядок проверяется тоже — переставленные блоки дают другую
 * разность (второй блок после третьего уже разогрет полем).
 */
export function seriesComplete(run: SeriesRun): boolean {
  if (run.blocks.length !== run.planned.length) return false;
  return run.blocks.every((b, i) => b.key === run.planned[i] && b.done);
}

/**
 * Разности относительно ПЕРВОГО блока — по одной на каждый следующий.
 * Неполная серия разностей не даёт вовсе: `null`, а не нули и не частичный набор.
 */
export function seriesDiffs(run: SeriesRun): Record<string, number> | null {
  if (!seriesComplete(run)) return null;
  const base = run.blocks[0];
  const out: Record<string, number> = {};
  for (const b of run.blocks.slice(1)) out[`${b.key}_minus_${base.key}`] = b.timeMs - base.timeMs;
  return out;
}

/**
 * ОДНА сессия на всю серию. Время партии — сумма блоков, ошибки — сумма ошибок,
 * а сами блоки и уровень лежат в `details`, потому что без уровня разность
 * бессмысленна (см. шапку).
 */
export function seriesSession(run: SeriesRun): {
  game_type: string; score: number; time_seconds: number; errors: number;
  mode: string; details: Record<string, unknown>;
} {
  const complete = seriesComplete(run);
  const diffs = seriesDiffs(run);
  const totalMs = run.blocks.reduce((s, b) => s + b.timeMs, 0);
  const errors = run.blocks.reduce((s, b) => s + b.errors, 0);
  const details: Record<string, unknown> = {
    level: run.level,
    series_complete: complete,
    blocks: run.blocks.map((b) => ({ key: b.key, time_ms: b.timeMs, errors: b.errors, done: b.done })),
  };
  // Ключа `diffs` у неполной серии нет ВООБЩЕ — не пустой объект и не нули:
  // отсутствие ключа читается однозначно, ноль читается как «цена нулевая».
  if (diffs) details.diffs = diffs;
  return {
    game_type: run.gameType,
    score: complete ? Math.max(0, Math.round(60000 / Math.max(1, totalMs / run.blocks.length))) : 0,
    time_seconds: totalMs / 1000,
    errors,
    mode: `series-l${run.level}`,
    details,
  };
}

/** Серия блоков в истории: сколько раз ПОДРЯД каждый блок был взят. */
export type BlockStreaks = Readonly<Record<string, number>>;

export function bumpStreak(previous: number, taken: boolean): number {
  return taken ? previous + 1 : 0;
}

/**
 * УРОВЕНЬ СЕРИИ — модель C: уровень это РАЗМЕР ПОЛЯ, общий для всех блоков, и
 * растёт он, только когда ВЗЯТЫ ВСЕ блоки. Ограничитель — самое слабое звено.
 *
 * ⚠️ КРИТЕРИЙ ВЗЯТИЯ — УСТОЙЧИВОСТЬ (результат повторён `STABLE_RUNS` раз
 * подряд), а НЕ абсолютный порог. Порог здесь запрещён живым примером: у `sdmt`
 * на 76-м уровне он требует 246 мс на ответ — быстрее времени простой реакции,
 * то есть уровень, который нельзя взять никогда.
 */
export function seriesLevelMove(streaks: BlockStreaks, planned: readonly string[]): { raise: boolean; weakest: string } {
  let weakest = planned[0];
  let min = Number.POSITIVE_INFINITY;
  for (const key of planned) {
    const s = streaks[key] ?? 0;
    if (s < min) { min = s; weakest = key; }
  }
  return { raise: min >= STABLE_RUNS, weakest };
}

/**
 * Старт мультиигры — с МИНИМАЛЬНОГО уровня по всем блокам: «подтянуть всё, что
 * слабо». Прежние уровни блоков возвращаются рядом, чтобы экран мог показать их
 * явно: молча посадить человека на минимум читается как откат прогресса.
 */
export function seriesStartLevel(levels: Readonly<Record<string, number>>, planned: readonly string[]): { level: number; perBlock: Record<string, number> } {
  const perBlock: Record<string, number> = {};
  let min = Number.POSITIVE_INFINITY;
  for (const key of planned) {
    const l = levels[key] ?? 1;
    perBlock[key] = l;
    if (l < min) min = l;
  }
  return { level: Number.isFinite(min) ? min : 1, perBlock };
}

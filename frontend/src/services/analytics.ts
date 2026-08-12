/**
 * analytics — БАЛАНС ТРЕНИРОВОК по когнитивным областям.
 *
 * ЗАЧЕМ. У конкурента (Octothink) на экране аналитики полосы «Внимание 59%, Память 77%,
 * Счёт 28%». Приём сильный: человек с одного взгляда видит перекос. У нас разбивки по
 * областям не было вовсе — экран статистики показывает игры по отдельности, а не картину.
 *
 * ⚠️ ЧТО ИМЕННО ЗНАЧИТ ПРОЦЕНТ — И ПОЧЕМУ НЕ «НАСКОЛЬКО Я ХОРОШ».
 * У них процент непрозрачен: непонятно, это доля правильных, место среди других или
 * что-то ещё. Мы так не можем: чтобы честно сказать «ваше внимание на 59%», нужны нормы
 * по возрасту и полу, которых у нас нет, и выдумывать их — то же самое, что обещать рост
 * IQ. В карточке Play мы прямо пишем, что этого не обещаем.
 *
 * Поэтому здесь процент — ДОЛЯ ТРЕНИРОВОК в области от всех тренировок. Это проверяемый
 * факт, а не оценка: он отвечает на вопрос «что я на самом деле качаю, а что обхожу
 * стороной». Перекос виден сразу, и с ним можно что-то сделать — в отличие от балла,
 * который непонятно как двигать.
 *
 * Рядом идёт СВОЙ К СВОЕМУ: средний результат в области за последние две недели против
 * предыдущих двух. Сравнение человека только с самим собой — единственное, на что мы
 * имеем право без норм.
 */

export interface AnalyticsSession {
  game_type: string;
  score?: number;
  timestamp?: string;
}

export interface AreaStat {
  /** Категория из реестра игр: memory, attention, logic, action, intuition, recovery. */
  area: string;
  /** Сколько партий сыграно в этой области. */
  sessions: number;
  /** Доля от всех партий, 0..1. Именно это показываем полосой. */
  share: number;
  /**
   * Сдвиг среднего результата: свежие две недели против предыдущих двух.
   * null — данных не хватает на честное сравнение, и тогда НИЧЕГО не рисуем.
   * Показать «0%» вместо «нет данных» — значит соврать про застой.
   */
  trend: number | null;
}

const HALF_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** Минимум партий в КАЖДОЙ половине окна, чтобы сравнение вообще что-то значило. */
export const MIN_FOR_TREND = 3;

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Разбивка по областям. `areaOf` отдаёт категорию по идентификатору игры — реестр
 * передаётся снаружи, чтобы функция оставалась чистой и проверялась без импорта экранов.
 */
export function areaBreakdown(
  sessions: readonly AnalyticsSession[],
  areaOf: (gameType: string) => string | undefined,
  now: number = Date.now(),
): AreaStat[] {
  const byArea = new Map<string, { all: number; recent: number[]; prev: number[] }>();

  for (const s of sessions) {
    const area = areaOf(s.game_type);
    if (!area) continue;                       // игра не из реестра — молча не приписываем никуда
    const rec = byArea.get(area) ?? { all: 0, recent: [], prev: [] };
    rec.all += 1;

    const t = s.timestamp ? Date.parse(s.timestamp) : NaN;
    const score = Number(s.score);
    if (Number.isFinite(t) && t <= now && Number.isFinite(score)) {
      const age = now - t;
      if (age <= HALF_WINDOW_MS) rec.recent.push(score);
      else if (age <= HALF_WINDOW_MS * 2) rec.prev.push(score);
    }
    byArea.set(area, rec);
  }

  const total = [...byArea.values()].reduce((a, r) => a + r.all, 0);
  const out: AreaStat[] = [];

  for (const [area, rec] of byArea) {
    let trend: number | null = null;
    if (rec.recent.length >= MIN_FOR_TREND && rec.prev.length >= MIN_FOR_TREND) {
      const before = avg(rec.prev);
      // Делить на ноль нельзя, и «рост с нуля» — не рост, а отсутствие базы.
      if (before > 0) trend = (avg(rec.recent) - before) / before;
    }
    out.push({ area, sessions: rec.all, share: total ? rec.all / total : 0, trend });
  }

  // Сверху — где занимаются больше всего: перекос читается с первой строки.
  return out.sort((a, b) => b.sessions - a.sessions);
}

/**
 * Область, которой человек занимается меньше всех. Для подсказки «что подтянуть».
 * null, если данных нет или всё ровно — выдумывать «слабое место» на пустом месте нельзя.
 */
export function weakestArea(stats: readonly AreaStat[]): string | null {
  const played = stats.filter((s) => s.sessions > 0);
  if (played.length < 2) return null;
  const min = played[played.length - 1];
  const max = played[0];
  // Разрыв меньше чем вдвое — это не перекос, а обычный разброс. Молчим.
  return max.sessions >= min.sessions * 2 ? min.area : null;
}

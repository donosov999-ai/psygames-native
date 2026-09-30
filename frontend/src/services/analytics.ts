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
   * Сдвиг результата: свежие две недели против предыдущих двух — у каждой игры своей
   * шкалой, затем среднее по играм области, взвешенное числом партий.
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
  type Halves = { recent: number[]; prev: number[] };
  const byArea = new Map<string, { all: number; games: Map<string, Halves> }>();

  for (const s of sessions) {
    const area = areaOf(s.game_type);
    if (!area) continue;                       // игра не из реестра — молча не приписываем никуда
    const rec = byArea.get(area) ?? { all: 0, games: new Map<string, Halves>() };
    rec.all += 1;

    const t = s.timestamp ? Date.parse(s.timestamp) : NaN;
    const score = Number(s.score);
    if (Number.isFinite(t) && t <= now && Number.isFinite(score)) {
      const age = now - t;
      const g = rec.games.get(s.game_type) ?? { recent: [], prev: [] };
      if (age <= HALF_WINDOW_MS) g.recent.push(score);
      else if (age <= HALF_WINDOW_MS * 2) g.prev.push(score);
      rec.games.set(s.game_type, g);
    }
    byArea.set(area, rec);
  }

  const total = [...byArea.values()].reduce((a, r) => a + r.all, 0);
  const out: AreaStat[] = [];

  for (const [area, rec] of byArea) {
    /*
     * 🔴 СДВИГ СЧИТАЕТСЯ У КАЖДОЙ ИГРЫ СВОЕЙ ШКАЛОЙ И ТОЛЬКО ПОТОМ СВОДИТСЯ В ОБЛАСТЬ.
     * Раньше сравнивался средний балл области как есть, а шкалы у игр разные: у дыхания
     * счёт — секунды, у паузы — минуты, у судоку — очки. Стоило в свежие две недели
     * сыграть больше игр с мелкой шкалой — и область «падала на 71 %», хотя ни в одной
     * игре результат не изменился (отчёт dfd6b290, 18.09.2026: «−71 %», «−54 %»).
     * Сдвиг области — среднее сдвигов её игр, взвешенное числом их партий в окне.
     */
    let sum = 0;
    let weight = 0;
    for (const g of rec.games.values()) {
      if (g.recent.length < MIN_FOR_TREND || g.prev.length < MIN_FOR_TREND) continue;
      const before = avg(g.prev);
      // Делить на ноль нельзя, и «рост с нуля» — не рост, а отсутствие базы.
      if (!(before > 0)) continue;
      const w = g.recent.length + g.prev.length;
      sum += w * ((avg(g.recent) - before) / before);
      weight += w;
    }
    const trend = weight > 0 ? sum / weight : null;
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

/* psygames-attention-measures · VER 1 · 07.09.2026 */
/**
 * МЕРЫ ПРОХОДА — то, что пишется в партию и по чему человека сравнивают с нормой.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Считать это внутри экрана можно, но тогда проверить
 * нечем: чтобы добраться до формулы, надо смонтировать экран и доиграть партию, а
 * это долго и хрупко. Величина, которую нельзя проверить дёшево, не проверяется
 * вовсе — и живёт с ошибкой. Здесь чистые функции над записями проб: гейт кормит
 * их придуманными партиями с известным ответом.
 *
 * ⚠️ Экраны обязаны ЗВАТЬ эти функции, а не считать своё рядом. Копия разойдётся
 * молча, и гейт будет стеречь формулу, которой в игре уже нет.
 */

/** Проба CPT в том виде, в каком её пишет экран (нужны только два поля). */
export interface TargetTrialLike { responded: boolean; trialIndex: number }

/**
 * ПАДЕНИЕ ТОЧНОСТИ К КОНЦУ ПАРТИИ (vigilance decrement по обнаружениям).
 *
 * Классический показатель бдительности — падение ДОЛИ пойманных целей со временем
 * на задаче. Это НЕ то же, что замедление: человек может отвечать так же быстро и
 * при этом пропускать всё больше. Цели делятся по порядку предъявления на четыре
 * четверти, в каждой считается доля пойманных, по четырём точкам берётся наклон МНК.
 * Отрицательный наклон = внимание падает.
 *
 * Порог 8 целей: при меньшем на четверть приходится одна-две цели, и доля скачет
 * между 0 и 1 — это шум, а не биомаркер. Ниже порога честнее вернуть null, чем число.
 */
export function vigilanceAccuracySlope(targets: TargetTrialLike[]): { slope: number | null; byQuartile: number[] | null } {
  if (targets.length < 8) return { slope: null, byQuartile: null };
  const perQ = Math.floor(targets.length / 4);
  const byOrder = [...targets].sort((a, b) => a.trialIndex - b.trialIndex);
  const rates: number[] = [];
  for (let i = 0; i < 4; i++) {
    const slice = byOrder.slice(i * perQ, (i + 1) * perQ);
    rates.push(slice.filter((t) => t.responded).length / slice.length);
  }
  const xs = [1, 2, 3, 4], meanX = 2.5;
  const meanY = rates.reduce((a, b) => a + b, 0) / 4;
  const num = xs.reduce((acc, x, i) => acc + (x - meanX) * (rates[i] - meanY), 0);
  const den = xs.reduce((acc, x) => acc + Math.pow(x - meanX, 2), 0);
  return {
    slope: den > 0 ? Number((num / den).toFixed(4)) : 0,
    byQuartile: rates.map((r) => Number(r.toFixed(3))),
  };
}

/**
 * ХОДОВ ДО ПЕРЕХВАТА НОВОГО ПРАВИЛА (WCST).
 *
 * Вход — по одному числу на каждый состоявшийся сдвиг: сколько ходов прошло от
 * молчаливой смены правила до первого верного ответа по новому. Пусто (сдвигов не
 * было) → null, а НЕ 0: ноль означал бы мгновенный перехват, которого не случалось.
 * Число сдвигов возвращается рядом со средним намеренно — среднее по одному сдвигу
 * и по пяти это разные по надёжности числа, и различить их можно только имея второе.
 */
export function ruleCatchStats(catches: number[]): { mean: number | null; shifts: number; trials: number[] | null } {
  if (!catches.length) return { mean: null, shifts: 0, trials: null };
  const mean = catches.reduce((a, b) => a + b, 0) / catches.length;
  return { mean: Number(mean.toFixed(2)), shifts: catches.length, trials: catches };
}

/**
 * ДОЛЯ ОШИБОК ТОРМОЖЕНИЯ (go/no-go).
 *
 * Делится на ФАКТИЧЕСКИ показанные не-мишени, а не на заданную долю: в короткой
 * партии они расходятся, и деление на номинал завышало бы или занижало показатель
 * молча. Не показано ни одной не-мишени → null: делить не на что.
 */
export function commissionRate(commissions: number, nonTargetsShown: number): number | null {
  if (nonTargetsShown <= 0) return null;
  return Number((commissions / nonTargetsShown).toFixed(3));
}

/**
 * 🔴 ТРУДНОСТЬ РАСТЁТ ПО КРИВОЙ, А НЕ ПИЛОЙ ОТ ФОРМЫ ДОСКИ.
 *
 * ЗАМЕР, РАДИ КОТОРОГО ЭТО НАПИСАНО (02.09.2026, симуляция игрока средней силы,
 * 12 партий на уровень, 40 уровней): корреляция номера уровня со средним числом
 * ходов была **−0,063**. То есть заявленная сложность не значила ничего. В отчёте
 * агента 30.08 стояло «0,09» — тот же вывод, но причина там названа не была.
 *
 * Причина нашлась здесь: форму доски выбирал цикл `((L−3) × 7) % длина`, а формы
 * в списке содержат от 6 до 16 ниш. Число видов товара считается от числа ниш —
 * значит вместе с рисунком скакала вся трудность:
 *
 *   L17 — 4 типа, 6 ниш (легче первого уровня)
 *   L18 — 13 типов, 16 ниш (стена)
 *
 * Лечение: `targetSlots(L)` задаёт ОБЪЁМ, а форма выбирается среди тех, чей объём
 * ближе к цели, — рисунок продолжает меняться, трудность идёт по кривой.
 * После правки корреляция **0,707**.
 *
 * ⚠️ ЧЕМ МЕРИМ. Полный перебор здесь неприменим: дерево партии не влезает ни в
 * какой бюджет (проверено — BFS не дошёл до дна ни на одном уровне из тридцати).
 * Симулятор смотрит на один ход вперёд, как игрок средней силы. Его АБСОЛЮТНАЯ
 * доля провалов завышена — плотные доски он не берёт, хотя `solvableStrict`
 * подтверждает их решаемость (6/6 на L21…L37). Поэтому проверяем ОТНОСИТЕЛЬНУЮ
 * меру: связь номера уровня с числом ходов, а не «проходит ли симулятор».
 */
import { dealBoard, levelCfg, targetSlots, typeBudget, TYPES_ON_BOARD_MAX, strictPlacement } from '../../app/games/goods-sort';

/** Игрок средней силы: выбирает лучший ход из видимых, на один шаг вперёд. */
function playGreedy(cells0: number[][], caps: number[], rnd: () => number, maxMoves = 400): number | null {
  const b = cells0.map((c) => [...c]);
  const cap = (i: number) => caps[i] ?? 3;
  let moves = 0;
  const done = () => b.every((c) => c.length === 0);
  while (!done() && moves < maxMoves) {
    const opts: { f: number; t: number; score: number }[] = [];
    for (let f = 0; f < b.length; f++) {
      if (!b[f].length) continue;
      const item = b[f][b[f].length - 1];
      for (let t = 0; t < b.length; t++) {
        if (t === f || b[t].length >= cap(t)) continue;
        const same = b[t].filter((x) => x === item).length;
        let score = 1;
        if (same === 2 && b[t].length === 2) score = 100;      // завершает тройку
        else if (same > 0) score = 40 + same * 10;             // кладёт к своим
        else if (b[t].length === 0) score = 10;                // в пустую нишу
        if (b[f].length === 1) score += 5;                     // освобождает нишу целиком
        opts.push({ f, t, score });
      }
    }
    if (!opts.length) return null;
    const best = Math.max(...opts.map((o) => o.score));
    const good = opts.filter((o) => o.score >= best - 5);
    const pick = good[Math.floor(rnd() * good.length)];
    const item = b[pick.f].pop()!;
    b[pick.t].push(item);
    const top = b[pick.t];
    if (top.length >= 3 && top.slice(-3).every((x) => x === item)) top.splice(-3, 3);
    moves++;
  }
  return done() ? moves : null;
}

/** Детерминированный генератор: замер обязан повторяться от прогона к прогону. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

const POOL = Array.from({ length: 34 }, (_, i) => i);

describe('кривая трудности сортировки', () => {
  it('кривая объёма не убывает начиная с третьего уровня', () => {
    /**
     * ⚠️ Первые два уровня — исключение, и намеренное: там полная доска 3×3
     * (девять ниш), потому что правило объясняется на простой фигуре, а не на
     * вырезанной. С третьего начинаются формы, и объём там сперва 8 — это НЕ
     * усложнение и не облегчение, а смена рисунка при почти том же объёме.
     */
    /**
     * ⚠️ СТРОГИЕ УРОВНИ — ЗАКОННОЕ ИСКЛЮЧЕНИЕ, и это не послабление кривой.
     * Правило «класть только к такому же» само по себе тяжелее любой прибавки
     * ниш, поэтому доска там на ступень МЕНЬШЕ (канон Royal Match: трудный
     * уровень — меньше сущностей, но глубже). Проверяем монотонность по
     * обычным уровням, а строгие — отдельной проверкой ниже.
     */
    for (let L = 4; L <= 60; L++) {
      if (strictPlacement(L) || strictPlacement(L - 1)) continue;
      expect(`L${L}: ${targetSlots(L)}`).toBe(`L${L}: ${Math.max(targetSlots(L - 1), targetSlots(L))}`);
    }
    // И само исключение существует: иначе строка выше молча проверяла бы всё подряд.
    const строгие: number[] = [];
    for (let L = 1; L <= 60; L++) if (strictPlacement(L)) строгие.push(L);
    expect(строгие.length).toBeGreaterThan(3);
    for (const L of строгие) expect(targetSlots(L)).toBeLessThanOrEqual(12);
    expect(targetSlots(1)).toBe(9);
    for (let L = 1; L <= 60; L++) expect(targetSlots(L)).toBeLessThanOrEqual(16);   // доска 4×4
    expect(targetSlots(50)).toBeGreaterThan(targetSlots(5));                        // рост есть
  });

  it('🔴 число ниш следует кривой, а не рисунку формы', () => {
    const мимо: string[] = [];
    for (let L = 3; L <= 60; L++) {
      const cfg = levelCfg(L, POOL.length, false);
      const было = cfg.mask.filter(Boolean).length;
      // Формы дискретны, точного попадания не требуем — но промах больше двух ниш
      // означает, что объём снова диктует рисунок, а не кривая.
      if (Math.abs(было - targetSlots(L)) > 2) мимо.push(`L${L}: ниш ${было}, цель ${targetSlots(L)}`);
    }
    expect(мимо).toEqual([]);
  });

  it('🔴 соседние уровни не отличаются втрое по числу видов', () => {
    const скачки: string[] = [];
    for (let L = 2; L <= 60; L++) {
      const a = levelCfg(L - 1, POOL.length, false).types;
      const b = levelCfg(L, POOL.length, false).types;
      // Именно это было главным симптомом: L17 — 4 вида, L18 — 13.
      if (Math.max(a, b) > Math.min(a, b) * 2) скачки.push(`L${L - 1}→L${L}: ${a}→${b}`);
    }
    expect(скачки).toEqual([]);
  });

  it('потолок видов оставляет манёвр на полной доске', () => {
    /**
     * ⚠️ ПОТОЛОК У ДОСКИ, А НЕ У ШКАЛЫ. Сначала я поставил его в `typeBudget` —
     * и сломал пороги открытия наборов: по той же функции считается, с какого
     * уровня набор начинает «упираться» в игру, и наборы шире потолка перестали
     * открываться вовсе («Зверята» получили порог 1000). Шкала растёт без предела,
     * а ограничена РАЗДАЧА.
     */
    expect(typeBudget(1)).toBe(4);                            // шкала: начинаем с четырёх
    expect(typeBudget(200)).toBeGreaterThan(TYPES_ON_BOARD_MAX);   // и растёт без предела
    const POOL2 = Array.from({ length: 34 }, (_, i) => i);
    for (let L = 1; L <= 200; L++) {
      expect(levelCfg(L, POOL2.length, false).types).toBeLessThanOrEqual(TYPES_ON_BOARD_MAX);
    }
  });

  it('🔴 заявленная сложность связана с реальной: корреляция ≥ 0,4', () => {
    /**
     * ⚠️ МЕРА — ДОЛЯ НЕВЗЯТЫХ ПАРТИЙ, А НЕ ЧИСЛО ХОДОВ.
     *
     * Первая редакция считала корреляцию по среднему числу ходов и падала не на
     * корреляции, а на нехватке точек: симулятор берёт плотные доски редко, и на
     * половине уровней среднее не из чего составить. Доля невзятых определена на
     * КАЖДОМ уровне и растёт вместе с трудностью — на ней замер устойчив.
     *
     * Числа замера 02.09.2026 (40 уровней, 12 партий): по ходам было −0,063 →
     * стало 0,707; по доле невзятых 0,338 → 0,687.
     */
    const rnd = mulberry(20260902);
    const Ls: number[] = [], провал: number[] = [], ходыL: number[] = [], ходы: number[] = [];
    for (let L = 1; L <= 24; L++) {
      const m: number[] = []; let fails = 0;
      for (let r = 0; r < 8; r++) {
        const d = dealBoard(L, POOL, false);
        const res = playGreedy(d.cells, d.cells.map(() => 3), rnd);
        if (res === null) fails++; else m.push(res);
      }
      Ls.push(L); провал.push(fails / 8);
      if (m.length >= 3) { ходыL.push(L); ходы.push(m.reduce((a, b) => a + b, 0) / m.length); }
    }
    expect(Ls.length).toBe(24);
    const rПровал = pearson(Ls, провал);
    expect(`корреляция по доле невзятых ${rПровал.toFixed(3)}`)
      .toBe(`корреляция по доле невзятых ${rПровал.toFixed(3)}`);
    // Порог 0,4 с запасом от замеренных 0,687: мутация «верни цикл форм» краснит гейт.
    expect(rПровал).toBeGreaterThanOrEqual(0.4);
    // Если точек по ходам хватило — проверяем и их: две независимые меры лучше одной.
    if (ходыL.length >= 10) expect(pearson(ходыL, ходы)).toBeGreaterThan(0);
  }, 300000);
});

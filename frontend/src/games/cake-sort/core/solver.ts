/* psygames-cake-sort-solver · VER 1 · 06.09.2026 */
/**
 * РЕШАТЕЛЬ ТОРТОВ: доказательство решаемости и честный минимум ходов.
 *
 * 🔴 ЗАЧЕМ ВООБЩЕ ДОКАЗЫВАТЬ. Это единственное, чем мы отличаемся от
 * конкурентов жанра: 454 отзыва разобранного конкурента жалуются на уровни,
 * которые нельзя пройти. Мы бракуем раздачу, если решатель НЕ подтвердил
 * решаемость.
 *
 * ⚠️ «БЮДЖЕТ КОНЧИЛСЯ» ≠ «НЕРЕШАЕМО». Тот же урок, что в сортировке товаров:
 * там из-за смешения этих двух ответов доску пересобирали до восьми раз по
 * ~90 мс и всё равно принимали последнюю. Здесь `solve` возвращает `exhausted`
 * отдельным флагом, и браковать разрешено только ДОКАЗАННУЮ нерешаемость.
 */
import { Board, CIRCLE, canPlace, collapse, isCleared, moveTop } from './plate';

export interface SolveResult {
  solvable: boolean;
  /** Бюджет исчерпан — ответ «не знаю», а не «нет». */
  exhausted: boolean;
  nodes: number;
}

/**
 * Ключ состояния. Тарелки СОРТИРУЮТСЯ: стол — множество тарелок, а не список,
 * и две раскладки, отличающиеся только порядком тарелок, — одно состояние.
 * Очередь в ключ входит длиной и содержимым: она часть задачи.
 */
function ключ(b: Board): string {
  return `${b.plates.map((p) => p.join(',')).sort().join('|')}#${b.queue.map((p) => p.join(',')).join('|')}`;
}

/**
 * Все законные ходы.
 *
 * `prune` — отсечение «не разбирай однородную тарелку в пустую». Сектор,
 * снятый с тарелки, где всё одного вида, и положенный в ПУСТУЮ, ровно
 * увеличивает разбросанность этого вида: ход, который придётся отменять своими
 * же руками. Слияние двух однородных тарелок отсекать нельзя — это как раз
 * полезный ход.
 *
 * ⚠️ ОТСЕЧЕНИЕ ОБЯЗАНО БЫТЬ ПРОВЕРЕНО A/B, А НЕ ОБОСНОВАНО РАССУЖДЕНИЕМ.
 * Красивое рассуждение уже подводило: любое отсечение может срезать
 * единственное решение. Гейт `cake-sort-solver-cutoff` прогоняет доски с
 * отсечением и без и требует, чтобы вердикт совпал на всех.
 */
export function moves(b: Board, prune = true): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (let from = 0; from < b.plates.length; from += 1) {
    const src = b.plates[from] ?? [];
    if (!src.length) continue;
    const type = src[src.length - 1] as number;
    const однородна = src.every((s) => s === type);
    for (let to = 0; to < b.plates.length; to += 1) {
      if (to === from) continue;
      if (!canPlace(b, to, type)) continue;
      if (prune && однородна && (b.plates[to] ?? []).length === 0) continue;
      out.push({ from, to });
    }
  }
  return out;
}

export function solve(start: Board, budget = 20000, prune = true): SolveResult {
  const начало = collapse(start).board;
  if (isCleared(начало)) return { solvable: true, exhausted: false, nodes: 0 };
  const видели = new Set<string>([ключ(начало)]);
  const стек: Board[] = [начало];
  let nodes = 0;
  while (стек.length) {
    const b = стек.pop() as Board;
    if (++nodes > budget) return { solvable: false, exhausted: true, nodes };
    for (const m of moves(b, prune)) {
      const nb = moveTop(b, m.from, m.to);
      if (!nb) continue;
      if (isCleared(nb)) return { solvable: true, exhausted: false, nodes };
      const k = ключ(nb);
      if (видели.has(k)) continue;
      видели.add(k);
      стек.push(nb);
    }
  }
  return { solvable: false, exhausted: false, nodes };
}

/**
 * 🔴 ПУТЬ РЕШЕНИЯ ЦЕЛИКОМ, А НЕ ОДИН ХОД. И это не «заодно», а починка.
 *
 * Первая редакция отдавала только первый ход найденной ветки, а экран просил
 * подсказку заново после каждого хода. Гейт «если ходить только по подсказкам,
 * стол разбирается» покраснел на всех двенадцати столах: обход в глубину при
 * каждом вызове находит ДРУГОЙ путь, и два соседних совета отменяли друг друга —
 * подсказка честно ходила по кругу, оставаясь при этом законной на каждом шаге.
 *
 * Поэтому ищется ПУТЬ, а вызывающий его помнит и идёт по нему, пока не свернёт.
 * Тогда завершение гарантировано построением: путь — настоящее решение.
 */
export function solvePath(start: Board, budget = 20000): { from: number; to: number }[] | null {
  const начало = collapse(start).board;
  if (isCleared(начало)) return [];
  const видели = new Set<string>([ключ(начало)]);
  const стек: { b: Board; путь: { from: number; to: number }[] }[] = [{ b: начало, путь: [] }];
  let nodes = 0;
  while (стек.length) {
    const { b, путь } = стек.pop() as { b: Board; путь: { from: number; to: number }[] };
    if (++nodes > budget) return null;
    for (const m of moves(b)) {
      const nb = moveTop(b, m.from, m.to);
      if (!nb) continue;
      const далее = [...путь, m];
      if (isCleared(nb)) return далее;
      const k = ключ(nb);
      if (видели.has(k)) continue;
      видели.add(k);
      стек.push({ b: nb, путь: далее });
    }
  }
  return null;
}

/**
 * Подсказка — первый ход настоящего решения.
 *
 * ⚠️ Вернуть `null` честнее, чем выдумать: если за бюджет решение не нашлось,
 * подсказки нет, и экран обязан не тратить её счётчик.
 */
export function hintMove(start: Board, budget = 20000): { from: number; to: number } | null {
  const путь = solvePath(start, budget);
  return путь && путь.length ? (путь[0] as { from: number; to: number }) : null;
}

/** Доказано ли, что стол НЕ разбирается. Только этим разрешено браковать раздачу. */
export function provenUnsolvable(b: Board, budget = 20000): boolean {
  const r = solve(b, budget);
  return !r.solvable && !r.exhausted;
}

/**
 * НИЖНЯЯ ГРАНИЦА ЧИСЛА ХОДОВ — она же эвристика A*.
 *
 * Для каждого вида: он лежит в `k` тарелках, а собрать его надо в `⌈n / 6⌉`
 * кругов. Один ход уменьшает число тарелок с этим видом самое большее на
 * единицу, значит нужно минимум `k − ⌈n / 6⌉` ходов. Сумма по видам не
 * переоценивает — иначе A* перестал бы находить минимум, а не просто замедлился.
 *
 * ⚠️ Очередь считается наравне со столом: её сектора тоже придётся собирать,
 * и не учитывать их значило бы занизить границу до бесполезной.
 */
export function lowerBound(b: Board): number {
  const тарелок = new Map<number, number>();
  const всего = new Map<number, number>();
  for (const p of [...b.plates, ...b.queue]) {
    for (const t of new Set(p)) тарелок.set(t, (тарелок.get(t) ?? 0) + 1);
    for (const t of p) всего.set(t, (всего.get(t) ?? 0) + 1);
  }
  let h = 0;
  for (const [t, k] of тарелок) {
    h += Math.max(0, k - Math.ceil((всего.get(t) ?? 0) / CIRCLE));
  }
  return h;
}

export interface MinMovesResult {
  /** Минимум ходов; null — не уложились в бюджет. */
  moves: number | null;
  nodes: number;
}

/**
 * ЧЕСТНЫЙ МИНИМУМ ХОДОВ — A* по корзинам f = g + h.
 *
 * 🔴 ИМЕННО ЭТИМ МЕРЯЕТСЯ КАЛИБРОВКА, А НЕ ПРИКИДКОЙ. Сортировка товаров уже
 * заплатила за прикидку: эталон `types × 3` был завышен на треть, порог трёх
 * звёзд оказался недостижим на 95 % досок, и увидеть это можно было ТОЛЬКО
 * перебором. Число `REF_PER_TYPE = 2,2` оттуда снято под ТРОЙКИ и к шестёркам
 * отношения не имеет — здесь оно меряется заново (`cake-sort-reference`).
 *
 * ⚠️ ОТСЕЧЕНИЕ ЗДЕСЬ ВЫКЛЮЧЕНО ПО УМОЛЧАНИЮ (`prune = false`), в отличие от
 * `solve`. Отсечение отвечает на вопрос «решается ли», и там срезанная ветка
 * не меняет ответ, если решение есть на другой. Здесь вопрос другой — «за
 * сколько МИНИМУМ», — и срезанная ветка может унести именно кратчайший путь.
 * Скорость покупать ценой правильности того самого числа, ради которого всё и
 * считается, нельзя.
 */
export function minMoves(start: Board, budget = 40000, prune = false): MinMovesResult {
  const начало = collapse(start).board;
  if (isCleared(начало)) return { moves: 0, nodes: 0 };
  const корзины: { b: Board; g: number }[][] = [];
  const положить = (b: Board, g: number) => {
    const f = g + lowerBound(b);
    (корзины[f] ??= []).push({ b, g });
  };
  const видели = new Map<string, number>([[ключ(начало), 0]]);
  положить(начало, 0);
  let nodes = 0;
  for (let f = 0; f < корзины.length || f < 300; f += 1) {
    const пачка = корзины[f];
    if (!пачка) continue;
    while (пачка.length) {
      const { b, g } = пачка.pop() as { b: Board; g: number };
      if (isCleared(b)) return { moves: g, nodes };
      if (++nodes > budget) return { moves: null, nodes };
      if ((видели.get(ключ(b)) ?? Infinity) < g) continue;
      for (const m of moves(b, prune)) {
        const nb = moveTop(b, m.from, m.to);
        if (!nb) continue;
        const k = ключ(nb);
        const было = видели.get(k);
        if (было !== undefined && было <= g + 1) continue;
        видели.set(k, g + 1);
        положить(nb, g + 1);
      }
    }
  }
  return { moves: null, nodes };
}

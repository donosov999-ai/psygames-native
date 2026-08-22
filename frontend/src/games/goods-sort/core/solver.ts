/* psygames-goods-sort-solver · VER 1 · 22.08.2026 */
/**
 * РЕШАТЕЛЬ СОРТИРОВКИ: РАЗБИРАЕТСЯ ЛИ ДОСКА И ЧТО ДЕЛАТЬ ДАЛЬШЕ.
 *
 * 🔴 ЧЕМ БЫЛ ПЛОХ ПРЕЖНИЙ. Он считал ВСЕ ниши по три. С 18-го уровня ниши бывают
 * на два и на четыре, и выходило два вранья сразу: он разрешал себе положить
 * третий товар в нишу на ДВА и не замечал тройку в нише на ЧЕТЫРЕ. Замер
 * 22.08.2026: «решение», которым доска признавалась проходимой, содержало
 * невозможный ход на 69–100 % досок уровней 20+. То есть строгий уровень мог не
 * иметь решения, и проверка сама себе это разрешала.
 *
 * Здесь ёмкости приходят вместе с доской (`Board`) и забыть про них нельзя.
 */
import {
  type Board, capOf, collapseTriples, isCleared, moveTop, roomIn, tripleIn,
} from './board';

/** Ключ состояния: ниши равноправны, поэтому содержимое сортируем. */
function stateKey(board: Board): string {
  return board.cells.map((c, i) => `${capOf(board, i)}:${c.join('.')}`).sort().join('|');
}

export interface SolveResult {
  /** Доска разбирается. */
  solvable: boolean;
  /** Перебор упёрся в бюджет — ответ «нет» здесь означает «не знаю». */
  exhausted: boolean;
  /** Первый ход найденного решения, если оно есть. */
  firstMove: { from: number; to: number } | null;
}

/**
 * Разбирается ли доска строгой укладкой.
 *
 * ⚠️ БЮДЖЕТ ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. Перебор без потолка на плотной доске уходит в
 * минуты, а раздача идёт на глазах у человека. Упёрлись в бюджет — честно
 * говорим `exhausted`, а не выдаём «нерешаемо»: соврать про нерешаемость значит
 * заставить генератор бесконечно пересобирать нормальные доски.
 */
export function solveStrict(start: Board, budget = 20000): SolveResult {
  const seen = new Set<string>();
  let nodes = 0;
  let exhausted = false;
  let firstMove: { from: number; to: number } | null = null;

  const walk = (board: Board, depth: number): boolean => {
    if (isCleared(board)) return true;
    if (++nodes > budget) { exhausted = true; return false; }
    const key = stateKey(board);
    if (seen.has(key)) return false;
    seen.add(key);

    /**
     * ПОРЯДОК ХОДОВ РЕШАЕТ ВСЁ. Сначала пробуем те, что складывают тройку, потом
     * те, что кладут к своему типу, и лишь потом переезды в пустую нишу: без
     * этого перебор упирается в бюджет вместо ответа.
     */
    const moves: { from: number; to: number; rank: number }[] = [];
    for (let from = 0; from < board.cells.length; from += 1) {
      const src = board.cells[from] ?? [];
      if (src.length === 0) continue;
      const type = src[src.length - 1] as number;
      for (let to = 0; to < board.cells.length; to += 1) {
        if (to === from || roomIn(board, to) <= 0) continue;
        const dst = board.cells[to] ?? [];
        if (dst.length > 0 && dst[dst.length - 1] !== type) continue;   // строгая укладка
        const sameCount = dst.filter((t) => t === type).length;
        const rank = sameCount + 1 >= 3 ? 0 : dst.length > 0 ? 1 : 2;
        moves.push({ from, to, rank });
      }
    }
    moves.sort((a, b) => a.rank - b.rank);

    for (const m of moves) {
      const next = moveTop(board, m.from, m.to, true);
      if (!next) continue;
      if (walk(next, depth + 1)) {
        if (depth === 0) firstMove = { from: m.from, to: m.to };
        return true;
      }
    }
    return false;
  };

  const solvable = walk(collapseTriples(start), 0);
  return { solvable, exhausted, firstMove };
}

/** Короткий ответ для генерации: доску отдавать человеку можно. */
export function solvableStrict(board: Board, budget = 20000): boolean {
  return solveStrict(board, budget).solvable;
}

/**
 * ЕСТЬ ЛИ ХОД ВООБЩЕ — распознавание тупика.
 *
 * 🔴 ЭТОГО НЕ БЫЛО ВОВСЕ. Ни в сортировке, ни в маджонге проверки тупика не
 * стояло: доска могла встать, и человек тыкал в мёртвую доску, не понимая, что
 * произошло. У игры-образца это отдельное состояние с прямым сообщением.
 */
export function hasAnyMove(board: Board, strict: boolean): boolean {
  for (let from = 0; from < board.cells.length; from += 1) {
    const src = board.cells[from] ?? [];
    if (src.length === 0) continue;
    const type = src[src.length - 1] as number;
    for (let to = 0; to < board.cells.length; to += 1) {
      if (to === from || roomIn(board, to) <= 0) continue;
      const dst = board.cells[to] ?? [];
      if (strict && dst.length > 0 && dst[dst.length - 1] !== type) continue;
      // Переезд из ниши в пустую нишу, где он ничего не меняет, ходом не считаем:
      // иначе «ход есть» будет вечно верным и тупик не наступит никогда.
      if (dst.length === 0 && src.length === 1) continue;
      return true;
    }
  }
  return false;
}

/**
 * Подсказка: ход, который ВЕДЁТ К РЕШЕНИЮ, а не просто законен.
 *
 * 🔴 ПРЕЖНЯЯ ПОДСКАЗКА НАЗЫВАЛА ХОДЫ, КОТОРЫЕ ИГРА ОТВЕРГАЛА. Она не знала ни
 * строгой укладки, ни ёмкостей: замер 22.08.2026 — от 29 до 91 % подсказок были
 * незаконны. Подсказка списывалась, человек тащил товар — и ничего не
 * происходило. Здесь ход берётся из настоящего решения.
 */
export function hintMove(board: Board, budget = 20000): { from: number; to: number } | null {
  return solveStrict(board, budget).firstMove;
}

/** Сколько троек ещё можно собрать в принципе: тип, которого меньше трёх, мёртв. */
export function unreachableTypes(board: Board): number[] {
  const count = new Map<number, number>();
  for (const cell of board.cells) for (const t of cell) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count.entries()].filter(([, n]) => n % 3 !== 0 || n === 0).map(([t]) => t);
}

/** Есть ли на доске сложенная тройка, которую просто не убрали. */
export function pendingTriple(board: Board): boolean {
  return board.cells.some((c) => tripleIn(c) !== null);
}

/**
 * ТУПИК НА ЖИВОЙ ДОСКЕ.
 *
 * ⚠️ ЖИВАЯ — ЭТО НЕ ВСЯ. Ниши под замком, под препятствием и вырезанные маской
 * ходов не дают: считать их значит вечно находить несуществующий ход и никогда
 * не объявлять тупик. Поэтому мёртвые ниши сюда приходят отдельным списком и
 * опустошаются перед подсчётом.
 *
 * И разобранная доска тупиком НЕ считается: там ходов нет потому, что всё
 * сделано. Сказать человеку «ходов больше нет» в момент победы — обиднее, чем
 * промолчать.
 */
export function isDeadEnd(board: Board, usable: readonly boolean[], strict: boolean): boolean {
  /**
   * ⚠️ У НЕДОСТУПНОЙ НИШИ МЕСТ НОЛЬ, А НЕ ПРОСТО ПУСТО. Первая редакция обнуляла
   * только содержимое, оставляя вместимость: запертая ниша продолжала считаться
   * местом, куда можно положить, и тупик не наступал никогда. Недоступна — значит
   * ни взять, ни положить.
   */
  const cells = board.cells.map((c, i) => (usable[i] === false ? [] : [...c]));
  const caps = board.caps.map((cap, i) => (usable[i] === false ? 0 : cap));
  const live = { cells, caps } as Board;
  if (isCleared(live)) return false;
  return !hasAnyMove(live, strict);
}

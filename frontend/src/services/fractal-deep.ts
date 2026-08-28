/* psygames-fractal-deep · VER 1 · 28.08.2026 */
/**
 * ФРАКТАЛ «ИХ МАСШТАБА» — дерево судоку глубиной в несколько слоёв.
 *
 * ЗАЧЕМ. Денис 28.08, по референсу Fractal Sudoku (Google Play, Gc13): «я хочу их
 * масштаб». Там 3 слоя и тысячи вложенных пазлов: за клеткой верхней сетки — целая
 * судоку, решаешь снизу вверх неделями. Наш существующий фрактал (fractal-sudoku.ts,
 * 2 слоя × 9 дочек, событие на час-два) ОСТАЁТСЯ КАК ЕСТЬ — «у нас как режим босса
 * это другое». Этот движок — отдельный, для марафонского режима.
 *
 * УСТРОЙСТВО.
 *   · Узел = судоку 9×9. Адрес узла — путь: '' корень, '4,7' — пазл под клеткой
 *     (4,7) корня, '4,7/1,2' — под клеткой (1,2) того пазла, и так до глубины D.
 *   · КОРМИМЫЕ клетки узла (их K штук, «ограничим вручную» — ручка feedCount)
 *     руками не заполняются: каждая скрыта своим пазлом слоем ниже. Реши его до
 *     порога — центральная клетка его решения отдаст цифру наверх (правило центра —
 *     как в референсе и в нашем боссе-фрактале). Остальные пустые — руками.
 *   · Листья (нижний слой) — обычные судоку банка с подсказками: там и начинается
 *     решение, ровно как в референсе («начните с самого глубокого уровня»).
 *
 * 🔴 ЛЕНИВАЯ ДЕТЕРМИНИРОВАННАЯ МАТЕРИАЛИЗАЦИЯ — единственный способ унести масштаб.
 * Полная партия глубины 3 — это тысячи досок; породить их разом нельзя ни по
 * времени, ни по памяти, ни по снимку незаконченной партии. Поэтому узел РОЖДАЕТСЯ
 * ПРИ ПЕРВОМ ВХОДЕ от пары (зерно партии, путь) и всегда рождается одинаковым:
 * снимок партии хранит только тронутые узлы, остальное дерево живёт в зерне.
 *
 * 🔴 ДОСКИ — ИЗ БАНКА, цифры — РЕЛЕЙБЛОМ. Банк (893 916 досок с посчитанным SE,
 * общественное достояние) отдаёт валидную доску с единственным решением за доли
 * миллисекунды. Ограничение узла одно: центр его решения обязан равняться цифре
 * родительской клетки. Судоку инвариантна к перестановке цифр, поэтому достаточно
 * ОБМЕНЯТЬ две цифры (центральную ↔ требуемую) во всей доске: рейтинг, единственность
 * и подсказки сохраняются по построению. Генерации «с нуля» здесь нет вовсе.
 *
 * ⚠️ ВЫБОР ДОСКИ НЕ ЗАВИСИТ ОТ КОРМЯЩЕЙ ЦИФРЫ. Зерно выбора — (партия, путь,
 * полоса); цифра приходит отдельным аргументом и влияет только на релейбл. Это
 * позволяет считать размеры дерева (blanks, кормимые) БЕЗ решения досок — счёт
 * партии из тысяч пазлов стоит десятки миллисекунд, а не минуты (см. countDeep).
 */
import { type Cell, solve } from '@/src/services/sudoku-core';
import { makeRng, normalizeSeed } from '@/src/services/seed';
import {
  BANK_N, BANK_BR, BANK_BC, bankPool, bankRatingForLevel,
} from '@/src/services/sudoku-bank';

export const DEEP_N = BANK_N;
/** Центр доски — клетка, чья цифра решения уходит в родителя (правило референса). */
export const DEEP_FEED_CELL: readonly [number, number] = [4, 4];

/** Путь узла: '' — корень, 'r,c' — под клеткой корня, 'r,c/r,c' — слоем ниже. */
export type DeepPath = string;

export interface DeepCfg {
  /** Слоёв всего, включая корень: 2 или 3 (у референса 3). */
  depth: number;
  /** Полоса рейтинга банка для всех узлов партии (сложность досок). */
  rating: number;
  /**
   * Сколько клеток узла кормится снизу: число ИЛИ 'all' (каждая пустая — как в
   * полном масштабе референса). Это и есть ручное ограничение объёма партии.
   */
  feedCount: number | 'all';
  /** Доля дырок узла, которую надо закрыть, чтобы он отдал цифру наверх (0..1]. */
  unlockShare: number;
}

/** Узел без решения — для счёта и карточек. Решение считается отдельно (12 мс). */
export interface DeepPick {
  path: DeepPath;
  puzzle: Cell[][];
  blanks: number;
  /** Порог открытия: закрыл столько дырок — узел отдаёт цифру наверх. */
  unlockCells: number;
  /** Кормимые клетки (руками не заполняются; под каждой — узел слоем ниже). У листьев пусто. */
  feedCells: [number, number][];
  rating: number;
}

/** Полный узел: то же плюс решение (для партии). */
export interface DeepNode extends DeepPick {
  solution: Cell[][];
}

// ─────────────────────────── путь ───────────────────────────

export function childPath(parent: DeepPath, r: number, c: number): DeepPath {
  return parent === '' ? `${r},${c}` : `${parent}/${r},${c}`;
}

/** Родитель и клетка, под которой живёт узел. Для корня — null. */
export function parentOf(path: DeepPath): { parent: DeepPath; cell: [number, number] } | null {
  if (path === '') return null;
  const i = path.lastIndexOf('/');
  const leaf = i < 0 ? path : path.slice(i + 1);
  const [r, c] = leaf.split(',').map(Number);
  return { parent: i < 0 ? '' : path.slice(0, i), cell: [r ?? 0, c ?? 0] };
}

/** Глубина узла: 0 — корень. */
export function depthOf(path: DeepPath): number {
  return path === '' ? 0 : path.split('/').length;
}

// ─────────────────────────── материализация ───────────────────────────

function pickBoard(seed: string, path: DeepPath, rating: number): { puzzle: Cell[][]; rating: number } {
  const pool = bankPool(rating);
  if (pool.length === 0) throw new Error(`fractal-deep: полоса ${rating} пуста`);
  const rng = makeRng(`fractal-deep|${normalizeSeed(seed)}|${path}|R${Math.round(rating * 10)}`);
  const row = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]!;
  const puzzle: Cell[][] = [];
  for (let r = 0; r < DEEP_N; r++) {
    const line: Cell[] = [];
    for (let c = 0; c < DEEP_N; c++) line.push(row.p.charCodeAt(r * DEEP_N + c) - 48);
    puzzle.push(line);
  }
  return { puzzle, rating: row.r };
}

/**
 * Кормимые клетки узла: детерминированная выборка из его дырок. Перемешивание
 * зерном — чтобы пунктирные клетки были разбросаны по доске, как в референсе,
 * а не сбивались в первый ряд. 'all' — каждая пустая (полный масштаб).
 */
function pickFeedCells(seed: string, path: DeepPath, puzzle: Cell[][], want: number | 'all'): [number, number][] {
  const empties: [number, number][] = [];
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (puzzle[r]![c] === 0) empties.push([r, c]);
  if (want === 'all') return empties;
  const rng = makeRng(`fractal-deep-feed|${normalizeSeed(seed)}|${path}`);
  for (let i = empties.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [empties[i], empties[j]] = [empties[j]!, empties[i]!];
  }
  return empties.slice(0, Math.max(0, Math.min(want, empties.length)));
}

/** Узел БЕЗ решения — дёшево (без перебора), для счёта дерева и карточек. */
export function materializePick(seed: string, path: DeepPath, cfg: DeepCfg): DeepPick {
  const { puzzle, rating } = pickBoard(seed, path, cfg.rating);
  let blanks = 0;
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (puzzle[r]![c] === 0) blanks++;
  // Листья детей не заводят: глубина кончилась — это обычные судоку с подсказками.
  const isLeaf = depthOf(path) >= cfg.depth - 1;
  const feedCells = isLeaf ? [] : pickFeedCells(seed, path, puzzle, cfg.feedCount);
  const unlockCells = Math.max(1, Math.min(blanks, Math.ceil(blanks * cfg.unlockShare)));
  return { path, puzzle, blanks, unlockCells, feedCells, rating };
}

/**
 * Полный узел. `feedDigit` — цифра родительской клетки (0 у корня): центр решения
 * обязан равняться ей, что достигается обменом двух цифр во всей доске. Обмен —
 * биекция на цифрах, поэтому валидность, единственность и рейтинг сохраняются.
 */
export function materializeNode(seed: string, path: DeepPath, cfg: DeepCfg, feedDigit: number): DeepNode {
  const pick = materializePick(seed, path, cfg);
  const solution = pick.puzzle.map((row) => [...row]);
  if (!solve(solution, DEEP_N, BANK_BR, BANK_BC, 'none')) {
    throw new Error('fractal-deep: доска банка не решилась — банк повреждён');
  }
  if (feedDigit > 0) {
    const centre = solution[DEEP_FEED_CELL[0]]![DEEP_FEED_CELL[1]]!;
    if (centre !== feedDigit) {
      const swap = (g: Cell[][]) => {
        for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) {
          const v = g[r]![c];
          if (v === centre) g[r]![c] = feedDigit as Cell;
          else if (v === feedDigit) g[r]![c] = centre;
        }
      };
      swap(solution);
      swap(pick.puzzle);
    }
  }
  return { ...pick, solution };
}

/**
 * Цепочка от корня до узла включительно — каждому по дороге считается его кормящая
 * цифра из решения родителя. Это и есть «войти на глубину N»: экран держит цепочку,
 * а не всё дерево.
 */
export function materializeChain(seed: string, path: DeepPath, cfg: DeepCfg): DeepNode[] {
  const parts = path === '' ? [] : path.split('/');
  const chain: DeepNode[] = [materializeNode(seed, '', cfg, 0)];
  let cur: DeepPath = '';
  for (const part of parts) {
    const [r, c] = part.split(',').map(Number);
    const parent = chain[chain.length - 1]!;
    const digit = parent.solution[r ?? 0]![c ?? 0]!;
    cur = childPath(cur, r ?? 0, c ?? 0);
    chain.push(materializeNode(seed, cur, cfg, digit));
  }
  return chain;
}

// ─────────────────────────── размер партии ───────────────────────────

export interface DeepCount {
  /** Пазлов всего, включая корень. */
  total: number;
  /** По слоям: [1, узлов на глубине 1, …]. */
  byDepth: number[];
}

/**
 * Точный размер дерева партии — для ручки «ограничим вручную» на экране настройки:
 * человек до старта видит, во что ввязывается. Считается на picks (без решений),
 * поэтому даже партия из тысяч пазлов считается за десятки миллисекунд: листья не
 * материализуются вовсе — их число равно числу кормимых клеток предпоследнего слоя.
 */
export function countDeep(seed: string, cfg: DeepCfg): DeepCount {
  const byDepth: number[] = [1];
  let frontier: DeepPick[] = [materializePick(seed, '', cfg)];
  for (let d = 1; d < cfg.depth; d++) {
    const isLast = d === cfg.depth - 1;
    let n = 0;
    const next: DeepPick[] = [];
    for (const node of frontier) {
      n += node.feedCells.length;
      if (!isLast) {
        for (const [r, c] of node.feedCells) next.push(materializePick(seed, childPath(node.path, r, c), cfg));
      }
    }
    byDepth.push(n);
    frontier = next;
  }
  return { total: byDepth.reduce((a, b) => a + b, 0), byDepth };
}

/** Полоса банка для глубокой партии — той же лестницей, что у классики. */
export function deepRatingForLevel(level: number, shift = 0): number {
  return bankRatingForLevel(level, shift);
}

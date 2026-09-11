/* psygames-fractal-deep · VER 3 · 11.09.2026 */
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
import {
  type Cell, type CageMap, type ThermoPN, type Variant,
  solve, countSolutions, thermoFromSolution, generateThermoCages,
} from '@/src/services/sudoku-core';
import { makeRng, normalizeSeed } from '@/src/services/seed';
import {
  BANK_N, BANK_BR, BANK_BC, bankPool,
} from '@/src/services/sudoku-bank';
// ⚠️ Импорт стоял в ТЕЛЕ модуля с 29.08 (be1b2f09) и держал предупреждение import/first:
// tsc и все пробы на него зелены, ловит только линт. Замечание моё — чиню своё.
import { countSolutionsFast } from '@/src/services/fractal-sudoku';

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
  /**
   * ПРИПРАВА ЛИСТЬЕВ (§7е пп.56–57): термометры и клетки-суммы на нижнем слое.
   * Выключено — Бездна из чистой классики, как была. Включено — каждый лист по
   * жребию зерна получает термометр либо термометр с суммами, и за это у него
   * выкапываются лишние подсказки (см. spiceLeaf).
   */
  spice?: boolean;
}

/** Чем приправлен лист: ничем, термометрами, термометрами с клетками-суммами. */
export type DeepSpice = 'none' | 'thermo' | 'thermocage';

/** Приправа узла: правило + фигуры, согласованные с его решением. */
export interface DeepSeasoning {
  spice: DeepSpice;
  thermo?: ThermoPN;
  cages?: CageMap;
  /** Сколько подсказок выкопано сверх банковских — цена приправы. */
  dug: number;
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

/** Полный узел: то же плюс решение (для партии) и приправа листа. */
export interface DeepNode extends DeepPick, DeepSeasoning {
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
 * ПРИПРАВА ЛИСТА — термометры и клетки-суммы поверх банковской доски (§7е пп.56–57).
 *
 * 🔴 ЧЕГО ЭТО НЕ ДЕЛАЕТ. Не рисует фигуру вслепую и не ищет под неё доску: фигура
 * кладётся ПО ГОТОВОМУ РЕШЕНИЮ (`thermoFromSolution`, `generateThermoCages`) — тот
 * же порядок, которым лечили секундную сборку классики 23.08 (2 443 мс → 0,078 мс).
 * Решение по построению удовлетворяет и термометру, и суммам, поэтому противоречий
 * между правилами взяться неоткуда.
 *
 * 🔴 ПОЧЕМУ ПРИПРАВА ОБЯЗАНА ЧТО-ТО ОТНИМАТЬ. Термометр и суммы — это ДОПОЛНИТЕЛЬНЫЕ
 * подсказки: доска банка с ними становится не сложнее, а легче, и «вариант» вырождается
 * в украшение. Поэтому за приправу платят подсказками: копаем цифры из доски, пока
 * решение остаётся ЕДИНСТВЕННЫМ уже с учётом нового правила (`countSolutions` с
 * термометром и суммами). Единственность проверяется, а не предполагается.
 *
 * 🔴 ТОЛЬКО ЛИСТЬЯ. Выше листа часть клеток кормится снизу (`feedCells`) и руками не
 * заполняется: термометр, проходящий через такую клетку, требовал бы от человека
 * сравнить с цифрой, которой ещё нет. Лист — обычная судоку, там приправа честна.
 *
 * Жребий приправы — от зерна и пути, как всё в Бездне: узел, материализованный
 * заново после перезапуска, обязан прийти с тем же узором.
 */
export function spiceLeaf(
  seed: string,
  path: DeepPath,
  puzzle: Cell[][],
  solution: Cell[][],
  maxDig = 6,
): DeepSeasoning {
  const rng = makeRng(`fractal-deep-spice|${normalizeSeed(seed)}|${path}`);
  const roll = rng();
  const spice: DeepSpice = roll < 0.34 ? 'none' : roll < 0.67 ? 'thermo' : 'thermocage';
  if (spice === 'none') return { spice, dug: 0 };

  const thermo = thermoFromSolution(solution, DEEP_N, rng);
  const cages = spice === 'thermocage' ? generateThermoCages(solution, DEEP_N, rng) : undefined;
  const variant: Variant = spice === 'thermocage' ? 'thermocage' : 'thermo';

  // Термометр мог не сложиться (короткие пути) — тогда приправлять нечем.
  let hasThermo = false;
  for (let r = 0; r < DEEP_N && !hasThermo; r++) for (let c = 0; c < DEEP_N; c++) if (thermo[r]![c]) { hasThermo = true; break; }
  if (!hasThermo) return { spice: 'none', dug: 0 };

  const givens: [number, number][] = [];
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (puzzle[r]![c] !== 0) givens.push([r, c]);
  for (let i = givens.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [givens[i], givens[j]] = [givens[j]!, givens[i]!];
  }

  let dug = 0;
  for (const [r, c] of givens) {
    if (dug >= maxDig) break;
    const keep = puzzle[r]![c]!;
    puzzle[r]![c] = 0 as Cell;
    const probe = puzzle.map((row) => [...row]);
    const unique = countSolutions(
      probe, DEEP_N, BANK_BR, BANK_BC, variant, undefined, 2, { steps: 20000 },
      thermo, undefined, cages,
    ) === 1;
    if (unique) dug++;
    else puzzle[r]![c] = keep;
  }
  return { spice, thermo, cages, dug };
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
  // Приправа — только листу (у него нет кормимых клеток) и только когда её просили.
  const seasoning: DeepSeasoning = cfg.spice && pick.feedCells.length === 0
    ? spiceLeaf(seed, path, pick.puzzle, solution)
    : { spice: 'none', dug: 0 };
  // Выкопанные цифры меняют число дырок — значит и порог открытия. Считать его по
  // додырочному числу значило бы открывать узел раньше объявленной доли.
  let blanks = 0;
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (pick.puzzle[r]![c] === 0) blanks++;
  const unlockCells = Math.max(1, Math.min(blanks, Math.ceil(blanks * cfg.unlockShare)));
  return { ...pick, blanks, unlockCells, solution, ...seasoning };
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

// ─────────────────────────── порталы в глубине (X5) ───────────────────────────

/**
 * ПОРТАЛ БЕЗДНЫ — стык двух ЛИСТЬЕВ-СИБЛИНГОВ, перенос босс-приёма (fractal-sudoku,
 * FractalPortal) на ленивое дерево. Что переносит портал — НЕ ЦИФРУ, А ОГРАНИЧЕНИЕ:
 * обе стороны ДОВЫКОЛОТЫ (по одной подсказке банковской доски снято — dropCell) так,
 * что каждая порознь неоднозначна, а пересечение кандидатов портальной клетки даёт
 * вывод, которого нет ни в одной доске по отдельности.
 *
 * 🔴 ЧЕСТНОСТЬ ПАРЫ — КРИТЕРИЙ БОССА, НЕ ДОПУЩЕНИЕ: порознь countSolutions ≥ 2 у
 * обеих, вместе Σ_v sol(A|a=v)·sol(B|b=v) == 1. Пара берётся только при ровно 1 —
 * иначе доска с полным правом имела бы второе решение (класс бага «L30 evenodd»).
 *
 * 🔴 ПЛАН СТРОИТСЯ ОТ РЕШЕНИЯ РОДИТЕЛЯ. Кормящий своп цифр (centre↔feedDigit)
 * у листьев РАЗНЫЙ: цифра, общая до свопов, после них расходится. Поэтому
 * кандидаты сравниваются по УЖЕ свопнутым решениям (materializeNode с feedDigit
 * из решения родителя) — общая цифра портала совпадает у обеих сторон по
 * построению. Детерминизм: план = f(seed, путь родителя, cfg) при
 * детерминированном родителе.
 *
 * ⚠️ БЮДЖЕТ ПРОБ, ТИХАЯ ДЕГРАДАЦИЯ. Не нашлась честная пара за бюджет — у пары
 * порталов нет, партия живёт как раньше (тот же контракт, что фолбэки генератора).
 */
export interface DeepPortal {
  /** Пути двух листьев-сиблингов. */
  aPath: DeepPath;
  bPath: DeepPath;
  /** Портальные клетки (пустые в обеих досках): общая цифра решений. */
  aCell: [number, number];
  bCell: [number, number];
  /** Снятая подсказка на каждой стороне — добавленная дырка неоднозначности. */
  aDrop: [number, number];
  bDrop: [number, number];
  /** Общая цифра (после кормящих свопов) — для гейтов и подсветки ошибки. */
  digit: number;
}

const flatOf = (g: Cell[][], drop?: [number, number]): Int8Array => {
  const f = new Int8Array(DEEP_N * DEEP_N);
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) f[r * DEEP_N + c] = g[r]![c]!;
  if (drop) f[drop[0] * DEEP_N + drop[1]] = 0;
  return f;
};

/** Решений доски при закреплённой цифре в клетке (для суммы по цифрам портала). */
function solutionsWith(flat: Int8Array, cell: [number, number], v: number, limit: number): number {
  const f = Int8Array.from(flat);
  f[cell[0] * DEEP_N + cell[1]] = v;
  return countSolutionsFast(f, limit);
}

const PORTAL_PAIRS_PER_PARENT = 2;
const PORTAL_TRY_BUDGET = 36;   // проб (дроп×клетка) на пару; босс находит пары за десятки

/**
 * План порталов родителя предпоследнего слоя. Пары — из его feed-детей (там листья).
 * Возвращает найденные честные порталы (может быть пусто — бюджет).
 */
export function deepPortalsFor(seed: string, parentPath: DeepPath, cfg: DeepCfg, parentSolution: Cell[][]): DeepPortal[] {
  if (depthOf(parentPath) !== cfg.depth - 2) return [];   // порталы живут только на листьях
  const parent = materializePick(seed, parentPath, cfg);
  const feeds = parent.feedCells;
  if (feeds.length < 2) return [];
  const rng = makeRng(`fractal-deep-portal|${normalizeSeed(seed)}|${parentPath}`);
  const order = [...feeds];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }

  const portals: DeepPortal[] = [];
  const used = new Set<string>();
  for (let k = 0; k + 1 < order.length && portals.length < PORTAL_PAIRS_PER_PARENT; k += 2) {
    const [ar, ac] = order[k]!;
    const [br, bc] = order[k + 1]!;
    const aPath = childPath(parentPath, ar, ac);
    const bPath = childPath(parentPath, br, bc);
    if (used.has(aPath) || used.has(bPath)) continue;
    const A = materializeNode(seed, aPath, cfg, parentSolution[ar]![ac]!);
    const B = materializeNode(seed, bPath, cfg, parentSolution[br]![bc]!);

    // Кандидаты: подсказки для дропа и пустые клетки-порталы, своим rng — детерминировано.
    const givens = (n: DeepNode): [number, number][] => {
      const out: [number, number][] = [];
      for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (n.puzzle[r]![c] !== 0) out.push([r, c]);
      return out;
    };
    const holes = (n: DeepNode): [number, number][] => {
      const out: [number, number][] = [];
      for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) if (n.puzzle[r]![c] === 0) out.push([r, c]);
      return out;
    };
    const shuffleRng = <T,>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
      return a;
    };
    const aDrops = shuffleRng(givens(A));
    const bDrops = shuffleRng(givens(B));
    const aHoles = shuffleRng(holes(A));
    const bHoles = shuffleRng(holes(B));

    let found: DeepPortal | null = null;
    let tries = 0;
    outer:
    for (const aDrop of aDrops) {
      const aFlat = flatOf(A.puzzle, aDrop);
      if (countSolutionsFast(aFlat, 2) < 2) continue;   // дроп не раскрыл доску — дальше
      for (const bDrop of bDrops) {
        if (++tries > PORTAL_TRY_BUDGET) break outer;
        const bFlat = flatOf(B.puzzle, bDrop);
        if (countSolutionsFast(bFlat, 2) < 2) continue;
        // Портальные клетки: общая цифра решений, и пересечение обязано дать ровно 1.
        for (const aCell of aHoles.slice(0, 8)) {
          const digit = A.solution[aCell[0]]![aCell[1]]!;
          const bCell = bHoles.find(([r, c]) => B.solution[r]![c] === digit
            && !(r === bDrop[0] && c === bDrop[1]));
          if (!bCell) continue;
          if (aCell[0] === aDrop[0] && aCell[1] === aDrop[1]) continue;
          let joint = 0;
          for (let v = 1; v <= DEEP_N && joint <= 1; v++) {
            const na = solutionsWith(aFlat, aCell, v, 2);
            if (na === 0) continue;
            const nb = solutionsWith(bFlat, bCell, v, 2);
            joint += Math.min(2, na) * Math.min(2, nb);
          }
          if (joint === 1) {
            found = { aPath, bPath, aCell, bCell, aDrop, bDrop, digit };
            break outer;
          }
        }
      }
    }
    if (found) { portals.push(found); used.add(aPath); used.add(bPath); }
  }
  return portals;
}

/** Портал листа из плана его родителя (или null). Сторона: своя клетка/дроп первыми. */
export function portalOfLeaf(portals: DeepPortal[], leaf: DeepPath): { cell: [number, number]; drop: [number, number]; partnerPath: DeepPath; partnerCell: [number, number]; digit: number } | null {
  for (const p of portals) {
    if (p.aPath === leaf) return { cell: p.aCell, drop: p.aDrop, partnerPath: p.bPath, partnerCell: p.bCell, digit: p.digit };
    if (p.bPath === leaf) return { cell: p.bCell, drop: p.bDrop, partnerPath: p.aPath, partnerCell: p.aCell, digit: p.digit };
  }
  return null;
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

/**
 * ═══ ЛЕСТНИЦА ТРУДНОСТИ — ОТДЕЛЬНАЯ ОСЬ ОТ ОБЪЁМА (правка 11.09.2026) ═══
 *
 * 🔴 ЧТО БЫЛО НЕ ТАК. Полоса банка была ВПАЯНА в пресет объёма: scout = SE 1.2,
 * trek = 1.5, abyss = 1.7. Две разные вещи сидели на одной ручке, и это отнимало
 * ровно те партии, которые человек скорее всего и хочет: маленькой, но трудной —
 * не существовало; марафон на недели приходил всегда на самых лёгких досках банка.
 * Замер 11.09.2026: три полосы из 37 в RATING_LADDER, то есть 8% лестницы, и все
 * три — её нижние ступени.
 *
 * ⚠️ ПРИЧИНА ПОТОЛКА УСТАРЕЛА, А ПОТОЛОК ОСТАЛСЯ. В шапке PRESETS экрана написано
 * прямо: «полосы банка лёгкие нарочно: пометок в первой версии нет, доски обязаны
 * браться головой без карандаша». Пометки приехали в X5 (PencilMarksLayer, marks
 * в снимке партии) — условие, под которое ставился потолок, больше не выполняется,
 * а потолок остался стоять. Ограничение ставил я же, и снимать его было мне.
 *
 * ═══ ПОЧЕМУ ПОДПИСЬ — ИМЯ СТУПЕНИ, А НЕ ИМЯ ПРИЁМА ═══
 *
 * 🔴 ПЕРВАЯ ВЕРСИЯ ЭТОЙ ЛЕСТНИЦЫ ПОДПИСЫВАЛА ПОЛОСЫ ПРИЁМАМИ (голая пара, X-Wing) —
 * как плитки фрактала-босса. Замер это снял. 24 листа на полосу, оценка gradePuzzle,
 * 11.09.2026 — какая ступень техники реально нужна:
 *
 *     SE 1.2 → 1×11 2×13   SE 2.6 → 3×23 4×1    SE 3.4 → 4×12 5×6 6×6
 *     SE 1.5 → 1×9  2×15   SE 2.8 → 3×18 4×5    SE 3.6 → 4×20 6×4
 *     SE 1.7 → 2×12 3×12   SE 3.0 → 4×24        SE 3.8 → 7×6, молчит 18
 *     SE 2.0 → 2×11 3×9    SE 3.2 → 6×18 5×2 4×4
 *     SE 2.3 → 2×19 3×3
 *
 * Подпись приёмом была бы ОБЕЩАНИЕМ, и на половине полос оно не выполняется: на
 * SE 1.2 «голый одиночка» верен у 11 досок из 24, на SE 1.7 «скрытый одиночка» — у
 * 12 из 24, а на SE 3.4 обещанная скрытая пара выпадает у 6 из 24, зато голая пара
 * (то есть ступень НИЖЕ) — у 12. Чисто ложатся только три полосы: 2.6 (96%),
 * 3.0 (100%) и 3.2 (75%). Трёх честных подписей на шесть ступеней не хватает.
 *
 * Поэтому ступени названы ОТНОСИТЕЛЬНО — Начинающий…Крайность. Такая подпись обещает
 * только ПОРЯДОК, а порядок здесь настоящий: SE посчитан эталонным оценщиком по 894
 * тысячам досок и монотонен по построению. Опровергнуть относительную подпись
 * отдельная доска не может, в отличие от имени приёма.
 *
 * 🦥 Слова взяты готовые: `sudokuTier*` уже переведены и уже показываются картой
 * уровней классики (app/games/sudoku.tsx, SUDOKU_TIER_KEYS). Новых ключей эта ось не
 * просит ни одного — цена ключа здесь 11 локалей (src/contexts/translations/*.ts плюс
 * гейт i18n-coverage с нулевым долгом).
 *
 * ПОЧЕМУ ИМЕННО ЭТИ ШЕСТЬ ПОЛОС. Каждая — отдельное семейство приёмов по
 * RATING_LADDER, а не ровный шаг по числу: 1.2 голые одиночки · 1.7 скрытая
 * одиночка в строке/столбце · 2.6 указатели · 3.2 X-Wing · 4.5 W-Wing и простая
 * раскраска · 5.7 BUG. Ёмкость проверена: замер 11.09 — в каждой полосе банка ровно
 * 40 досок, пустых полос среди выбранных нет, партия глубины 3 собирается на каждой.
 *
 * ⚠️ ВЕРХ — 5.7, И ЭТО СУЖДЕНИЕ, А НЕ ЗАМЕР. Выше в банке лежат ещё 13 полос до 8.2,
 * и движок их берёт (проверено тем же замером — ни одна не падает). Не взяты они
 * потому, что в Бездне полоса действует на ВСЕ ~2800 узлов партии сразу: марафон, где
 * каждый лист требует длинных цепей, — это не «Крайность», а непроходимость. Сколько
 * времени человек тратит на доску SE 7.8, я не мерил и не называю. Если появится
 * режим «одна доска», полосы 5.8–8.2 готовы и ждут.
 */
export interface DeepBand {
  /** Полоса банка: по ней выбираются доски ВСЕХ узлов партии. */
  rating: number;
  /** Ключ словаря с читаемым именем ступени. Слова готовые — новых не заводим. */
  nameKey: string;
}

export const DEEP_BANDS: readonly DeepBand[] = [
  { rating: 1.2, nameKey: 'sudokuTierBeginner' },   // голые одиночки
  { rating: 1.7, nameKey: 'sudokuTierEasy' },       // скрытая одиночка в строке/столбце
  { rating: 2.6, nameKey: 'sudokuTierMedium' },     // указатели (pointing)
  { rating: 3.2, nameKey: 'sudokuTierHard' },       // X-Wing — 18 листьев из 24
  { rating: 4.5, nameKey: 'sudokuTierExpert' },     // W-Wing и простая раскраска
  { rating: 5.7, nameKey: 'sudokuTierExtreme' },    // BUG — вершина классических техник
];

/** Номер ступени трудности в границах таблицы. Чужое число не роняет партию. */
export function clampDeepBand(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.max(0, Math.min(DEEP_BANDS.length - 1, Math.floor(step)));
}

/** Полоса банка по ступени трудности. */
export function deepBandRating(step: number): number {
  return (DEEP_BANDS[clampDeepBand(step)] as DeepBand).rating;
}

/** Ключ имени ступени — для подписи на экране. */
export function deepBandName(step: number): string {
  return (DEEP_BANDS[clampDeepBand(step)] as DeepBand).nameKey;
}

// ─────────────────────────── партия: всплытие цифр ───────────────────────────

/** Наигранное по тронутым узлам: путь → доска руки (0 = пусто). */
export type DeepPlayed = Record<DeepPath, number[][]>;
/** Доступ к узлам — кэширует вызывающий (экран держит Map). */
export type NodeAt = (p: DeepPath) => DeepNode;

/**
 * 🔴 ЦИФРЫ СНИЗУ НЕ ХРАНЯТСЯ — ОНИ ВЫЧИСЛЯЮТСЯ. Значение кормимой клетки — это
 * вопрос «дорешан ли её ребёнок до порога», заданный прямо в момент чтения.
 * Так отмена хода в ребёнке, роняющая его ниже порога, сама забирает цифру из
 * родителя: второй бухгалтерии, которая могла бы разъехаться, просто нет.
 * (Ровно та ошибка, за которую фрактал-босс расплачивался с отменой 19.08.)
 */

/** Сколько СВОИХ клеток узла закрыто верно: подсказки и кормимые не в счёт. */
export function deepOwnSolved(node: DeepNode, grid: number[][] | undefined): number {
  if (!grid) return 0;
  const feed = new Set(node.feedCells.map(([r, c]) => `${r},${c}`));
  let n = 0;
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) {
    if (node.puzzle[r]![c] !== 0 || feed.has(`${r},${c}`)) continue;
    if (grid[r]?.[c] === node.solution[r]![c]) n++;
  }
  return n;
}

/** Закрытых клеток узла всего: свои руки + всплывшие от детей. */
export function deepNodeProgress(nodeAt: NodeAt, played: DeepPlayed, p: DeepPath): number {
  const node = nodeAt(p);
  let n = deepOwnSolved(node, played[p]);
  for (const [r, c] of node.feedCells) if (deepNodeDone(nodeAt, played, childPath(p, r, c))) n++;
  return n;
}

/** Узел отдал цифру наверх: закрыто не меньше порога. */
export function deepNodeDone(nodeAt: NodeAt, played: DeepPlayed, p: DeepPath): boolean {
  return deepNodeProgress(nodeAt, played, p) >= nodeAt(p).unlockCells;
}

/** Видимое значение клетки: подсказка → рука → всплывшая снизу цифра. */
export function deepValueAt(nodeAt: NodeAt, played: DeepPlayed, p: DeepPath, r: number, c: number): number {
  const node = nodeAt(p);
  const given = node.puzzle[r]![c]!;
  if (given !== 0) return given;
  const hand = played[p]?.[r]?.[c] ?? 0;
  if (hand !== 0) return hand;
  if (node.feedCells.some(([fr, fc]) => fr === r && fc === c) && deepNodeDone(nodeAt, played, childPath(p, r, c))) {
    return node.solution[r]![c]!;
  }
  return 0;
}

/** Корень собран верно и целиком — победа партии. */
export function deepRootComplete(nodeAt: NodeAt, played: DeepPlayed): boolean {
  const root = nodeAt('');
  for (let r = 0; r < DEEP_N; r++) for (let c = 0; c < DEEP_N; c++) {
    if (deepValueAt(nodeAt, played, '', r, c) !== root.solution[r]![c]) return false;
  }
  return true;
}

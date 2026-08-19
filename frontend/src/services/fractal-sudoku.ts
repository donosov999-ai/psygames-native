/**
 * fractal-sudoku — судоку, вложенная сама в себя.
 *
 * ЗАЧЕМ. Разобрано по фото карточки, которые прислал Денис: за каждой клеткой верхней
 * сетки спрятана целая судоку. Решаешь снизу вверх, слой за слоем, пока не вскроешь
 * корневую. Как мега-босс — событие на несколько часов.
 *
 * ⚠️ ГЛУБИНА ДВА — СОЗНАТЕЛЬНЫЙ ПРЕДЕЛ. У оригинала 6555 пазлов, очевидно заготовленных
 * заранее. У нас доска строится на лету, поэтому здесь корень + девять дочерних = 10
 * сеток. Глубина три (91 сетка) структурой держится, но только заготовками.
 *
 * ═══ ЧТО БЫЛО СЛОМАНО (замер 19.08.2026, до этой правки) ═══
 *
 * 1. ИГРА НЕ ВЫИГРЫВАЛАСЬ ВООБЩЕ, НИ НА ОДНОМ УРОВНЕ. Победа проверяла полное
 *    совпадение корня с решением, но заполнялись в корне ровно девять клеток —
 *    те, что приходят снизу. Остальные (в среднем 51 на 15-м уровне) не заполнял
 *    никто и никогда: ввода в корень на экране не было. 0 побед из 30 партий.
 * 2. РЕШЕНИЕ НЕ БЫЛО ЕДИНСТВЕННЫМ. Дырки копались случайно, без всякой проверки:
 *    0 из 270 дочерних сеток имели единственное решение. Значит подсветка ошибки
 *    врала (игрок ставил ВАЛИДНУЮ цифру, а сверка с зашитым solution считала её
 *    ошибкой), а «вывести логикой» было невозможно в принципе.
 * 3. СЛОЖНОСТЬ РОСЛА ЧИСЛОМ ДЫРОК НАУГАД. Ровно та ось, на которой сломался
 *    обычный судоку («с 30 по 34 сложность не меняется» — репорт Вали), и ровно
 *    от неё там ушли в градацию по технике решения (см. sudoku-grade.ts).
 *
 * ═══ КАК ЧИНИМ ═══
 *
 * Дырки копаются ТОЛЬКО пока пазл остаётся решаемым вынужденной логикой в пределах
 * потолка техник уровня. Это даёт три вещи разом:
 *   • единственность решения бесплатно — если каждый шаг вынужден, ответ один;
 *   • отсутствие угадайки — замер показал, что «просто единственное решение» на
 *     56 дырках в 37% случаев требует перебора, то есть честной логикой не берётся;
 *   • сложность растёт СОДЕРЖАНИЕМ — какую технику приходится применить.
 *
 * ⚠️ ПОЧЕМУ СВОЙ РЕШАТЕЛЬ, А НЕ gradePuzzle ИЗ sudoku-grade. Замер: одна оценка
 * gradePuzzle на доске в 50 дырок — 10–27 мс. Проверка нужна на КАЖДОЕ выкалывание
 * (81 раз) и на КАЖДУЮ из десяти сеток: вышло бы 8–20 секунд на партию, то есть
 * намертво зависший экран. Здесь битовый решатель на тех же техниках: 0.03–0.3 мс
 * на прогон, вся партия — десятки миллисекунд. Номера ступеней берём из
 * TECHNIQUE_TIER, чтобы две лестницы не разъехались, а гейт
 * (__tests__/fractal-sudoku-solvable.test.ts) сверяет вердикты обоих решателей
 * и число решений — со штатным countSolutions ядра.
 */
import { makeRng, seededShuffle, type Rng } from '@/src/services/seed';
import { TECHNIQUE_TIER } from '@/src/services/sudoku-grade';
import { fractalLevel, type FractalLevelCfg } from '@/src/services/fractalLevels';

export const N = 9;
const CELLS = N * N;
const ALL = 0x1ff;

/**
 * Историческое имя порога: 17 — доказанный минимум подсказок, при котором судоку 9×9
 * ещё имеет единственное решение. Сам порог открытия теперь считается от РЕАЛЬНОГО
 * числа дырок конкретной сетки (см. FractalChild.unlockCells): число дырок больше не
 * задаётся сверху, его определяет логика, и фиксированные 17 могли бы оказаться
 * недостижимыми (порог выше числа выколотых клеток = сетка не открывается никогда).
 */
export const UNLOCK_CELLS = 17;

/** Клетка, чьё значение уходит родителю. Центр — потому что он дальше всех от краёв. */
export const FEED_CELL: readonly [number, number] = [4, 4];
const FEED_INDEX = FEED_CELL[0] * N + FEED_CELL[1];

export type Board = number[][];

/** Одна дочерняя сетка партии. */
export interface FractalChild {
  solution: Board;
  puzzle: Board;
  /** Клетка КОРНЯ, которую эта сетка открывает. */
  feedsCell: [number, number];
  /** Сколько клеток реально выколото — число получается из логики, а не задаётся. */
  blanks: number;
  /** Порог открытия именно этой сетки. Всегда ≤ blanks, иначе открыть её нельзя. */
  unlockCells: number;
  /** Самая сложная техника, без которой сетку не добить. */
  tier: number;
}

export interface FractalPuzzle {
  /** Корневая сетка: то, что человек собирает в итоге. */
  root: {
    solution: Board;
    puzzle: Board;
    blanks: number;
    tier: number;
    /**
     * Правда ли корень НЕЛЬЗЯ добить без цифр снизу. Если бы можно было, девять
     * дочерних оказались бы декорацией: игрок закрыл бы корень напрямую.
     */
    needsChildren: boolean;
  };
  children: FractalChild[];
  level: number;
}

// ─────────────────────── таблицы и зоны (считаются один раз) ───────────────────────

const BIT_TO_DIGIT = new Int8Array(512);
for (let d = 1; d <= N; d++) BIT_TO_DIGIT[1 << (d - 1)] = d;

const POPCOUNT = new Int8Array(512);
for (let m = 1; m < 512; m++) POPCOUNT[m] = POPCOUNT[m >> 1] + (m & 1);

const boxOf = (i: number) => (((i / 27) | 0) * 3) + (((i % 9) / 3) | 0);

/**
 * Маски позиций внутри зоны для техники «связанные кандидаты»: три позиции подряд
 * (в блоке — строка блока, в строке — клетки одного блока) и три через две
 * (в блоке — столбец блока). Считаются один раз, чтобы техника не собирала массивы.
 */
const TRIPLE_ROW = [0b000000111, 0b000111000, 0b111000000];
const TRIPLE_COL = [0b001001001, 0b010010010, 0b100100100];

/** Рабочий буфер техники «голая пара/тройка» — чтобы не аллоцировать массив на вызов. */
const SUBSET_BUF = new Int8Array(9);

/** 27 зон: девять строк, девять столбцов, девять блоков. */
const UNITS: number[][] = (() => {
  const u: number[][] = [];
  for (let r = 0; r < N; r++) u.push(Array.from({ length: N }, (_, c) => r * N + c));
  for (let c = 0; c < N; c++) u.push(Array.from({ length: N }, (_, r) => r * N + c));
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const cells: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cells.push((br * 3 + i) * N + bc * 3 + j);
    u.push(cells);
  }
  return u;
})();

/** 20 «соседей» клетки: своя строка, свой столбец, свой блок. */
const PEERS: Int8Array[] = (() => {
  const p: Int8Array[] = [];
  for (let i = 0; i < CELLS; i++) {
    const r = (i / N) | 0, c = i % N, b = boxOf(i);
    const set = new Set<number>();
    for (let k = 0; k < N; k++) { set.add(r * N + k); set.add(k * N + c); }
    for (let k = 0; k < CELLS; k++) if (boxOf(k) === b) set.add(k);
    set.delete(i);
    p.push(Int8Array.from(set));
  }
  return p;
})();

// ─────────────────────── быстрый перебор: сколько решений ───────────────────────

/**
 * Число решений, но не больше limit. Битовые маски + выбор клетки с наименьшим числом
 * кандидатов: 0.037 мс на прогон против 2.65 мс у штатного countSolutions ядра
 * (замер 19.08 на 200 досках, вердикты совпали 200/200). Разница в 70 раз и решает,
 * можно ли честно генерировать на телефоне.
 */
export function countSolutionsFast(flat: Int8Array, limit = 2): number {
  const grid = Int8Array.from(flat);
  const rows = new Int32Array(N), cols = new Int32Array(N), box = new Int32Array(N);
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (!v) continue;
    const m = 1 << (v - 1), r = (i / N) | 0, c = i % N, b = boxOf(i);
    if ((rows[r] | cols[c] | box[b]) & m) return 0;   // уже противоречие
    rows[r] |= m; cols[c] |= m; box[b] |= m;
  }
  let count = 0;
  const walk = (): boolean => {   // true = хватит, дошли до limit
    let bi = -1, bm = 0, bn = N + 1;
    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      const m = ALL & ~(rows[(i / N) | 0] | cols[i % N] | box[boxOf(i)]);
      if (m === 0) return false;
      const n = POPCOUNT[m];
      if (n < bn) { bn = n; bi = i; bm = m; if (n === 1) break; }
    }
    if (bi < 0) return ++count >= limit;
    const r = (bi / N) | 0, c = bi % N, b = boxOf(bi);
    let m = bm;
    while (m) {
      const t = m & -m; m ^= t;
      grid[bi] = BIT_TO_DIGIT[t]; rows[r] |= t; cols[c] |= t; box[b] |= t;
      const stop = walk();
      grid[bi] = 0; rows[r] ^= t; cols[c] ^= t; box[b] ^= t;
      if (stop) return true;
    }
    return false;
  };
  walk();
  return count;
}

// ─────────────────────── логический решатель (лестница техник) ───────────────────────

/**
 * Ступени берём из общей таблицы sudoku-grade, чтобы «третий уровень» значил одно и
 * то же в обеих играх. Выше naked_subset не поднимаемся: следующие техники стоят
 * дороже, а тридцати уровням хватает четырёх ступеней.
 */
export const FRACTAL_TIERS = {
  nakedSingle: TECHNIQUE_TIER.naked_single,   // 1 — в клетке остался один кандидат
  hiddenSingle: TECHNIQUE_TIER.hidden_single, // 2 — в зоне цифра помещается только сюда
  locked: TECHNIQUE_TIER.locked,              // 3 — цифра блока заперта в одной строке
  nakedSubset: TECHNIQUE_TIER.naked_subset,   // 4 — голая пара/тройка
} as const;

export const MAX_TIER = FRACTAL_TIERS.nakedSubset;

export interface LogicResult {
  /** Добита ли доска до конца ВЫНУЖДЕННЫМИ ходами, без единого перебора. */
  solved: boolean;
  /** Самая сложная понадобившаяся техника; 0 у уже полной доски. */
  tier: number;
}

/**
 * Решить вынужденной логикой, не применяя техник выше tierCap.
 *
 * ⚠️ ЗАЧЕМ ИМЕННО ТАК, А НЕ «ПРОСТО ЕДИНСТВЕННОЕ РЕШЕНИЕ». Единственность и решаемость
 * логикой — разные вещи: замер 19.08 на максимально выкопанных досках дал 37% пазлов
 * с единственным решением, которое НЕ достаётся ни одной техникой, только перебором.
 * Для игрока это неотличимо от угадайки.
 */
let solveCalls = 0;

/**
 * Счётчик прогонов логического решателя — РАБОТА, которую стоила генерация.
 *
 * ⚠️ ЗАЧЕМ ОН ЕСТЬ. Гейт раньше мерил генерацию часами («партия быстрее полусекунды»)
 * и покраснел 19.08 на общем прогоне: на машине шло три тяжёлых набора разом, load
 * average 73, и та же партия тридцатого уровня заняла 1016 мс вместо 143. Часы в
 * параллельном прогоне меряют загрузку машины, а не код — ровно та ошибка, от которой
 * лечили самурая (там генератор обрывал выкалывание по gameNow, и сложность зависела
 * от быстродействия телефона). Счётчик прогонов детерминирован и от машины не зависит.
 */
export const logicSolveCalls = (): number => solveCalls;
export const resetLogicSolveCalls = (): void => { solveCalls = 0; };

export function logicSolve(flat: Int8Array, tierCap: number = MAX_TIER): LogicResult {
  solveCalls++;
  const grid = Int8Array.from(flat);
  const cand = new Int32Array(CELLS);
  let empty = 0;
  for (let i = 0; i < CELLS; i++) if (!grid[i]) { cand[i] = ALL; empty++; }
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (!v) continue;
    const b = 1 << (v - 1);
    for (const p of PEERS[i]) if (!grid[p]) cand[p] &= ~b;
  }
  let tier = 0;
  let broken = false;

  const place = (i: number, b: number) => {
    grid[i] = BIT_TO_DIGIT[b];
    cand[i] = 0;
    empty--;
    for (const p of PEERS[i]) {
      if (grid[p]) continue;
      cand[p] &= ~b;
      if (cand[p] === 0) broken = true;
    }
  };

  /** Голый одиночка: в клетке остался один кандидат. */
  const nakedSingle = (): boolean => {
    let did = false;
    for (let i = 0; i < CELLS; i++) {
      if (grid[i]) continue;
      if (cand[i] === 0) { broken = true; return did; }
      if (POPCOUNT[cand[i]] === 1) { place(i, cand[i]); did = true; if (broken) return did; }
    }
    return did;
  };

  /** Скрытый одиночка: в зоне цифру можно поставить только в одну клетку. */
  const hiddenSingle = (): boolean => {
    let did = false;
    for (const unit of UNITS) {
      for (let d = 0; d < N; d++) {
        const b = 1 << d;
        let seen = 0, at = -1, filled = false;
        for (const i of unit) {
          if (grid[i]) { if (grid[i] === d + 1) { filled = true; break; } continue; }
          if (cand[i] & b) { seen++; at = i; }
        }
        if (filled) continue;
        if (seen === 0) { broken = true; return did; }
        if (seen === 1) { place(at, b); did = true; if (broken) return did; }
      }
    }
    return did;
  };

  /**
   * Связанные кандидаты. Две стороны одной монеты:
   *   • цифра блока помещается только в одну его строку → из остальной строки её убираем;
   *   • цифра строки помещается только в один её блок → из остального блока её убираем.
   * Техника ничего не ставит, только вычёркивает — после неё возвращаемся к одиночкам.
   */
  const locked = (): boolean => {
    let did = false;
    for (let d = 0; d < N; d++) {
      const b = 1 << d;
      for (let ui = 0; ui < UNITS.length; ui++) {
        const unit = UNITS[ui];
        // Маска ПОЗИЦИЙ внутри зоны (0..8), а не массив клеток: техника зовётся
        // десятки тысяч раз за партию, и каждый push/includes здесь стоил больше,
        // чем сама логика (замер: копание на третьей ступени было в 4 раза дороже второй).
        let spots = 0;
        let filled = false;
        for (let k = 0; k < N; k++) {
          const i = unit[k];
          if (grid[i]) { if (grid[i] === d + 1) { filled = true; break; } continue; }
          if (cand[i] & b) spots |= 1 << k;
        }
        if (filled || POPCOUNT[spots] < 2) continue;

        let target = -1;
        if (ui >= 18) {
          // Блок: цифра заперта в одной его строке (столбце) → чистим остаток строки (столбца).
          const boxRow = ((ui - 18) / 3) | 0, boxCol = (ui - 18) % 3;
          for (let j = 0; j < 3; j++) {
            if ((spots & ~TRIPLE_ROW[j]) === 0) target = boxRow * 3 + j;
            else if ((spots & ~TRIPLE_COL[j]) === 0) target = N + boxCol * 3 + j;
            if (target >= 0) break;
          }
        } else {
          // Строка (столбец): цифра заперта в одном блоке → чистим остаток блока.
          for (let j = 0; j < 3; j++) {
            if ((spots & ~TRIPLE_ROW[j]) !== 0) continue;
            target = ui < N ? 18 + ((ui / 3) | 0) * 3 + j : 18 + j * 3 + (((ui - N) / 3) | 0);
            break;
          }
        }
        if (target < 0) continue;

        const from = UNITS[ui], to = UNITS[target];
        for (let k = 0; k < N; k++) {
          const i = to[k];
          if (grid[i] || !(cand[i] & b)) continue;
          let inside = false;
          for (let q = 0; q < N; q++) if (from[q] === i) { inside = true; break; }
          if (inside) continue;
          cand[i] &= ~b;
          did = true;
          if (cand[i] === 0) { broken = true; return did; }
        }
      }
    }
    return did;
  };

  /**
   * Голая пара/тройка: k клеток зоны делят ровно k кандидатов — значит эти цифры
   * заняты ими, и из остальных клеток зоны их можно вычеркнуть.
   */
  const nakedSubset = (): boolean => {
    let did = false;
    for (const unit of UNITS) {
      // Позиции с 2–3 кандидатами. Держим в заранее выделенном буфере: техника —
      // самая горячая точка копания, и unit.filter() здесь аллоцировал массив
      // на каждый вызов (десятки тысяч за партию).
      let openN = 0;
      for (let k = 0; k < N; k++) {
        const i = unit[k];
        if (grid[i]) continue;
        const pc = POPCOUNT[cand[i]];
        if (pc >= 2 && pc <= 3) SUBSET_BUF[openN++] = k;
      }
      for (let a = 0; a < openN; a++) {
        for (let b2 = a + 1; b2 < openN; b2++) {
          const ka = SUBSET_BUF[a], kb = SUBSET_BUF[b2];
          const pairMask = cand[unit[ka]] | cand[unit[kb]];
          if (POPCOUNT[pairMask] > 3) continue;
          if (POPCOUNT[pairMask] === 2) did = wipe(unit, (1 << ka) | (1 << kb), pairMask, 2) || did;
          if (broken) return did;
          for (let c3 = b2 + 1; c3 < openN; c3++) {
            const kc = SUBSET_BUF[c3];
            const m3 = pairMask | cand[unit[kc]];
            if (POPCOUNT[m3] !== 3) continue;
            did = wipe(unit, (1 << ka) | (1 << kb) | (1 << kc), m3, 3) || did;
            if (broken) return did;
          }
        }
      }
    }
    return did;
  };

  /**
   * Вычеркнуть цифры группы из остальных клеток зоны.
   *
   * ⚠️ Маску пересчитываем ЗДЕСЬ, а не полагаемся на посчитанную раньше: вычёркивания
   * этого же прохода могли ужать кандидатов группы. Со старой маской группа выкинула бы
   * больше, чем имеет права, и решатель «решил» бы чужую доску, объявив единственность
   * там, где её нет.
   */
  function wipe(unit: number[], members: number, maskIn: number, size: number): boolean {
    let mask = 0;
    for (let k = 0; k < N; k++) if (members & (1 << k)) mask |= cand[unit[k]];
    if (POPCOUNT[mask] !== size || (mask & ~maskIn) !== 0) return false;
    let did = false;
    for (let k = 0; k < N; k++) {
      if (members & (1 << k)) continue;
      const i = unit[k];
      if (grid[i] || !(cand[i] & mask)) continue;
      cand[i] &= ~mask;
      did = true;
      if (cand[i] === 0) { broken = true; return did; }
    }
    return did;
  }

  for (;;) {
    if (broken) return { solved: false, tier: TECHNIQUE_TIER.guess };
    if (empty === 0) return { solved: true, tier };
    if (nakedSingle()) { tier = Math.max(tier, FRACTAL_TIERS.nakedSingle); continue; }
    if (tierCap >= FRACTAL_TIERS.hiddenSingle && hiddenSingle()) { tier = Math.max(tier, FRACTAL_TIERS.hiddenSingle); continue; }
    if (tierCap >= FRACTAL_TIERS.locked && locked()) { tier = Math.max(tier, FRACTAL_TIERS.locked); continue; }
    if (tierCap >= FRACTAL_TIERS.nakedSubset && nakedSubset()) { tier = Math.max(tier, FRACTAL_TIERS.nakedSubset); continue; }
    return { solved: false, tier: TECHNIQUE_TIER.guess };
  }
}

// ─────────────────────── сборка решённых сеток ───────────────────────

const emptyFlat = () => new Int8Array(CELLS);

function fits(flat: Int8Array, i: number, v: number): boolean {
  for (const p of PEERS[i]) if (flat[p] === v) return false;
  return true;
}

/** Заполнить сетку целиком перебором в случайном порядке цифр. */
function fill(flat: Int8Array, pos: number, rnd: Rng): boolean {
  if (pos === CELLS) return true;
  if (flat[pos]) return fill(flat, pos + 1, rnd);
  for (const v of seededShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd)) {
    if (!fits(flat, pos, v)) continue;
    flat[pos] = v;
    if (fill(flat, pos + 1, rnd)) return true;
    flat[pos] = 0;
  }
  return false;
}

const toBoard = (flat: Int8Array): Board =>
  Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => flat[r * N + c]));

const toFlat = (b: Board): Int8Array => {
  const f = emptyFlat();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) f[r * N + c] = b[r][c];
  return f;
};

/** Решённая сетка, у которой центр равен заданной цифре. */
export function solvedWithCenter(center: number, rnd: Rng = Math.random): Board {
  for (let attempt = 0; attempt < 60; attempt++) {
    const f = emptyFlat();
    f[FEED_INDEX] = center;
    if (fill(f, 0, rnd)) return toBoard(f);
  }
  throw new Error(`fractal: не удалось собрать сетку с центром ${center}`);
}

/**
 * Клетка корня, которую открывает дочерняя сетка с индексом i.
 *
 * Одна дочерняя на БЛОК корня, а не на клетку: девять сеток вместо восьмидесяти одной.
 * Отдаёт она центр своего блока — так связь видна на глаз, и человек понимает, что решил.
 */
export function rootCellForChild(i: number): [number, number] {
  const blockRow = Math.floor(i / 3), blockCol = i % 3;
  return [blockRow * 3 + 1, blockCol * 3 + 1];
}

// ─────────────────────── копание дырок ───────────────────────

interface DigOpts {
  /** Потолок дырок. Настоящий стопор — техника; потолок держит лёгкие уровни нестрашными. */
  cap: number;
  /** Потолок техники: выкалываем, только пока пазл берётся техниками не выше этой. */
  tier: number;
  /** Клетки, которые выкалывать нельзя (у корня — те, что придут снизу). */
  protect?: Set<number>;
  /** Клетки, которые гасим безусловно (центр дочерней — иначе цифру отдали бы даром). */
  forceOut?: number[];
}

function digByLogic(solution: Int8Array, opts: DigOpts, rnd: Rng): { flat: Int8Array; blanks: number; tier: number } {
  const p = Int8Array.from(solution);
  let blanks = 0;
  for (const i of opts.forceOut ?? []) if (p[i]) { p[i] = 0; blanks++; }
  const order = seededShuffle(Array.from({ length: CELLS }, (_, i) => i), rnd);
  for (const i of order) {
    if (blanks >= opts.cap) break;
    if (!p[i] || opts.protect?.has(i)) continue;
    const keep = p[i];
    p[i] = 0;
    if (logicSolve(p, opts.tier).solved) blanks++;
    else p[i] = keep;   // без этой цифры доска логикой не берётся — возвращаем
  }
  return { flat: p, blanks, tier: logicSolve(p, opts.tier).tier };
}

/**
 * То же копание, но с ПОЛОМ: уровень обязан не только «не быть сложнее потолка», но и
 * не оказаться легче своей ступени. Иначе случайный порядок выкалывания выдаёт на
 * двадцатом уровне доску, которая целиком добивается голыми одиночками, — и человек
 * честно говорит «сложность не растёт» (ровно репорт Вали по обычному судоку).
 *
 * Пол проверяется бесплатно: logicSolve идёт по техникам строго снизу вверх и берётся
 * за следующую, только когда предыдущие встали. Значит вернувшийся tier === потолок и
 * есть доказательство, что без верхней техники доска не добивается.
 *
 * Заходов немного: порядок выкалывания случайный, сложность от него пляшет, но платить
 * за идеал секундами на телефоне нельзя. Не попали — берём лучшую из попыток.
 */
function digToTier(solution: Int8Array, opts: DigOpts, rnd: Rng, attempts = 4) {
  let best = digByLogic(solution, opts, rnd);
  for (let k = 1; k < attempts && best.tier < opts.tier; k++) {
    const next = digByLogic(solution, opts, rnd);
    if (next.tier > best.tier || (next.tier === best.tier && next.blanks > best.blanks)) best = next;
  }
  return best;
}

// ─────────────────────── прогресс и порог открытия ───────────────────────

/**
 * Сколько клеток дочерней сетки уже решено. Считаем СОВПАДЕНИЯ с решением, а не просто
 * заполненность: неверная цифра — не прогресс, и открывать ею родителя нельзя.
 *
 * ⚠️ ПАРАМЕТР given ОБЯЗАТЕЛЕН НА ЖИВОМ ЭКРАНЕ. Без него считаются и подсказки задания,
 * а они с решением совпадают по определению: порог оказывается взят ДО первого хода,
 * все девять сеток открыты сразу, и вся конструкция теряет смысл. Поймано на первом же
 * запуске экрана 12.08 — девять плиток показали «17/17».
 */
export function solvedCount(current: Board, solution: Board, given?: boolean[][]): number {
  let n = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (given?.[r][c]) continue;
      if (current[r][c] !== 0 && current[r][c] === solution[r][c]) n++;
    }
  }
  return n;
}

/**
 * Открыта ли родительская клетка этой дочерней сеткой.
 *
 * @param threshold сколько верных клеток нужно. Живой экран берёт его из
 *   FractalChild.unlockCells — там он посчитан от РЕАЛЬНОГО числа дырок сетки.
 */
export function isUnlocked(current: Board, solution: Board, given?: boolean[][], threshold: number = UNLOCK_CELLS): boolean {
  return solvedCount(current, solution, given) >= threshold;
}

/**
 * Может ли человек поставить цифру в эту клетку корня.
 *
 * ⚠️ ПРАВИЛО ЖИВЁТ ЗДЕСЬ, А НЕ НА ЭКРАНЕ. Ровно на нём игра и сломалась: экран считал
 * корень картинкой, заполнял в нём только девять клеток, приходящих снизу, а победа
 * требовала полного совпадения с решением — и не наступала никогда. Теперь правило одно
 * на экран и на гейт: подсказка задания не редактируется, кормящая клетка приходит
 * снизу (подставить её руками значило бы обойти всю игру), остальное — поле человека.
 */
export function rootEditable(rootPuzzle: Board, r: number, c: number): boolean {
  if (rootPuzzle[r][c] !== 0) return false;
  for (let i = 0; i < 9; i++) {
    const [rr, rc] = rootCellForChild(i);
    if (rr === r && rc === c) return false;
  }
  return true;
}

/** Сошёлся ли корень целиком. Это и есть победа в партии. */
export function rootSolved(rootGrid: Board, solution: Board): boolean {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (rootGrid[r][c] !== solution[r][c]) return false;
  return true;
}

/**
 * Клетки корня, которые не заполнит НИКТО: ни игрок, ни дочерние сетки.
 * Список обязан быть пустым — иначе партия непроходима по построению.
 */
export function rootUnreachableCells(rootPuzzle: Board): [number, number][] {
  const feeds = new Set(Array.from({ length: 9 }, (_, i) => rootCellForChild(i).join(',')));
  const out: [number, number][] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (rootPuzzle[r][c] !== 0) continue;
    if (feeds.has(`${r},${c}`) || rootEditable(rootPuzzle, r, c)) continue;
    out.push([r, c]);
  }
  return out;
}

// ─────────────────────── сборка партии ───────────────────────

/**
 * Собрать фрактальную головоломку глубины два для заданного уровня.
 *
 * ПОРЯДОК ВАЖЕН. Сначала решение корня — оно задаёт девять цифр, которые обязаны
 * оказаться в центрах дочерних. Потом сами дочерние. Корень копаем ПОСЛЕДНИМ и
 * с защищёнными «кормящими» клетками: логика проверяется на доске, где эти девять
 * цифр СТОЯТ, потому что в игре они там и окажутся — их принесут снизу. Гасим их
 * только в напечатанном задании.
 *
 * Отсюда честная связь: корень с девятью цифрами решается логикой и единственным
 * образом, а БЕЗ них — неоднозначен, то есть девять дочерних действительно несущие,
 * а не декорация (замер 19.08: 40 из 40 корней неоднозначны без цифр снизу).
 */
export function generateFractal(level: number, seed?: string): FractalPuzzle {
  const cfg: FractalLevelCfg = fractalLevel(level);
  const rnd: Rng = seed ? makeRng(seed) : Math.random;

  const rootSolution = emptyFlat();
  if (!fill(rootSolution, 0, rnd)) throw new Error('fractal: не удалось собрать корень');

  const children: FractalChild[] = [];
  for (let i = 0; i < 9; i++) {
    const [rr, rc] = rootCellForChild(i);
    const center = rootSolution[rr * N + rc];
    const solution = toFlat(solvedWithCenter(center, rnd));
    const dug = digToTier(solution, { cap: cfg.childBlanksCap, tier: cfg.tier, forceOut: [FEED_INDEX] }, rnd);
    // Порог — доля от РЕАЛЬНОГО числа дырок, а не фиксированное число. Дырок столько,
    // сколько разрешила логика; фиксированный порог мог бы оказаться выше их числа,
    // и сетка не открылась бы никогда — то есть партия стала бы непроходимой.
    const unlockCells = Math.max(1, Math.min(dug.blanks, Math.round(dug.blanks * cfg.unlockShare)));
    children.push({
      solution: toBoard(solution),
      puzzle: toBoard(dug.flat),
      feedsCell: [rr, rc],
      blanks: dug.blanks,
      unlockCells,
      tier: dug.tier,
    });
  }

  const feeds = new Set(Array.from({ length: 9 }, (_, i) => {
    const [rr, rc] = rootCellForChild(i);
    return rr * N + rc;
  }));
  // Корню хватает двух заходов: ступень техники держат дочерние, а корень ограничен
  // потолком дырок и лишние заходы окупались бы только временем на телефоне.
  const dugRoot = digToTier(rootSolution, { cap: cfg.rootBlanksCap, tier: cfg.rootTier, protect: feeds }, rnd, 2);

  const printed = Int8Array.from(dugRoot.flat);
  for (const i of feeds) printed[i] = 0;
  let needsChildren = countSolutionsFast(printed, 2) >= 2;

  // Страховка на редкий случай: если корень добивается и БЕЗ цифр снизу, дочерние
  // становятся украшением — игрок закроет корень напрямую. Тогда выкалываем ещё,
  // не ломая решаемость корня-с-девятью-цифрами. Замер 19.08: понадобилось 0 раз
  // из 40, но «почти никогда» — не «никогда», а цена ошибки здесь вся игра.
  if (!needsChildren) {
    const q = Int8Array.from(dugRoot.flat);
    for (const i of seededShuffle(Array.from({ length: CELLS }, (_, k) => k), rnd)) {
      if (!q[i] || feeds.has(i)) continue;
      const keep = q[i];
      q[i] = 0;
      if (!logicSolve(q, cfg.rootTier).solved) { q[i] = keep; continue; }
      printed[i] = 0;
      dugRoot.flat[i] = 0;
      if (countSolutionsFast(printed, 2) >= 2) { needsChildren = true; break; }
    }
  }

  let rootBlanks = 0;
  for (let i = 0; i < CELLS; i++) if (!printed[i]) rootBlanks++;

  return {
    root: {
      solution: toBoard(rootSolution),
      puzzle: toBoard(printed),
      blanks: rootBlanks,
      tier: logicSolve(dugRoot.flat, cfg.rootTier).tier,
      needsChildren,
    },
    children,
    level: cfg.level,
  };
}

/** Плоский вид доски — для гейтов и для быстрого решателя. */
export const flatten = toFlat;

/* psygames-fillwords-generator · VER 1 · 22.08.2026 */
/**
 * ГЕНЕРАТОР ПОЛЯ: СНАЧАЛА РЕШЕНИЕ, ПОТОМ БУКВЫ.
 *
 * 🔴 ПОЧЕМУ НЕ «РАЗБРОСАТЬ СЛОВА И ПОСМОТРЕТЬ, ЧТО ВЫШЛО». Главное правило
 * филвордов — поле разбирается ЦЕЛИКОМ. Если укладывать слова по одному в
 * случайные свободные места, то к концу почти всегда остаётся горстка клеток
 * неудобной формы, куда ни одно слово не встаёт: «хвост» из двух клеток в углу,
 * дырка посередине. Дальше есть только два выхода, и оба плохие: либо засыпать
 * остаток случайными буквами (тогда это уже не филворды, а поиск слов в шуме, и
 * уровень нельзя закрыть по правилу «поле пустое»), либо перезапускать раскладку
 * до победного — то есть заменить генератор лотереей с неизвестным временем.
 *
 * 🔴 КАК ЗДЕСЬ. Раскладка строится ОТ РЕШЕНИЯ, в три шага, и покрытие следует из
 * построения, а не проверяется постфактум:
 *
 *   1. ПУТЬ. Строим гамильтонов путь по клеткам — маршрут, который заходит в
 *      КАЖДУЮ клетку РОВНО ОДИН РАЗ, а соседние точки маршрута соседствуют и на
 *      поле (8 сторон: линия слова гнётся в любую сторону, включая диагонали).
 *   2. РАЗРЕЗ. Заранее набираем длины слов так, чтобы их сумма была РОВНО равна
 *      числу клеток, и режем путь на куски этих длин. Куски — непрерывные
 *      отрезки маршрута, значит каждый кусок сам по себе законная «змейка» слова.
 *   3. СЛОВА. В кусок длины L кладём слово из L букв.
 *
 * Отрезки не пересекаются (маршрут не заходит в клетку дважды) и в объединении
 * дают все клетки (маршрут обошёл всё) — поле покрыто целиком ПО ПОСТРОЕНИЮ.
 *
 * ⚠️ ЧТО СЛОМАЕТСЯ ПРИ ДРУГОМ РЕШЕНИИ. Замени гамильтонов путь на «случайный
 * путь без самопересечений» — и он застрянет, не обойдя всё поле: остаток
 * придётся засыпать шумом. Убери условие «сумма длин РОВНО равна числу клеток»
 * — останется хвост, который нечем закрыть. Разреши слову идти по уже занятым
 * клеткам — пропадёт разбиение, и «разобрать поле целиком» станет недостижимо.
 * Каждое из трёх мест сторожит своя проба в `fillwords-core.test.ts`.
 */
import { createRng, normalizeSeed, type FillwordsRng } from './rng';
import type { CellIndex, FillwordsPuzzle, PlantedWord } from './types';
import {
  FILLWORDS_MAX_WORD,
  FILLWORDS_MIN_WORD,
  isFillwordsLocale,
  wordPool,
  wordsOfLength,
} from './words';

/** Соседство — восемь сторон: линия слова гнётся и по диагонали. */
export function areAdjacent(a: CellIndex, b: CellIndex, cols: number): boolean {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  return dr <= 1 && dc <= 1;
}

/** Таблица соседей на всё поле — считается один раз на раскладку, а не в цикле поиска. */
function neighbourTable(rows: number, cols: number): CellIndex[][] {
  const table: CellIndex[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const list: CellIndex[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          list.push(nr * cols + nc);
        }
      }
      table.push(list);
    }
  }
  return table;
}

/**
 * ЗМЕЙКА — ЗАПАСНОЙ МАРШРУТ, КОТОРЫЙ СУЩЕСТВУЕТ ВСЕГДА.
 *
 * Строки проходятся туда-обратно: конец строки и начало следующей стоят в одном
 * столбце, то есть соседствуют по вертикали. Такой обход законен на ЛЮБОМ поле,
 * и поэтому поиск маршрута ниже не может провалиться совсем — в худшем случае
 * он вернётся сюда. Восемь вариантов (по строкам/по столбцам × два отражения)
 * нужны затем, чтобы запасной маршрут не выглядел каждый раз одинаково.
 */
function serpentinePath(rows: number, cols: number, rng: FillwordsRng): CellIndex[] {
  const byRow = rng.next() < 0.5;
  const flipMajor = rng.next() < 0.5;
  const flipMinor = rng.next() < 0.5;
  const out: CellIndex[] = [];
  const major = byRow ? rows : cols;
  const minor = byRow ? cols : rows;
  for (let i = 0; i < major; i++) {
    const m = flipMajor ? major - 1 - i : i;
    for (let j = 0; j < minor; j++) {
      const forward = (i % 2 === 0) !== flipMinor;
      const n = forward ? j : minor - 1 - j;
      out.push(byRow ? m * cols + n : n * cols + m);
    }
  }
  return out;
}

/**
 * ГАМИЛЬТОНОВ ПУТЬ поиском в глубину с двумя отсечениями. Без них перебор на
 * поле 8×8 (64 клетки) уходит в миллионы веток и не заканчивается за разумное
 * время — а поле пересобирается на каждом уровне, прямо по нажатию «Начать».
 *
 *   · ВАРНСДОРФ: первым пробуем соседа, у которого меньше всего свободных
 *     продолжений. Приём с обхода конём: клетку, которая вот-вот окажется
 *     отрезанной, занимаем раньше, чем она станет тупиком.
 *   · СВЯЗНОСТЬ ОСТАТКА: после шага все ещё не пройденные клетки обязаны
 *     оставаться одним куском. Шаг, разрезающий остаток надвое, гарантированно
 *     ведёт в тупик — отбрасываем его сразу, а не через сотню веток.
 *
 * ⚠️ БЮДЖЕТ ШАГОВ — НЕ ПЕРЕСТРАХОВКА, А ОБЯЗАТЕЛЬСТВО ПЕРЕД ЭКРАНОМ. Поиск
 * гамильтонова пути в общем случае NP-полон, и «обычно быстро» — не гарантия.
 * Кончился бюджет — молча уходим на змейку: человек получит поле чуть более
 * регулярной формы, но получит его СРАЗУ, а не через зависший экран.
 */
function hamiltonianPath(rows: number, cols: number, rng: FillwordsRng): CellIndex[] {
  const total = rows * cols;
  const table = neighbourTable(rows, cols);
  const visited = new Array<boolean>(total).fill(false);
  const seen = new Int32Array(total);
  const path: CellIndex[] = [];
  let generation = 0;
  let budget = 60000;

  const freeDegree = (cell: CellIndex): number => {
    let d = 0;
    for (const n of table[cell]) if (!visited[n]) d++;
    return d;
  };

  /** Остались ли все непройденные клетки одним куском, если идти в `from`. */
  const restStaysWhole = (from: CellIndex, remaining: number): boolean => {
    generation++;
    let count = 0;
    const stack: CellIndex[] = [from];
    seen[from] = generation;
    while (stack.length > 0) {
      const cell = stack.pop() as CellIndex;
      count++;
      for (const n of table[cell]) {
        if (visited[n] || seen[n] === generation) continue;
        seen[n] = generation;
        stack.push(n);
      }
    }
    return count === remaining;
  };

  const step = (cell: CellIndex): boolean => {
    visited[cell] = true;
    path.push(cell);
    if (path.length === total) return true;
    if (budget-- > 0) {
      const candidates = table[cell].filter((n) => !visited[n]);
      rng.shuffle(candidates);
      candidates.sort((a, b) => freeDegree(a) - freeDegree(b));
      const remaining = total - path.length;
      for (const n of candidates) {
        if (!restStaysWhole(n, remaining)) continue;
        if (step(n)) return true;
        if (budget <= 0) break;
      }
    }
    visited[cell] = false;
    path.pop();
    return false;
  };

  if (step(rng.int(total))) return path;
  return serpentinePath(rows, cols, rng);
}

/** Вес длины: середина словаря приятнее и на глаз, и на ощупь — крайности реже. */
const LENGTH_WEIGHT: Record<number, number> = { 3: 2, 4: 4, 5: 4, 6: 3, 7: 2, 8: 1 };

/**
 * НАБОР ДЛИН, СУММА КОТОРЫХ РОВНО РАВНА ЧИСЛУ КЛЕТОК.
 *
 * 🔴 ЗДЕСЬ ЖИВЁТ ВТОРАЯ ПОЛОВИНА ГАРАНТИИ ПОКРЫТИЯ. Маршрут покрывает поле, но
 * если сумма длин окажется меньше числа клеток — останется необрезанный хвост,
 * а если больше — последнему слову не хватит клеток. Поэтому длина добавляется
 * только тогда, когда ОСТАТОК после неё либо ноль, либо не меньше минимального
 * слова: «остаток 2» — это тупик, из которого уже не выбраться.
 *
 * ⚠️ ПОТОЛОК ПО СЛОВАРЮ. Взять двадцать слов длины 3 нельзя, если их в языке
 * двенадцать: слова в одном поле не повторяются (иначе две одинаковые змейки
 * путают и человека, и разбор жеста). Поэтому длина выбывает из кандидатов,
 * когда её запас исчерпан, — и немецкий с двенадцатью трёхбуквенными словами
 * собирает поле из более длинных, вместо того чтобы упереться.
 */
function pickLengths(
  total: number,
  minLen: number,
  maxLen: number,
  capacity: (len: number) => number,
  rng: FillwordsRng,
): number[] | null {
  const lengths: number[] = [];
  for (let len = minLen; len <= maxLen; len++) if (capacity(len) > 0) lengths.push(len);
  if (lengths.length === 0) return null;

  const attempt = (): number[] | null => {
    const used: Record<number, number> = {};
    const out: number[] = [];
    let rest = total;
    while (rest > 0) {
      const fits = lengths.filter((len) => (
        len <= rest
        && (rest - len === 0 || rest - len >= minLen)
        && (used[len] || 0) < capacity(len)
      ));
      if (fits.length === 0) return null;
      const totalWeight = fits.reduce((sum, len) => sum + (LENGTH_WEIGHT[len] || 1), 0);
      let ticket = rng.next() * totalWeight;
      let chosen = fits[fits.length - 1];
      for (const len of fits) {
        ticket -= LENGTH_WEIGHT[len] || 1;
        if (ticket <= 0) { chosen = len; break; }
      }
      used[chosen] = (used[chosen] || 0) + 1;
      out.push(chosen);
      rest -= chosen;
    }
    return out;
  };

  for (let i = 0; i < 200; i++) {
    const got = attempt();
    if (got) return got;
  }

  // Запасной ход — жадно от коротких, тем же правилом остатка. Он менее
  // разнообразен, зато не зависит от везения: если решение существует при
  // текущих потолках словаря, здесь оно почти всегда и находится.
  const used: Record<number, number> = {};
  const out: number[] = [];
  let rest = total;
  while (rest > 0) {
    const len = lengths.find((candidate) => (
      candidate <= rest
      && (rest - candidate === 0 || rest - candidate >= minLen)
      && (used[candidate] || 0) < capacity(candidate)
    ));
    if (len === undefined) return null;
    used[len] = (used[len] || 0) + 1;
    out.push(len);
    rest -= len;
  }
  return out;
}

/** Параметры уровня филвордов. Отдельные от корректурной пробы — оси сложности разные. */
export interface FillwordsLevelCfg {
  rows: number;
  cols: number;
  /** Потолок длины слова: на маленьком поле змея из восьми букв съедает треть поля. */
  maxWordLen: number;
  /** Лимит времени на уровень, секунды. */
  timeLimitSec: number;
}

/**
 * ЛЕСЕНКА УРОВНЕЙ. Три оси, и все три растут медленно — филворды это не гонка:
 *   · поле 5×5 → 8×8 (25 → 64 клетки): дольше держать в голове найденное;
 *   · потолок длины слова 5 → 8: длинные змейки труднее увидеть целиком;
 *   · бюджет времени на клетку 3.0 → 1.8 с: к концу лесенки поле вдвое больше,
 *     а времени на клетку почти вдвое меньше.
 *
 * ⚠️ Время считается ОТ ЧИСЛА КЛЕТОК, а не задаётся числом на уровень: иначе
 * при переходе 7×7 → 8×8 (плюс 15 клеток) лимит остался бы прежним, и уровень
 * стал бы резко невозможным на ровном месте.
 */
export function fillwordsLevel(level: number): FillwordsLevelCfg {
  const n = Math.max(1, Math.floor(level) || 1);
  const size = Math.min(8, 5 + Math.floor((n - 1) / 4));
  const maxWordLen = Math.min(FILLWORDS_MAX_WORD, 5 + Math.floor((n - 1) / 3));
  const perCellSec = Math.max(1.8, 3 - (n - 1) * 0.06);
  return { rows: size, cols: size, maxWordLen, timeLimitSec: Math.round(size * size * perCellSec) };
}

export interface FillwordsRequest {
  rows: number;
  cols: number;
  locale: string;
  seed: number;
  /** Потолок длины слова; по умолчанию — общий потолок словаря. */
  maxWordLen?: number;
}

/**
 * ПРОВЕРКА ИНВАРИАНТА — ТРИПВАЙР, А НЕ ВЕЖЛИВОСТЬ.
 *
 * Покрытие следует из построения, так что здесь не должно падать никогда. Но
 * «не должно» и «не падает» — разные утверждения, а цена ошибки максимальная:
 * поле, которое нельзя разобрать, выглядит для человека как зависшая игра, и
 * он не поймёт, что именно сломалось. Поэтому раскладка, нарушившая разбиение,
 * не доезжает до экрана вовсе.
 */
export function assertFullCoverage(puzzle: FillwordsPuzzle): void {
  const total = puzzle.rows * puzzle.cols;
  const owner = new Array<number>(total).fill(-1);
  puzzle.words.forEach((planted, index) => {
    for (const cell of planted.path) {
      if (cell < 0 || cell >= total) throw new Error(`fillwords: клетка ${cell} вне поля`);
      if (owner[cell] !== -1) throw new Error(`fillwords: клетка ${cell} занята дважды`);
      owner[cell] = index;
    }
  });
  const free = owner.indexOf(-1);
  if (free !== -1) throw new Error(`fillwords: клетка ${free} не принадлежит ни одному слову`);
}

/**
 * Собрать поле. Бросает, если у языка нет словаря: на экран это состояние не
 * попадает (режим там не предлагается), а вот молча отдать пустое поле —
 * попадёт, и человек увидит игру, в которую нельзя играть.
 */
export function generateFillwords(request: FillwordsRequest): FillwordsPuzzle {
  const { rows, cols, locale } = request;
  const seed = normalizeSeed(request.seed);
  if (rows < 2 || cols < 2) throw new Error('fillwords: поле меньше 2×2 не бывает');
  if (!isFillwordsLocale(locale)) throw new Error(`fillwords: нет словаря для языка ${locale}`);

  const pool = wordPool(locale);
  const rng = createRng(seed);
  const total = rows * cols;
  const maxWordLen = Math.min(request.maxWordLen ?? FILLWORDS_MAX_WORD, FILLWORDS_MAX_WORD, total);

  const lengths = pickLengths(total, FILLWORDS_MIN_WORD, maxWordLen, (len) => wordsOfLength(pool, len).length, rng);
  if (!lengths) throw new Error(`fillwords: язык ${locale} не набирает ${total} клеток словами`);

  const path = hamiltonianPath(rows, cols, rng);
  const letters = new Array<string>(total).fill('');
  const words: PlantedWord[] = [];
  const used = new Set<string>();
  let at = 0;

  for (const len of lengths) {
    const bank = wordsOfLength(pool, len).filter((w) => !used.has(w));
    const word = rng.pick(bank);
    if (!word) throw new Error(`fillwords: кончились слова длины ${len} в языке ${locale}`);
    used.add(word);
    const cells = path.slice(at, at + len);
    at += len;
    [...word].forEach((ch, i) => { letters[cells[i]] = ch; });
    words.push({ word, path: cells });
  }

  const puzzle: FillwordsPuzzle = { rows, cols, locale, seed, letters, words };
  assertFullCoverage(puzzle);
  return puzzle;
}

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

/**
 * Соседство. По умолчанию восемь сторон — линия гнётся и по диагонали.
 *
 * 🔴 ЗАПРЕТ ДИАГОНАЛЕЙ — ЭТО НЕ КОСМЕТИКА, А ОСЬ СЛОЖНОСТИ, И ЗАМЕР ЭТО ПОКАЗАЛ.
 * Пространство поиска (число самонепересекающихся путей длины L из середины поля
 * 12×9) падает на порядки: длина 3 — 56 против 12 (×4,7), длина 5 — 2336 против
 * 100 (×23), длина 7 — 80 953 против 753 (×108), длина 8 — 444 876 против 1978
 * (×225). Так устроен жанр «Поиска слов»: слово читается по прямой, и это ДРУГОЕ
 * упражнение — сканирование лучами вместо прослеживания змейки.
 */
export function areAdjacent(a: CellIndex, b: CellIndex, cols: number, диагонали = true): boolean {
  if (a === b) return false;
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols));
  const dc = Math.abs((a % cols) - (b % cols));
  if (dr > 1 || dc > 1) return false;
  return диагонали || dr === 0 || dc === 0;
}

/** Таблица соседей на всё поле — считается один раз на раскладку, а не в цикле поиска. */
function neighbourTable(rows: number, cols: number, диагонали = true): CellIndex[][] {
  const table: CellIndex[][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const list: CellIndex[] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (!диагонали && dr !== 0 && dc !== 0) continue;
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
function hamiltonianPath(rows: number, cols: number, rng: FillwordsRng, диагонали = true): CellIndex[] {
  const total = rows * cols;
  const table = neighbourTable(rows, cols, диагонали);
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
  /** Пол длины слова — третья ось лестницы, см. шапку `fillwordsLevel`. */
  minWordLen: number;
  /** Лимит времени на уровень, секунды. */
  timeLimitSec: number;
}

/**
 * Потолок высоты поля. 🔴 ЭТО ЗАМЕР ВЁРСТКИ, А НЕ ВКУС — И МЕРИТЬ ЕГО НАДО НА
 * САМОМ МАЛЕНЬКОМ ЭКРАНЕ, А НЕ НА СВОЁМ.
 *
 * Клетка считается как `max(22, min(ширина/cols, высота/rows, 72))`, и 22 здесь
 * ПОЛ, а не зажим: если места меньше, клетка всё равно станет 22, а сетка молча
 * вылезет за экран.
 *
 * ⚠️ Сначала здесь стояло 20 — по замеру на телефоне 360×740, где двадцать строк
 * дают клетку 26 px. Проба `fillwords-ladder` («сетка влезает по ширине на 360 и
 * по высоте на 640») отбила это сразу: на 320×568 под сетку остаётся 358 точек,
 * и уже семнадцать строк требуют 374. Считать надо от 320×568: 358 / 22 = 16,27.
 * Отсюда шестнадцать — при них 16 × 22 = 352 ≤ 358, а семнадцать не влезают.
 */
const FILLWORDS_MAX_ROWS = 16;
/** Уровень, на котором форма поля упирается в потолок (rows = FILLWORDS_MAX_ROWS). */
const ФОРМА_УПЁРЛАСЬ = 34;
/** Потолок пола длины слова. Дальше словарь ещё собирает, но слов на поле < 15. */
const ПОЛ_МАКС = 7;

/**
 * ЛЕСЕНКА УРОВНЕЙ. Четыре оси, и все растут медленно — филворды это не гонка:
 *   · столбцов 5 → 9: поле шире, змейка длиннее по горизонтали;
 *   · строк 5 → 12: поле выше, найденное дольше держать в голове;
 *   · потолок длины слова 5 → 8: длинные змейки труднее увидеть целиком;
 *   · бюджет времени на клетку 3.0 → 1.8 с.
 *
 * 🔴 ПОЛЕ ПЕРЕСТАЛО БЫТЬ КВАДРАТНЫМ 06.09.2026 — просьба Дениса «филворды
 * крупнее, у них 5000 уровней». Разбор нашёл причину, и она была в одной строке:
 * стояло `Math.min(8, …)` на ОБЕ стороны, поэтому потолок 8×8 брался на 13-м
 * уровне, а уровни 13…500 выдавали ОДНО И ТО ЖЕ поле. Генератор прямоугольники
 * умел и до правки — 5×10 и 9×16 собирались с первой попытки, — просто их никто
 * не заказывал.
 *
 * ⚠️ СТОРОНЫ РАСТУТ ПО-РАЗНОМУ, И ЭТО НЕ ПРИХОТЬ. Ширину ограничивает палец, а
 * не вкус: замер по вёрстке на телефоне 360 точек — 16 столбцов дают клетку в
 * 21 точку при нижнем зажиме 22, поле вылезает за край. Девять столбцов дают 37.
 * Высоту так не зажимает, поэтому вглубь поле растёт дальше, чем вширь, — и
 * получаются вытянутые сетки, те самые, что у образца жанра.
 *
 * ⚠️ Время считается ОТ ЧИСЛА КЛЕТОК (`rows * cols`, а не `size * size`): иначе
 * прямоугольник получал бы лимит от квадрата и уровень становился бы резко
 * невозможным на ровном месте.
 *
 * 🔴 ПЯТАЯ ОСЬ — ПОЛ ДЛИНЫ СЛОВА, И ОНА ЕДИНСТВЕННАЯ РАСТЁТ НЕ ЛИНЕЙНО.
 *
 * 📍 Замер 06.09.2026: на 5000 уровнях лестница давала 22 РАЗНЫХ настройки, и с
 * 22-го уровня всё замирало — 4979 уровней (99,6%) были одинаковы: 12×9, слово
 * ≤8, время 194.
 *
 * Из чего выбирали, померено на поле 12×9 через ПРОСТРАНСТВО ПОИСКА — сумму по
 * словам числа самонепересекающихся путей их длины (соседство восьмистороннее,
 * поэтому путей из середины поля: длина 3 — 56, длина 5 — 2336, длина 8 —
 * 444 876; каждая буква умножает примерно на семь):
 *   · форма поля 12×9 → 16×9 — клеток больше, слов больше, длина та же: ×1,3.
 *     Ось ЛИНЕЙНАЯ и упирается в вёрстку самого узкого экрана (см. потолок выше);
 *   · пол длины 3 → 7 — слов МЕНЬШЕ (21,8 → 15,0), но каждое длиннее: ×3,3.
 *     Ось растёт как степень, потому что растёт длина пути, а не их число.
 * Точный замер по фактическим длинам, 20 сидов, все пять языков собрались 20/20:
 * пол 3 — 695к, пол 4 — 764к, пол 5 — 1031к, пол 6 — 1876к, пол 7 — 2306к.
 *
 * ⚠️ ОСИ ВКЛЮЧАЮТСЯ ПО ОЧЕРЕДИ, А НЕ ВМЕСТЕ. Пол начинает расти только с уровня
 * 46, когда форма упёрлась: обе разом дали бы один скачок вместо лестницы.
 * Итог: настроек 22 → 30, лестница живёт до 94-го уровня вместо 22-го, и на
 * каждом уровне подряд (прогон 1…300) ни одного отката ни по одной оси.
 */
export function fillwordsLevel(level: number): FillwordsLevelCfg {
  const n = Math.max(1, Math.floor(level) || 1);
  const cols = Math.min(9, 5 + Math.floor((n - 1) / 5));
  const rows = Math.min(FILLWORDS_MAX_ROWS, 5 + Math.floor((n - 1) / 3));
  const maxWordLen = Math.min(FILLWORDS_MAX_WORD, 5 + Math.floor((n - 1) / 3));
  // Пол трогается только после того, как форма упёрлась: две оси разом дали бы
  // скачок на одном уровне вместо лестницы.
  const послеФормы = Math.max(0, n - ФОРМА_УПЁРЛАСЬ);
  const minWordLen = Math.min(ПОЛ_МАКС, FILLWORDS_MIN_WORD + Math.floor(послеФормы / 15));
  const perCellSec = Math.max(1.8, 3 - (n - 1) * 0.06);
  return { rows, cols, maxWordLen, minWordLen, timeLimitSec: Math.round(rows * cols * perCellSec) };
}

export interface FillwordsRequest {
  rows: number;
  cols: number;
  locale: string;
  seed: number;
  /** Потолок длины слова; по умолчанию — общий потолок словаря. */
  maxWordLen?: number;
  /** Пол длины слова; по умолчанию — общий пол словаря. */
  minWordLen?: number;
  /** Разрешить диагонали. По умолчанию да — так режим и работал. */
  диагонали?: boolean;
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

  const wanted = Math.min(
    Math.max(FILLWORDS_MIN_WORD, request.minWordLen ?? FILLWORDS_MIN_WORD),
    maxWordLen,
  );

  /**
   * 🔴 ПОЛ ДЛИНЫ ОТСТУПАЕТ, А НЕ РОНЯЕТ УРОВЕНЬ.
   *
   * 📍 Замер 06.09.2026: с полом 7 на поле 20×9 (180 клеток) немецкий и
   * португальский не собирались ВОВСЕ — 40 попыток из 70 падали с «не набирает
   * 180 клеток словами», то есть уровни со 106-го были для них сломаны. Причина
   * не в поле, а в словаре: длинных слов в этих языках меньше, а слова в одном
   * поле не повторяются, и запас длины кончается.
   *
   * Уровень с полом на единицу ниже — это чуть легче, чем обещано лестницей.
   * Упавшая игра — это не «чуть легче», это конец партии. Поэтому пол сползает
   * вниз до тех пор, пока разбиение не найдётся, и только исчерпав весь путь до
   * `FILLWORDS_MIN_WORD`, генератор признаёт язык непригодным для этого поля.
   *
   * ⚠️ ЧЕСТНО: НА НЫНЕШНЕЙ ЛЕСТНИЦЕ ЭТО СТРАХОВКА, А НЕ ЖИВАЯ ПОЧИНКА. Падение
   * ловилось при потолке в 20 строк; потолок опустили до 16 (замер вёрстки на
   * 320×568), поле стало 144 клетки вместо 180 — и словаря снова хватает: без
   * отступления уровни 94, 150 и 300 собираются 18/18 на всех пяти языках.
   * Мутация это и показала — убрал отступление, проба осталась зелёной.
   * Отступление оставлено намеренно и проверяется ОТДЕЛЬНО, прямым запросом
   * поля, которого словарь не тянет: без него `18×9` с полом 7 не собирается
   * у немецкого ни разу из шести, `20×9` — ни у немецкого, ни у португальского.
   * Стоит поднять потолок строк или завести язык победнее — и страховка станет
   * рабочей в тот же день.
   */
  let lengths: number[] | null = null;
  for (let floorLen = wanted; floorLen >= FILLWORDS_MIN_WORD && !lengths; floorLen -= 1) {
    lengths = pickLengths(total, floorLen, maxWordLen, (len) => wordsOfLength(pool, len).length, rng);
  }
  if (!lengths) throw new Error(`fillwords: язык ${locale} не набирает ${total} клеток словами`);

  const диагонали = request.диагонали ?? true;
  const path = hamiltonianPath(rows, cols, rng, диагонали);
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

  const puzzle: FillwordsPuzzle = { rows, cols, locale, seed, letters, words, диагонали };
  assertFullCoverage(puzzle);
  return puzzle;
}

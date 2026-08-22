/* psygames-mahjong-silhouettes · VER 1 · 22.08.2026 */
/**
 * НАБОР СИЛУЭТОВ РАСКЛАДКИ: черепаха, пирамида, крепость, бабочка, мост, паук, ромб.
 *
 * 🔴 ЧТО БЫЛО. Силуэт был ОДИН — ромб. Первый уровень и сороковой отличались только
 * числом плиток и высотой стопки, то есть глаз не отличал их вовсе: каждая новая
 * доска выглядела как предыдущая. У образцов (Vita Mahjong — 100 млн установок,
 * Mahjong Blast — 50 млн) главная витринная строка — «сотни вручную проработанных
 * раскладок», и держится она не на количестве плиток, а на УЗНАВАЕМОЙ ФОРМЕ.
 *
 * КАК УСТРОЕНО. Силуэт задаёт ОДНУ маску — след нижнего слоя, в нормированных
 * координатах u,v ∈ [-1,1] (независимо от того, 8 колонок на уровне или 12).
 * Верхние слои НЕ рисуются отдельно: каждый следующий — эрозия предыдущего, то есть
 * его внутренность (клетка выживает, если у неё есть соседи со всех четырёх сторон).
 *
 * ⚠️ ПОЧЕМУ ИМЕННО ЭРОЗИЯ, А НЕ ОТДЕЛЬНАЯ МАСКА НА СЛОЙ. Даёт две вещи даром:
 *   1. Каждая верхняя плитка ЛЕЖИТ на нижней (слой k+1 ⊆ слой k). Прежний код
 *      сдвигал верхний слой на клетку вбок, и плитка могла висеть над пустотой —
 *      правило «на ней ничего не лежит» от этого не ломалось, но горка выглядела
 *      развалившейся.
 *   2. Силуэт сохраняется на всех слоях сам: внутренность черепахи — черепаха
 *      поменьше. Рисовать по маске на каждый из пяти слоёв × семь форм = 35 масок,
 *      которые разъедутся при первой же правке.
 *
 * ЗАМЕР 22.08.2026, ПО 200 СБОРОК НА СИЛУЭТ (уровни 1/6/12/20/40, худшее по уровням) —
 * доля сборок, упёршихся в тупик и честно вернувших пустое:
 *   черепаха 20,0 % · пирамида 25,0 % · крепость 13,5 % · бабочка 15,5 %
 *   мост 13,5 % · паук 16,0 % · ромб 22,5 %
 * ДО набора силуэтов единственный ромб давал 12–22 % на тех же уровнях, то есть формы
 * не ухудшили сборку. Экран пересобирает до двадцати раз (0,25²⁰ ≈ 10⁻¹²), поэтому до
 * игрока такая доска не доходит; полный разбор каждой формы стережёт
 * `mahjong-silhouettes.test.ts`.
 *
 * ⚠️ ТОНКИЕ ФОРМЫ (стена крепости, полотно моста, лапы паука) эродируют в НИЧТО за
 * один-два шага. Для них есть отступное правило: если сузить нечего — слой садится
 * башней на самые глубокие клетки нижнего (см. `nextLayer`). Крепость от этого
 * получает башни по углам, мост — пилоны: ровно то, чем эти силуэты и узнаются.
 */

/** Клетка следа — в ЦЕЛЫХ колонках/строках. В полуклетки переводит `buildPositions`. */
export interface Cell { col: number; row: number }

export type SilhouetteKey =
  | 'turtle' | 'pyramid' | 'fortress' | 'butterfly' | 'bridge' | 'spider' | 'diamond';

interface Silhouette {
  key: SilhouetteKey;
  /** Отношение высоты маски к ширине: мост широкий и низкий, паук почти квадратный. */
  aspect: number;
  /** Принадлежит ли клетка силуэту. u,v — нормированные координаты в [-1,1]. */
  inside(u: number, v: number): boolean;
}

const ell = (u: number, v: number, cu: number, cv: number, ru: number, rv: number): boolean =>
  ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 <= 1;

/**
 * СЕМЬ ФОРМ. Порядок в массиве — порядок раздачи по уровням (см. `silhouetteForLevel`).
 * Формы описаны неравенствами, а не таблицей клеток: одна и та же форма обязана
 * читаться и на 8 колонках первого уровня, и на 12 колонках сорокового.
 */
const SHAPES: Silhouette[] = [
  {
    // ЧЕРЕПАХА — канон маджонга: овальный панцирь, голова сверху, четыре лапы по углам.
    key: 'turtle', aspect: 0.86,
    inside: (u, v) => ell(u, v, 0, 0.06, 0.86, 0.76)          // панцирь
      || ell(u, v, 0, -0.86, 0.2, 0.2)                        // голова
      || ell(u, v, -0.74, -0.6, 0.24, 0.22)                   // лапы
      || ell(u, v, 0.74, -0.6, 0.24, 0.22)
      || ell(u, v, -0.74, 0.66, 0.24, 0.22)
      || ell(u, v, 0.74, 0.66, 0.24, 0.22),
  },
  {
    // ПИРАМИДА — треугольник: узкая верхушка, широкое основание.
    key: 'pyramid', aspect: 0.9,
    inside: (u, v) => Math.abs(u) <= 0.16 + 0.84 * ((v + 1) / 2),
  },
  {
    // КРЕПОСТЬ — полая стена по периметру, четыре угловые башни, ворота снизу по центру.
    key: 'fortress', aspect: 0.86,
    inside: (u, v) => {
      const gate = Math.abs(u) <= 0.2 && v >= 0.62;           // ворота — вырез в южной стене
      if (gate) return false;
      const wall = Math.max(Math.abs(u), Math.abs(v)) >= 0.48;// стена толщиной больше половины полукоробки
      const tower = Math.abs(u) >= 0.4 && Math.abs(v) >= 0.4;  // угловые башни — толще стены
      return wall || tower;
    },
  },
  {
    // БАБОЧКА — четыре лопасти крыльев и узкое тело; талия снаружи по горизонтали.
    key: 'butterfly', aspect: 0.92,
    inside: (u, v) => {
      const body = Math.abs(u) <= 0.14 && Math.abs(v) <= 0.86;
      if (body) return true;
      const w = Math.abs(u);
      const wing = ((w - 0.56) / 0.44) ** 2 + (v / 0.9) ** 2 <= 1;
      const waist = w > 0.45 && Math.abs(v) < 0.16;           // вырез между верхней и нижней лопастью
      return wing && !waist;
    },
  },
  {
    // МОСТ — полотно во всю ширину, два пилона и упоры по краям.
    key: 'bridge', aspect: 0.66,
    inside: (u, v) => {
      const deck = Math.abs(v) <= 0.33;                       // полотно
      const pylon = Math.abs(Math.abs(u) - 0.46) <= 0.22;     // два пилона во всю высоту
      const abutment = Math.abs(u) >= 0.78 && v >= -0.15;     // береговые упоры
      return deck || pylon || abutment;
    },
  },
  {
    // ПАУК — плотное тело и шесть лап: четыре по диагоналям, две по горизонтали.
    key: 'spider', aspect: 0.96,
    inside: (u, v) => {
      const body = ell(u, v, 0, 0, 0.44, 0.52);
      const diag = Math.abs(Math.abs(v) - Math.abs(u)) <= 0.27;   // толще 4-связности: тонкая диагональ рассыпается в пунктир
      const side = Math.abs(v) <= 0.16;
      return body || diag || side;
    },
  },
  {
    // РОМБ — форма, с которой маджонг здесь жил до набора силуэтов. Оставлена: она рабочая.
    key: 'diamond', aspect: 0.82,
    inside: (u, v) => Math.abs(u) + Math.abs(v) <= 1.02,
  },
];

const BY_KEY: Record<SilhouetteKey, Silhouette> = SHAPES.reduce((acc, s) => {
  acc[s.key] = s; return acc;
}, {} as Record<SilhouetteKey, Silhouette>);

/** Имена силуэтов в порядке раздачи — наружу для проверок и отладки. */
export const SILHOUETTE_KEYS: SilhouetteKey[] = SHAPES.map((s) => s.key);

/**
 * КАКОЙ СИЛУЭТ У УРОВНЯ.
 *
 * Детерминированно — уровень 7 сегодня и через месяц выглядит одинаково, иначе
 * поднятая из хранилища недоигранная партия оживала бы другой формой.
 *
 * Шаг 3 при семи формах: 7 простое, 3 с ним взаимно просто — значит соседние уровни
 * НИКОГДА не совпадают по виду, а любые семь подряд дают все семь форм ровно по разу.
 * Простое `L % 7` тоже развело бы соседей, но шло бы по кругу в одном и том же
 * порядке; шаг 3 переставляет цикл и не даёт запомнить «после моста всегда паук».
 */
export function silhouetteForLevel(level: number): SilhouetteKey {
  const n = Math.max(1, Math.floor(level) || 1);
  return SILHOUETTE_KEYS[((n - 1) * 3) % SILHOUETTE_KEYS.length] as SilhouetteKey;
}

const ck = (c: Cell): number => c.row * 1000 + c.col;

/** След силуэта на сетке cols×rows. */
function maskCells(s: Silhouette, cols: number, rows: number): Cell[] {
  const out: Cell[] = [];
  const cu = (cols - 1) / 2;
  const cv = (rows - 1) / 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const u = cu === 0 ? 0 : (col - cu) / (cu + 0.5);
      const v = cv === 0 ? 0 : (row - cv) / (cv + 0.5);
      if (s.inside(u, v)) out.push({ col, row });
    }
  }
  return out;
}

/**
 * Самый крупный связный кусок следа.
 *
 * ⚠️ Зачем. На маленькой сетке (первый уровень — двадцать плиток) мелкие детали
 * формы вырождаются в ОДИНОЧНЫЕ клетки: голова черепахи и кончики лап отрывались от
 * панциря и лежали мусором по углам. Одиночная плитка вдобавок свободна всегда — то
 * есть она не только сорит видом, но и разбавляет доску дармовыми ходами.
 */
function largestBlob(cells: Cell[]): Cell[] {
  const set = new Set(cells.map(ck));
  const seen = new Set<number>();
  let best: Cell[] = [];
  for (const start of cells) {
    if (seen.has(ck(start))) continue;
    const stack = [start];
    const blob: Cell[] = [];
    seen.add(ck(start));
    while (stack.length) {
      const c = stack.pop() as Cell;
      blob.push(c);
      const nb = [
        { col: c.col - 1, row: c.row }, { col: c.col + 1, row: c.row },
        { col: c.col, row: c.row - 1 }, { col: c.col, row: c.row + 1 },
      ];
      for (const n of nb) {
        if (set.has(ck(n)) && !seen.has(ck(n))) { seen.add(ck(n)); stack.push(n); }
      }
    }
    if (blob.length > best.length) best = blob;
  }
  return best;
}

/** Внутренность набора: клетка выживает, если соседи есть со всех четырёх сторон. */
function erode(cells: Cell[]): Cell[] {
  const set = new Set(cells.map(ck));
  return cells.filter((c) => set.has(ck({ col: c.col - 1, row: c.row }))
    && set.has(ck({ col: c.col + 1, row: c.row }))
    && set.has(ck({ col: c.col, row: c.row - 1 }))
    && set.has(ck({ col: c.col, row: c.row + 1 })));
}

/** Глубина клетки = сколько эрозий она переживает. Мера «насколько внутри». */
function depthOf(cells: Cell[]): Map<number, number> {
  const out = new Map<number, number>();
  let cur = cells;
  for (let d = 0; cur.length > 0 && d < 64; d++) {
    for (const c of cur) out.set(ck(c), d);
    cur = erode(cur);
  }
  return out;
}

/** Центр набора — для сортировки «от середины наружу». */
function centroid(cells: Cell[]): { col: number; row: number } {
  let sc = 0, sr = 0;
  for (const c of cells) { sc += c.col; sr += c.row; }
  return { col: sc / cells.length, row: sr / cells.length };
}

/**
 * Порядок клеток «сначала самые внутренние». Любой ПРЕФИКС этого порядка — тот же
 * силуэт, только ужатый: так набирается нужное число плиток без отдельной маски на
 * каждый размер доски.
 */
function orderInward(cells: Cell[]): Cell[] {
  const depth = depthOf(cells);
  const c0 = centroid(cells);
  const dist = (c: Cell) => (c.col - c0.col) ** 2 + (c.row - c0.row) ** 2;
  return [...cells].sort((a, b) => (depth.get(ck(b)) ?? 0) - (depth.get(ck(a)) ?? 0)
    || dist(a) - dist(b)
    || a.row - b.row || a.col - b.col);
}

/**
 * Следующий слой над данным.
 *
 * Обычно — эрозия. Но у тонких форм (стена крепости в две клетки, полотно моста,
 * лапа паука) эрозия обнуляет слой сразу, и пятислойный уровень выложился бы в один
 * слой. Тогда слой садится БАШНЕЙ: берёт 40 % самых глубоких клеток нижнего. Это не
 * подпорка, а часть замысла — башни крепости и пилоны моста именно так и выглядят.
 */
function nextLayer(cur: Cell[]): Cell[] {
  const e = erode(cur);
  // Порог не «хоть что-то», а доля: у крепости эрозия давала 4 клетки из 66, и
  // четырёхслойный уровень выкладывался ТРЕМЯ слоями — правила обещали одно, доска
  // показывала другое. Замер 22.08.2026: крепость на 12 уровне [66, 4, 2, 0].
  if (e.length >= Math.max(3, Math.round(cur.length * 0.18))) return e;
  if (cur.length < 4) return [];
  return orderInward(cur).slice(0, Math.max(2, Math.round(cur.length * 0.35)));
}

/** Стопка слоёв от следа: [след, его внутренность, внутренность внутренности, …]. */
function layerChain(base: Cell[], layers: number): Cell[][] {
  const chain: Cell[][] = [base];
  for (let k = 1; k < layers; k++) {
    const prev = chain[k - 1] as Cell[];
    chain.push(prev.length ? nextLayer(prev) : []);
  }
  return chain;
}

const chainSize = (chain: Cell[][]): number => chain.reduce((a, l) => a + l.length, 0);

/**
 * ПОЗИЦИИ РАСКЛАДКИ по силуэту: ровно needTiles клеток, разложенных по слоям.
 *
 * Порядок работы:
 *   1. Берём НАИМЕНЬШУЮ сетку, на которой стопка слоёв вмещает needTiles: форма
 *      рисуется в масштабе заказа, а не обрезается из большой.
 *   2. Излишек срезаем с клеток, НА КОТОРЫХ НИЧЕГО НЕ ЛЕЖИТ, поровну по слоям (по
 *      доле уже срезанного) — так силуэт ужимается по контуру, сохраняя пропорции
 *      стопки, а не теряет верхушку и не сплющивается в двухэтажную стенку.
 *
 * ⚠️ Срезать «просто сверху» нельзя: излишек доходит до полутора десятков клеток, а
 * в верхнем слое их бывает три — слой исчез бы целиком, и уровень, который правила
 * объявляют пятислойным, выложился бы четырьмя.
 */
export function buildPositions(
  layers: number, needTiles: number, cols: number, key: SilhouetteKey = 'diamond',
): { x: number; y: number; layer: number }[] {
  const s = BY_KEY[key] ?? BY_KEY.diamond;
  const width = Math.max(4, Math.floor(cols));
  /**
   * (1) МАСШТАБ, А НЕ ЯДРО. Форма рисуется на сетке ровно того размера, который
   * нужен под заказ.
   *
   * 🔴 Первая редакция брала маску максимального размера и отрезала от неё
   * «самые внутренние» клетки. На больших уровнях выходило красиво, а на первом —
   * одинаковый блин у всех семи форм: внутренность выпуклой фигуры это круг, чем
   * бы фигура ни была снаружи. Замер 22.08.2026: черепаха, пирамида и ромб на
   * двадцати плитках давали ПОБУКВЕННО совпадающие раскладки.
   */
  /** Годится ли сетка: вмещает заказ И даёт ВСЕ обещанные слои, а не «сколько выйдет». */
  const fits = (m: Cell[]): boolean => {
    const c = layerChain(m, layers);
    return chainSize(c) >= needTiles && c.every((l) => l.length >= 2);
  };
  let mask: Cell[] = [];
  for (let w = 6; w <= width; w++) {
    const m = largestBlob(maskCells(s, w, Math.max(4, Math.round(w * s.aspect))));
    if (fits(m)) { mask = m; break; }
  }
  if (!mask.length) {
    // Ширина упёрлась в потолок уровня (она подобрана под экран) — растим вверх.
    let rows = Math.max(4, Math.round(width * s.aspect));
    mask = largestBlob(maskCells(s, width, rows));
    for (let grow = 0; grow < 40 && !fits(mask); grow++) {
      rows += 1;
      mask = largestBlob(maskCells(s, width, rows));
    }
  }
  const chain: Cell[][] = layerChain(mask, layers);

  // (2) излишек — по одной клетке, слой выбирается по доле уже срезанного (см. score).
  const live: Cell[][] = chain.map((l) => [...l]);
  const orig = chain.map((l) => Math.max(1, l.length));
  const covered = (k: number, c: Cell): boolean =>
    (live[k + 1] ?? []).some((u) => u.col === c.col && u.row === c.row);
  let extra = chainSize(live) - needTiles;
  let guard = 0;
  while (extra > 0 && guard++ < needTiles * 8) {
    let bestK = -1, bestI = -1, bestScore = -1;
    for (let k = 0; k < live.length; k++) {
      const layerCells = live[k] as Cell[];
      // Слой не опускаем ниже пары: иначе обещанные правилами слои редеют до нуля.
      if (layerCells.length <= 2) continue;
      const c0 = centroid(layerCells);
      const here = new Set(layerCells.map(ck));
      for (let i = 0; i < layerCells.length; i++) {
        const c = layerCells[i] as Cell;
        if (covered(k, c)) continue;
        const nb = [{ col: c.col - 1, row: c.row }, { col: c.col + 1, row: c.row },
          { col: c.col, row: c.row - 1 }, { col: c.col, row: c.row + 1 }]
          .filter((n) => here.has(ck(n))).length;
        /**
         * Слой выбирается по ДОЛЕ уже срезанного, а не по абсолютному размеру.
         * 🔴 Сначала здесь стояло «сначала самый многолюдный» — и нижний слой худел
         * до размера верхнего: замер 22.08.2026 давал бабочку [29, 28, 11, 4], то
         * есть почти на каждой нижней плитке лежала верхняя. Это не горка, а
         * двухэтажная стенка. Пропорции стопки задаёт эрозия, обрезка их держит.
         */
        const score = (layerCells.length / (orig[k] as number)) * 1e6
          + (4 - nb) * 1e3 + (c.col - c0.col) ** 2 + (c.row - c0.row) ** 2;
        if (score > bestScore) { bestScore = score; bestK = k; bestI = i; }
      }
    }
    if (bestK < 0) break;
    (live[bestK] as Cell[]).splice(bestI, 1);
    extra -= 1;
  }

  /**
   * Координаты прижимаем к нулю. Пустые строки сверху и колонки слева ничего не
   * показывают, но входят в габарит поля: экран считает размер плитки по крайним
   * координатам, и полоса пустоты просто отбирает у плиток пиксели.
   */
  const minCol = Math.min(...live.flat().map((c) => c.col));
  const minRow = Math.min(...live.flat().map((c) => c.row));
  const out: { x: number; y: number; layer: number }[] = [];
  for (let k = 0; k < live.length; k++) {
    for (const c of live[k] as Cell[]) out.push({ x: (c.col - minCol) * 2, y: (c.row - minRow) * 2, layer: k });
  }
  if (out.length % 2 === 1) {
    // Чётность — условие раздачи парами. Снимаем ту, на которой ничего не лежит.
    const top = out.reduce((m, p, i) => (p.layer > (out[m] as { layer: number }).layer ? i : m), 0);
    out.splice(top, 1);
  }
  return out;
}

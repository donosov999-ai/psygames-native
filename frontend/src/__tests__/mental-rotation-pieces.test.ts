/* psygames-mental-rotation-pieces · VER 1 · 16.09.2026 */
/* psygames-spatial-claude-mac · задача 5a1b4d25 */
/**
 * 🔴 «НЕДОСТАЮЩАЯ ЧАСТЬ» И «СБОРКА»: РАЗРЕЗ ЧЕСТНЫЙ, ВЕРНЫЙ ОТВЕТ ОДИН.
 *
 * Два режима стоят на одном разрезе фигуры (`split.ts`). Проба проверяет четыре
 * требования задачи 5a1b4d25: связность обеих частей по граням, точное покрытие,
 * размер меньшей части и — самое дорогое — ЕДИНСТВЕННОСТЬ ответа.
 *
 * 🔬 ЕДИНСТВЕННОСТЬ МЕРИТСЯ НЕЗАВИСИМЫМ ПЕРЕБОРОМ. Генератор отсеивает подделки
 * функцией `composes`; проверять его той же функцией — значит соглашаться с ним
 * по определению. Здесь свои 24 матрицы поворота (знаковые перестановки с
 * определителем +1) и полный перебор подмножеств кубиков целого: для каждой
 * подделки ищется хоть одно разбиение целого на «показанный кусок + подделка».
 * Нашлось — у задания два верных ответа.
 */
import {
  buildAssemblyTask, buildMissingTask, buildTask, createRng, KIND_UNLOCK, levelParams,
  MIN_MISSING_PIECE, planTaskKinds, shapesOfSize, splitShape, composes, isFaceConnected,
} from '@/src/games/mental-rotation/core';
import type { Cube, Shape } from '@/src/games/mental-rotation/core';
import { shapeSurface } from '@/src/games/mental-rotation/core/surface';

// ─── независимая геометрия пробы ─────────────────────────────────────────

/** 24 поворота куба: знаковые перестановки осей с определителем +1. */
const ПОВОРОТЫ: ((c: Cube) => Cube)[] = (() => {
  const out: ((c: Cube) => Cube)[] = [];
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const parity = [1, -1, -1, 1, 1, -1];
  perms.forEach((p, pi) => {
    for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
      if (parity[pi] * sx * sy * sz !== 1) continue;
      out.push((c) => [sx * c[p[0]], sy * c[p[1]], sz * c[p[2]]]);
    }
  });
  return out;
})();
const ключ = (s: Shape): string => {
  const m = [0, 1, 2].map((i) => Math.min(...s.map((c) => c[i])));
  return s.map((c) => c.map((v, i) => v - m[i]).join(',')).sort().join('|');
};
/** Канон фигуры с точностью до поворота (без отражения). */
const канон = (s: Shape): string => ПОВОРОТЫ.map((r) => ключ(s.map(r))).sort()[0];
const связна = (s: Shape): boolean => {
  const cells = new Set(s.map((c) => c.join(',')));
  const seen = new Set([s[0].join(',')]), queue = [s[0]];
  for (let i = 0; i < queue.length; i++) for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const k = queue[i].map((v, j) => v + d[j]).join(',');
    if (cells.has(k) && !seen.has(k)) { seen.add(k); queue.push(k.split(',').map(Number) as Cube); }
  }
  return seen.size === cells.size && cells.size === s.length;
};
/** Все подмножества размера k (индексы). */
function* сочетания(n: number, k: number, from = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = from; i <= n - (k - acc.length); i++) yield* сочетания(n, k, i + 1, [...acc, i]);
}
/** Делится ли целое на кусок, равный `a`, и остаток, равный `b`, — полным перебором. */
const делится = (whole: Shape, a: Shape, b: Shape): boolean => {
  if (a.length + b.length !== whole.length) return false;
  const ka = канон(a), kb = канон(b);
  for (const idx of сочетания(whole.length, a.length)) {
    const set = new Set(idx);
    const part = whole.filter((_, i) => set.has(i)), rest = whole.filter((_, i) => !set.has(i));
    if (канон(part) === ka && канон(rest) === kb) return true;
  }
  return false;
};

// ─── делитель ─────────────────────────────────────────────────────────────

describe('делитель фигуры', () => {
  const фигуры = shapesOfSize(4, 11);

  it('прибор жив: независимый канон различает зеркало и узнаёт поворот', () => {
    const L: Shape = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]];            // киральная «ступенька»
    const зеркало: Shape = L.map(([x, y, z]) => [-x, y, z]);
    const поворот: Shape = L.map(([x, y, z]) => [-y, x, z]);
    expect(канон(L)).toBe(канон(поворот));
    expect(канон(L)).not.toBe(канон(зеркало));
    expect(ПОВОРОТЫ.length).toBe(24);
    expect(фигуры.length).toBeGreaterThan(20);
  });

  it('🔴 обе части связны по граням, покрывают фигуру ровно и не пересекаются', () => {
    const плохо: string[] = [];
    let разрезов = 0;
    for (const [fi, фигура] of фигуры.entries()) for (let seed = 0; seed < 12; seed++) {
      const rng = createRng(`split-${fi}-${seed}`);
      const size = 2 + (seed % Math.max(1, фигура.length - 3));
      const cut = splitShape(фигура, rng, 2, size);
      if (!cut) continue;
      разрезов++;
      const [a, b] = cut;
      const все = [...a, ...b].map((c) => c.join(',')).sort().join('|');
      if (!связна(a) || !связна(b)) плохо.push(`фигура ${fi} seed ${seed}: часть не связна`);
      if (все !== фигура.map((c) => c.join(',')).sort().join('|')) плохо.push(`фигура ${fi} seed ${seed}: части не покрывают фигуру ровно`);
      if (a.length !== size) плохо.push(`фигура ${fi} seed ${seed}: просили ${size}, получили ${a.length}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
    expect(разрезов).toBeGreaterThan(200);
  });

  it('меньшая часть не мельче minPart, а невозможный разрез — null, а не обман', () => {
    const I4: Shape = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]];
    expect(splitShape(I4, createRng('x'), 3)).toBeNull();          // 4 < 2×3
    expect(splitShape(I4, createRng('x'), 2, 1)).toBeNull();       // кусок мельче minPart
    const плохо: string[] = [];
    for (const [fi, фигура] of фигуры.entries()) for (let seed = 0; seed < 8; seed++) {
      const cut = splitShape(фигура, createRng(`min-${fi}-${seed}`), 3);
      if (cut && Math.min(cut[0].length, cut[1].length) < 3) плохо.push(`фигура ${fi}: меньшая часть ${Math.min(cut[0].length, cut[1].length)}`);
    }
    expect(плохо).toEqual([]);
  });

  it('контроль composes на известных ответах', () => {
    const квадрат: Shape = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]];
    const I3: Shape = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
    const один: Shape = [[0, 0, 0]];
    const домино: Shape = [[0, 0, 0], [0, 1, 0]];
    const L4: Shape = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [2, 1, 0]];
    expect(composes(квадрат, домино, домино)).toBe(true);
    expect(composes(квадрат, I3, один)).toBe(false);           // тройка в квадрат 2×2 не ложится
    expect(composes(L4, I3, один)).toBe(true);
    expect(composes(L4, домино, домино)).toBe(true);
    expect(isFaceConnected([[0, 0, 0], [1, 1, 0]])).toBe(false);  // касание ребром — не связь
  });
});

// ─── задания ──────────────────────────────────────────────────────────────

const УРОВНИ_СБОРКИ = [11, 12, 13, 15, 18, 21, 24, 27, 30];
const УРОВНИ_ПУСТОТЫ = [21, 22, 23, 24, 25, 26, 28, 30, 33];

describe('«Недостающая часть»', () => {
  const задания = УРОВНИ_ПУСТОТЫ.flatMap((level) => Array.from({ length: 12 }, (_, i) => ({
    level, seed: i, task: buildMissingTask(level, createRng(`missing-${level}-${i}`)),
  })));

  it('есть что проверять', () => { expect(задания.length).toBe(УРОВНИ_ПУСТОТЫ.length * 12); });

  it('🔴 верный ответ ОДИН: ни одна подделка не заполняет пустоту ни в каком положении (независимый перебор)', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const дыра = new Set(task.hole.map((c) => c.join(',')));
      const остаток = task.whole.filter((c) => !дыра.has(c.join(',')));
      const верных = task.options.filter((o) => делится(task.whole, остаток, o.shape));
      if (верных.length !== 1) плохо.push(`L${level}#${seed}: вариантов, заполняющих пустоту, ${верных.length}`);
      else if (!верных[0].isMatch) плохо.push(`L${level}#${seed}: заполняет пустоту не тот вариант, что назван верным`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('части честные: пустота и остаток связны, пустота не мельче четырёх кубиков', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const дыра = new Set(task.hole.map((c) => c.join(',')));
      const остаток = task.whole.filter((c) => !дыра.has(c.join(',')));
      if (!связна(task.hole) || !связна(остаток)) плохо.push(`L${level}#${seed}: часть не связна`);
      if (task.hole.length < MIN_MISSING_PIECE) плохо.push(`L${level}#${seed}: пустота ${task.hole.length}`);
      if (task.options.some((o) => o.shape.length !== task.hole.length)) плохо.push(`L${level}#${seed}: вариант другого размера — отсеивается счётом`);
      if (task.options.length !== levelParams(level).optionCount) плохо.push(`L${level}#${seed}: вариантов ${task.options.length}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 варианты попарно разные: две одинаковые подделки игрок отсеет, не вращая ничего', () => {
    const плохо = задания.filter(({ task }) => new Set(task.options.map((o) => канон(o.shape))).size !== task.options.length);
    expect(плохо.map(({ level, seed }) => `L${level}#${seed}`).slice(0, 5)).toEqual([]);
  });

  it('🔴 пустота видна: она не больше сплошной части и стоит к зрителю ближе остатка (живой кадр 16.09)', () => {
    const глубина = (s: Shape) => s.reduce((sum, c) => sum + c[0] + c[1] + c[2], 0) / s.length;
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const дыра = new Set(task.hole.map((c) => c.join(',')));
      const остаток = task.whole.filter((c) => !дыра.has(c.join(',')));
      if (остаток.length < task.hole.length) плохо.push(`L${level}#${seed}: пустота ${task.hole.length} больше остатка ${остаток.length}`);
      if (глубина(task.hole) < глубина(остаток)) плохо.push(`L${level}#${seed}: пустота за сплошной частью`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('⚠️ верный кусок нарисован повёрнутым, а не так, как стоит пустота', () => {
    const плохо = задания.filter(({ task }) => ключ(task.options[task.correctIdx].shape) === ключ(task.hole));
    expect(плохо.map(({ level, seed }) => `L${level}#${seed}`)).toEqual([]);
  });
});

describe('«Сборка»', () => {
  const задания = УРОВНИ_СБОРКИ.flatMap((level) => Array.from({ length: 12 }, (_, i) => ({
    level, seed: i, task: buildAssemblyTask(level, createRng(`assembly-${level}-${i}`)),
  })));

  it('🔴 верный ответ ОДИН: из двух кусков складывается ровно один вариант (независимый перебор)', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const складываются = task.options.filter((o) => делится(o.shape, task.parts[0], task.parts[1]));
      if (складываются.length !== 1) плохо.push(`L${level}#${seed}: складывается вариантов ${складываются.length}`);
      else if (!складываются[0].isMatch) плохо.push(`L${level}#${seed}: складывается не тот вариант, что назван верным`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 варианты попарно разные: две одинаковые подделки игрок отсеет, не вращая ничего', () => {
    const плохо = задания.filter(({ task }) => new Set(task.options.map((o) => канон(o.shape))).size !== task.options.length);
    expect(плохо.map(({ level, seed }) => `L${level}#${seed}`).slice(0, 5)).toEqual([]);
  });

  it('куски связны, варианты одного размера и все связны', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const n = task.parts[0].length + task.parts[1].length;
      if (!связна(task.parts[0]) || !связна(task.parts[1])) плохо.push(`L${level}#${seed}: кусок не связен`);
      if (task.options.some((o) => o.shape.length !== n || !связна(o.shape))) плохо.push(`L${level}#${seed}: вариант не той величины или рассыпан`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });
});

describe('все ступени до 50-й собираются, и на крупных фигурах ответ тоже один', () => {
  it('🔴 ни один уровень от открытия до 50-го не падает при сборке задания', () => {
    const плохо: string[] = [];
    for (let level = KIND_UNLOCK.assembly; level <= 50; level++) for (let i = 0; i < 3; i++) {
      try { buildAssemblyTask(level, createRng(`all-a-${level}-${i}`)); } catch (e) { плохо.push(`assembly L${level}: ${String(e).slice(0, 60)}`); }
      if (level >= KIND_UNLOCK.missing) {
        try { buildMissingTask(level, createRng(`all-m-${level}-${i}`)); } catch (e) { плохо.push(`missing L${level}: ${String(e).slice(0, 60)}`); }
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 крупные фигуры (40-й и 50-й уровни): верный ответ один, независимым перебором', () => {
    const плохо: string[] = [];
    for (const level of [40, 50]) for (let i = 0; i < 4; i++) {
      const m = buildMissingTask(level, createRng(`big-m-${level}-${i}`));
      const дыра = new Set(m.hole.map((c) => c.join(',')));
      const остаток = m.whole.filter((c) => !дыра.has(c.join(',')));
      const mВерных = m.options.filter((o) => делится(m.whole, остаток, o.shape));
      if (mВерных.length !== 1 || !mВерных[0].isMatch) плохо.push(`missing L${level}#${i}: заполняют ${mВерных.length}`);
      const a = buildAssemblyTask(level, createRng(`big-a-${level}-${i}`));
      const aВерных = a.options.filter((o) => делится(o.shape, a.parts[0], a.parts[1]));
      if (aВерных.length !== 1 || !aВерных[0].isMatch) плохо.push(`assembly L${level}#${i}: складываются ${aВерных.length}`);
    }
    expect(плохо).toEqual([]);
  });
});

describe('пустота «недостающей части» видна на фигуре', () => {
  const пара: Shape = [[0, 0, 0], [1, 0, 0]];

  it('🔴 пустые кубики рисуются как пустые, а стенка сплошного кубика у пустоты — видна', () => {
    const грани = shapeSurface(пара, 200, 'x', 0, [[1, 0, 0]]);
    expect(грани.filter((g) => g.ghost).length).toBeGreaterThan(0);
    // грань +x сплошного кубика смотрит в пустоту: без неё кусок «висит» в воздухе
    expect(грани.some((g) => g.id === '0,0,0:0' && !g.ghost)).toBe(true);
    // между двумя пустыми кубиками грани нет — пустота рисуется одним объёмом
    const дыра = shapeSurface([[0, 0, 0], [1, 0, 0], [2, 0, 0]], 200, 'x', 0, [[1, 0, 0], [2, 0, 0]]);
    expect(дыра.some((g) => g.id === '1,0,0:0')).toBe(false);
  });

  it('без пустых кубиков картинка прежняя — остальные режимы не задеты', () => {
    const фигура = shapesOfSize(6, 6)[0];
    const было = shapeSurface(фигура, 180, 'y', 30).map((g) => `${g.id}|${g.fill}|${g.points.join(';')}`);
    const стало = shapeSurface(фигура, 180, 'y', 30, []).map((g) => `${g.id}|${g.fill}|${g.points.join(';')}`);
    expect(стало).toEqual(было);
    expect(shapeSurface(фигура, 180).some((g) => g.ghost)).toBe(false);
  });
});

describe('новые виды доходят до партии', () => {
  it('открываются на своих уровнях и попадают в план', () => {
    // Литералом: порог, взятый у проверяемого, порогом не является.
    expect([KIND_UNLOCK.assembly, KIND_UNLOCK.missing]).toEqual([11, 21]);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) for (const k of planTaskKinds(21, 15, createRng(`plan-pieces-${i}`))) seen.add(k);
    expect(seen.has('missing') && seen.has('assembly')).toBe(true);
    const рано = new Set<string>();
    for (let i = 0; i < 40; i++) for (const k of planTaskKinds(20, 15, createRng(`plan-early-${i}`))) рано.add(k);
    expect(рано.has('missing')).toBe(false);
    expect(buildTask('missing', 21, createRng('bt-m')).kind).toBe('missing');
    expect(buildTask('assembly', 11, createRng('bt-a')).kind).toBe('assembly');
  });
});

/* psygames-mental-rotation-formation · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 0d96f48e */
/**
 * 🔴 «ТРИ ВИДА»: ПО ВИДАМ СВЕРХУ, СПЕРЕДИ И СПРАВА ПОДХОДИТ РОВНО ОДИН ВАРИАНТ.
 *
 * Три вида фигуру однозначно не задают: кубик, спрятанный по всем трём осям, можно
 * переставить, и тени не изменятся. Генератор отсеивает такие подделки функцией
 * `sameThreeViews`; проверять его ею же — соглашаться с ним по определению. Здесь
 * виды считаются заново, своими множествами клеток, и сравниваются все три.
 */
import {
  buildFormationTask, buildTask, createRng, KIND_UNLOCK, levelParams, moveKeepingView, planTaskKinds, sameThreeViews, shapesOfSize,
} from '@/src/games/mental-rotation/core';
import type { Cell2D, Shape } from '@/src/games/mental-rotation/core';

/** Свой расчёт вида: множество клеток «столбец,строка», сдвинутое в угол. */
const вид = (shape: Shape, how: (c: number[]) => [number, number]): string => {
  const cells = shape.map(how);
  const mc = Math.min(...cells.map((c) => c[0])), mr = Math.min(...cells.map((c) => c[1]));
  return [...new Set(cells.map(([c, r]) => `${c - mc},${r - mr}`))].sort().join('|');
};
const виды = (s: Shape): string => [
  вид(s, ([x, , z]) => [x, z]),       // сверху
  вид(s, ([x, y]) => [x, -y]),        // спереди
  вид(s, ([, y, z]) => [-z, -y]),     // справа
].join(' / ');
const сетка = (cells: Cell2D[]): string => cells.map((c) => `${c.col},${c.row}`).sort().join('|');
const объёмна = (s: Shape): boolean => [0, 1, 2].every((i) => Math.max(...s.map((c) => c[i])) - Math.min(...s.map((c) => c[i])) >= 1);

describe('«Три вида»', () => {
  it('прибор жив: спрятанный кубик не меняет ни одного вида, а открытый — меняет', () => {
    const блок: Shape = [];
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) блок.push([x, y, z]);
    const безУгла = блок.filter(([x, y, z]) => !(x === 0 && y === 0 && z === 0));
    expect(виды(безУгла)).toBe(виды(блок));
    expect(sameThreeViews(безУгла, блок)).toBe(true);
    const сОтростком: Shape = [...блок, [2, 0, 0]];
    expect(виды(сОтростком)).not.toBe(виды(блок));
    expect(sameThreeViews(сОтростком, блок)).toBe(false);
    // совпадение ОДНОГО вида — норма, а не брак
    const высокий: Shape = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]];
    const низкий: Shape = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]];
    expect(виды(высокий).split(' / ')[0]).not.toBe('');
    expect(sameThreeViews(высокий, низкий)).toBe(false);
  });

  const УРОВНИ = [15, 16, 18, 20, 25, 30, 40, 50];
  const задания = УРОВНИ.flatMap((level) => Array.from({ length: 12 }, (_, i) => ({
    level, seed: i, task: buildFormationTask(level, createRng(`formation-${level}-${i}`)),
  })));

  it('есть что проверять', () => { expect(задания.length).toBe(УРОВНИ.length * 12); });

  it('🔴 по трём видам подходит ровно один вариант, и он назван верным (свой расчёт видов)', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const нужно = [сетка(task.views.top), сетка(task.views.front), сетка(task.views.side)].join(' / ');
      const подходят = task.options.filter((o) => виды(o.shape) === нужно);
      if (подходят.length !== 1) плохо.push(`L${level}#${seed}: подходят ${подходят.length}`);
      else if (!подходят[0].isMatch) плохо.push(`L${level}#${seed}: подходит не тот, что назван верным`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('варианты попарно разные, все объёмные, вариантов столько, сколько обещает уровень', () => {
    const плохо: string[] = [];
    for (const { level, seed, task } of задания) {
      const ключи = new Set(task.options.map((o) => o.shape.map((c) => c.join(',')).sort().join('|')));
      if (ключи.size !== task.options.length) плохо.push(`L${level}#${seed}: два одинаковых варианта`);
      if (task.options.some((o) => !объёмна(o.shape))) плохо.push(`L${level}#${seed}: плоский вариант`);
      if (task.options.length !== levelParams(level).optionCount) плохо.push(`L${level}#${seed}: вариантов ${task.options.length}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('подделки разные по сути: встречаются и переставленный кубик, и повёрнутая та же фигура', () => {
    const виды_ = new Set(задания.flatMap(({ task }) => task.options.map((o) => o.flaw)));
    expect(виды_.has('one-cube')).toBe(true);
    expect(виды_.has('other-view')).toBe(true);
  });

  /**
   * 🔴 ОДНОГО ВИДА НЕ ХВАТАЕТ. Замер 17.09.2026: первый генератор отдавал задания, где у всех
   * подделок, например, вид сверху был другим, — ответ находился по одному виду в 90 заданиях
   * из 96, два остальных вида можно было не смотреть. После подбора набора по охвату видов —
   * 0 из 288 на всех уровнях 15–50. Порог ноль поставлен ПОСЛЕ этого замера.
   */
  it('🔴 ни в одном задании ответ не находится по одному виду — нужны все три', () => {
    const плохо: string[] = [];
    for (let level = KIND_UNLOCK.formation; level <= 50; level++) for (let i = 0; i < 3; i++) {
      const task = buildFormationTask(level, createRng(`one-view-${level}-${i}`));
      const нужно = [сетка(task.views.top), сетка(task.views.front), сетка(task.views.side)];
      const подделки = task.options.filter((o) => !o.isMatch).map((o) => виды(o.shape).split(' / '));
      const выдаёт = [0, 1, 2].filter((v) => подделки.every((w) => w[v] !== нужно[v]));
      if (выдаёт.length) плохо.push(`L${level}#${i}: ответ виден по ${выдаёт.map((v) => ['виду сверху', 'виду спереди', 'виду справа'][v]).join(', ')}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('перестановка «с тем же видом» и правда сохраняет вид вдоль своей оси', () => {
    const плохо: string[] = [];
    const оси = [(c: number[]) => [c[1], c[2]], (c: number[]) => [c[0], c[2]], (c: number[]) => [c[0], c[1]]];
    for (const [fi, фигура] of shapesOfSize(5, 12).entries()) for (const axis of [0, 1, 2] as const) for (let i = 0; i < 4; i++) {
      const m = moveKeepingView(фигура, axis, createRng(`keep-${fi}-${axis}-${i}`));
      if (!m) continue;
      const тень = (s: number[][]) => [...new Set(s.map((c) => оси[axis](c).join(',')))].sort().join('|');
      if (тень(m) !== тень(фигура)) плохо.push(`фигура ${fi} ось ${axis}: вид изменился`);
      if (m.length !== фигура.length) плохо.push(`фигура ${fi}: число кубиков ${m.length}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 ни один уровень от открытия до 50-го не падает при сборке', () => {
    const плохо: string[] = [];
    for (let level = KIND_UNLOCK.formation; level <= 50; level++) for (let i = 0; i < 3; i++) {
      try { buildFormationTask(level, createRng(`all-f-${level}-${i}`)); } catch (e) { плохо.push(`L${level}: ${String(e).slice(0, 70)}`); }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('открывается 15-м и доходит до плана партии', () => {
    expect(KIND_UNLOCK.formation).toBe(15);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) for (const k of planTaskKinds(15, 15, createRng(`plan-formation-${i}`))) seen.add(k);
    expect(seen.has('formation')).toBe(true);
    expect(buildTask('formation', 15, createRng('bt-f')).kind).toBe('formation');
  });
});

/* psygames-mental-rotation-section · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача 4f85b6a9 */
/**
 * 🔴 «СРЕЗ» (ПЛОСКОСТЬ ПО ОСИ): ВЕРНЫЙ ОТВЕТ ОДИН, И ОН ПРАВДА СРЕЗ ВЫДЕЛЕННОГО СЛОЯ.
 *
 * Что стережёт проба, на уровнях 18–50 по нескольким раздачам каждый:
 *   · верный вариант совпадает со срезом, посчитанным ЗДЕСЬ, своим кодом — клетки слоя
 *     в осях вида, как записано в шапке `projection.ts` (сверху: вправо x, вниз z; спереди:
 *     вправо x, вниз −y; справа: вправо −z, вниз −y), а не вызовом той же `projectShape`;
 *   · вид всегда поперёк слоя: сверху — слой по Y, спереди — по Z, справа — по X;
 *   · ни одна подделка не совпадает с верным ответом, варианты попарно разные;
 *   · срез отличается от проекции всей фигуры — иначе слой можно не удерживать;
 *   · подпись подделки правдива: «вся фигура» — это и есть проекция всей фигуры,
 *     «соседний слой» — срез слоя рядом, «зеркало» и «повёрнут» — от верного среза;
 *   · экран рисует слой внутри фигуры и варианты сетками; строки на 12 языках.
 */
import { buildSectionTask, KIND_UNLOCK, levelParams, unlockedKinds, getMentalRotationStrings } from '@/src/games/mental-rotation/core';
import type { Cell2D, MentalRotationLocale, SectionTask } from '@/src/games/mental-rotation/core';
import { LANGUAGES } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

/** Своя случайность с семенем — раздачи одинаковы в каждом прогоне. */
function сСеменем(семя: number): () => number {
  let n = семя >>> 0;
  return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}

type Вид = 'top' | 'front' | 'side';
const ОСЬ: Record<Вид, number> = { top: 1, front: 2, side: 0 };
/** Клетка кубика при взгляде — литералами из шапки projection.ts. */
const КЛЕТКА: Record<Вид, (c: number[]) => [number, number]> = {
  top: ([x, , z]) => [x, z],
  front: ([x, y]) => [x, -y],
  side: ([, y, z]) => [-z, -y],
};
function отпечаток(клетки: [number, number][]): string {
  if (!клетки.length) return '';
  const mc = Math.min(...клетки.map((k) => k[0])), mr = Math.min(...клетки.map((k) => k[1]));
  return [...new Set(клетки.map(([c, r]) => `${c - mc},${r - mr}`))].sort().join('|');
}
const сетка = (cells: Cell2D[]) => отпечаток(cells.map((c) => [c.col, c.row]));
const срез = (t: SectionTask, слой: number) => отпечаток(t.shape.filter((c) => c[ОСЬ[t.view]] === слой).map(КЛЕТКА[t.view]));
const вся = (t: SectionTask) => отпечаток(t.shape.map(КЛЕТКА[t.view]));
const зеркало = (k: string) => { const cs = k.split('|').map((p) => p.split(',').map(Number)); const m = Math.max(...cs.map((c) => c[0])); return отпечаток(cs.map(([c, r]) => [m - c, r])); };
const поворот = (k: string) => { const cs = k.split('|').map((p) => p.split(',').map(Number)); const m = Math.max(...cs.map((c) => c[1])); return отпечаток(cs.map(([c, r]) => [m - r, c])); };

const ЗАДАНИЯ: { level: number; t: SectionTask }[] = [];
for (let level = 18; level <= 50; level++) for (const семя of [3, 17, 29, 41]) {
  ЗАДАНИЯ.push({ level, t: buildSectionTask(level, сСеменем(level * 1000 + семя)) });
}

describe('«Срез» в «Мысленном вращении»', () => {
  it('прибор жив: вид открывается с 18-го уровня, раздач 132, свой расчёт узнаёт перевёрнутую сетку', () => {
    expect(KIND_UNLOCK.section).toBe(18);
    expect(unlockedKinds(17)).not.toContain('section');
    expect(unlockedKinds(18)).toContain('section');
    expect(ЗАДАНИЯ.length).toBe(132);
    expect(поворот('0,0|1,0|1,1')).not.toBe('0,0|1,0|1,1');
    expect(зеркало('0,0|0,1|1,1')).not.toBe('0,0|0,1|1,1');
  });

  it('🔴 верный вариант — срез выделенного слоя, посчитанный своим кодом, а вид поперёк слоя', () => {
    const плохо: string[] = [];
    for (const { level, t } of ЗАДАНИЯ) {
      const ось = ОСЬ[t.view];
      if (!t.cubes.every((c) => c[ось] === t.layer) || !t.rest.every((c) => c[ось] !== t.layer)
        || t.cubes.length + t.rest.length !== t.shape.length) плохо.push(`L${level}: слой не по оси вида`);
      if (t.cubes.length < 2) плохо.push(`L${level}: в слое ${t.cubes.length} кубик`);
      const верный = t.options[t.correctIdx];
      if (!верный?.isMatch || t.options.filter((o) => o.isMatch).length !== 1) плохо.push(`L${level}: верных не один`);
      if (сетка(верный.cells) !== срез(t, t.layer)) плохо.push(`L${level} ${t.view}: верный вариант не срез слоя ${t.layer}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('🔴 ответ единственный: подделки не совпадают с верным и между собой, срез не равен проекции всей фигуры', () => {
    const плохо: string[] = [];
    for (const { level, t } of ЗАДАНИЯ) {
      const ключи = t.options.map((o) => сетка(o.cells));
      if (new Set(ключи).size !== ключи.length) плохо.push(`L${level}: варианты повторяются`);
      if (срез(t, t.layer) === вся(t)) плохо.push(`L${level}: срез совпал с проекцией всей фигуры`);
      if (t.options.length !== levelParams(level).optionCount) плохо.push(`L${level}: вариантов ${t.options.length}`);
    }
    expect(плохо.slice(0, 5)).toEqual([]);
  });

  it('подпись подделки правдива, а «вся фигура» — главная ловушка — есть в каждом задании', () => {
    const плохо: string[] = [];
    let сЦелой = 0;
    for (const { level, t } of ЗАДАНИЯ) {
      const верный = срез(t, t.layer);
      for (const o of t.options) {
        const k = сетка(o.cells);
        if (o.flaw === 'whole') { сЦелой += 1; if (k !== вся(t)) плохо.push(`L${level}: «вся фигура» не проекция`); }
        if (o.flaw === 'neighbour' && k !== срез(t, t.layer - 1) && k !== срез(t, t.layer + 1)) плохо.push(`L${level}: «соседний слой» не сосед`);
        if (o.flaw === 'mirror' && k !== зеркало(верный)) плохо.push(`L${level}: «зеркало» не зеркало`);
        if (o.flaw === 'turned' && k !== поворот(верный)) плохо.push(`L${level}: «повёрнут» не поворот`);
        if (o.flaw === 'one-cell' && k.split('|').length !== верный.split('|').length) плохо.push(`L${level}: «клетка» другого размера`);
      }
    }
    expect(плохо.slice(0, 5)).toEqual([]);
    /*
     * Порог — не «на глаз»: первая версия генератора брала проекцию всей фигуры, только если она не
     * совпала с уже взятой подделкой, и замер 17.09 дал её в 110 заданиях из 132 (83 %). В остальных
     * та же сетка стояла под чужой подписью или не стояла вовсе. Теперь она берётся первой — всегда.
     */
    expect(`${сЦелой} из ${ЗАДАНИЯ.length}`).toBe(`${ЗАДАНИЯ.length} из ${ЗАДАНИЯ.length}`);
  });

  it('экран рисует слой внутри фигуры, варианты сетками, вопрос с направлением взгляда, разбор своим текстом', () => {
    const экран = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'mental-rotation.tsx'), 'utf8');
    expect(экран).toMatch(/task\.kind === 'section'\s*\/\/[^\n]*\n\s*\? <View testID="section-layer"><RotationShape shape=\{task\.shape\} ghost=\{task\.rest\}/);
    expect(экран).toMatch(/\(task\.kind === 'projection' \|\| task\.kind === 'section'\) && renderGrid/);
    expect(экран).toMatch(/interpolateMentalRotation\(strings\.sectionPrompt/);
    expect(экран).toMatch(/task\.kind === 'section' \? strings\.reviewSectionHint/);
  });

  it('строки на 12 языках: имя, вопрос с {view}, разбор, подписи подделок — без чужих букв', () => {
    const плохо: string[] = [];
    for (const { code } of LANGUAGES) {
      const s = getMentalRotationStrings(code as MentalRotationLocale);
      for (const k of ['taskSection', 'sectionPrompt', 'reviewSectionHint', 'optionWholeFigure', 'optionNeighbourLayer', 'optionTurned'] as const) {
        const v = s[k];
        if (!v || !v.trim()) плохо.push(`${code}.${k}: пусто`);
        if (code !== 'ru' && /[а-яё]/i.test(v)) плохо.push(`${code}.${k}: кириллица`);
      }
      if (!s.sectionPrompt.includes('{view}')) плохо.push(`${code}: вопрос без {view}`);
      if (!s.kindsSummary.toLowerCase().includes(s.taskSection.toLowerCase())) плохо.push(`${code}: сводка видов не называет «${s.taskSection}»`);
    }
    expect(плохо).toEqual([]);
  });
});

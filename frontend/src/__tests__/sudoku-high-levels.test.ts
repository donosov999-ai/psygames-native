/* psygames-sudoku-high-levels · VER 1 · 22.08.2026 */
/**
 * ВЫШЕ СОРОК ПЕРВОГО УРОВНЯ ТОЖЕ ЕСТЬ ИГРА.
 *
 * 🔴 ПОЧЕМУ ЭТО НЕ ЛОВИЛОСЬ. Живая проба генератора стояла ровно одна и ровно на
 * ДВЕНАДЦАТОМ уровне (`sudoku-roads.test.ts`, «генератор слышит дорогу»). Всё, что
 * выше, не проверялось ни на решаемость, ни на сложность — а разваливалось именно
 * там. Уровни 54–57 (ThermoCage) не трогала ни одна проверка вовсе.
 *
 * 🔴 ЧТО НАШЛОСЬ ЗАМЕРОМ (по 10 досок на уровень, настоящий путь приложения):
 *
 *   • Доски ВЫШЕ ПОТОЛКА — то есть не берущиеся логикой совсем (ступень 9 = перебор):
 *     джигсо L50 — 1 из 10, L53 — 1 из 10, ThermoCage L54 — 1 из 10. ВСЕ ТРИ пришли
 *     по запасному пути генератора, который ступень не проверял вообще.
 *   • Сложность НЕ РОСЛА: L42 давал ступени 3, 2, 3 при L26 = 3, 3, 4 — «сложнее»
 *     оказывалось проще.
 *   • Двадцать уровней (38–57) не отличались ничем, кроме номера: полоса техник
 *     возвращала одно `{4, 6}` на всех, дырки упирались в потолок ещё на 29-м, а
 *     правило варианта меняется раз в четыре уровня.
 *
 * Здесь проверяются оба обещания: ПОТОЛОК (гарантия — доска берётся логикой) и
 * РАЗЛИЧИМОСТЬ соседних уровней. Пол полосы гарантией НЕ объявляется: на термометрах
 * он недостижим (0 из 12 досок 45-го дотянули до четвёртой ступени), и обещать его
 * значило бы врать.
 */
import { levelConfig } from '@/src/services/sudoku-core';
import { bandPos, easeToCeiling, generateLogical, gradePuzzle, targetTier } from '@/src/services/sudoku-grade';
import { roadTier } from '@/src/services/sudoku-roads';

const LAST = 57;

describe('полоса техник по всем уровням', () => {
  it('пол никогда не выше потолка', () => {
    for (let lv = 1; lv <= LAST; lv++) {
      const t = targetTier(lv);
      expect(`L${lv}: ${t.min} ≤ ${t.max}`).toBe(`L${lv}: ${Math.min(t.min, t.max)} ≤ ${t.max}`);
    }
  });

  it('🔴 соседние уровни выше 37-го отличаются друг от друга', () => {
    const same: string[] = [];
    for (let lv = 38; lv < LAST; lv++) {
      const a: any = levelConfig(lv), b: any = levelConfig(lv + 1);
      const ta = targetTier(lv), tb = targetTier(lv + 1);
      const key = (c: any, t: any, l: number) => JSON.stringify({ ...c, t, band: bandPos(l) });
      if (key(a, ta, lv) === key(b, tb, lv + 1)) same.push(`L${lv} = L${lv + 1}`);
    }
    expect(same).toEqual([]);
  });

  it('🔴 внутри полосы варианта цель растёт, а не топчется', () => {
    for (const start of [38, 42, 46, 50, 54]) {
      const maxes = [0, 1, 2, 3].map((k) => targetTier(start + k).max);
      const grows = maxes.every((m, i) => i === 0 || m >= (maxes[i - 1] as number));
      const moved = (maxes[3] as number) > (maxes[0] as number);
      expect(`полоса с L${start}: ${maxes.join(',')} — растёт ${grows && moved}`)
        .toBe(`полоса с L${start}: ${maxes.join(',')} — растёт true`);
    }
  });

  it('🔴 выше x-wing не поднимаемся — за ним идёт перебор', () => {
    for (let lv = 1; lv <= LAST; lv++) expect(targetTier(lv).max).toBeLessThanOrEqual(6);
  });
});

/**
 * ЖИВАЯ ПРОБА. Берём по одному уровню на КАЖДЫЙ вариант верхней половины, и именно
 * последний в полосе — там цель самая узкая и запасной путь включается чаще всего.
 */
describe('доска верхних уровней берётся логикой', () => {
  const CASES = [26, 37, 41, 45, 49, 53, 57];

  it.each(CASES)('L%i — доска решается техниками не выше своего потолка', (lv) => {
    const c: any = levelConfig(lv);
    const band = roadTier(lv, 'normal');
    const bad: string[] = [];
    for (let i = 0; i < 2; i++) {
      const r = generateLogical(lv, c.blanks, c.N, c.BR, c.BC, c.variant, { budgetMs: 2200, tier: band });
      const g = gradePuzzle(r.gen.puzzle, {
        N: c.N, BR: c.BR, BC: c.BC, variant: c.variant,
        regions: r.gen.regions, thermo: r.gen.thermo, arrow: r.gen.arrow, cages: r.gen.cages,
        parity: r.gen.parity, kropki: r.gen.kropki, sandwich: r.gen.sandwich,
      });
      if (!g.solved) bad.push(`L${lv} #${i}: логикой не берётся вовсе`);
      else if (g.tier > band.max) bad.push(`L${lv} #${i}: ступень ${g.tier} > потолка ${band.max}`);
    }
    expect(bad).toEqual([]);
  }, 300000);

  it('🔴 доска не выродилась: дырок много и решение на месте', () => {
    const c: any = levelConfig(53);
    const r = generateLogical(53, c.blanks, c.N, c.BR, c.BC, c.variant, { budgetMs: 2200, tier: roadTier(53, 'normal') });
    let blanks = 0;
    for (const row of r.gen.puzzle) for (const v of row) if (v === 0) blanks++;
    expect(`дырок ${blanks >= 30}`).toBe('дырок true');
    expect(r.gen.solution.length).toBe(9);
  }, 300000);
});

/**
 * 🔴 ПОСЛЕДНИЙ РУБЕЖ — ОТДЕЛЬНО. Он срабатывает редко (только когда все заходы дали
 * доску выше потолка), поэтому в живой пробе почти не встречается: гейт мигал бы,
 * а поломку внутри него не замечал. Проверяем его сам по себе, на доске, заведомо
 * не берущейся логикой.
 */
describe('доводка доски до потолка', () => {
  const { generatePuzzle, dimsForSize } = require('@/src/services/sudoku-core');
  const d = dimsForSize(9);

  /** Почти пустая доска: логикой не берётся, только перебором. */
  function tooHard() {
    const base = generatePuzzle(0, d.N, d.BR, d.BC, 'none');
    const puzzle = base.solution.map((row: number[]) => [...row]);
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (r * 9 + c >= 8) puzzle[r][c] = 0;
    return { ...base, puzzle };
  }

  it('🔴 непроходимая доска доводится до потолка, а не отдаётся как есть', () => {
    const hard = tooHard();
    const before = gradePuzzle(hard.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
    expect(`до доводки решается логикой: ${before.solved}`).toBe('до доводки решается логикой: false');
    const after = easeToCeiling(hard, 9, 3, 3, 'none', 4);
    expect(after.grade.solved).toBe(true);
    expect(after.grade.tier).toBeLessThanOrEqual(4);
  });

  /**
   * ⚠️ ПОТОЛОК ПРОВЕРЯЕТСЯ, А НЕ ТОЛЬКО «РЕШАЕТСЯ ЛИ ВООБЩЕ». Разница видна лишь на
   * НИЗКОМ потолке: доливая клетки, доска сперва становится решаемой на третьей-
   * четвёртой ступени и только потом опускается до первой. Проверка с потолком 4
   * этого не различала бы — там оба условия совпадают.
   */
  it('🔴 доводка опускает именно до ЗАДАННОГО потолка', () => {
    for (const max of [1, 2]) {
      const after = easeToCeiling(tooHard(), 9, 3, 3, 'none', max);
      expect(`потолок ${max}: решается ${after.grade.solved}, ступень ${after.grade.tier} ≤ ${max} → ${after.grade.solved && after.grade.tier <= max}`)
        .toBe(`потолок ${max}: решается true, ступень ${after.grade.tier} ≤ ${max} → true`);
    }
  });

  it('🔴 доводка не трогает доску, которая и так в пределах потолка', () => {
    const base = generatePuzzle(40, d.N, d.BR, d.BC, 'none');
    const g = gradePuzzle(base.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
    if (!g.solved || g.tier > 6) return;   // выборка не подошла — проверять нечего
    const after = easeToCeiling(base, 9, 3, 3, 'none', 6);
    expect(after.gen.puzzle).toEqual(base.puzzle);
  });

  /**
   * 🔴 «РЕШАЕТСЯ» И «В ПРЕДЕЛАХ ПОТОЛКА» — РАЗНЫЕ УСЛОВИЯ, И ПУТАТЬ ИХ НЕЛЬЗЯ.
   * На почти пустой доске разница не видна: пока её доливаешь до логической
   * решаемости, ступень успевает опуститься до первой сама. Настоящая проверка —
   * доска, которая УЖЕ решается, но слишком сложна: доводка обязана продолжить,
   * а не отдать её как есть.
   */
  it('🔴 доводка не путает «решается» с «в пределах потолка»', () => {
    let found = 0;
    for (let attempt = 0; attempt < 12 && found < 2; attempt++) {
      const base = generatePuzzle(52, d.N, d.BR, d.BC, 'none');
      const g = gradePuzzle(base.puzzle, { N: 9, BR: 3, BC: 3, variant: 'none' });
      if (!g.solved || g.tier < 2) continue;   // нужна доска, которая решается, но не первой ступенью
      found++;
      const max = g.tier - 1;
      const after = easeToCeiling(base, 9, 3, 3, 'none', max);
      expect(`была ступень ${g.tier}, потолок ${max} → стала ${after.grade.tier}, решается ${after.grade.solved}`)
        .toBe(`была ступень ${g.tier}, потолок ${max} → стала ${after.grade.tier}, решается true`);
      expect(after.grade.tier).toBeLessThanOrEqual(max);
    }
    expect(`подходящих досок нашлось: ${found > 0}`).toBe('подходящих досок нашлось: true');
  });

  /**
   * ⚠️ ПОРЯДОК ДОЛИВКИ СЛУЧАЕН, поэтому «чем выше потолок, тем меньше долито» здесь
   * не выполняется: замер дал 35 клеток при потолке 1 и 40 при потолке 4. Свойство,
   * которое от порядка не зависит: доска остаётся ЗАДАЧЕЙ, а не заполненной сеткой.
   */
  it('🔴 доводка оставляет доску задачей, а не заливает её', () => {
    for (const max of [1, 4, 6]) {
      const a = easeToCeiling(tooHard(), 9, 3, 3, 'none', max);
      let blanks = 0;
      for (const row of a.gen.puzzle) for (const v of row) if (v === 0) blanks++;
      expect(`потолок ${max}: дырок ${blanks}, это задача — ${blanks >= 20}`)
        .toBe(`потолок ${max}: дырок ${blanks}, это задача — true`);
    }
  });
});

declare function require(id: string): any;

/**
 * ⚠️ И ЧТО РУБЕЖ ДЕЙСТВИТЕЛЬНО СТОИТ НА ПУТИ. Он срабатывает редко — примерно на
 * одной доске джигсо из десяти, — поэтому выборочная проба его почти не задевает:
 * снимешь рубеж, и гейт останется зелёным просто потому, что не попал. Проверяем
 * связь напрямую: запасной путь генератора обязан пропускать доску через доводку.
 */
describe('рубеж стоит на пути', () => {
  const fs = require('fs');
  const path = require('path');
  it('🔴 запасной путь пропускает доску через доводку', () => {
    const src: string = fs.readFileSync(path.resolve(__dirname, '../services/sudoku-grade.ts'), 'utf8');
    const tail = src.slice(src.indexOf('const fbUntil'));
    expect(tail).toMatch(/const eased = easeToCeiling\(/);
    expect(tail).toMatch(/grade: eased\.grade/);
    expect(tail).toMatch(/const gen = eased\.gen;/);
  });
});

declare const __dirname: string;

/* psygames-sudoku-line-variants-earn-name · VER 2 · 01.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЛИНЕЙНЫЕ ВАРИАНТЫ ОБЯЗАНЫ ЗАСЛУЖИВАТЬ СВОЁ ИМЯ — «немецкий шёпот» (93–96, задача 5b0b7ca2),
 * «ренбан» (97–100, задача 031a7684) и «равные суммы» (101–104, задача b0a1feef); приёмка из
 * карточек цепочки «14 усложнений».
 *
 * Доска с линиями, которые ничего не решают, — это классика с цветным декором. Гейт меряет
 * ПОВЕДЕНИЕ меры на досках, которые получает человек (выгрузка натива
 * `flutter/assets/levels/sudoku-variant-boards.json` собрана тем же путём, что веб-экран):
 *   · с линиями доска решается логикой и той же ступенью, что записана при выгрузке;
 *   · без линий (та же доска, правило снято) логикой НЕ решается — у всех досок;
 *   · под потолком 3 (вывод варианта отсечён, правило против известных цифр осталось)
 *     решается не больше десятой части — то есть сам приём варианта нужен.
 * 📍 Замер 01.10.2026: шёпот — 48/48 с линиями той же ступенью, без линий 0/48, под потолком
 *    3 — 0/48; ренбан — 48/48, без линий 0/48, под потолком 3 — 1/48; равные суммы (101–104,
 *    задача b0a1feef) — 48/48, без линий 0/48, под потолком 3 — 0/48; палиндром (105–108, задача
 *    25679487) — 48/48, без линий 0/48, под потолком 3 — 2/48; «между концами» (109–112) — 48/48,
 *    без линий 0/48, под потолком 3 — 0/48. Мутации: мера без фильтра линий → краснеет
 *    вторая проба; приём без потолка → краснеет третья.
 *
 * VER 1 был `sudoku-whisper-earns-name.test.ts` — один вариант; с ренбаном таблица вариантов.
 */
import { gradePuzzle, GradeCtx } from '@/src/services/sudoku-grade';
import { ThermoPN, Variant } from '@/src/services/sudoku-core';

declare const require: (m: string) => any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

type Row = { level: number | string; variant: string; n: number | string; br: number | string; bc: number | string;
  puzzle: string; tier: number | string; geometry: Record<string, ThermoPN | undefined> };
const all: Row[] = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'flutter', 'assets', 'levels',
  'sudoku-variant-boards.json'), 'utf8')).boards;

const grid = (s: string, n: number) => Array.from({ length: n }, (_, r) => [...s.slice(r * n, r * n + n)].map(Number));

const LINE_VARIANTS: { variant: Variant; levels: number[]; cap?: number }[] = [
  { variant: 'whisper', levels: [93, 94, 95, 96] },
  { variant: 'renban', levels: [97, 98, 99, 100] },
  { variant: 'regionsum', levels: [101, 102, 103, 104] },
  { variant: 'palindrome', levels: [105, 106, 107, 108] },
  { variant: 'between', levels: [109, 110, 111, 112], cap: 3 },
];

describe.each(LINE_VARIANTS)('«$variant» заслуживает своё имя на досках, которые получает человек', ({ variant, levels, cap = 3 }) => {
  const boards = all.filter((b) => b.variant === variant);
  const ctx = (b: Row): GradeCtx => ({ N: Number(b.n), BR: Number(b.br), BC: Number(b.bc), variant, [variant]: b.geometry[variant] });

  it('есть что мерить: доски своих ступеней в выгрузке', () => {
    expect(boards.length).toBeGreaterThanOrEqual(40);
    expect(new Set(boards.map((b) => Number(b.level)))).toEqual(new Set(levels));
  });

  it('🔴 с линиями — решается той же ступенью; без линий — не решается ни одна', () => {
    let withLines = 0, sameTier = 0, withoutLines = 0;
    for (const b of boards) {
      const p = grid(b.puzzle, Number(b.n));
      const g = gradePuzzle(p, ctx(b));
      if (g.solved) withLines++;
      if (g.solved && g.tier === Number(b.tier)) sameTier++;
      if (gradePuzzle(p, { N: Number(b.n), BR: Number(b.br), BC: Number(b.bc), variant: 'none' }).solved) withoutLines++;
    }
    expect(`с линиями ${withLines}/${boards.length}, ступень сошлась ${sameTier}, без линий ${withoutLines}`)
      .toBe(`с линиями ${boards.length}/${boards.length}, ступень сошлась ${boards.length}, без линий 0`);
  });

  // Потолок — на ступень НИЖЕ приёма варианта. Все выводы вариантов — ступень 4 (класс включается
  // флагом `выводВарианта` с 4), поэтому потолок 3. 01.10: палиндром сперва стоял на ступени 3 с
  // потолком 2 — мутация «приём без потолка» выжила: при потолке 2 доске не хватает своих приёмов.
  it('🔴 приём линии нужен: под потолком ниже приёма решается не больше десятой части досок', () => {
    let capped = 0;
    for (const b of boards) if (gradePuzzle(grid(b.puzzle, Number(b.n)), ctx(b), cap).solved) capped++;
    expect(`под потолком ${cap} решено ${capped}/${boards.length}: не больше десятой части — ${capped <= boards.length / 10}`)
      .toBe(`под потолком ${cap} решено ${capped}/${boards.length}: не больше десятой части — true`);
  });
});

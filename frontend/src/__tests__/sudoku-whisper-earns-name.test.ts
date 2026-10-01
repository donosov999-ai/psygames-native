/* psygames-sudoku-whisper-earns-name · VER 1 · 01.10.2026 · psygames-sudoku-claude-mac */
/**
 * «НЕМЕЦКИЙ ШЁПОТ» ОБЯЗАН ЗАСЛУЖИВАТЬ СВОЁ ИМЯ (задача 5b0b7ca2, приёмка из карточки).
 *
 * Доска 93–96 с линиями, которые ничего не решают, — это классика с зелёным декором.
 * Гейт меряет ПОВЕДЕНИЕ меры на досках, которые получает человек (выгрузка натива
 * `flutter/assets/levels/sudoku-variant-boards.json` собрана тем же путём, что веб-экран):
 *   · с линиями доска решается логикой и той же ступенью, что записана при выгрузке;
 *   · без линий (та же доска, правило снято) логикой НЕ решается — у всех досок;
 *   · под потолком 3 (вывод варианта отсечён, правило против известных соседей осталось)
 *     решается не больше десятой части — то есть сам приём `whisper_line` нужен.
 * 📍 Замер 01.10.2026 на 48 досках выгрузки: с линиями 48/48 той же ступенью, без линий 0/48,
 *    под потолком 3 — 0/48. Мутации: мера без фильтра линий → краснеет вторая проба; приём
 *    `whisper_line` без потолка → краснеет третья.
 */
import { gradePuzzle } from '@/src/services/sudoku-grade';
import { ThermoPN } from '@/src/services/sudoku-core';

declare const require: (m: string) => any;
declare const __dirname: string;
const { readFileSync } = require('fs');
const { join } = require('path');

type Row = { level: number | string; variant: string; n: number | string; br: number | string; bc: number | string;
  puzzle: string; tier: number | string; geometry: { whisper?: ThermoPN } };
const boards: Row[] = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'flutter', 'assets', 'levels',
  'sudoku-variant-boards.json'), 'utf8')).boards.filter((b: Row) => b.variant === 'whisper');

const grid = (s: string, n: number) => Array.from({ length: n }, (_, r) => [...s.slice(r * n, r * n + n)].map(Number));

describe('немецкий шёпот заслуживает своё имя на досках, которые получает человек', () => {
  it('есть что мерить: доски 93–96 в выгрузке', () => {
    expect(boards.length).toBeGreaterThanOrEqual(40);
    expect(new Set(boards.map((b) => Number(b.level)))).toEqual(new Set([93, 94, 95, 96]));
  });

  it('🔴 с линиями — решается той же ступенью; без линий — не решается ни одна', () => {
    let withLines = 0, sameTier = 0, withoutLines = 0;
    for (const b of boards) {
      const n = Number(b.n), BR = Number(b.br), BC = Number(b.bc);
      const p = grid(b.puzzle, n);
      const g = gradePuzzle(p, { N: n, BR, BC, variant: 'whisper', whisper: b.geometry.whisper });
      if (g.solved) withLines++;
      if (g.solved && g.tier === Number(b.tier)) sameTier++;
      if (gradePuzzle(p, { N: n, BR, BC, variant: 'none' }).solved) withoutLines++;
    }
    expect(`с линиями ${withLines}/${boards.length}, ступень сошлась ${sameTier}, без линий ${withoutLines}`)
      .toBe(`с линиями ${boards.length}/${boards.length}, ступень сошлась ${boards.length}, без линий 0`);
  });

  it('🔴 приём линии нужен: под потолком 3 решается не больше десятой части досок', () => {
    let capped = 0;
    for (const b of boards) {
      const n = Number(b.n), BR = Number(b.br), BC = Number(b.bc);
      if (gradePuzzle(grid(b.puzzle, n), { N: n, BR, BC, variant: 'whisper', whisper: b.geometry.whisper }, 3).solved) capped++;
    }
    expect(`под потолком 3 решено ${capped}/${boards.length}: не больше десятой части — ${capped <= boards.length / 10}`)
      .toBe(`под потолком 3 решено ${capped}/${boards.length}: не больше десятой части — true`);
  });
});

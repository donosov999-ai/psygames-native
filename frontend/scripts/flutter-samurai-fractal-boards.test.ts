/* psygames-flutter-samurai-fractal-boards · VER 1 · 02.10.2026 · psygames-sudoku-claude-mac */
/**
 * ДОСКИ САМУРАЯ И ПАРТИИ ФРАКТАЛА ДЛЯ НАТИВНЫХ ЭКРАНОВ — ПРОГОНОМ ЖИВОГО ГЕНЕРАТОРА НА TS.
 *
 * 🔴 ЗАЧЕМ ФАЙЛ (задача 3eeee354). 23.09.2026 оба файла выгрузили разовой пробой, и она в
 * репозиторий не попала: опись 01.10 (`assets-without-exporter-2026-10-01.md`) записала их
 * «дырой» — ни выгрузчика, ни источника. Хуже: та проба звала генераторы БЕЗ ЗЕРНА
 * (`generateFractal(lvl.level)`, `Math.random` самурая), так что те доски не воспроизвести
 * ничем. Здесь у каждой доски своё зерно — повторный прогон даёт тот же файл байт в байт.
 *
 * Пишет в `flutter/assets/levels/`:
 *   · samurai-boards.json — по PER_SAMURAI досок на каждую из 12 ступеней тем же путём, что
 *     экран (`buildSamuraiLevel` = `samuraiBuilder` до конца, без кадров); `Math.random`
 *     подменён сеяным генератором, зерно — `samurai-<ступень>-<номер>`. Холст 21×21
 *     строкой: цифра (0 — пусто) в клетках пяти сеток, «.» вне их.
 *   · fractal-boards.json — по PER_FRACTAL партий на каждую из 30 ступеней:
 *     `generateFractal(ступень, 'fractal-<ступень>-<номер>')` — у фрактала зерно своё
 *     (строкой; обещание сида проверяет seed.test.ts). Доски — строками по 81 цифре.
 *
 * Каждая доска проверяется до записи: подсказки совпадают с решением, число пустых —
 * записанное. Правила и единственность стережёт перенос: flutter/test/samurai_levels_test.dart,
 * fractal_levels_test.dart.
 *
 * ЭТО НЕ ПРОБА, А ПРИБОР: в обычный прогон не попадает (jest берёт только
 * `src/__tests__/**`). Перевыпуск — из `frontend/` (несколько минут: самурай верхних ступеней
 * собирается секундами):
 *   npx jest --rootDir . --testMatch '**\/scripts\/flutter-samurai-fractal-boards.test.ts'
 * Затем: cd ../flutter && flutter test test/samurai_levels_test.dart test/fractal_levels_test.dart
 */
import { buildSamuraiLevel, CELLS, type SamuraiLevel } from '@/app/games/sudoku-samurai';
import { generateFractal, type FractalPuzzle } from '@/src/services/fractal-sudoku';
import { FRACTAL_MAX_LEVEL } from '@/src/services/fractalLevels';

declare function require(id: string): any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../flutter/assets/levels');
const SAMURAI_LEVELS = 12;
const PER_SAMURAI = 6;
const PER_FRACTAL = 3;
const SIZE = 21;

jest.setTimeout(60 * 60 * 1000);

/** mulberry32 от FNV-1a строки зерна — тот же сеяный генератор, что у выгрузчика судоку. */
function seeded(seed: string): () => number {
  let h = 0x811c9dc5;
  for (const ch of seed) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 0x01000193);
  let s = h | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Запись на строку: размер почти как у одной строки, а пересборка видна построчно. */
function write(name: string, source: string, key: string, records: unknown[]) {
  const body = records.map((r) => JSON.stringify(r)).join(',\n');
  fs.writeFileSync(path.join(OUT, name), `{"source":${JSON.stringify(source)},"${key}":[\n${body}\n]}\n`);
}

const flat = (b: ArrayLike<ArrayLike<number>>): string => Array.from(b, (row) => Array.from(row).join('')).join('');

function expectGivensFromSolution(puzzle: string, solution: string, where: string) {
  for (let i = 0; i < puzzle.length; i++) {
    if (puzzle[i] !== '0' && puzzle[i] !== '.' && puzzle[i] !== solution[i]) {
      throw new Error(`${where}: подсказка ${i} = ${puzzle[i]}, а в решении ${solution[i]}`);
    }
  }
}

test('самурай: 12 ступеней по 6 досок, с зерном', () => {
  const inShape = new Set(CELLS.map(([r, c]) => r * SIZE + c));
  const canvas = (b: SamuraiLevel['puzzle']): string => {
    let s = '';
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) s += inShape.has(r * SIZE + c) ? String(b[r][c]) : '.';
    return s;
  };
  const real = Math.random;
  const boards: unknown[] = [];
  try {
    for (let level = 1; level <= SAMURAI_LEVELS; level++) {
      for (let i = 0; i < PER_SAMURAI; i++) {
        Math.random = seeded(`samurai-${level}-${i}`);
        const best = buildSamuraiLevel(level).best;
        const puzzle = canvas(best.puzzle), solution = canvas(best.solution);
        const where = `самурай ${level}#${i}`;
        expectGivensFromSolution(puzzle, solution, where);
        const blanks = [...puzzle].filter((ch) => ch === '0').length;
        if (blanks !== best.blanks) throw new Error(`${where}: пустых ${blanks}, генератор говорит ${best.blanks}`);
        boards.push({ level, puzzle, solution, tier: best.tier, blanks });
      }
    }
  } finally {
    Math.random = real;
  }
  write('samurai-boards.json',
    'frontend/scripts/flutter-samurai-fractal-boards.test.ts: buildSamuraiLevel, seed samurai-<level>-<i>', 'boards', boards);
  expect(boards).toHaveLength(SAMURAI_LEVELS * PER_SAMURAI);
});

test('фрактал: 30 ступеней по 3 партии, с зерном', () => {
  const games: unknown[] = [];
  for (let level = 1; level <= FRACTAL_MAX_LEVEL; level++) {
    for (let i = 0; i < PER_FRACTAL; i++) {
      const g: FractalPuzzle = generateFractal(level, `fractal-${level}-${i}`);
      const where = `фрактал ${level}#${i}`;
      const r = g.root;
      const root = { puzzle: flat(r.puzzle), solution: flat(r.solution), blanks: r.blanks, tier: r.tier, needsChildren: r.needsChildren };
      expectGivensFromSolution(root.puzzle, root.solution, `${where} корень`);
      const children = g.children.map((ch, k) => {
        const c = {
          puzzle: flat(ch.puzzle), solution: flat(ch.solution), feedsCell: ch.feedsCell,
          blanks: ch.blanks, unlockCells: ch.unlockCells, tier: ch.tier,
        };
        expectGivensFromSolution(c.puzzle, c.solution, `${where} сетка ${k}`);
        return c;
      });
      games.push({ level: g.level, root, children, portals: g.portals });
    }
  }
  write('fractal-boards.json',
    "frontend/scripts/flutter-samurai-fractal-boards.test.ts: generateFractal(level, 'fractal-<level>-<i>')", 'games', games);
  expect(games).toHaveLength(FRACTAL_MAX_LEVEL * PER_FRACTAL);
});

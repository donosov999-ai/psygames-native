/* psygames-sudoku-native-boards-drift · VER 1 · 01.10.2026 */
/**
 * 🔴 ДОСКИ «СУДОКУ» У FLUTTER СОВПАДАЮТ С ЖИВЫМ TS (задача 6e9cedbc).
 *
 * Нативный экран играет доски данными из `flutter/assets/levels/sudoku-*.json`, которые
 * выгружает `flutter/tools/export-sudoku-boards.cjs` прогоном этого самого ядра. Выгрузка —
 * снимок: поставили новый вариант на ступень в `levelConfig`, сдвинули полосу банка или
 * мини-лестницу режима — и не перевыгрузили. Тогда веб и приложение играют РАЗНЫЕ лестницы,
 * а обе половины при этом зелёные (урок «эталон замораживает перенос, а не источник»).
 *
 * Здесь сверяется всё, что считается без случайности: лестница, полосы, банк, ПРАВИЛО каждой
 * выгруженной доски и ступени режимов. Сами доски случайны — их целость, единственность и
 * меру проверяет выгрузка до записи, а Dart-сторона — `flutter/test/sudoku_levels_test.dart`.
 */
import { levelConfig, dimsForSize, killerStepCount, killerBlanksForStep, blanksFor } from '@/src/services/sudoku-core';
import { BANK_N, RATING_LADDER } from '@/src/services/sudoku-bank';
import { sideStepCfg, sideStepCount } from '@/src/services/sudoku-modes';

declare const __dirname: string;
declare function require(id: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const LEVELS_DIR = join(__dirname, '..', '..', '..', 'flutter', 'assets', 'levels');
const readLevels = (file: string) => JSON.parse(readFileSync(join(LEVELS_DIR, file), 'utf8'));
const EXPORT_CMD = 'из корня репозитория: node flutter/tools/export-sudoku-boards.cjs';

const screenSrc: string = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'sudoku.tsx'), 'utf8');
const LAST_LEVEL = Number(/const SUDOKU_LAST_LEVEL = (\d+);/.exec(screenSrc)?.[1]);
// Банк — классика 9×9 и ступени со своей полосой банка (`bankRating`: Wordoku, звери, 08.10).
const isBankLevel = (lv: number) => {
  const c = levelConfig(lv);
  return (c.variant === 'none' || c.bankRating !== undefined) && c.N === BANK_N;
};

describe('доски судоку у Flutter = живой TS', () => {
  it('конец лестницы найден в экране', () => {
    expect(LAST_LEVEL).toBeGreaterThanOrEqual(80);
  });

  it('лестница = levelConfig 1…SUDOKU_LAST_LEVEL', () => {
    const inFile = readLevels('sudoku-ladder.json').ladder as { level: number }[];
    const diverged: string[] = [];
    for (let lv = 1; lv <= Math.max(LAST_LEVEL, inFile.length); lv++) {
      const c = levelConfig(lv);
      const live = lv <= LAST_LEVEL
        ? {
          level: lv, n: c.N, br: c.BR, bc: c.BC, blanks: c.blanks, variant: c.variant, hintMax: c.hintMax, lives: c.lives,
          ...(c.bankRating !== undefined ? { rating: c.bankRating } : {}),
        }
        : undefined;
      if (JSON.stringify(live) !== JSON.stringify(inFile[lv - 1])) diverged.push(`L${lv}`);
    }
    expect(diverged.length ? `лестница разошлась: ${diverged.join(', ')} — перевыгрузи: ${EXPORT_CMD} --no-boards --no-modes`
      : 'совпадает').toBe('совпадает');
  });

  it('полосы банка = RATING_LADDER (открытая последняя — как 1e9)', () => {
    const liveRows = RATING_LADDER.map((r) => ({ upTo: Number.isFinite(r.upTo) ? r.upTo : 1000000000, rating: r.rating }));
    expect(readLevels('sudoku-ladder.json').ratingRows).toEqual(liveRows);
  });

  it('банк — байт в байт тот же файл, что возит веб', () => {
    const web = readFileSync(join(__dirname, '..', 'services', 'sudoku-bank', 'boards.json'), 'utf8');
    const native = readFileSync(join(LEVELS_DIR, 'sudoku-bank.json'), 'utf8');
    expect(native === web ? 'тот же' : `разошёлся — перевыгрузи: ${EXPORT_CMD} --no-boards --no-modes`).toBe('тот же');
  });

  it('у каждой вариантной ступени есть доски, и это доски ЕЁ правила', () => {
    const boards = readLevels('sudoku-variant-boards.json').boards as
      { level: number; variant: string; n: number; br: number; bc: number; puzzle: string }[];
    const byLevel = new Map<number, typeof boards>();
    for (const b of boards) (byLevel.get(b.level) ?? byLevel.set(b.level, []).get(b.level)!).push(b);
    const problems: string[] = [];
    for (let lv = 1; lv <= LAST_LEVEL; lv++) {
      const own = byLevel.get(lv) ?? [];
      if (isBankLevel(lv)) {
        if (own.length) problems.push(`L${lv} банковая, а досок в выгрузке ${own.length}`);
        continue;
      }
      const c = levelConfig(lv);
      if (!own.length) problems.push(`L${lv} (${c.variant}) без досок`);
      const foreign = own.filter((b) => b.variant !== c.variant || b.n !== c.N || b.br !== c.BR || b.bc !== c.BC
        // клетки Шрёдингера — коды 1..10 и 100+, поэтому через запятую (toStr выгрузки)
        || (b.puzzle.includes(',') ? b.puzzle.split(',').length : b.puzzle.length) !== c.N * c.N);
      if (foreign.length) problems.push(`L${lv}: ${foreign.length} досок правила ${foreign[0].variant} ${foreign[0].n}×${foreign[0].n}, а ступень — ${c.variant} ${c.N}×${c.N}`);
    }
    for (const lv of byLevel.keys()) if (lv > LAST_LEVEL) problems.push(`L${lv} за концом лестницы`);
    const rebuild = problems.map((p) => Number(/^L(\d+)/.exec(p)?.[1]))
      .filter((lv) => lv > 0 && lv <= LAST_LEVEL && !isBankLevel(lv));
    // Ступень стала банковой — пересобирать её нечем, лишние доски снимет полная выгрузка.
    const which = rebuild.length ? ` --levels=${rebuild.join(',')}` : '';
    expect(problems.length ? `${problems.join(' · ')} — перевыгрузи: ${EXPORT_CMD} --no-modes${which}`
      : 'совпадает').toBe('совпадает');
    expect(boards.length).toBeGreaterThan(500);   // проба не пустая
  });

  it('мини-лестницы режимов: ступени и их настройки = sudoku-modes.ts', () => {
    const modes = readLevels('sudoku-modes.json').modes as Record<string,
      { step: number; blanks: number; band: { min: number; max: number }; puzzle: string }[]>;
    for (const mode of ['towers', 'unequal'] as const) {
      const rows = modes[mode] ?? [];
      const { N } = dimsForSize(mode === 'towers' ? 6 : 9);
      const problems: string[] = [];
      for (let step = 1; step <= sideStepCount(mode); step++) {
        const cfg = sideStepCfg(mode, step);
        const own = rows.filter((s) => s.step === step);
        if (!own.length) problems.push(`ступень ${step} без досок`);
        if (own.some((s) => s.blanks !== cfg.blanks || s.band.min !== cfg.band.min || s.band.max !== cfg.band.max)) {
          problems.push(`ступень ${step}: настройки разошлись с sideStepCfg`);
        }
        if (own.some((s) => s.puzzle.length !== N * N)) problems.push(`ступень ${step}: доска не ${N}×${N}`);
      }
      if (rows.some((s) => s.step > sideStepCount(mode))) problems.push('доски за концом мини-лестницы');
      expect(problems.length ? `${mode}: ${problems.join(' · ')} — перевыгрузи: ${EXPORT_CMD} --no-boards --modes=${mode}`
        : 'совпадает').toBe('совпадает');
    }
  });

  /**
   * «Киллер» и «Свободно» (задача 55b97845): глубина досок натива = ядру веба. Киллер — ступени
   * KILLER_LADDER (killerBlanksForStep), свободно — 6 пресетов blanksFor(6|9, easy|medium|hard).
   */
  it('«Киллер» и «Свободно»: ступени и глубина = sudoku-core', () => {
    const modes = readLevels('sudoku-modes.json').modes as Record<string,
      { step: number; blanks: number; puzzle: string; size?: number; difficulty?: string; cages?: unknown }[]>;
    const problems: string[] = [];
    const killer = modes.killer ?? [];
    for (let step = 1; step <= killerStepCount(); step++) {
      const own = killer.filter((s) => s.step === step);
      if (!own.length) problems.push(`киллер ${step}: досок нет`);
      if (own.some((s) => s.blanks !== killerBlanksForStep(step) || s.puzzle.length !== 81 || !s.cages)) {
        problems.push(`киллер ${step}: глубина/размер/суммы разошлись`);
      }
    }
    const presets = [[6, 'easy'], [6, 'medium'], [6, 'hard'], [9, 'easy'], [9, 'medium'], [9, 'hard']] as const;
    const free = modes.free ?? [];
    presets.forEach(([size, diff], i) => {
      const own = free.filter((s) => s.step === i + 1);
      if (!own.length) problems.push(`свободно ${i + 1}: досок нет`);
      if (own.some((s) => s.size !== size || s.difficulty !== diff || s.blanks !== blanksFor(size, diff) || s.puzzle.length !== size * size)) {
        problems.push(`свободно ${i + 1}: пресет разошёлся с blanksFor`);
      }
    });
    expect(problems.length ? `${problems.join(' · ')} — перевыгрузи: ${EXPORT_CMD} --no-boards --modes=killer,free`
      : 'совпадает').toBe('совпадает');
  });
});

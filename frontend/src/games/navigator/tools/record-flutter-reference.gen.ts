/* psygames-navigator-record-flutter-reference · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «НАВИГАТОРА» → `flutter/test/fixtures/navigator-reference.json`.
 *
 * 🔴 ЗАЧЕМ. Партия раздаётся по зерну, и одно зерно обязано дать ОДНУ И ТУ ЖЕ партию в вебе и
 * в приложении. Dart-перенос ядра (`flutter/lib/games/navigator/`) сверяется с этим файлом,
 * снятым прогоном ЖИВОГО TS-ядра.
 *
 * ⚠️ ПОЧЕМУ ЭКСПОРТЁР ЛЕЖИТ В РЕПО, А НЕ ВРЕМЕННОЙ ПРОБОЙ. Урок проекта: вшитые данные без
 * экспортёра не чинятся — у 14 лестниц в assets/levels экспортёра не было ни к одной, и после
 * правки ядра эталон переснять было нечем. А ещё урок 23.09: эталон замораживает ПЕРЕНОС, а не
 * источник — правка TS после снятия расходит половины молча. Поэтому:
 *   ПОСЛЕ ЛЮБОЙ ПРАВКИ `frontend/src/games/navigator/core/*` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ЭТАЛОН.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/navigator/tools/record-flutter-reference.gen.ts'
 */
import { generateNavigatorRound, navigatorModeForLevel } from '../core/generator';
import { homeSectorForBearing } from '../core/geometry';
import { NAVIGATOR_MODES, LEVELS, type NavigatorRound } from '../core/types';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const ПУТЬ = join(__dirname, '../../../../../flutter/test/fixtures/navigator-reference.json');

/** Зёрна подобраны под причёсывание: пробелы, подчёркивания, регистр, пустое. */
const ЗЁРНА = ['nav-a', 'nav-b', '  Mixed_Case__Seed  ', ''];

const клетка = (c: { x: number; y: number }) => [c.x, c.y];

function выгрузить(r: NavigatorRound) {
  return {
    id: r.id, seed: r.seed, level: r.level, mode: r.mode, difficulty: r.difficulty,
    gridSize: r.gridSize, routeSteps: r.routeSteps,
    route: r.route.map(клетка), routeDirections: r.routeDirections,
    startingFacing: r.startingFacing, turns: r.turns,
    landmarks: r.landmarks.map((l) => ({ id: l.id, cell: клетка(l.cell), symbol: l.symbol })),
    falseBranches: r.falseBranches.map((b) => ({ from: клетка(b.from), to: клетка(b.to) })),
    mapRotation: r.mapRotation, hideMapDuringRecall: r.hideMapDuringRecall,
    delaySteps: r.delaySteps, homeBearingDeg: r.homeBearingDeg,
    correctHomeSector: r.correctHomeSector,
  };
}

it('выгрузка эталона генератора «Навигатора»', () => {
  const rounds: unknown[] = [];
  for (const seed of ЗЁРНА) {
    for (let level = 1; level <= LEVELS; level += 1) {
      rounds.push({ request: { seed, level, mode: null }, round: выгрузить(generateNavigatorRound(seed, level)) });
    }
  }
  // Принудительный режим: партия не по лестнице, а выбранного вида.
  for (const mode of NAVIGATOR_MODES) {
    for (const level of [1, 10, 25]) {
      rounds.push({ request: { seed: 'nav-mode', level, mode }, round: выгрузить(generateNavigatorRound('nav-mode', level, mode)) });
    }
  }
  const modeForLevel = [-3, 0, 0.5, 1, 2.9, 7, 33, 34, 99].map((level) => ({ level, mode: navigatorModeForLevel(level) }));
  const sectors = Array.from({ length: 72 }, (_, i) => i * 5 - 20).map((bearing) => ({ bearing, sector: homeSectorForBearing(bearing) }));
  writeFileSync(ПУТЬ, JSON.stringify({ generatorVersion: 'navigator-generator-v1', rounds, modeForLevel, sectors }, null, 1) + '\n');
  expect(rounds.length).toBe(ЗЁРНА.length * LEVELS + NAVIGATOR_MODES.length * 3);
});

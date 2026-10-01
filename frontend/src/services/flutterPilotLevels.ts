/**
 * УРОВНИ ПИЛОТА FLUTTER — «Соедини точки» и «Одной линией» (задача 3dc0168c).
 *
 * 📍 Нативные экраны берут уровни не генератором на Dart, а готовыми из ассетов
 * `flutter/assets/levels/dots_connect.json` и `one_line.json` — их выпускает ЭТОТ ЖЕ
 * TS-генератор, что и веб (приём пилота 23.09.2026). До 01.10.2026 выгрузчика в репо не
 * было: файлы лежали с переезда пилота (63049fd49), и пересобрать их было нечем — ручную
 * правку стёрла бы первая пересборка, а без неё данные расходятся с вебом молча.
 * Замер 01.10.2026: эти функции воспроизводят оба файла один в один (40/40 + тренировка,
 * 30/30; dots_connect.json — байт в байт).
 *
 * Выгрузка: `npx jest --rootDir . --testMatch '**\/scripts/flutter-pilot-levels.test.ts'`.
 * Сторож расхождения: `src/__tests__/flutter-pilot-levels-match-generator.test.ts`.
 */
import { generateDotsPuzzle, generateDotsTrainingPuzzle } from '@/src/games/dots-connect/core/generator';
import { generateOneLinePuzzle } from '@/src/games/one-line/core/generator';

export const PILOT_SEED = 'flutter-pilot';
export const DOTS_LEVELS = 40;
export const ONE_LINE_LEVELS = 30;
/** Дата выгрузки в файле. Меняется только вместе с содержимым — иначе пересборка шумит. */
export const DOTS_EXPORTED_AT = '2026-09-23';

export function pilotDotsConnect() {
  return {
    generator: 'dots-connect',
    exportedAt: DOTS_EXPORTED_AT,
    seed: PILOT_SEED,
    training: generateDotsTrainingPuzzle(PILOT_SEED),
    levels: Array.from({ length: DOTS_LEVELS }, (_, i) => generateDotsPuzzle(PILOT_SEED, i + 1)),
  };
}

export function pilotOneLine() {
  return {
    generator: 'one-line',
    seed: PILOT_SEED,
    levels: Array.from({ length: ONE_LINE_LEVELS }, (_, i) => generateOneLinePuzzle(PILOT_SEED, i + 1)),
  };
}

/* psygames-trail-making-record-flutter-reference · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * ЭТАЛОН ДЛЯ FLUTTER-ПОЛОВИНЫ «СОЕДИНИ ЦЕПОЧКУ» → `flutter/test/fixtures/trail-making-reference.json`.
 *
 * 🔴 ЧТО СВЕРЯЕТСЯ ТОЧНО, А ЧТО СВОЙСТВАМИ. Лестница (`levelParams`) и всё, что раскладка узлов считает
 * БЕЗ случайности (подписи, колонки, ячейка, диаметр, дрожание), выгружаются здесь числами. Сами точки
 * веб ставит через `Math.random` без зерна — каждая партия своя, и сверять их поштучно нечего. Для них
 * Dart-проба проверяет СВОЙСТВА: кружки не накладываются, узлы лежат в поле, порядок подписей верный.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `levelParams` или `makeNodes` в `frontend/app/games/trail-making.tsx` — ПЕРЕЗАПУСТИТЬ
 * И ЗАКОММИТИТЬ ЭТАЛОН: он замораживает перенос, а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`): npx jest --testMatch '**\/trail-making/tools/record-flutter-reference.gen.ts'
 */
import { levelParams, makeNodes, JITTER_MAX, LAYOUT_PAD, NODE_MAX, NODE_MIN, type Mode } from '@/app/games/trail-making';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const OUT = join(__dirname, '../../../../../flutter/test/fixtures/trail-making-reference.json');

it('выгрузка эталона «Соедини цепочку»', () => {
  const levels = Array.from({ length: 20 }, (_, i) => i + 1).map((level) => ({ level, ...levelParams(level) }));
  const layouts: unknown[] = [];
  const cases: [Mode, number][] = [['A', 6], ['A', 9], ['A', 12], ['B', 4], ['B', 8], ['B', 11], ['B', 25]];
  const canvases: [number, number][] = [[328, 352], [358, 460], [600, 460], [280, 250], [700, 300]];
  for (const [mode, n] of cases) {
    for (const lang of ['ru', 'en', 'de']) {
      for (const [w, h] of canvases) {
        const l = makeNodes(mode, n, lang, w, h);
        layouts.push({ mode, n, lang, w, h, size: l.size, cell: l.cell, jitter: l.jitter, labels: l.nodes.map((x) => x.label) });
      }
    }
  }
  writeFileSync(OUT, JSON.stringify({ constants: { JITTER_MAX, LAYOUT_PAD, NODE_MAX, NODE_MIN }, levels, layouts }, null, 1) + '\n');
  expect(levels).toHaveLength(20);
});

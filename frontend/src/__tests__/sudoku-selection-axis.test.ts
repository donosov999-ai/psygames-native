/* psygames-gate-sudoku-selection-axis · VER 1 · 09.09.2026 */
/**
 * ОСЬ «СКОЛЬКО ДОСОК ПРОСМОТРЕТЬ, ПРЕЖДЕ ЧЕМ ВЫБРАТЬ».
 *
 * 🔴 ЗАЧЕМ. Замер 09.09.2026: у 27 пар соседних уровней из 91 совпадает ВСЁ — вариант,
 * число пустых и полоса трудности. Две серии идут по четыре подряд (L30–33 evenodd,
 * L34–37 kropki). Причина — два потолка сразу: пустые упираются в 58, полоса — в
 * потолок варианта (evenodd 4). По правилу «потолков нет» это значит, что ось не
 * найдена, а не что её нет.
 *
 * Найденная ось: место уровня в серии. Первый берёт первую подходящую доску, второй —
 * лучшую из двух. Замер на боевом пути, 18 досок на уровень: L30 ср 97 → L31 ср 108.
 *
 * ⚠️ ЧЕГО ЭТА ПРОБА НЕ ДЕЛАЕТ. Она НЕ мерит рост `cost` — это стоило бы минуты
 * генерации и краснело бы от невезения (см. флак-историю в sudoku-geometry). Она
 * сторожит ПРОВОДКУ: что серии находятся, что банковские уровни исключены, что
 * значение доходит до построителя и меняет его поведение.
 */
import { selectionLookForLevel, logicalBuilder } from '@/src/services/sudoku-grade';
import { levelConfig, dimsForSize } from '@/src/services/sudoku-core';
import { roadTier } from '@/src/services/sudoku-roads';

declare const __dirname: string;
declare function require(id: string): any;

test('🔴 серии одинаковых уровней найдены: первый 1, последующие 2', () => {
  // L30–33 evenodd и L34–37 kropki — замеренные серии, ради которых ось заведена
  expect(`L30..33 → ${[30, 31, 32, 33].map(selectionLookForLevel).join(',')}`)
    .toBe('L30..33 → 1,2,2,2');
  expect(`L34..37 → ${[34, 35, 36, 37].map(selectionLookForLevel).join(',')}`)
    .toBe('L34..37 → 1,2,2,2');
});

test('🔴 банковские уровни исключены: там построителя нет, настройка была бы холостой', () => {
  const банковские = [5, 6, 7, 8, 60, 70, 80].filter((L) => {
    const c = levelConfig(L) as unknown as { N: number; variant: string };
    return c.variant === 'none' && c.N === 9;
  });
  expect(банковские.length).toBeGreaterThan(4);   // выборка не пуста
  expect(`банковских с look>1: ${банковские.filter((L) => selectionLookForLevel(L) > 1).length}`)
    .toBe('банковских с look>1: 0');
});

test('🔴 look доходит до построителя и меняет число просмотренных досок', () => {
  const L = 33;                       // из серии, look = 2
  const cfg = levelConfig(L) as any;
  const d = dimsForSize(cfg.N);
  const прогон = (look: number) => {
    const b = logicalBuilder(L, cfg.blanks, d.N, d.BR, d.BC, cfg.variant, {
      budgetMs: 2200, tier: roadTier(L, 'normal'), look,
    });
    let шагов = 0;
    for (let i = 0; i < b.steps; i++) { const r = b.step(); шагов++; if (r && b.enough(r)) break; }
    return шагов;
  };
  // при look=1 останавливается на первой подходящей, при look=2 — не раньше второй
  expect(`look=1 просмотрел ${прогон(1)} · look=2 просмотрел не меньше ${Math.min(прогон(2), 2)}`)
    .toBe('look=1 просмотрел 1 · look=2 просмотрел не меньше 2');
});

test('🔴 экран передаёт look в построитель — иначе ось объявлена и не подключена', () => {
  const SRC = require('fs').readFileSync(
    require('path').join(__dirname, '../../app/games/sudoku.tsx'), 'utf8') as string;
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  expect(`экран зовёт selectionLookForLevel: ${/look:\s*selectionLookForLevel\(lv\)/.test(code)}`)
    .toBe('экран зовёт selectionLookForLevel: true');
});

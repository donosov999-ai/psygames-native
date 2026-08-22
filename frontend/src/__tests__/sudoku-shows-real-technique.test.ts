/* psygames-sudoku-shows-real-technique · VER 1 · 22.08.2026 */
/**
 * КЛАССИКА ПОКАЗЫВАЕТ ПРИЁМ ЭТОЙ ДОСКИ, А НЕ ЯРЛЫК ПО НОМЕРУ УРОВНЯ.
 *
 * 🔴 ЧТО НАШЛОСЬ. Самурай и фрактал показывают ступень, посчитанную ГРАДАТОРОМ для
 * конкретной сетки — у фрактала это прямо написано: «Настоящий приём ИМЕННО ЭТОЙ
 * сетки: соседние в той же партии бывают легче». В классической судоку на экране
 * стоял `sudokuDifficultyTier(level)` — ярлык, выведенный из НОМЕРА уровня
 * (подсказки, дырки, вариант). Про доску, которую сейчас раздали, он не знает ничего.
 *
 * Замер по всем 57 уровням:
 *
 *     beginner  1..4   (4)      expert   22..33 (12)
 *     easy      5..8   (4)      extreme  34..57 (24)  ← шесть разных правил
 *     medium    9..13  (5)                              одним словом
 *     hard      14..21 (8)
 *
 * Двадцать четыре уровня подряд назывались одинаково, притом что настоящая ступень
 * одной и той же доски гуляет от второй до шестой (замер генератора: L42 давал
 * 3, 2, 3; L45 — 2, 4, 6). Слово на экране было для красоты.
 *
 * ⚠️ КЛЮЧИ ПРИЁМОВ ПЕРЕИСПОЛЬЗУЕМ, А НЕ ЗАВОДИМ ВТОРЫЕ. Шесть приёмов уже описаны и
 * переведены на 12 языков для фрактала; вторая таблица тех же слов разъехалась бы с
 * первой при первой же правке.
 */
import { levelConfig, sudokuDifficultyTier } from '@/src/services/sudoku-core';
import { generateLogical, gradePuzzle } from '@/src/services/sudoku-grade';
import { roadTier } from '@/src/services/sudoku-roads';
import { fractalTechniqueKey, FRACTAL_TECHNIQUE_KEYS } from '@/src/services/fractalLevels';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');
const SCREEN: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/sudoku.tsx'), 'utf8');

describe('ярлык по номеру уровня — не про доску', () => {
  it('🔴 он и правда почти ничего не различает наверху', () => {
    const byLabel = new Map<string, number[]>();
    for (let lv = 1; lv <= 57; lv += 1) {
      const lab = sudokuDifficultyTier(lv);
      byLabel.set(lab, [...(byLabel.get(lab) ?? []), lv]);
    }
    const extreme = byLabel.get('extreme') ?? [];
    // Один ярлык на два десятка уровней — не описание доски, а заглушка.
    expect(`уровней под одним словом: ${extreme.length >= 20}`).toBe('уровней под одним словом: true');
    const variants = new Set(extreme.map((lv) => (levelConfig(lv) as { variant: string }).variant));
    expect(`разных правил под ним: ${variants.size >= 5}`).toBe('разных правил под ним: true');
  });
});

describe('экран показывает посчитанную ступень', () => {
  it('🔴 ступень берётся из оценки собранной доски', () => {
    expect(SCREEN).toMatch(/setBoardTier\(made\.grade\.solved \? made\.grade\.tier : null\)/);
    expect(SCREEN).toMatch(/\{t\(fractalTechniqueKey\(boardTier\) as never\)\}/);
  });

  it('🔴 вне режима уровней ступень не показывается — там доска не от логики', () => {
    expect(SCREEN).toMatch(/if \(mode !== 'levels'\) \{ setBoardTier\(null\);/);
  });

  it('🔴 подпись приёма существует для каждой ступени, которую может вернуть градатор', () => {
    for (let tier = 1; tier <= 6; tier += 1) {
      const key = fractalTechniqueKey(tier);
      expect(`ступень ${tier}: ${FRACTAL_TECHNIQUE_KEYS.includes(key)}`).toBe(`ступень ${tier}: true`);
    }
    // и это РАЗНЫЕ подписи, а не одна на всех
    expect(new Set([1, 2, 3, 4, 5, 6].map(fractalTechniqueKey)).size).toBe(6);
  });

  /**
   * ⚠️ ГЛАВНОЕ — ЧТО ПОКАЗАННОЕ СОВПАДАЕТ С ДОСКОЙ. Проверяем настоящей генерацией:
   * ступень, которую отдаёт сборщик, обязана совпасть с оценкой той же доски.
   */
  it('🔴 показанная ступень совпадает с оценкой той самой доски', () => {
    for (const lv of [12, 26, 41]) {
      const c = levelConfig(lv);
      const r = generateLogical(lv, c.blanks, c.N, c.BR, c.BC, c.variant, {
        budgetMs: 2200, tier: roadTier(lv, 'normal'),
      });
      const g = gradePuzzle(r.gen.puzzle, {
        N: c.N, BR: c.BR, BC: c.BC, variant: c.variant,
        regions: r.gen.regions, thermo: r.gen.thermo, arrow: r.gen.arrow, cages: r.gen.cages,
        parity: r.gen.parity, kropki: r.gen.kropki, sandwich: r.gen.sandwich,
      });
      expect(`L${lv}: сборщик ${r.grade.tier}, оценка ${g.tier}`).toBe(`L${lv}: сборщик ${r.grade.tier}, оценка ${r.grade.tier}`);
    }
  }, 120000);
});

/* psygames-sudoku-sandwich-axis-gate · VER 1 · 26.08.2026 */
/**
 * У СЭНДВИЧА СЛОЖНОСТЬ РАСТЁТ КОЛИЧЕСТВОМ СВЕДЕНИЙ, А НЕ СТУПЕНЬЮ ТЕХНИКИ —
 * И ЭТУ ОСЬ НЕ СТОРОЖИЛ НИКТО.
 *
 * 🔴 ЧТО ВЫЯСНИЛОСЬ ЗАМЕРОМ 26.08.2026. Все четыре уровня сэндвича (38–41) дают
 * ступень 4 и только 4 — двадцать досок из двадцати. Выглядит как сломанная
 * лестница, и я сам сперва так и записал. На деле уровни отличаются, просто по
 * ДРУГОЙ оси: сколько сумм показано игроку.
 *   L38 — 18 подсказок из 18   L39 — 14   L40 — 10   L41 — 6
 * Техника одна и та же (вывод из суммы между 1 и 9), а вот сведений всё меньше.
 * Подпись техники на экране при этом честна: приём действительно один.
 *
 * ⚠️ И ОТДЕЛЬНО — КАК Я ЧУТЬ НЕ ЗАПИСАЛ ЛОЖНЫЙ ДЕФЕКТ. Первый замер дал «на L41
 * показано 0–3 подсказки», то есть вариант местами исчезал вовсе. Причина была во
 * мне: генератор уже прорядил подсказки (`generateLogical` → `thinSandwich`), а
 * тест вызвал `thinSandwich` ВТОРОЙ раз поверх. Считать надо то, что лежит в
 * выданной раздаче, и ничего к нему не применять. Поэтому ниже берётся
 * `gen.sandwich` как есть.
 *
 * ЗАЧЕМ ГЕЙТ. Ось живёт в одной константе `SANDWICH_KEEP` и не проверяется ничем:
 * ни один прежний гейт про неё не знал (`grep thinSandwich` по всем проверкам —
 * пусто). Сломайся она — все четыре уровня стали бы одинаковыми, и не покраснело
 * бы НИЧЕГО: ступень-то остаётся 4, а её и сторожат остальные проверки.
 */
import { logicalBuilder } from '@/src/services/sudoku-grade';
import { levelConfig } from '@/src/services/sudoku-core';

const BAND = [38, 39, 40, 41];

/** Сколько сумм реально доходит до игрока: −1 значит «не показана». */
function shownClues(sw: { rows: number[]; cols: number[] } | undefined): number {
  if (!sw) return -1;
  return [...sw.rows, ...sw.cols].filter((x) => x >= 0).length;
}

function buildAt(level: number): { shown: number; tier: number } {
  const cfg = levelConfig(level);
  const b = logicalBuilder(level, cfg.blanks, cfg.N, cfg.BR, cfg.BC, cfg.variant, { budgetMs: 6000 });
  let made: ReturnType<typeof b.step> | null = null;
  for (let s = 0; s < b.steps; s++) { made = b.step(); if (b.enough(made)) break; }
  return { shown: shownClues(made?.gen.sandwich), tier: made?.grade.tier ?? -1 };
}

describe('сэндвич: ось количества подсказок', () => {
  it('есть что проверять — все четыре уровня действительно сэндвич', () => {
    for (const lv of BAND) expect(levelConfig(lv).variant).toBe('sandwich');
    expect(BAND.length).toBe(4);
  });

  it('🔴 подсказок становится строго меньше от уровня к уровню', () => {
    const shown = BAND.map((lv) => buildAt(lv).shown);
    // Ни один уровень не должен остаться без подсказок вовсе: тогда это уже не
    // сэндвич, а обычная судоку под чужим именем.
    for (let i = 0; i < shown.length; i++) {
      expect(shown[i]).toBeGreaterThan(0);
    }
    for (let i = 1; i < shown.length; i++) {
      expect(shown[i]).toBeLessThan(shown[i - 1] as number);
    }
    // Первый уровень полосы показывает ВСЕ восемнадцать: знакомство с правилом
    // не место для утайки.
    expect(shown[0]).toBe(18);
  }, 180000);

  it('🔴 прореживание детерминировано: тот же уровень — то же число подсказок', () => {
    // Иначе «уровень стал легче» превращается в лотерею, и сравнивать уровни
    // между собой нельзя вовсе.
    for (const lv of [39, 41]) {
      const a = buildAt(lv).shown;
      const b = buildAt(lv).shown;
      expect(a).toBe(b);
    }
  }, 180000);
});

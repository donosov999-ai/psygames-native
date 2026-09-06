/* psygames-sudoku-tier-is-a-measure · VER 1 · 06.09.2026 */
/**
 * СТУПЕНЬ ОБЯЗАНА ОТВЕЧАТЬ «БЕЗ ЧЕГО ДОСКА НЕ РЕШАЕТСЯ», А НЕ «ЧТО СРАБОТАЛО».
 *
 * 🔴 ЧТО БЫЛО. Цепочка неравенств, сумма сэндвича и граница видимости небоскрёбов —
 * техники ступени 4, но жили они внутри `refilter` и работали ВСЕГДА, при любом
 * `tierCap`. Два следствия, оба замерены 06.09.2026 на боевом пути:
 *   · спросить «решается ли доска БЕЗ вариантной техники» было НЕЛЬЗЯ — ответ всегда
 *     выходил «да»: цена подсказками при `tierCap=1` равнялась 0 у 64 досок из 64;
 *   · `tier = 4` означал «фильтр варианта что-то отсёк», а не «без техники не обойтись»,
 *     и потому одинаково стоял на 11 ступенях из 16 у двух вариантных режимов.
 *
 * Здесь сторожится починка: `tierCap` отсекает вариантный ВЫВОД, оставляя вариантное
 * ПРАВИЛО (проверку против уже известных соседей) на месте — оно дано игроку даром.
 *
 * ⚠️ Гейт меряет ПОВЕДЕНИЕ на собранной доске, а не ищет слова в исходнике.
 */
import { gradePuzzle } from '@/src/services/sudoku-grade';
import { Cell, dimsForSize, generatePuzzle, TowersMap, UnequalMap } from '@/src/services/sudoku-core';

const { N, BR, BC } = dimsForSize(6);

describe('ступень — величина, а не отметка о срабатывании', () => {
  it('🔴 под потолком 1 вариантная техника НЕ МОЖЕТ оказаться самой сложной', () => {
    /**
     * 🔴 ПЕРВАЯ РЕДАКЦИЯ ЭТОЙ ПРОВЕРКИ ПЕРЕЖИЛА МУТАЦИЮ — и я оставляю разбор, потому
     * что ошибка типовая. Она искала доску, где полный решатель справляется, а голые
     * одиночки нет, и объявляла это доказательством отсечения. Но такая доска есть
     * ВСЕГДА: `tierCap=1` отсекает и обычные техники (скрытую одиночку, locked), и
     * разница возникала из-за НИХ. Вернул дефект (`выводВарианта = true`) — проба
     * осталась зелёной, то есть мерила «есть доски сложнее первой ступени».
     *
     * Здесь меряется ровно заявленное и наблюдаемое: под потолком 1 вариантный вывод
     * выключен, значит `hardest` НЕ МОЖЕТ быть вариантной техникой ни на одной доске.
     * При возвращённом дефекте `towers_clue` немедленно всплывает.
     */
    let сКраем = 0;
    let подПотолком = 0;
    for (let i = 0; i < 40; i++) {
      const g = generatePuzzle(18, N, BR, BC, 'towers');
      const towers = (g as unknown as { towers?: TowersMap }).towers;
      const ctx = { N, BR, BC, variant: 'towers' as const, towers };
      if (gradePuzzle(g.puzzle, ctx).hardest === 'towers_clue') сКраем++;
      if (gradePuzzle(g.puzzle, ctx, 1).hardest === 'towers_clue') подПотолком++;
    }
    // Проверка живая: без потолка край становится сложнейшей техникой на части досок.
    expect(`край работает без потолка: ${сКраем > 0}`).toBe('край работает без потолка: true');
    // А под потолком 1 — ни на одной.
    expect(`край под потолком 1: ${подПотолком} досок`).toBe('край под потолком 1: 0 досок');
  });

  it('🔴 длина и цена вывода считаются у КАЖДОЙ доски, включая нерешённую', () => {
    // Величина, которой не хватало: `tier` — ярлык, `steps`/`cost` — числа.
    const g = generatePuzzle(18, N, BR, BC, 'towers');
    const towers = (g as unknown as { towers?: TowersMap }).towers;
    const r = gradePuzzle(g.puzzle, { N, BR, BC, variant: 'towers', towers });
    expect(typeof r.steps).toBe('number');
    expect(typeof r.cost).toBe('number');
    expect(r.steps).toBeGreaterThan(0);
    // цена не ниже длины: каждый шаг стоит минимум ступень 1
    expect(r.cost).toBeGreaterThanOrEqual(r.steps);

    // и у НЕРЕШЁННОЙ доски величины тоже есть — пустая сетка логикой не берётся
    const пусто: Cell[][] = Array.from({ length: N }, () => Array(N).fill(0) as Cell[]);
    const нерешённая = gradePuzzle(пусто, { N, BR, BC, variant: 'none' });
    expect(нерешённая.solved).toBe(false);
    expect(typeof нерешённая.steps).toBe('number');
    expect(typeof нерешённая.cost).toBe('number');
  });

  it('🔴 то же у неравенств: цепочка под потолком 1 не всплывает', () => {
    const d9 = dimsForSize(9);
    let сЦепью = 0;
    let подПотолком = 0;
    for (let i = 0; i < 12; i++) {
      const g = generatePuzzle(50, d9.N, d9.BR, d9.BC, 'unequal');
      const unequal = (g as unknown as { unequal?: UnequalMap }).unequal;
      const ctx = { N: d9.N, BR: d9.BR, BC: d9.BC, variant: 'unequal' as const, unequal };
      if (gradePuzzle(g.puzzle, ctx).hardest === 'unequal_chain') сЦепью++;
      if (gradePuzzle(g.puzzle, ctx, 1).hardest === 'unequal_chain') подПотолком++;
    }
    expect(`цепочка работает без потолка: ${сЦепью > 0}`).toBe('цепочка работает без потолка: true');
    expect(`цепочка под потолком 1: ${подПотолком} досок`).toBe('цепочка под потолком 1: 0 досок');
  });
});

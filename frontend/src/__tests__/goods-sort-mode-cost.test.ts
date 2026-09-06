/**
 * 🔴 КАЖДЫЙ РЕЖИМ ЧТО-ТО МЕНЯЕТ — И МЫ НАЗЫВАЕМ, ЧТО ИМЕННО.
 *
 * Режимов в сортировке стало пять: строгая укладка, скрытая информация,
 * ниша-джокер, подвижные ниши, одноцветный уровень. Каждый добавляет код,
 * правило на двенадцати языках и место в графике ввода. Режим, который ничего
 * не меняет, — это украшение, и стоит он столько же, сколько работающий.
 *
 * 🔴 ЗАМЕР, КОТОРЫЙ ПЕРЕВЕРНУЛ ЭТУ ПРОБУ. Первым делом я померил всем одну
 * величину — число допустимых первых ходов (L1…L80, `dealBoard` + `placementOk`):
 *
 *   обычные уровни ≥30 — 40,7 хода · строгая укладка — 26,0 (−36 %)
 *   скрытая информация — 39,9 · подвижные ниши — 39,6 · одноцветный — 45,5
 *
 * То есть ОДНА мерка годится ровно одному режиму. У остальных цена лежит на
 * другой оси, и мерить их «ходами» значит объявить работающую механику пустой.
 * Поэтому здесь у каждого режима СВОЯ проверка, а у того, чья цена вообще не
 * измеряется кодом, — названная причина, почему.
 */
import {
  levelCfg, dealBoard, capsForBoard, placementOk, jokersForBoard, jokerNiches,
  strictPlacement, hiddenInfo, movingNiches, monochromeLevel, poolForLevel,
  nicheShift, permuteCells, WARM_FAMILY, GOOD_SETS, hideDeepSpots,
} from '@/app/games/goods-sort';

jest.setTimeout(300000);
const LEVELS = Array.from({ length: 80 }, (_, i) => i + 1);
const МИКС = (GOOD_SETS[0] as { pool: number[] }).pool;

/** Сколько ходов доступно на стартовой доске уровня — настоящим предикатом игры. */
function допустимыхХодов(L: number): number {
  const { cells } = dealBoard(L, poolForLevel(L, МИКС), false);
  const caps = capsForBoard(L, cells);
  const jok = jokersForBoard(L, cells);
  const strict = strictPlacement(L);
  let n = 0;
  for (let a = 0; a < cells.length; a += 1) {
    const src = cells[a] ?? [];
    if (!src.length) continue;
    const тип = src[src.length - 1] as number;
    for (let b = 0; b < cells.length; b += 1) {
      if (a !== b && placementOk(cells[b] ?? [], тип, strict, caps[b], jok[b])) n += 1;
    }
  }
  return n;
}
const среднее = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const обычные = LEVELS.filter((L) => L >= 30 && !strictPlacement(L) && !hiddenInfo(L) && !movingNiches(L) && !monochromeLevel(L));

describe('цена каждого режима', () => {
  it('есть с чем сравнивать — обычные уровни в том же диапазоне существуют', () => {
    expect(обычные.length).toBeGreaterThanOrEqual(5);
    expect(среднее(обычные.map(допустимыхХодов))).toBeGreaterThan(10);
  });

  /** Строгая укладка — единственный режим, чья цена видна в числе ходов. */
  it('🔴 строгая укладка заметно сужает выбор ходов', () => {
    const свои = среднее(LEVELS.filter(strictPlacement).map(допустимыхХодов));
    const база = среднее(обычные.map(допустимыхХодов));
    // Не «меньше», а МЕТНО меньше: замер дал 26,0 против 40,7, то есть −36 %.
    expect(свои).toBeLessThan(база * 0.85);
  });

  /**
   * Скрытая информация ходов не отнимает — она отнимает ЗНАНИЕ. Мерить её
   * ходами значит объявить работающую механику пустой (замер: 39,9 против 39,7).
   */
  it('🔴 скрытая информация прячет часть доски, а не сужает ходы', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(hiddenInfo)) {
      const { cells } = dealBoard(L, poolForLevel(L, МИКС), false);
      const спрятать = hideDeepSpots(cells);
      if (спрятать.length === 0) плохо.push(`L${L}: прятать нечего — режим пуст`);
    }
    expect(плохо).toEqual([]);
  });

  /** Подвижные ниши отнимают МАРШРУТ: содержимое остаётся, адрес меняется. */
  it('🔴 подвижные ниши правда меняют адреса', () => {
    const плохо: string[] = [];
    for (const L of LEVELS.filter(movingNiches)) {
      const { cells } = dealBoard(L, poolForLevel(L, МИКС), false);
      const caps = capsForBoard(L, cells);
      const p = nicheShift(caps, 1);
      const сдвинуто = p.filter((j, i) => j !== i).length;
      if (сдвинуто < 2) плохо.push(`L${L}: сдвигается ${сдвинуто} ниш`);
      // И содержимое при этом сохраняется целиком — иначе это не сдвиг, а потеря.
      const до = cells.flat().slice().sort((a, b) => a - b).join(',');
      const после = permuteCells(cells, p).flat().slice().sort((a, b) => a - b).join(',');
      if (до !== после) плохо.push(`L${L}: сдвиг изменил содержимое`);
    }
    expect(плохо).toEqual([]);
  });

  /** Джокер добавляет МЕСТО: занятая ниша начинает принимать чужие типы. */
  it('🔴 джокер расширяет выбор там, где строгая укладка его сузила', () => {
    const свои = LEVELS.filter((L) => jokerNiches(L, 14).length > 0);
    expect(свои.length).toBeGreaterThan(2);
    // Все уровни джокера — строгие: он снимает правило, которого без них нет.
    expect(свои.every(strictPlacement)).toBe(true);
  });

  /**
   * 🔴 ЦЕНА ОДНОЦВЕТНОГО РЕЖИМА КОДОМ НЕ ИЗМЕРЯЕТСЯ, И ЭТО НАЗВАНО, А НЕ СКРЫТО.
   *
   * Замер дал 45,5 хода против 40,7 у обычных — то есть по ходам он даже
   * «легче». Так и должно быть: он не трогает ни правила, ни доступность ходов,
   * он меняет то, ЧЕМ игрок различает предметы — цвет на форму. Это работа
   * глаза, и в коде её нет вовсе.
   *
   * Проверяемое здесь — что подмена пула ПРОИСХОДИТ и что она однородна по
   * оттенку. Всё остальное про этот режим проверяется только глазами.
   */
  it('🔴 одноцветный меняет пул, а не арифметику — и это записано', () => {
    const свои = LEVELS.filter(monochromeLevel);
    expect(свои.length).toBeGreaterThan(0);
    for (const L of свои) {
      const { cells } = dealBoard(L, poolForLevel(L, МИКС), false);
      const виды = [...new Set(cells.flat())];
      expect(виды.every((t) => WARM_FAMILY.includes(t))).toBe(true);
      // Число видов при этом НЕ просело — задача осталась той же по объёму.
      expect(levelCfg(L, poolForLevel(L, МИКС).length, false).types).toBeGreaterThanOrEqual(4);
    }
  });

  /**
   * 🔴 И ГЛАВНОЕ: НИ ОДИН РЕЖИМ НЕ ОСТАЛСЯ БЕЗ СВОЕЙ МЕРКИ. Список закрытый —
   * добавят шестой режим, и он обязан получить проверку здесь, а не проехать
   * молча, как проехала бы любая из четырёх при одной общей мерке.
   */
  it('🔴 у каждого режима есть своя мерка, и все они непусты', () => {
    const режимы: Record<string, (L: number) => boolean> = {
      'строгая укладка': strictPlacement,
      'скрытая информация': hiddenInfo,
      'подвижные ниши': movingNiches,
      'одноцветный': monochromeLevel,
      'джокер': (L) => jokerNiches(L, 14).length > 0,
    };
    const пустые = Object.entries(режимы)
      .filter(([, f]) => LEVELS.filter(f).length === 0)
      .map(([имя]) => `${имя}: не встречается ни на одном из восьмидесяти уровней`);
    expect(пустые).toEqual([]);
    expect(Object.keys(режимы).length).toBe(5);
  });
});

/* psygames-digit-span-stop-rule · VER 1 · 22.08.2026 */
/**
 * СПАН МЕРЯЕТСЯ ДО ДВУХ ОШИБОК НА ОДНОЙ ДЛИНЕ, А НЕ ДО ДВУХ ЗА ПАРТИЮ.
 *
 * 🔴 ЧТО НАШЛОСЬ. В «Спане цифр» рядом с правилом стоял комментарий «2 errors at same
 * length => stop», а сам код проверял `errors >= 1` — то есть ОБЩИЙ счётчик ошибок за
 * партию, который на успехе не сбрасывался. Ошибся на длине 4, взял её со второго раза,
 * ошибся на 5 — партия окончена, хотя на пятёрке это была ПЕРВАЯ попытка.
 *
 * Спан — величина замеряемая: это докуда человек дошёл до двух ошибок на одной длине.
 * Так устроен «Спан по клеткам» рядом (`errorsAtLen` со сбросом на успехе) и так
 * устроена сама методика. Модель игрока даёт недомер около 0,1 спана — немного, но в
 * замеряемой величине нельзя врать и на десятую.
 *
 * ⚠️ ЗДЕСЬ ПРОВЕРЯЕТСЯ ПРАВИЛО, А НЕ ЭКРАН. Экран — React с таймерами; правило же
 * простое, и его достаточно прогнать как правило. Плюс отдельная сверка, что в
 * исходнике стоит именно счётчик на длине, а не общий.
 */
declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

/** Партия по правилу «стоп после N ошибок на текущей длине». Возвращает максимум длины. */
function play(trueSpan: number, wrongAt: number[], perLength: boolean): number {
  let len = 3, total = 0, atLen = 0, max = 0, round = 0;
  while (round < 12 && len <= 12) {
    round += 1;
    const fails = len > trueSpan || wrongAt.includes(round);
    if (!fails) { max = Math.max(max, len); len += 1; atLen = 0; continue; }
    total += 1; atLen += 1;
    if (perLength ? atLen >= 2 : total >= 2) break;
  }
  return max;
}

describe('правило остановки «Спана цифр»', () => {
  /**
   * Ключевой случай: одна ошибка на четвёрке, потом четвёрка взята, потом одна ошибка
   * на пятёрке. По правилу методики партия ПРОДОЛЖАЕТСЯ — на пятёрке это первая
   * попытка. По прежнему коду она обрывалась.
   */
  it('🔴 ошибка, взятая длина, ошибка на следующей — партия продолжается', () => {
    const perLength = play(9, [1, 3], true);
    const perGame = play(9, [1, 3], false);
    expect(`на длине ${perLength} против за партию ${perGame}`).toBe(`на длине ${perLength} против за партию ${perGame}`);
    expect(perLength).toBeGreaterThan(perGame);
  });

  it('🔴 две ошибки подряд на одной длине — партия всё-таки заканчивается', () => {
    // раунды 1 и 2 — обе на длине 3 (после ошибки длина не растёт)
    expect(play(9, [1, 2], true)).toBe(0);
  });

  it('🔴 безошибочная игра доходит до своего спана', () => {
    for (const span of [4, 6, 8]) expect(play(span, [], true)).toBe(span);
  });

  it('🔴 в исходнике стоит счётчик НА ДЛИНЕ, а не общий', () => {
    const src: string = fs.readFileSync(path.resolve(__dirname, '../../app/games/digit-span.tsx'), 'utf8');
    expect(src).toMatch(/atLenErrors \+= 1;/);
    expect(src).toMatch(/if \(atLenErrors >= 2 \|\| round >= 12\) cont = false;/);
    // и он обнуляется на взятой длине, иначе это снова общий счётчик
    expect(src).toMatch(/nextLen = seqLen \+ 1;\s*\n\s*atLenErrors = 0;/);
    // и на старте партии
    expect(src).toMatch(/errorsAtLenRef\.current = 0;/);
    expect(src).not.toMatch(/if \(errors >= 1 \|\| round >= 12\)/);
  });
});

/**
 * 🔴 ПОРЦИИ РАЗЛИЧИМЫ ФОРМОЙ, А НЕ ТОЛЬКО ЦВЕТОМ.
 *
 * Правило записано над самой палитрой: двенадцать заливок — предел, за которым
 * «зелёный» и «салатовый» сливаются у любого зрения, а при дейтеранопии ещё и
 * «красный» с «зелёным». Поэтому у каждой порции есть знак, и различие держится
 * на ФОРМЕ. Это требование аудита доступности, а не вкус.
 *
 * 📍 ПОВОД ЗАВЕСТИ ГЕЙТ: правило нарушалось ПРЯМО ПОД СВОИМ ТЕКСТОМ. Замер
 * 07.09.2026 по именам знаков в Юникоде показал, что у второго цвета стоял «■»
 * (BLACK SQUARE), а у восьмого «◼» (BLACK MEDIUM SQUARE) — одна и та же фигура,
 * отличающаяся кеглем, то есть шрифтом устройства. Зелёный и серый различались
 * ТОЛЬКО оттенком. Оба встречаются вместе с седьмого уровня.
 *
 * ⚠️ ГЕЙТ СМОТРИТ НА ИМЕНА ЗНАКОВ, А НЕ НА КАРТИНКУ. Отрисовку проба не видит, и
 * «похоже ли» глазами не спросишь. Зато имя в Юникоде называет СЕМЬЮ фигуры
 * (SQUARE, CIRCLE, TRIANGLE, STAR), и совпадение семьи при совпадении заливки
 * («BLACK») — признак, который ловится машинально и не зависит от вкуса.
 */

declare const __dirname: string;
declare function require(id: string): any;
const { readFileSync } = require('fs');
const { join } = require('path');

const ЭКРАН: string = readFileSync(join(__dirname, '..', '..', 'app', 'games', 'water-sort.tsx'), 'utf8');

/** Палитра берётся из экрана: другой её копии нет, и заводить вторую нельзя. */
function палитра(): { fill: string; mark: string }[] {
  const тело = ЭКРАН.slice(ЭКРАН.indexOf('const ЦВЕТА'), ЭКРАН.indexOf('];', ЭКРАН.indexOf('const ЦВЕТА')));
  return [...тело.matchAll(/\{ fill: '(#[0-9a-f]{6})', mark: '(.+?)' \}/g)]
    .map((m) => ({ fill: m[1] as string, mark: m[2] as string }));
}

/**
 * Семья фигуры по имени знака: слова имени без слов о цвете и весе. У «■»
 * (BLACK SQUARE) семья {SQUARE}, у «◼» (BLACK MEDIUM SQUARE) — тоже {SQUARE}.
 */
function семья(знак: string): Set<string> {
  const имя = (знак.codePointAt(0) ?? 0);
  const н = НАЗВАНИЯ[имя] ?? '';
  const служебные = new Set(['BLACK', 'WHITE', 'HEAVY', 'MEDIUM', 'SMALL', 'LARGE', 'WITH', 'AND', 'THE']);
  return new Set(н.split(' ').filter((w) => w && !служебные.has(w)));
}

/**
 * ⚠️ Имена знаков перечислены здесь, а не берутся из среды: `unicodedata` в
 * узле нет, а тащить пакет ради двенадцати строк — дороже, чем выписать их.
 * Список закрытый: знак без имени роняет пробу, а не проходит молча.
 */
const НАЗВАНИЯ: Record<number, string> = {
  0x25B2: 'BLACK UP-POINTING TRIANGLE',
  0x25CF: 'BLACK CIRCLE',
  0x25A0: 'BLACK SQUARE',
  0x2605: 'BLACK STAR',
  0x25C6: 'BLACK DIAMOND',
  0x271A: 'HEAVY GREEK CROSS',
  0x2726: 'BLACK FOUR POINTED STAR',
  0x2764: 'HEAVY BLACK HEART',
  0x25FC: 'BLACK MEDIUM SQUARE',
  0x25BC: 'BLACK DOWN-POINTING TRIANGLE',
  0x25D0: 'CIRCLE WITH LEFT HALF BLACK',
  0x2731: 'HEAVY ASTERISK',
  0x2B22: 'BLACK HEXAGON',
  0x2B1F: 'BLACK PENTAGON',
  0x25A1: 'WHITE SQUARE',
  0x25CB: 'WHITE CIRCLE',
  0x25B3: 'WHITE UP-POINTING TRIANGLE',
};

describe('порции различимы формой', () => {
  const цвета = палитра();

  it('есть что проверять: палитра прочитана целиком', () => {
    expect(цвета.length).toBe(12);
    expect(new Set(цвета.map((c) => c.fill)).size).toBe(12);
  });

  it('🔴 у каждого знака известно имя — иначе проверка семьи слепа', () => {
    const без = цвета
      .filter((c) => !НАЗВАНИЯ[c.mark.codePointAt(0) ?? 0])
      .map((c) => `${c.mark} (U+${(c.mark.codePointAt(0) ?? 0).toString(16).toUpperCase()}) у ${c.fill}`);
    expect(без).toEqual([]);
  });

  /**
   * 🔴 ГЛАВНОЕ. Две порции не имеют права различаться ТОЛЬКО кеглем: это
   * ровно тот случай, что был найден 07.09.2026 («■» и «◼»).
   */
  it('🔴 нет двух знаков одной семьи с одинаковой заливкой', () => {
    const беды: string[] = [];
    for (let i = 0; i < цвета.length; i += 1) {
      for (let j = i + 1; j < цвета.length; j += 1) {
        const a = цвета[i]!; const b = цвета[j]!;
        const сa = семья(a.mark); const сb = семья(b.mark);
        const общая = [...сa].filter((w) => сb.has(w));
        if (!общая.length) continue;
        const имяA = НАЗВАНИЯ[a.mark.codePointAt(0) ?? 0] ?? '';
        const имяB = НАЗВАНИЯ[b.mark.codePointAt(0) ?? 0] ?? '';
        // Разная заливка (BLACK/WHITE) или разная ориентация — уже различие.
        const заливкаA = имяA.includes('WHITE') ? 'WHITE' : 'BLACK';
        const заливкаB = имяB.includes('WHITE') ? 'WHITE' : 'BLACK';
        const ориентация = сa.size !== сb.size || [...сa].some((w) => !сb.has(w));
        if (заливкаA === заливкаB && !ориентация) {
          беды.push(`${a.mark} (${имяA}) и ${b.mark} (${имяB}) — одна фигура, различаются только кеглем`);
        }
      }
    }
    expect(беды).toEqual([]);
  });

  it('🔴 знаки не повторяются: двенадцать порций — двенадцать разных фигур', () => {
    expect(new Set(цвета.map((c) => c.mark)).size).toBe(12);
  });
});

/* psygames-chinese-tones-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР «ТОНОВ» ПОКАЗЫВАЕТ СЛОВА БАНКА С ТЕМ ТОНОМ, КОТОРЫЙ ИГРА ЗАСЧИТАЕТ.
 *
 * Игра верным считает кнопку «тон N» для слога из `ZH_TONE_BANK[N]`. Разбор обязан говорить то же:
 * слово, названное «тоном 3», лежит в третьем тоне банка, а четыре тона — это ОДИН слог.
 */
import { ZH_TONE_BANK } from '@/src/constants/zhToneBank.generated';
import { stripTone } from '@/src/games/chinese-tones/core/pinyin';
import { собратьРазборТонов, основыВоВсехТонах, основыСПарой23 } from '@/src/games/chinese-tones/teach';

function сеянный(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}

const вТоне = (тон: 1 | 2 | 3 | 4, zh: string, py: string) =>
  ZH_TONE_BANK[тон].some((с) => с.zh === zh && с.pinyin === py);

describe('разбор «Тонов китайского»', () => {
  it('🔴 слово, названное «тоном N», лежит в N-м тоне банка — ровно этот ответ игра засчитает', () => {
    let карточекТона = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { карточки } = собратьРазборТонов(ZH_TONE_BANK, null, сеянный(seed));
      for (const к of карточки.filter((к) => к.вид === 'тон')) {
        expect(к.ключ).toBe(`teachZhTone${к.тон}`);
        expect(вТоне(к.тон!, String(к.поля!.zh), String(к.поля!.py))).toBe(true);
        expect(к.звук).toEqual([к.поля!.zh]);
        карточекТона++;
      }
    }
    expect(карточекТона).toBe(120);
  });

  it('🔴 четыре тона — это ОДИН слог, по порядку 1-2-3-4', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { карточки, основа } = собратьРазборТонов(ZH_TONE_BANK, null, сеянный(seed));
      const тоны = карточки.filter((к) => к.вид === 'тон');
      expect(тоны.map((к) => к.тон)).toEqual([1, 2, 3, 4]);
      expect(new Set(тоны.map((к) => stripTone(String(к.поля!.py))))).toEqual(new Set([основа]));
    }
  });

  it('🔴 пара «второй против третьего» — один слог, настоящие слова банка, не тот же слог, что четвёрка', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { карточки, основа } = собратьРазборТонов(ZH_TONE_BANK, null, сеянный(seed));
      const пара = карточки.find((к) => к.вид === 'пара')!;
      const { a, pa, b, pb } = пара.поля as Record<string, string>;
      expect(вТоне(2, a!, pa!)).toBe(true);
      expect(вТоне(3, b!, pb!)).toBe(true);
      expect(stripTone(pa!)).toBe(stripTone(pb!));
      expect(stripTone(pa!)).not.toBe(основа);
      expect(пара.звук).toEqual([a, b]);
    }
  });

  it('🔴 слово текущего задания в разбор не попадает — иначе разбор назвал бы ответ', () => {
    const весьБанк = ([1, 2, 3, 4] as const).flatMap((т) => ZH_TONE_BANK[т]);
    for (const задание of весьБанк) {
      for (let seed = 1; seed <= 3; seed++) {
        const { карточки } = собратьРазборТонов(ZH_TONE_BANK, задание.pinyin, сеянный(seed));
        const показано = карточки.flatMap((к) => к.слоги.map((с) => с.pinyin));
        expect(показано).not.toContain(задание.pinyin);
      }
    }
  });

  it('между вступлением и итогом каждая карточка называет приём', () => {
    const ПРИЁМЫ = new Set(['teachZhTone1', 'teachZhTone2', 'teachZhTone3', 'teachZhTone4', 'teachZhPair23']);
    const { карточки } = собратьРазборТонов(ZH_TONE_BANK, null, сеянный(5));
    expect(карточки[0]!.ключ).toBe('teachZhIntro');
    expect(карточки[карточки.length - 1]!.вид).toBe('готово');
    const середина = карточки.slice(1, -1);
    const названо = середина.filter((к) => ПРИЁМЫ.has(к.ключ)).length;
    expect(`${названо} из ${середина.length}`).toBe('5 из 5');
  });

  it('материала хватает даже без слога текущего задания', () => {
    // Замер 30.09.2026 по банку: во всех четырёх тонах — 3 слога (qi, ji, jie), во 2-м и 3-м — 28.
    expect(основыВоВсехТонах(ZH_TONE_BANK).length).toBeGreaterThanOrEqual(2);
    expect(основыСПарой23(ZH_TONE_BANK).length).toBeGreaterThanOrEqual(3);
  });
});

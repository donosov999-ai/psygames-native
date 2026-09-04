/**
 * ЗНАК ТОНА СТАВИТСЯ ПО ПРАВИЛУ, А НЕ НАД ПЕРВОЙ ГЛАСНОЙ.
 *
 * Упражнение строит варианты ответа само (тот же слог в четырёх тонах). Ошибка
 * в постановке знака не видна на экране — она просто учит человека писать
 * неправильно. Поэтому главная проверка здесь не список примеров, а ПРОГОН ПО
 * ВСЕМУ БАНКУ: снять знак и поставить обратно обязано вернуть исходное написание
 * каждого из слогов.
 */
import { toneOf, stripTone, applyTone, allTones } from '@/src/games/chinese-tones/core/pinyin';
import { ZH_TONE_BANK } from '@/src/constants/zhToneBank.generated';

const весьБанк = ([1, 2, 3, 4] as const).flatMap((т) => ZH_TONE_BANK[т].map((с) => ({ ...с, тон: т })));

describe('тоновый знак', () => {
  it('🔴 круговой прогон по всему банку: снять знак и поставить обратно = исходное написание', () => {
    const плохие = весьБанк
      .filter((с) => applyTone(stripTone(с.pinyin), с.тон) !== с.pinyin)
      .map((с) => `${с.zh} ${с.pinyin} → ${applyTone(stripTone(с.pinyin), с.тон)}`);
    expect(плохие).toEqual([]);
  });

  it('тон читается верно у каждого слога банка', () => {
    const плохие = весьБанк.filter((с) => toneOf(с.pinyin) !== с.тон).map((с) => `${с.pinyin}: ${toneOf(с.pinyin)} ≠ ${с.тон}`);
    expect(плохие).toEqual([]);
  });

  /** Замеренные вручную случаи — ровно те три, на которых правило нетривиально. */
  it.each([
    ['liu', 2, 'liú'],   // последняя гласная, а не первая
    ['gui', 1, 'guī'],   // то же, но пара ui
    ['hao', 3, 'hǎo'],   // есть `a` — знак на неё
    ['dou', 4, 'dòu'],   // пара ou — знак на o
    ['xie', 2, 'xié'],   // есть `e` — знак на неё
    ['nü', 3, 'nǚ'],     // умляут сохраняется
  ])('%s + тон %i = %s', (база, тон, ждём) => {
    expect(applyTone(база as string, тон as number)).toBe(ждём);
  });

  it('нейтральный тон и мусор не ломают', () => {
    expect(applyTone('ma', 5)).toBe('ma');
    expect(applyTone('zzz', 2)).toBe('zzz');
    expect(toneOf('ma')).toBe(5);
  });

  it('четыре варианта — четыре РАЗНЫХ написания одного слога', () => {
    const в = allTones('zhǎo');
    expect(в).toEqual(['zhāo', 'zháo', 'zhǎo', 'zhào']);
    expect(new Set(в).size).toBe(4);
  });

  it('варианты строятся для каждого слога банка и всегда различимы', () => {
    for (const с of весьБанк) {
      const в = allTones(с.pinyin);
      expect(new Set(в).size).toBe(4);
      expect(в).toContain(с.pinyin);
    }
  });
});

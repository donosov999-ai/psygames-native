/* psygames-phoneme-pairs-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР «ФОНЕМНЫХ ПАР» БЕРЁТ ПАРЫ ИЗ ПУЛА УРОВНЯ, НАЗЫВАЕТ ТО СЛОВО, ЧТО ПРОЗВУЧАЛО, И ПОКАЗЫВАЕТ
 * МЕСТО РАСХОЖДЕНИЯ ТАМ, ГДЕ ОНО ЧЕСТНОЕ.
 *
 * Игра верным считает то слово пары, которое произнёс голос. Разбор обязан говорить то же, а место
 * расхождения показывать только там, где написание (или пиньинь) совпадает со звуком.
 */
import { MINIMAL_PAIRS } from '@/app/games/phoneme-pairs';
import { собратьРазборФонем, гдеРасходятся, пулУровня, видРазличия, type Пара } from '@/src/games/phoneme-pairs/teach';
import { ZH_PINYIN } from '@/src/constants/zhPinyin.generated';

function сеянный(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}
const ЯЗЫКИ = Object.keys(MINIMAL_PAIRS);
const пиньинь = (з: string) => ZH_PINYIN[з]?.pinyin ?? з;

describe('разбор «Фонемных пар»', () => {
  it('языков шесть, пар 75 — замер, на котором стоит выбор вида различия', () => {
    expect(ЯЗЫКИ.sort()).toEqual(['de', 'en', 'es', 'pt', 'ru', 'zh']);
    expect(ЯЗЫКИ.reduce((n, я) => n + MINIMAL_PAIRS[я]!.length, 0)).toBe(75);
  });

  it.each(ЯЗЫКИ)('🔴 %s: пример — из пула уровня 1–5, ответ — то слово, что прозвучало на пробе', (язык) => {
    const пул = пулУровня(MINIMAL_PAIRS[язык]!, true);
    const вПуле = (п: Пара) => пул.some((q) => q[0] === п[0] && q[1] === п[1]);
    for (let seed = 1; seed <= 30; seed++) {
      const { карточки, примеры } = собратьРазборФонем(пул, язык, null, сеянный(seed));
      expect(примеры).toHaveLength(2);
      for (const п of примеры) expect(вПуле(п)).toBe(true);
      for (let i = 0; i < карточки.length; i++) {
        const к = карточки[i]!;
        if (к.вид === 'пара') expect(к.звук).toEqual([к.пара![0], к.пара![1]]);
        if (к.вид === 'проба') {
          const ответ = карточки[i + 1]!;
          expect(ответ.вид).toBe('ответ');
          expect(к.звук).toEqual([к.пара![к.звучит!]]);
          expect(ответ.звучит).toBe(к.звучит);
          expect(ответ.звук).toEqual(к.звук);
        }
      }
    }
  });

  it('🔴 место расхождения честное: вне отрезков слова совпадают, отрезки непустые — по всем 75 парам', () => {
    for (const язык of ЯЗЫКИ) {
      for (const [x, y] of MINIMAL_PAIRS[язык]!) {
        const [a, b] = язык === 'zh' ? [пиньинь(x), пиньинь(y)] : [x, y];
        const { a: [сА, пА], b: [сБ, пБ] } = гдеРасходятся(a, b);
        const А = Array.from(a); const Б = Array.from(b);
        expect(сА).toBe(сБ);
        expect(А.slice(0, сА).join('')).toBe(Б.slice(0, сБ).join(''));
        expect(А.slice(пА).join('')).toBe(Б.slice(пБ).join(''));
        expect(пА - сА).toBeGreaterThan(0);
        expect(пБ - сБ).toBeGreaterThan(0);
      }
    }
  });

  /**
   * 🔴 У КАЖДОГО ЗНАКА КИТАЙСКИХ ПАР ЕСТЬ ПИНЬИНЬ. Экран подписывает им кнопки (PINYIN_HINT), разбор ищет
   * по нему место расхождения. До 30.09.2026 у 21 из 26 знаков пиньиня в словаре не было: на кнопке
   * стоял голый иероглиф, а разбор сравнивал «班» с «帮» целиком. Сборщик scripts/build-zh-pinyin.mjs
   * теперь берёт знаки и из блока пар экрана.
   */
  it('🔴 у каждого знака китайских пар есть пиньинь — кнопка и разбор без него слепые', () => {
    const без = MINIMAL_PAIRS.zh!.flat().filter((з) => !ZH_PINYIN[з]?.pinyin);
    expect(`без пиньиня: ${без.join(' ')}`).toBe('без пиньиня: ');
  });

  it('английский и немецкий не подсвечивают букв — у них написание не совпадает со звуком', () => {
    for (const язык of ['en', 'de']) {
      expect(видРазличия(язык)).toBe('гласный');
      const { карточки } = собратьРазборФонем(пулУровня(MINIMAL_PAIRS[язык]!, true), язык, null, сеянный(2));
      for (const к of карточки.filter((к) => к.вид === 'пара')) {
        expect(к.ключ).toBe('teachPhVowel');
        expect(к.отличие).toBeNull();
      }
    }
    expect(гдеРасходятся('pero', 'perro')).toEqual({ a: [2, 3], b: [2, 4] });
    expect(гдеРасходятся('банка', 'банька')).toEqual({ a: [2, 3], b: [2, 4] });
    expect(гдеРасходятся(пиньинь('山'), пиньинь('三'))).toEqual({ a: [0, 2], b: [0, 1] });
  });

  it('🔴 пара текущего задания в разбор не попадает', () => {
    for (const язык of ЯЗЫКИ) {
      const пул = пулУровня(MINIMAL_PAIRS[язык]!, true);
      for (const текущая of пул) {
        for (let seed = 1; seed <= 10; seed++) {
          const { примеры } = собратьРазборФонем(пул, язык, текущая, сеянный(seed));
          expect(примеры.some((п) => п[0] === текущая[0] && п[1] === текущая[1])).toBe(false);
        }
      }
    }
  });

  it('между вступлением и итогом каждая карточка называет приём', () => {
    const ПРИЁМЫ = new Set(['teachPhSpot', 'teachPhVowel', 'teachPhProbe', 'teachPhAnswerSpot', 'teachPhAnswerVowel']);
    for (const язык of ЯЗЫКИ) {
      const { карточки } = собратьРазборФонем(пулУровня(MINIMAL_PAIRS[язык]!, true), язык, null, сеянный(4));
      expect(карточки[0]!.ключ).toBe('teachPhIntro');
      expect(карточки[карточки.length - 1]!.ключ).toBe('teachPhDone');
      const середина = карточки.slice(1, -1);
      expect(`${язык}: ${середина.filter((к) => ПРИЁМЫ.has(к.ключ)).length} из ${середина.length}`).toBe(`${язык}: 6 из 6`);
    }
  });
});

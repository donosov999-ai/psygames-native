/* psygames-dictation-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР «ДИКТАНТА» РЕЖЕТ ФРАЗУ УРОВНЯ НА КУСКИ, КОТОРЫЕ СКЛАДЫВАЮТСЯ РОВНО В ТО, ЧТО ПРИМЕТ ИГРА.
 *
 * Игра принимает фразу знак в знак (ввод стоит на неверном знаке). Разбор показывает её кусками —
 * склейка кусков обязана давать тот же текст, иначе приём учил бы набирать не то.
 */
import { buildPhrases, dictationLangs, levelPhrases } from '@/src/games/dictation/core/phrases';
import { собратьРазборДиктанта, разрезать, склеить } from '@/src/games/dictation/teach';

function сеянный(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}
const ЯЗЫКИ = dictationLangs();
const слов = (к: string) => к.split(' ').filter(Boolean).length;

describe('разбор «Диктанта»', () => {
  it('языки диктанта на месте — на них стоит проба', () => {
    expect(ЯЗЫКИ.length).toBeGreaterThanOrEqual(5);
  });

  it.each(ЯЗЫКИ)('🔴 %s: куски КАЖДОЙ фразы банка складываются ровно в неё, и кусок не больше меры', (язык) => {
    for (const ф of buildPhrases(язык)) {
      const куски = разрезать(ф.text, язык);
      expect(склеить(куски, язык)).toBe(ф.text);
      for (const к of куски) {
        expect(к.length).toBeGreaterThan(0);
        // Китайский кусок — клауза: внутри неё знаков препинания нет, конец — знак или конец фразы.
        if (язык === 'zh') expect(/[，。！？、；：,.!?]/.test(Array.from(к).slice(0, -1).join(''))).toBe(false);
        else expect(слов(к)).toBeLessThanOrEqual(3);
      }
    }
  });

  it.each(ЯЗЫКИ)('🔴 %s: фраза разбора — из пула уровня 1–3 и не текущая; карточки кусков звучат своими кусками', (язык) => {
    const пул = levelPhrases(buildPhrases(язык), 1);
    for (let seed = 1; seed <= 20; seed++) {
      const текущая = пул[seed % пул.length]!.text;
      const р = собратьРазборДиктанта(пул, язык, текущая, сеянный(seed))!;
      expect(пул.some((ф) => ф.text === р.фраза)).toBe(true);
      expect(р.фраза).not.toBe(текущая);
      expect(р.карточки.find((к) => к.вид === 'слушаем')!.звук).toEqual([р.фраза]);
      const куски = р.карточки.filter((к) => к.вид === 'кусок');
      expect(куски.map((к) => к.звук[0])).toEqual(р.куски);
      expect(склеить(куски.map((к) => String(к.поля!.c)), язык)).toBe(р.фраза);
    }
  });

  it('🔴 zh: кусок — целая клауза, слово не рвётся — «我想多喝 | 水。» больше не выйдет', () => {
    expect(разрезать('天热，我想多喝水。', 'zh')).toEqual(['天热，', '我想多喝水。']);
    for (const ф of buildPhrases('zh')) {
      for (const к of разрезать(ф.text, 'zh').slice(0, -1)) expect(/[，。！？、；：,.!?]$/.test(к)).toBe(true);
    }
  });

  it('между вступлением и итогом каждая карточка называет приём', () => {
    const ПРИЁМЫ = new Set(['teachDictListen', 'teachDictChunk', 'teachDictStuck']);
    for (const язык of ЯЗЫКИ) {
      const р = собратьРазборДиктанта(levelPhrases(buildPhrases(язык), 1), язык, null, сеянный(3))!;
      expect(р.карточки[0]!.ключ).toBe('teachDictIntro');
      expect(р.карточки[р.карточки.length - 1]!.ключ).toBe('teachDictDone');
      const середина = р.карточки.slice(1, -1);
      expect(середина.filter((к) => ПРИЁМЫ.has(к.ключ)).length).toBe(середина.length);
    }
  });
});

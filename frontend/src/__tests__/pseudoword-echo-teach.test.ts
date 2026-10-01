/* psygames-pseudoword-echo-teach · VER 1 · 30.09.2026 */
/**
 * 🎓 РАЗБОР «ЭХА ПСЕВДОСЛОВ» ОТСЕИВАЕТ ВСЕ ТРИ ЛОВУШКИ НАСТОЯЩЕГО ГЕНЕРАТОРА И НАЗЫВАЕТ ТО СЛОВО,
 * КОТОРОЕ ИГРА ЗАСЧИТАЕТ.
 *
 * Раунды берутся из buildRounds самого экрана — тем же генератором, что и партия. Игра верным считает
 * вариант, равный загаданному слову (handlePick: opt === round.word).
 */
import { buildRounds, levelParams, VOWELS } from '@/app/games/pseudoword-echo';
import { собратьРазборЭха, разобратьЛовушку } from '@/src/games/pseudoword-echo/teach';

const ЯЗЫКИ = ['en', 'es', 'pt', 'de', 'ru'];
const раунды = (язык: string, сколько: number) => {
  const p = levelParams(1);
  return buildRounds(язык, сколько, p.lenMin, p.lenMax, p.hardShare);
};

describe('разбор «Эха псевдослов»', () => {
  it.each(ЯЗЫКИ)('🔴 %s: у каждой ловушки генератора определяется вид — 200 раундов уровня 1', (язык) => {
    const безВида: string[] = [];
    let ловушек = 0;
    for (const р of раунды(язык, 200)) {
      for (const в of р.options.filter((o) => o !== р.word)) {
        ловушек++;
        if (!разобратьЛовушку(р.word, в, VOWELS[язык]!)) безВида.push(`${р.word}→${в}`);
      }
    }
    expect(ловушек).toBe(600);
    expect(безВида.slice(0, 5)).toEqual([]);
  });

  it.each(ЯЗЫКИ)('🔴 %s: вид назван верно — из варианта по виду восстанавливается услышанное слово', (язык) => {
    for (const р of раунды(язык, 100)) {
      for (const в of р.options.filter((o) => o !== р.word)) {
        const л = разобратьЛовушку(р.word, в, VOWELS[язык]!)!;
        const В = Array.from(в);
        const [с, по] = л.где;
        const восстановлено = [...В.slice(0, с), ...Array.from(л.было), ...В.slice(по)].join('');
        expect(восстановлено).toBe(р.word);
        expect(В.slice(с, по).join('')).toBe(л.стало);
        if (л.вид === 'гласная') expect(VOWELS[язык]!.includes(л.было)).toBe(true);
        if (л.вид === 'согласная') expect(VOWELS[язык]!.includes(л.было)).toBe(false);
      }
    }
  });

  it.each(ЯЗЫКИ)('🔴 %s: разбор отсеивает все три ловушки и называет то слово, что игра засчитает', (язык) => {
    for (const р of раунды(язык, 50)) {
      const { карточки } = собратьРазборЭха(р, VOWELS[язык]!);
      const отсев = карточки.filter((к) => к.вид === 'отсев');
      expect(отсев).toHaveLength(3);
      expect(new Set(отсев.map((к) => к.вариант))).toEqual(new Set(р.options.filter((o) => o !== р.word)));
      const ответ = карточки.find((к) => к.вид === 'ответ')!;
      expect(ответ.вариант).toBe(р.word);
      expect(ответ.звук).toEqual([р.word]);
      expect(карточки.find((к) => к.вид === 'слушаем')!.звук).toEqual([р.word]);
    }
  });

  it('между вступлением и итогом каждая карточка называет приём', () => {
    const ПРИЁМЫ = new Set(['teachEchoListen', 'teachEchoVowel', 'teachEchoConsonant', 'teachEchoSwap', 'teachEchoDouble', 'teachEchoPick']);
    for (const язык of ЯЗЫКИ) {
      const { карточки } = собратьРазборЭха(раунды(язык, 1)[0]!, VOWELS[язык]!);
      expect(карточки[0]!.ключ).toBe('teachEchoIntro');
      expect(карточки[карточки.length - 1]!.ключ).toBe('teachEchoDone');
      const середина = карточки.slice(1, -1);
      expect(`${язык}: ${середина.filter((к) => ПРИЁМЫ.has(к.ключ)).length} из ${середина.length}`).toBe(`${язык}: 5 из 5`);
    }
  });

  it('вид ловушки на ручных примерах всех четырёх видов', () => {
    expect(разобратьЛовушку('pamoke', 'pemoke', VOWELS.en!)!.вид).toBe('гласная');
    expect(разобратьЛовушку('pamoke', 'bamoke', VOWELS.en!)!.вид).toBe('согласная');
    expect(разобратьЛовушку('pamoke', 'apmoke', VOWELS.en!)!.вид).toBe('перестановка');
    expect(разобратьЛовушку('pamoke', 'pammoke', VOWELS.en!)!.вид).toBe('удвоение');
    expect(разобратьЛовушку('pamoke', 'zzzzzz', VOWELS.en!)).toBeNull();
  });
});

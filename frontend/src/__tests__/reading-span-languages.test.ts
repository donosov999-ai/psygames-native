/**
 * «ОБЪЁМ ПРИ ЧТЕНИИ» НА 12 ЯЗЫКАХ — корпус целиком на каждом (задача 03a1440e).
 *
 * До 21.10.2026 es de fr it pt ja ko zh ar hi играли английскими предложениями: игра, которая меряет
 * память при ПОНИМАНИИ текста, на чужом языке меряла знание английского. Перевод держится по ключу
 * `en` (`src/games/reading-span/sentences-i18n.ts`); здесь сверяется, что ни одно предложение не
 * осталось без языка, слово стоит в своём предложении, а ответ этим словом засчитывается.
 */
import { recallScore, SENTENCES, sentenceText, sentenceWord } from '@/app/games/reading-span';
import { SENTENCE_TR } from '@/src/games/reading-span/sentences-i18n';

const LANGS = ['es', 'de', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi'];

/** Слово видно в предложении: целым словом; ko — с частицей после него, ja/zh — подстрокой (пробелов нет). */
function wordIsInSentence(lang: string, text: string, word: string): boolean {
  if (lang === 'ja' || lang === 'zh') return text.includes(word);
  const tokens = text.toLowerCase().split(/[\s,;.!?।،]+/).flatMap((w) => [w, w.replace(/^.*['’]/, '')]);
  const w = word.toLowerCase();
  return lang === 'ko' ? tokens.some((t) => t.startsWith(w)) : tokens.includes(w);
}

test('у каждого предложения есть все десять языков, лишних ключей нет', () => {
  for (const s of SENTENCES) expect(Object.keys(s.tr ?? {}).sort()).toEqual([...LANGS].sort());
  expect(Object.keys(SENTENCE_TR).sort()).toEqual(SENTENCES.map((s) => s.en).sort());
});

test.each(LANGS)('%s: предложение своё, слово стоит в нём, предложения не повторяются', (lang) => {
  const texts = SENTENCES.map((s) => sentenceText(s, lang));
  expect(new Set(texts).size).toBe(SENTENCES.length);
  for (const s of SENTENCES) {
    const text = sentenceText(s, lang);
    const word = sentenceWord(s, lang);
    expect(text).not.toBe(s.en);
    expect(word.trim()).toBe(word);
    expect(word).not.toMatch(/\s/);
    if (!wordIsInSentence(lang, text, word)) throw new Error(`${lang}: «${word}» нет в «${text}»`);
  }
});

test.each(LANGS)('%s: набор, вспомненный словами своего языка, засчитан; английскими — нет', (lang) => {
  const seq = SENTENCES.slice(10, 15);
  expect(recallScore(seq, lang, seq.map((s) => sentenceWord(s, lang)).join(' ')).errors).toBe(0);
  expect(recallScore(seq, lang, seq.map((s) => s.lastEn).join(' ')).hits).toBeLessThan(seq.length);
});

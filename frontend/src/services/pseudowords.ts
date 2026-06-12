/**
 * Генератор псевдослов (Полиглот TIER 1 п.2, v1.29.0) — для «Лексического решения».
 * Псевдослово = орфографически правдоподобная мутация реального слова целевого языка:
 *  - алфавитные (en/es/pt/de/ru): замена 1–2 букв с сохранением класса
 *    (гласная→гласная, согласная→согласная), регистр первого символа сохраняется;
 *  - hi (деванагари): замена согласной U+0915–U+0939 на другую согласную —
 *    матры (огласовки) остаются прикреплены к новой согласной, слог читается;
 *  - zh: в словах из 2+ иероглифов один заменяется иероглифом из пула словаря;
 *    односимвольные пропускаются (любой одиночный иероглиф — реальное слово).
 * Каждый результат фильтруется от ВСЕХ реальных словоформ языка в словаре.
 */
import { TRANSLATION_VOCAB } from '@/src/constants/translationVocab';

const VOWELS: Record<string, string> = {
  en: 'aeiou',
  es: 'aeiouáéíóú',
  pt: 'aeiouáâãéêíóôõú',
  de: 'aeiouäöü',
  ru: 'аеёиоуыэюя',
};
const CONSONANTS: Record<string, string> = {
  en: 'bcdfghklmnprstvz',
  es: 'bcdfghlmnprstvz',
  pt: 'bcdfglmnprstvz',
  de: 'bdfghklmnprstwz',
  ru: 'бвгдклмнпрстфхш',
};

const DEVANAGARI_CONSONANTS = 'कखगघचछजझटठडढणतथदधनपफबभमयरलवशषसह';

function realWords(lang: string): string[] {
  return TRANSLATION_VOCAB.map((w) => w[lang]).filter(Boolean);
}

function swapChar(word: string, lang: string): string {
  const vowels = VOWELS[lang];
  const consonants = CONSONANTS[lang];
  const chars = word.split('');
  // кандидаты на замену — буквы известного класса (не пробелы/дефисы/заглавные первой буквы)
  const idxs = chars
    .map((c, i) => ({ c: c.toLowerCase(), i }))
    .filter(({ c }) => vowels.includes(c) || consonants.includes(c))
    .map(({ i }) => i);
  if (idxs.length === 0) return word;
  const n = word.length > 5 && Math.random() < 0.5 ? 2 : 1; // длинные слова — иногда 2 замены
  let out = [...chars];
  for (let k = 0; k < n && idxs.length > 0; k++) {
    const pick = idxs.splice(Math.floor(Math.random() * idxs.length), 1)[0];
    const orig = out[pick];
    const lower = orig.toLowerCase();
    const setStr = vowels.includes(lower) ? vowels : consonants;
    let repl = lower;
    for (let tries = 0; tries < 10 && repl === lower; tries++) {
      repl = setStr[Math.floor(Math.random() * setStr.length)];
    }
    out[pick] = orig === lower ? repl : repl.toUpperCase();
  }
  return out.join('');
}

function swapDevanagari(word: string): string {
  const chars = [...word];
  const idxs = chars.map((c, i) => ({ c, i })).filter(({ c }) => DEVANAGARI_CONSONANTS.includes(c)).map(({ i }) => i);
  if (idxs.length === 0) return word;
  const pick = idxs[Math.floor(Math.random() * idxs.length)];
  let repl = chars[pick];
  for (let tries = 0; tries < 10 && repl === chars[pick]; tries++) {
    repl = DEVANAGARI_CONSONANTS[Math.floor(Math.random() * DEVANAGARI_CONSONANTS.length)];
  }
  chars[pick] = repl;
  return chars.join('');
}

function swapHanzi(word: string, pool: string[]): string {
  const chars = [...word];
  if (chars.length < 2) return word; // односимвольные не мутируем
  const pick = Math.floor(Math.random() * chars.length);
  let repl = chars[pick];
  for (let tries = 0; tries < 10 && repl === chars[pick]; tries++) {
    repl = pool[Math.floor(Math.random() * pool.length)];
  }
  chars[pick] = repl;
  return chars.join('');
}

/** count псевдослов целевого языка; не совпадают ни с одним словом словаря. */
export function generatePseudowords(lang: string, count: number): string[] {
  const words = realWords(lang);
  const realSet = new Set(words.map((w) => w.toLowerCase()));
  const hanziPool = lang === 'zh' ? Array.from(new Set(words.flatMap((w) => [...w]))) : [];
  const sourcePool = lang === 'zh' ? words.filter((w) => [...w].length >= 2) : words;

  const out = new Set<string>();
  let guard = 0;
  while (out.size < count && guard < count * 40) {
    guard += 1;
    const src = sourcePool[Math.floor(Math.random() * sourcePool.length)];
    if (!src) break;
    const pw =
      lang === 'zh' ? swapHanzi(src, hanziPool)
      : lang === 'hi' ? swapDevanagari(src)
      : swapChar(src, lang);
    if (!pw || realSet.has(pw.toLowerCase()) || out.has(pw)) continue;
    out.add(pw);
  }
  return Array.from(out);
}

/** count реальных слов целевого языка (уникальных). */
export function sampleRealWords(lang: string, count: number): string[] {
  const words = Array.from(new Set(realWords(lang)));
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words.slice(0, count);
}

export const RU_PHONEMIC_LETTERS = ['К','Л','М','П','С','Т','Б','В','Г','Д','Н','Р'] as const;
export const EN_PHONEMIC_LETTERS = ['F','A','S','B','C','D','M','P','R','T','L','N'] as const;

/**
 * 🔴 ПИСЬМЕННОСТЬ ЗАДАНИЯ — ОДНО РЕШЕНИЕ НА ДВА МЕСТА.
 *
 * Раньше буквы выбирались здесь («не английский → кириллица»), а проверка слова
 * жила в экране и спрашивала «язык === ru?». Для французского выходило: буква
 * кириллическая, проверка латинская — принять слово НЕЛЬЗЯ НИ ОДНО. Игра шла,
 * таймер тикал, счёт оставался нулём, и причина ниоткуда не следовала.
 *
 * Теперь письменность выбирается ОДИН раз, и от неё зависит и буква, и проверка:
 * разойтись им больше негде.
 */
export type PhonemicScript = 'ru' | 'en';

/** Языки на латинице: там беглость по первой букве работает как есть. */
const LATIN_LANGS = ['en', 'es', 'de', 'fr', 'it', 'pt'] as const;

export function phonemicScriptFor(language: string): PhonemicScript {
  if (language === 'ru') return 'ru';
  if ((LATIN_LANGS as readonly string[]).includes(language)) return 'en';
  /**
   * ⚠️ ИЕРОГЛИФЫ, КАНА, ДЕВАНАГАРИ, АРАБИЦА. Беглость «на букву П» в них не
   * ставится: письменность устроена иначе. Даём латиницу и честно предупреждаем
   * на экране — молча выдавать невыполнимое задание хуже.
   */
  return 'en';
}

/** Нужен ли экрану разговор о подмене письменности. */
export function phonemicScriptIsFallback(language: string): boolean {
  return language !== 'ru' && !(LATIN_LANGS as readonly string[]).includes(language);
}

export function phonemicLetterPool(language: string): readonly string[] {
  return phonemicScriptFor(language) === 'en' ? EN_PHONEMIC_LETTERS : RU_PHONEMIC_LETTERS;
}

/**
 * ПРОВЕРКА СЛОВА И ИТОГ ПОДХОДА — перенесены из экрана 30.09.2026 без изменения
 * поведения, чтобы Flutter-перенос сверялся с ИСПОЛНЕНИЕМ этих функций
 * (`scripts/flutter-phonemic-fluency-reference.test.ts`), а не с пересказом.
 *
 * ⚠️ ПИСЬМЕННОСТЬ ПРИХОДИТ ИЗ ОДНОГО МЕСТА (`phonemicScriptFor`) — той же
 * функции, по которой выбрана буква задания. Раньше буква выбиралась в
 * сервисе, а проверка спрашивала «язык === ru?» в экране: для французского буква
 * выходила кириллической, проверка латинской, и принять слово было НЕЛЬЗЯ.
 */
/** Буквы письменности и её гласные — данными: прибор выгружает их во Flutter
 *  (`flutter/assets/vocab/phonemic-fluency.json`), второй копии там нет. */
export const PHONEMIC_CHARS: Record<PhonemicScript, RegExp> = { ru: /^[а-яё-]+$/i, en: /^[a-z-]+$/i };
export const PHONEMIC_VOWELS: Record<PhonemicScript, RegExp> = { ru: /[аеёиоуыэюя]/i, en: /[aeiouy]/i };

export function isValidWord(raw: string, letter: string, lang: PhonemicScript): { valid: boolean; reason?: string } {
  if (raw.length < 3) return { valid: false, reason: 'too_short' };
  if (raw.length > 30) return { valid: false, reason: 'too_long' };
  if (raw[0].toUpperCase() !== letter) return { valid: false, reason: 'wrong_letter' };
  // Only language letters
  if (!PHONEMIC_CHARS[lang].test(raw)) return { valid: false, reason: 'non_letters' };
  // Reject obvious gibberish: no vowels at all → not a real word
  if (!PHONEMIC_VOWELS[lang].test(raw)) return { valid: false, reason: 'no_vowels' };
  // Reject 3+ same characters in a row (typing junk)
  if (/(.)\1\1/.test(raw)) return { valid: false, reason: 'repetition_pattern' };
  // Reject same 2 chars repeated 3+ times (e.g. "abababab")
  if (/(..)\1\1/.test(raw)) return { valid: false, reason: 'repetition_pattern' };
  return { valid: true };
}

export interface PhonemicSaid { word: string; ts: number; valid: boolean; reason?: string }

/** Итог подхода: верные слова, причины отказов, темп и половины времени. */
export function phonemicSummary(said: readonly PhonemicSaid[], startTs: number, duration: number) {
  const validWords = said.filter(w => w.valid);
  const repetitions = said.filter(w => !w.valid && w.reason === 'repetition').length;
  const wrongLetter = said.filter(w => !w.valid && w.reason === 'wrong_letter').length;
  const tooShort = said.filter(w => !w.valid && w.reason === 'too_short').length;
  // mean inter-word interval (only on valid)
  let meanInter = 0;
  if (validWords.length >= 2) {
    let totalGap = 0;
    for (let i = 1; i < validWords.length; i++) {
      totalGap += (validWords[i].ts - validWords[i-1].ts) / 1000;
    }
    meanInter = totalGap / (validWords.length - 1);
  }
  // First/second half breakdown
  const halfTime = startTs + (duration / 2) * 1000;
  const firstHalf = validWords.filter(w => w.ts < halfTime).length;
  const secondHalf = validWords.filter(w => w.ts >= halfTime).length;
  return { validWords, repetitions, wrongLetter, tooShort, meanInter, firstHalf, secondHalf };
}

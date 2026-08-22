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

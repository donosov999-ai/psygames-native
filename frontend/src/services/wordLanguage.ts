/* psygames-word-language · VER 1 · 06.09.2026 */
/**
 * 🔴 ЯЗЫК СЛОВ — ОТДЕЛЬНО ОТ ЯЗЫКА ПРИЛОЖЕНИЯ.
 *
 * 📍 ДВА ОТЧЁТА ДЕНИСА 05.09.2026, дословно: «надо добавить выбор языка»
 * (анаграммы) и «надо добавить сюда выбор языка» («Беглость речи»). Обе игры
 * брали язык слов из языка интерфейса: русское меню — только русские слова.
 * Тренировать английские слова при русском интерфейсе было нельзя вовсе.
 *
 * ⚠️ Языков ровно ДВА, и это не упрощение, а замер: у «Беглости» вся
 * письменность сводится к `PhonemicScript = 'ru' | 'en'`, у анаграмм банк
 * выбирается как `isRu ? RU_WORDS_* : EN_WORDS_*`, а словарь `ANAGRAM_DICT`
 * имеет ключи `ru` и `en`. Остальные языки интерфейса и сейчас играют
 * английскими словами — просто молча. Третий язык здесь появится тогда же,
 * когда появятся его слова, а не раньше.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WORD_LANGS = ['ru', 'en'] as const;
export type WordLang = (typeof WORD_LANGS)[number];

/** Подпись варианта — на своём языке, а не переводом: «Русский» и «English». */
export const WORD_LANG_LABEL: Record<WordLang, string> = { ru: 'Русский', en: 'English' };

/**
 * Язык слов по умолчанию — язык интерфейса, если слова на нём есть.
 * Для остальных двенадцати языков это английский: так игра и работала.
 */
export function defaultWordLang(uiLanguage: string): WordLang {
  return (WORD_LANGS as readonly string[]).includes(uiLanguage) ? (uiLanguage as WordLang) : 'en';
}

/** Ключ хранения — по игре И по профилю: у Вали и у Дениса выбор свой. */
export function wordLangKey(gameId: string, profileId: string): string {
  return `psygames_${gameId}_wordlang_${profileId}`;
}

export function isWordLang(v: unknown): v is WordLang {
  return typeof v === 'string' && (WORD_LANGS as readonly string[]).includes(v);
}

export async function readWordLang(gameId: string, profileId: string, uiLanguage: string): Promise<WordLang> {
  try {
    const v = await AsyncStorage.getItem(wordLangKey(gameId, profileId));
    return isWordLang(v) ? v : defaultWordLang(uiLanguage);
  } catch {
    return defaultWordLang(uiLanguage);
  }
}

export async function saveWordLang(gameId: string, profileId: string, lang: WordLang): Promise<void> {
  try { await AsyncStorage.setItem(wordLangKey(gameId, profileId), lang); } catch { /* хранилище недоступно — выбор живёт до конца сессии */ }
}

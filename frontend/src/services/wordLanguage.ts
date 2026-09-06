/* psygames-word-language · VER 1 · 06.09.2026 */
/**
 * 🔴 ЯЗЫК СЛОВ — ОТДЕЛЬНО ОТ ЯЗЫКА ПРИЛОЖЕНИЯ.
 *
 * 📍 ДВА ОТЧЁТА ДЕНИСА 05.09.2026, дословно: «надо добавить выбор языка»
 * (анаграммы) и «надо добавить сюда выбор языка» («Беглость речи»). Обе игры
 * брали язык слов из языка интерфейса: русское меню — только русские слова.
 * Тренировать английские слова при русском интерфейсе было нельзя вовсе.
 *
 * ⚠️ БЫЛО «ЯЗЫКОВ РОВНО ДВА» — И ЭТО ПЕРЕСТАЛО БЫТЬ ПРАВДОЙ 06.09.2026.
 * Здесь стояло: «третий язык появится тогда же, когда появятся его слова, а не
 * раньше». Слова появились: у режима «Найди все слова» наборов ВОСЕМЬ (ru, en,
 * de, es, fr, it, ko, pt) — все лежат в `constants/allWords*.json`, подключены и
 * проходят гейты. Полдня они были собраны и невидимы, потому что список языков
 * был один на все игры.
 *
 * 🔴 СПИСОК ЗАВИСИТ ОТ ИГРЫ, А НЕ ОДИН НА ВСЕХ. У «Беглости речи» два языка —
 * это по-прежнему замер, а не упрощение: вся письменность там сводится к
 * `PhonemicScript = 'ru' | 'en'`. У анаграмм столько, сколько наборов.
 *
 * ⚠️ А ВНУТРИ АНАГРАММ — ЕЩЁ И ОТ РЕЖИМА. Классика и «Квадрат слов» кормятся из
 * `ANAGRAM_DICT`, у которого ключи `ru` и `en`; восемь языков знает только «Найди
 * все слова». Поэтому сервис отдаёт МАКСИМУМ игры, а сузить до режима — дело
 * экрана: он один знает, что сейчас выбрано. Отдавать корейский классике значило
 * бы показать человеку пустой банк.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WORD_LANGS = ['ru', 'en'] as const;
/**
 * Локаль слов. Тип широкий намеренно: набор зависит от игры, и жёсткое
 * объединение пришлось бы править при каждом новом словнике. Что именно
 * допустимо, решает `wordLangsFor` и проверяет `isWordLang`.
 */
export type WordLang = string;

/**
 * Языки СЛОВ по играм. Ключ — `gameId`, тот же, что в `useWordLanguage`.
 * Игры, которых здесь нет, получают `WORD_LANGS` — два языка, как было.
 */
const ЯЗЫКИ_ИГРЫ: Record<string, readonly string[]> = {
  // Восемь наборов «Найди все слова». Классика и «Квадрат слов» знают из них
  // только ru и en — сужает экран, см. шапку файла.
  anagrams: ['ru', 'en', 'de', 'es', 'fr', 'it', 'ko', 'pt', 'ar'],
};

/** Какие языки предлагать в этой игре. */
export function wordLangsFor(gameId: string): readonly string[] {
  return ЯЗЫКИ_ИГРЫ[gameId] ?? WORD_LANGS;
}

/**
 * Подпись варианта — на СВОЁМ языке, а не переводом: так человек находит свой
 * язык, даже когда интерфейс на чужом.
 */
export const WORD_LANG_LABEL: Record<string, string> = {
  ru: 'Русский', en: 'English', de: 'Deutsch', es: 'Español',
  fr: 'Français', it: 'Italiano', pt: 'Português', ko: '한국어', ar: 'العربية',
};

/**
 * Язык слов по умолчанию — язык интерфейса, если слова на нём есть в ЭТОЙ игре.
 * Иначе английский: так игра и работала.
 */
export function defaultWordLang(uiLanguage: string, gameId?: string): WordLang {
  const можно = gameId ? wordLangsFor(gameId) : WORD_LANGS;
  return (можно as readonly string[]).includes(uiLanguage) ? uiLanguage : 'en';
}

/** Ключ хранения — по игре И по профилю: у Вали и у Дениса выбор свой. */
export function wordLangKey(gameId: string, profileId: string): string {
  return `psygames_${gameId}_wordlang_${profileId}`;
}

/**
 * Годится ли сохранённое значение для этой игры.
 *
 * ⚠️ ПРОВЕРЯТЬ НАДО ПО ИГРЕ, А НЕ ПО ОБЩЕМУ СПИСКУ. Без `gameId` корейский,
 * сохранённый в анаграммах, не прошёл бы проверку и молча сбросился в английский
 * при следующем заходе — а человек решил бы, что выбор не сохраняется.
 */
export function isWordLang(v: unknown, gameId?: string): v is WordLang {
  const можно = gameId ? wordLangsFor(gameId) : WORD_LANGS;
  return typeof v === 'string' && (можно as readonly string[]).includes(v);
}

export async function readWordLang(gameId: string, profileId: string, uiLanguage: string): Promise<WordLang> {
  try {
    const v = await AsyncStorage.getItem(wordLangKey(gameId, profileId));
    return isWordLang(v, gameId) ? v : defaultWordLang(uiLanguage, gameId);
  } catch {
    return defaultWordLang(uiLanguage, gameId);
  }
}

export async function saveWordLang(gameId: string, profileId: string, lang: WordLang): Promise<void> {
  try { await AsyncStorage.setItem(wordLangKey(gameId, profileId), lang); } catch { /* хранилище недоступно — выбор живёт до конца сессии */ }
}

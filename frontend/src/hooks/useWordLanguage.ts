/* psygames-use-word-language · VER 1 · 06.09.2026 */
/**
 * Язык СЛОВ игры: читается из хранилища, по умолчанию — язык интерфейса.
 * Отчёты Дениса 05.09.2026 по анаграммам и «Беглости речи»: «надо добавить
 * выбор языка». Подробности — в `services/wordLanguage.ts`.
 *
 * ⚠️ `ready` нужен, чтобы игра не стартовала на языке по умолчанию раньше, чем
 * прочитан сохранённый выбор: иначе первый круг после запуска шёл бы не на том
 * языке, и человек списал бы это на то, что выбор не сохраняется.
 */
import { useCallback, useEffect, useState } from 'react';
import { readWordLang, saveWordLang, defaultWordLang, type WordLang } from '@/src/services/wordLanguage';

export function useWordLanguage(gameId: string, profileId: string | undefined, uiLanguage: string) {
  const [lang, setLang] = useState<WordLang>(() => defaultWordLang(uiLanguage, gameId));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let живой = true;
    if (!profileId) { setLang(defaultWordLang(uiLanguage, gameId)); setReady(true); return () => { живой = false; }; }
    setReady(false);
    readWordLang(gameId, profileId, uiLanguage).then((v) => { if (живой) { setLang(v); setReady(true); } });
    return () => { живой = false; };
  }, [gameId, profileId, uiLanguage]);

  const pick = useCallback((v: WordLang) => {
    setLang(v);
    if (profileId) void saveWordLang(gameId, profileId, v);
  }, [gameId, profileId]);

  return { lang, pick, ready };
}

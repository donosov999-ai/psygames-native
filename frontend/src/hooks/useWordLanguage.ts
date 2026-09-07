/* psygames-use-word-language · VER 2 · 07.09.2026 */
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

/**
 * 🔴 ХРАНИМ «ДЛЯ КАКОГО ЯЗЫКА ИНТЕРФЕЙСА ПОСЧИТАНО», А НЕ ФЛАГ «ГОТОВО».
 *
 * 📍 Репорт Дениса 07.09.2026: «зарядка, после первого упражнения ошибка по
 * словам». Замер: интерфейс русский («Анаграммы», «Подсказка», «Сбросить»), а
 * слово английское — FLOOD, подсказка «too much water on land». Живьём то же на
 * /games/anagrams?wu=1&diff=medium&length=5 — там был TRUCK. Вручную тот же
 * экран даёт русские слова, то есть банк неверен только на пути зарядки.
 *
 * ПРИЧИНА — ФЛАГ-СОСТОЯНИЕ ОТСТАЁТ РОВНО НА ОДИН КАДР. Язык интерфейса доезжает
 * промисом (`LanguageContext` стартует с 'en'); в кадре, где он сменился на
 * 'ru', этот хук ещё не пересчитался — его эффект выполняется ПОСЛЕ отрисовки.
 * А `ready`, будучи состоянием, в этом кадре ещё `true` от ПРЕЖНЕГО языка.
 * Автостарт зарядки видел «язык готов, слова готовы», собирал английский банк,
 * и когда хук досчитывал, партия уже шла и не пересобиралась.
 *
 * ⚠️ ФЛАГОМ ЭТО НЕ ВЫРАЖАЕТСЯ В ПРИНЦИПЕ: любое состояние обновляется на кадр
 * позже своей причины. Поэтому хранится ПАРА «значение + для какого языка оно
 * посчитано», а `ready` и сам язык слов ВЫЧИСЛЯЮТСЯ В РЕНДЕРЕ — такое равенство
 * отстать не может, оно пересчитывается вместе с языком интерфейса.
 */
export function useWordLanguage(gameId: string, profileId: string | undefined, uiLanguage: string) {
  const [выбор, setВыбор] = useState<{ lang: WordLang; forLang: string } | null>(null);

  useEffect(() => {
    if (!profileId) return undefined;          // без профиля читать нечего — значение считается ниже
    let живой = true;
    readWordLang(gameId, profileId, uiLanguage)
      .then((v) => { if (живой) setВыбор({ lang: v, forLang: uiLanguage }); });
    return () => { живой = false; };
  }, [gameId, profileId, uiLanguage]);

  // Годится только выбор, посчитанный для ТЕКУЩЕГО языка интерфейса.
  const свежий = выбор && выбор.forLang === uiLanguage ? выбор : null;
  const lang = свежий ? свежий.lang : defaultWordLang(uiLanguage, gameId);
  // Без профиля хранилище не спрашиваем, значит значение верно уже сейчас.
  const ready = свежий !== null || !profileId;

  const pick = useCallback((v: WordLang) => {
    setВыбор({ lang: v, forLang: uiLanguage });
    if (profileId) void saveWordLang(gameId, profileId, v);
  }, [gameId, profileId, uiLanguage]);

  return { lang, pick, ready };
}

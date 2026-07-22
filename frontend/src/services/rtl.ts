/**
 * rtl.ts — направление письма (RTL) для арабского и других RTL-языков.
 *
 * ФАКТ по коду react-native-web 0.21.2 (см. node_modules/react-native-web/dist):
 *  - exports/I18nManager — ЗАГЛУШКА: forceRTL() ничего не делает,
 *    getConstants().isRTL всегда false. Через I18nManager RTL на web НЕ включить.
 *  - Реальный рычаг на web — атрибут dir на корне документа: чистый CSS сам
 *    зеркалит flexDirection:'row', выравнивание текста по умолчанию, порядок
 *    bidi-текста и блочную раскладку (заливки прогресс-баров прижимаются вправо).
 *  - Логические стили (start/end, marginStart, textAlign:'start') RN Web резолвит
 *    НЕ из document.dir, а из React-контекста LocaleProvider (createElement
 *    оборачивает элемент, у которого задан проп dir). В коде приложения логических
 *    стилей сейчас нет (проверено грепом), поэтому контекст не нужен; понадобятся —
 *    обернуть корневой View пропом dir={isRTL() ? 'rtl' : 'ltr'}.
 *  - Физические left/right/marginLeft/textAlign:'left' НЕ зеркалятся никогда —
 *    для них точечное ветвление по isRTLLang()/isRTL() по месту.
 *
 * Native (реальный iOS/Android, НЕ webview): I18nManager.forceRTL() пишет флаг,
 * который применяется только ПОСЛЕ перезапуска приложения. Сейчас все сборки —
 * webview (Tauri + RN Web), нативная ветка — задел на будущее.
 */
import { I18nManager, Platform } from 'react-native';

/** Языки с письмом справа налево (расширять по мере подключения). */
export const RTL_LANGS = ['ar', 'he', 'fa', 'ur'] as const;

/** true, если код языка (в т.ч. с регионом: 'ar-SA') — RTL. */
export function isRTLLang(lang: string): boolean {
  return (RTL_LANGS as readonly string[]).includes(lang.split('-')[0].toLowerCase());
}

/**
 * Применить направление письма под язык. Вызывается при каждой смене языка
 * (подписка в app/_layout.tsx → RootLayoutNav). Идемпотентно.
 */
export function applyRTL(lang: string): void {
  const rtl = isRTLLang(lang);
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return; // SSR / статический экспорт
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = lang; // скринридеры, переносы, выбор глифов
  } else {
    // Натив: выставляем флаг; полностью применится после перезапуска аппа.
    try {
      if (I18nManager.isRTL !== rtl) {
        I18nManager.allowRTL(rtl);
        I18nManager.forceRTL(rtl);
      }
    } catch {
      // урезанный рантайм без модуля — молча пропускаем
    }
  }
}

/**
 * Текущее направление. НЕ реактивно: компонент не перерисуется от смены dir.
 * В компонентах, знающих язык, предпочитай isRTLLang(language) из useLanguage().
 */
export function isRTL(): boolean {
  if (Platform.OS === 'web') {
    return typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  }
  try {
    return I18nManager.isRTL;
  } catch {
    return false;
  }
}

/**
 * buildTarget — build-time флаг сборки (web-demo vs полное приложение).
 *
 * EXPO_PUBLIC_* инлайнится при экспорте: babel-preset-expo
 * (plugins/inline-env-vars.js) заменяет ЛИТЕРАЛЬНОЕ обращение
 * `process.env.EXPO_PUBLIC_BUILD_TARGET` на строку-значение в момент билда.
 * ⚠️ Поэтому обращение ниже написано именно литералом — деструктуризация или
 * динамический ключ (`process.env[k]`) НЕ инлайнятся и в браузере сломаются.
 *
 * Сборка демо: EXPO_PUBLIC_BUILD_TARGET=web-demo npx expo export -p web
 * (CI: только web-deploy/play-deploy шаги; Tauri-экспорты идут без флага = полное приложение).
 */

export const BUILD_TARGET: string = process.env.EXPO_PUBLIC_BUILD_TARGET ?? 'app';

export const IS_WEB_DEMO: boolean = process.env.EXPO_PUBLIC_BUILD_TARGET === 'web-demo';

export function isWebDemo(): boolean {
  return IS_WEB_DEMO;
}

/**
 * URL страницы «Скачать» промо-сайта на языке пользователя.
 * en — корень сайта, остальные языки — префикс /<lang>/.
 */
export function demoDownloadUrl(language: string): string {
  return 'https://psy-games.pro/' + (language === 'en' ? '' : language + '/') + 'download';
}

/**
 * ?embed=1 — «минимальный хром» (демо-лендинг встроен на сайт iframe'ом):
 * прячем шапку лендинга. Читаем прямо из window.location.search —
 * демо живёт только на web, при SPA-переходах параметр остаётся в URL входа.
 */
export function isEmbed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch {
    return false;
  }
}

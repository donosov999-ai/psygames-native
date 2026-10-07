/* psygames-dots-connect-record-flutter-strings · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * СЛОВАРЬ «СОЕДИНИ ТОЧКИ» ДЛЯ FLUTTER-ПОЛОВИНЫ — `flutter/assets/l10n/dots-connect.json`.
 *
 * 🔴 ЗАЧЕМ. Текст партии у веба живёт в модуле (`core/i18n.ts`) сразу на двенадцати языках.
 * Нативный экран берёт его отсюда, а не держит свои строки: иначе перевод, сделанный для веба,
 * в приложение не доезжает, и экран говорит на одном языке из двенадцати (гейт
 * `flutter/test/ui_text_debt_does_not_grow_test.dart`). Читает файл `flutter/lib/shell/module_strings.dart`.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/i18n.ts` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ JSON: вшитые данные без экспортёра
 * не чинятся, а эталон замораживает перенос, а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/dots-connect/tools/record-flutter-strings.gen.ts'
 */
import { DOTS_LOCALES, getDotsStrings } from '../core/i18n';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/dots-connect.json');

it('выгрузка словаря «Соедини точки» для приложения', () => {
  const all: Record<string, Record<string, string>> = {};
  for (const locale of DOTS_LOCALES) all[locale] = { ...getDotsStrings(locale) };
  writeFileSync(STRINGS_PATH, JSON.stringify(all, null, 1) + '\n');
  expect(Object.keys(all).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'zh']);
  // `getDotsStrings` молча падает на английский, если языка нет: тот же объект — это провал, а не перевод.
  const fellBack = DOTS_LOCALES.filter((locale) => locale !== 'en' && getDotsStrings(locale) === getDotsStrings('en'));
  expect(fellBack).toEqual([]);
});

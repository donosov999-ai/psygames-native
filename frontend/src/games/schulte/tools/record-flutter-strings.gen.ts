/* psygames-schulte-series-record-flutter-strings · VER 1 · 07.10.2026 */
/**
 * @jest-environment node
 */
/**
 * СЛОВАРЬ СЕРИИ БЛОКОВ «ТАБЛИЦЫ ШУЛЬТЕ» ДЛЯ FLUTTER-ПОЛОВИНЫ — `flutter/assets/l10n/schulte-series.json`.
 *
 * 🔴 ЗАЧЕМ. Текст серии у веба живёт в модуле (`core/i18n.ts`) сразу на двенадцати языках.
 * Нативный экран серии (`flutter/lib/games/schulte/series_screen.dart`, задача 1b6338c1) берёт
 * его отсюда, а не держит свои строки: иначе перевод, сделанный для веба, в приложение не
 * доезжает. Читает файл `flutter/lib/shell/module_strings.dart`.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/i18n.ts` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ JSON: вшитые данные без экспортёра
 * не чинятся, а эталон замораживает перенос, а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/schulte/tools/record-flutter-strings.gen.ts'
 */
import { SCHULTE_SERIES_LOCALES, getSchulteSeriesStrings } from '../core/i18n';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/schulte-series.json');

it('выгрузка словаря серии «Таблицы Шульте» для приложения', () => {
  const all: Record<string, Record<string, string>> = {};
  for (const locale of SCHULTE_SERIES_LOCALES) all[locale] = { ...getSchulteSeriesStrings(locale) };
  writeFileSync(STRINGS_PATH, JSON.stringify(all, null, 1) + '\n');
  expect(Object.keys(all).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'zh']);
  // Молчаливый откат на английский — провал, а не перевод.
  const fellBack = SCHULTE_SERIES_LOCALES.filter(
    (locale) => locale !== 'en' && getSchulteSeriesStrings(locale) === getSchulteSeriesStrings('en'),
  );
  expect(fellBack).toEqual([]);
});

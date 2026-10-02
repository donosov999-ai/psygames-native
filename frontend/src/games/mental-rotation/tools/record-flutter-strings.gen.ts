/* psygames-mental-rotation-record-flutter-strings · VER 1 · 30.09.2026 */
/**
 * @jest-environment node
 */
/**
 * СЛОВАРЬ «МЫСЛЕННОГО ВРАЩЕНИЯ» ДЛЯ FLUTTER-ПОЛОВИНЫ — `flutter/assets/l10n/mental-rotation.json`.
 *
 * 🔴 ЗАЧЕМ. Вопросы заданий, подписи вариантов и разборы у веба живут в модуле (`core/i18n.ts`)
 * сразу на двенадцати языках. Нативный экран держал их русскими строками (`words.dart`, 62 штуки):
 * немец и кореец читали вопрос задания по-русски посреди своего экрана. Теперь он берёт их отсюда
 * через `flutter/lib/shell/module_strings.dart` — формулировки те же, что в вебе, слово в слово.
 *
 * ⚠️ ПОСЛЕ ПРАВКИ `core/i18n.ts` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ JSON: вшитые данные без экспортёра
 * не чинятся, а эталон замораживает перенос, а не источник.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/mental-rotation/tools/record-flutter-strings.gen.ts'
 */
import { getMentalRotationStrings } from '../core/i18n';
import { MENTAL_ROTATION_LOCALES } from '../core/types';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const STRINGS_PATH = join(__dirname, '../../../../../flutter/assets/l10n/mental-rotation.json');

it('выгрузка словаря «Мысленного вращения» для приложения', () => {
  const all: Record<string, Record<string, string>> = {};
  for (const locale of MENTAL_ROTATION_LOCALES) all[locale] = { ...getMentalRotationStrings(locale) };
  writeFileSync(STRINGS_PATH, JSON.stringify(all, null, 1) + '\n');
  // Языки приложения — ровно `L.locales` из `flutter/lib/shell/l10n.dart`.
  expect(Object.keys(all).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'zh']);
  // `getMentalRotationStrings` молча падает на английский, если языка нет: тот же объект — провал.
  const fellBack = MENTAL_ROTATION_LOCALES.filter((locale) => locale !== 'en' && getMentalRotationStrings(locale) === getMentalRotationStrings('en'));
  expect(fellBack).toEqual([]);
});

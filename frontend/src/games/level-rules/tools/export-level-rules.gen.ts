/* psygames-level-rules-native-export · VER 1 · 30.09.2026 */
/**
 * ВЫГРУЗКА ТАБЛИЦЫ ПРАВИЛ УРОВНЕЙ ДЛЯ FLUTTER — `flutter/assets/level_rules.json`.
 *
 * Запуск (из frontend):  npx jest --testMatch '**\/level-rules/tools/*.gen.ts'
 * Затем:                  node ../flutter/tools/embed-l10n.mjs   — ключи lr_* доедут до словарей
 *
 * Зачем и почему таблицей — шапка `ruleSources.ts`. Свежесть сторожит проба
 * `src/__tests__/level-rules-native-export-fresh.test.ts`: правило поменяли в TS и не
 * перевыгрузили — она краснеет и называет эту команду.
 */
declare const __dirname: string;
declare function require(id: string): any;
const { writeFileSync } = require('fs');
const { join } = require('path');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  Redirect: () => null,
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));

it('выгрузка таблицы правил уровней для Flutter', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- после заглушки expo-router */
  const { levelRulesTable, MAX_LEVEL } = require('./ruleSources');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const games = levelRulesTable();
  const file = join(__dirname, '..', '..', '..', '..', '..', 'flutter', 'assets', 'level_rules.json');
  const body = {
    _: 'СГЕНЕРИРОВАНО, руками не править: npx jest --testMatch \'**/level-rules/tools/*.gen.ts\' (из frontend). '
      + 'Отрезок: [с уровня, по уровень или null — до конца, ключ правила или null — правила нет]. '
      + 'Тексты — ключи словаря lr_<игра>_<ключ>_title|rule|example.',
    maxLevel: MAX_LEVEL,
    games,
  };
  writeFileSync(file, JSON.stringify(body, null, 1) + '\n');
  expect(Object.keys(games).length).toBeGreaterThan(20);
});

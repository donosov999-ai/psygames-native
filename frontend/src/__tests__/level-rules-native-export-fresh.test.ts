/* psygames-level-rules-native-export-fresh · VER 1 · 30.09.2026 */
/**
 * 🔴 ТАБЛИЦА ПРАВИЛ УРОВНЕЙ У FLUTTER СОВПАДАЕТ С ЖИВЫМ TS.
 *
 * Нативная половина показывает правило уровня по таблице `flutter/assets/level_rules.json`,
 * которую выгружает `src/games/level-rules/tools/export-level-rules.gen.ts`. Выгрузка —
 * снимок: правило поменяли в игре и не перевыгрузили — веб и приложение объявляют разное,
 * и обе половины при этом зелёные. Эта проба пересчитывает таблицу прогоном тех же правил
 * и сверяет с файлом.
 *
 * Вторая половина — полнота: игра, где стоит `useLevelRules(`, обязана быть в таблице.
 * Иначе новая игра с правилами переедет во Flutter и будет включать механики молча.
 */
declare const __dirname: string;
declare function require(id: string): any;
const { readFileSync, readdirSync } = require('fs');
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

const ФАЙЛ = join(__dirname, '..', '..', '..', 'flutter', 'assets', 'level_rules.json');
const ИГРЫ = join(__dirname, '..', '..', 'app', 'games');
const КОМАНДА = "из frontend: npx jest --testMatch '**/level-rules/tools/*.gen.ts' && node ../flutter/tools/embed-l10n.mjs";

describe('таблица правил уровней для Flutter', () => {
  const { levelRulesTable } = require('@/src/games/level-rules/tools/ruleSources');
  const живая = levelRulesTable();
  const вФайле = JSON.parse(readFileSync(ФАЙЛ, 'utf8')).games;

  it('совпадает с тем, что считает живой TS', () => {
    const разошлись = Object.keys({ ...живая, ...вФайле })
      .filter((id) => JSON.stringify(живая[id]) !== JSON.stringify(вФайле[id]));
    expect(разошлись.length ? `правила разошлись у: ${разошлись.join(', ')} — перевыгрузи: ${КОМАНДА}` : 'совпадает')
      .toBe('совпадает');
  });

  it('каждая игра с правилами уровня есть в таблице', () => {
    const сПравилами = (readdirSync(ИГРЫ) as string[])
      .filter((f) => f.endsWith('.tsx') && readFileSync(join(ИГРЫ, f), 'utf8').includes('useLevelRules('));
    expect(сПравилами.length).toBeGreaterThan(20);   // проба не пустая
    const нет = сПравилами.map((f) => f.replace(/\.tsx$/, '').replace(/-/g, '_')).filter((id) => !(id in живая));
    expect(нет.length ? `нет в ruleSources.ts: ${нет.join(', ')}` : 'все на месте').toBe('все на месте');
  });
});

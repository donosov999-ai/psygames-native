/**
 * РАЗВИЛКА НЕ ОТКРЫВАЕТ ЛИШНЕГО И НЕ ОТКРЫВАЕТСЯ ПУСТОЙ.
 *
 * 🔴 ЗАЧЕМ. 04.09.2026 развилки вышли из предпросмотра `nzt48` в общий доступ.
 * Замер ПЕРЕД включением: у двенадцати профилей от 12 до 28 лишних входов
 * каждому. «Детям» открывались шахматы вслепую, самурай и Висконсинский тест,
 * «Старшим» — трекер объектов, «Шахматисту» — весь набор охвата памяти.
 *
 * ⚠️ И ЭТОГО НЕ ВИДНО ИЗ СЕТКИ. Карточек в каталоге стало МЕНЬШЕ — развилки
 * сжали список, — а доступного стало больше. Проверка по числу карточек показала
 * бы улучшение. Поэтому здесь считаются ССЫЛКИ ВНУТРИ экрана развилки, а не
 * карточки снаружи.
 *
 * Обратная ошибка так же молчалива: развилка, у которой после фильтра не
 * осталось ни одного упражнения, выглядит как обычная карточка и открывает
 * пустой список.
 */
import React from 'react';
import { visibleInCatalog, isHubGame } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

/** Профиль, за который отвечает подменённый контекст. Имя с `mock` — требование jest. */
let mockПрофиль: any = null;
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: mockПрофиль, ready: true }),
  ProfileProvider: ({ children }: any) => children,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

declare function require(m: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const КОРЕНЬ = path.join(__dirname, '../..');

function ссылкиЭкрана(route: string): string[] {
  const f = path.join(КОРЕНЬ, 'app' + route + '.tsx');
  if (!fs.existsSync(f)) return [];
  const src: string = fs.readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ');
  return [...src.matchAll(/'(\/games\/[a-z0-9-]+)'/g)].map((m) => m[1]!);
}

describe('развилка и профиль', () => {
  /**
   * ⚠️ ПРОВЕРЯЕМ ОТРИСОВКУ, А НЕ ФАЙЛ. Статический список внутри экрана развилки
   * всегда полон — фильтр работает в рантайме, по текущему профилю. Первая
   * редакция этого теста читала исходник и падала на верном коде: она мерила не
   * то место.
   */
  it('🔴 отрисованная развилка не показывает закрытое профилю', () => {
    const профиль = PROFILES.find((p) => p.id === 'kids')!;
    mockПрофиль = профиль;
    const можно = new Set(filterAllowedGames(профиль).map((g) => g.route));
    expect(`chess-blind разрешён детям: ${можно.has('/games/chess-blind')}`)
      .toBe('chess-blind разрешён детям: false');
    expect(`schulte разрешён детям: ${можно.has('/games/schulte')}`)
      .toBe('schulte разрешён детям: true');

    const { ThemeProvider } = require('@/src/contexts/ThemeContext');
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const HubScreen = require('@/src/components/HubScreen').default;
    let r: any;
    TestRenderer.act(() => {
      r = TestRenderer.create(
        React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(HubScreen, {
                titleKey: 'visualMemoryGroup', descKey: 'visualMemoryGroupDesc',
                pickKey: 'hubPickExercise', icon: 'image', gradient: ['#000000', '#111111'],
                games: [
                  { route: '/games/schulte', icon: 'grid', nameKey: 'schulteTable', descKey: 'schulteTableDesc' },
                  { route: '/games/chess-blind', icon: 'apps', nameKey: 'chessBlind', descKey: 'chessBlindDesc' },
                ],
              })))),
      );
    });
    // считаем СТРОКИ списка, а не слова: подпись зависит от языка проб
    const строки = r.root.findAll((n: any) => typeof n.props?.accessibilityRole === 'string'
      && n.props.accessibilityRole === 'button' && typeof n.props?.onPress === 'function');
    const текст = JSON.stringify(r.toJSON());
    expect(`«Доска в уме» на экране: ${/Доска в уме|Board in Mind/.test(текст)}`).toBe('«Доска в уме» на экране: false');
    expect(`строк в списке: ${строки.length >= 1}`).toBe('строк в списке: true');
    expect(`Шульте на экране: ${/Шульте|Schulte/i.test(текст)}`).toBe('Шульте на экране: true');
    r.unmount();
  });

  it('🔴 открытая развилка не бывает пустой', () => {
    const пустые: string[] = [];
    for (const p of PROFILES) {
      const можноИгры = filterAllowedGames(p);
      const можно = new Set(можноИгры.map((g) => g.route));
      for (const х of visibleInCatalog(можноИгры, p.id).filter((g) => isHubGame(g.id))) {
        if (!х.route) continue;
        const внутри = ссылкиЭкрана(х.route).filter((r) => можно.has(r)).length;
        if (внутри === 0) пустые.push(`${p.id}/${х.id}`);
      }
    }
    expect(пустые).toEqual([]);
  });

  it('🔴 экран развилки ФИЛЬТРУЕТ список, а не показывает общий', () => {
    const src: string = fs.readFileSync(path.join(КОРЕНЬ, 'src/components/HubScreen.tsx'), 'utf8');
    expect(src).toContain('filterAllowedGames');
    // общий список наружу больше не идёт: обход строится по отфильтрованному
    expect(src).not.toContain('games.map(');
  });
});

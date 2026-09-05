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

/**
 * ЧТО ЛЕЖИТ ВНУТРИ РАЗВИЛКИ — СПРАШИВАЕМ У ОБЩЕГО РЕЕСТРА (`hubContents.ts`).
 *
 * ⚠️ Здесь стоял разбор ИСХОДНИКА экрана регулярками: состав был набран прямо в
 * JSX шестнадцати `app/games/*-hub.tsx`, и другого места его взять было негде.
 * Ровно из-за этой второй копии значок на карточке каталога врал (замер
 * 05.09.2026: 6 развилок из 16 разошлись; «Зрительная память» — на значке 2,
 * внутри 3). С переездом состава в один реестр разбирать нечего — и не нужно:
 * то же самое читает и экран, и значок. Отрисовку проверяет соседняя проба
 * `hub-badge-matches-screen`.
 */
function ссылкиЭкрана(route: string): string[] {
  const { HUB_CONTENTS } = require('@/src/constants/hubContents');
  const { GAME_SUITES } = require('@/src/constants/gameSuites');
  const все = new Set<string>();
  for (const c of (HUB_CONTENTS[route] ?? []) as { route: string; suiteId?: string }[]) {
    все.add(c.route);
    if (!c.suiteId) continue;
    // под карточкой набора живёт несколько маршрутов — они тоже достижимы
    const набор = GAME_SUITES.find((s: any) => s.id === c.suiteId);
    for (const m of набор?.modes ?? []) все.add(m.route);
  }
  return [...все];
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

    /**
     * ⚠️ РИСУЕМ НАСТОЯЩИЕ ЭКРАНЫ, А НЕ СОБРАННЫЙ ЗДЕСЬ СПИСОК. До 05.09.2026 сюда
     * передавался выдуманный набор карточек пропом `games` — проба проверяла
     * фильтр каркаса, но ни одной живой развилки в глаза не видела. Состав теперь
     * приходит из реестра, и синтетический список стал бы проверкой самого себя.
     * Берём две живые: за «Шахматами» лежит закрытая детям доска в уме, за
     * «Поиском» — открытая им таблица Шульте.
     */
    const нарисовать = (route: string) => {
      const { ThemeProvider } = require('@/src/contexts/ThemeContext');
      const { LanguageProvider } = require('@/src/contexts/LanguageContext');
      const { WarmupProvider } = require('@/src/contexts/WarmupContext');
      const { SafeAreaProvider } = require('react-native-safe-area-context');
      const Экран = require('../../app/games/' + route.replace('/games/', '')).default;
      let r: any;
      TestRenderer.act(() => {
        r = TestRenderer.create(
          // ⚠️ Провайдер зарядки: развилка «Шахматы» с 06.09.2026 показывает над
          // списком зарядку из обоих своих упражнений и спрашивает `useWarmup`.
          // В приложении он стоит всегда (`app/_layout.tsx`).
          React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
            React.createElement(ThemeProvider, null,
              React.createElement(LanguageProvider, null,
                React.createElement(WarmupProvider, null, React.createElement(Экран))))));
      });
      /**
       * ⚠️ ЧИТАЕМ ПОДПИСИ СТРОК, А НЕ ВЕСЬ ЭКРАН. Первая редакция искала имя игры
       * по всему дереву и покраснела на исправном коде: «Доска в уме» названа в
       * СНОСКЕ развилки («chessGroupFootnote»), которая на месте у всех профилей.
       * Гейт мерил не то место — а спрашивают у него про строки списка.
       */
      const строки = new Map<unknown, string>();
      for (const n of r.root.findAll((x: any) => x.props?.accessibilityRole === 'button'
        && typeof x.props?.onPress === 'function' && typeof x.props?.activeOpacity === 'number')) {
        const подпись = n.findAll(() => true)
          .flatMap((x: any) => ([] as any[]).concat(x.props?.children ?? []))
          .filter((c: any) => typeof c === 'string').join(' ');
        строки.set(n.props.onPress, подпись);
      }
      r.unmount();
      return { текст: [...строки.values()].join(' | '), строк: строки.size };
    };

    const шахматы = нарисовать('/games/chess-hub');
    expect(`«Доска в уме» на экране шахмат: ${/Доска в уме|Board in Mind/.test(шахматы.текст)}`)
      .toBe('«Доска в уме» на экране шахмат: false');

    const поиск = нарисовать('/games/search-hub');
    expect(`строк в списке поиска: ${поиск.строк >= 1}`).toBe('строк в списке поиска: true');
    expect(`Шульте на экране поиска: ${/Шульте|Schulte/i.test(поиск.текст)}`).toBe('Шульте на экране поиска: true');
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
    /**
     * ⚠️ И СПИСОК КАРКАС БОЛЬШЕ НЕ ПРИНИМАЕТ СНАРУЖИ. Пока проп `games` был,
     * развилка могла принести свой состав — и приносила: значок считал по
     * `mergedInto`, экран рисовал JSX, расходились 6 развилок из 16.
     */
    expect(`каркас берёт состав по маршруту: ${src.includes('visibleHubCards(hubRoute')}`)
      .toBe('каркас берёт состав по маршруту: true');
  });
});

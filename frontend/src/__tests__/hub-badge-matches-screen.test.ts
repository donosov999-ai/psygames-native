/* psygames-gate-hub-badge · VER 1 · 05.09.2026 */
/**
 * 🔴 ЧИСЛО НА ЗНАЧКЕ РАЗВИЛКИ РАВНО ЧИСЛУ СТРОК ВНУТРИ НЕЁ. У КАЖДОГО ПРОФИЛЯ.
 *
 * 📍 ОТЗЫВ, ИЗ-ЗА КОТОРОГО ГЕЙТ НАПИСАН. Тестировщица, запись `291c2cff` в
 * `app_feedback`, дословно: «написано например один а по факту там два стоит и
 * так абсолютно во всех профилях».
 *
 * 📍 ЗАМЕР 05.09.2026 ДО ПРАВКИ: расходились 6 развилок из 16 — `span_group`,
 * `sudoku_group`, `attention_conflict`, `inhibition_group`, `visual_memory_group`,
 * `languages_group`; 24 пары профиль×развилка. Чистый пример — «Зрительная
 * память»: на значке 2, внутри 3. Худший — судоку: значок 1, внутри 5.
 *
 * ⚠️ ПОЧЕМУ ГЕЙТ РИСУЕТ ЭКРАНЫ, А НЕ СЧИТАЕТ ПО ДАННЫМ. Дефект был ровно в том,
 * что число и список брались из РАЗНЫХ мест: значок — из поля `mergedInto`,
 * список — из рукописного JSX в `app/games/*-hub.tsx`. Проба, считающая обе
 * половины по одним и тем же данным, зазеленела бы на том самом коде, который
 * врал человеку. Поэтому здесь одна половина — РИСОВАННЫЙ экран (строки, которые
 * человек пересчитает пальцем), а вторая — та функция, которую зовёт значок на
 * главной. Вернуть развилке свой список — и гейт краснеет.
 */
import React from 'react';
import { GAMES, isHubGame } from '@/src/constants/games';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { HUB_CONTENTS, hubBadgeCount } from '@/src/constants/hubContents';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/games/span',
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

function вОкружении(узел: any) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  return React.createElement(SafeAreaProvider, { initialMetrics: METRICS } as any,
    React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, узел)));
}

/** Экран развилки по её маршруту из каталога — берём настоящий, а не пересобранный. */
function экранПоМаршруту(route: string) {
  const имя = route.replace('/games/', '');
  return require('../../app/games/' + имя).default;
}

/**
 * СТРОКИ СПИСКА — то, что человек пересчитает пальцем.
 *
 * ⚠️ Кнопка «назад» тоже `accessibilityRole="button"` с `onPress`, поэтому
 * различаем по `activeOpacity`: он есть только у карточек списка. И считаем по
 * ОБРАБОТЧИКУ, а не по узлам: одна карточка встречается в дереве дважды —
 * компонентом и его хостом, — и наивный `findAll` ровно удваивал весь список
 * (замер: «внутри 8» там, где карточек четыре).
 */
function строкСписка(r: any): number {
  const обработчики = new Set<unknown>();
  for (const n of r.root.findAll((x: any) => x.props?.accessibilityRole === 'button'
    && typeof x.props?.onPress === 'function'
    && typeof x.props?.activeOpacity === 'number')) {
    // Одна карточка — один обработчик нажатия, сколько бы узлов его ни несло.
    обработчики.add(n.props.onPress);
  }
  return обработчики.size;
}

const ХАБЫ = GAMES.filter((g) => isHubGame(g.id));

declare function require(m: string): any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const КОРЕНЬ = path.join(__dirname, '../..');
const безКомментариев = (s: string): string =>
  s.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('значок развилки не врёт', () => {
  it('есть что проверять: развилок ≥ 16, профилей ≥ 10, и они различаются доступом', () => {
    expect(ХАБЫ.length).toBeGreaterThanOrEqual(16);
    expect(PROFILES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PROFILES.map((p) => filterAllowedGames(p).length)).size).toBeGreaterThan(1);
  });

  /**
   * САМОПРОВЕРКА ОТ СЛЕПОГО ЗЕЛЁНОГО: у каждой развилки каталога есть состав, и
   * состав не описан ни для чего, кроме развилок. Иначе «0 = 0» сойдёт за успех.
   */
  it('🔴 состав описан ровно для развилок каталога — ни одной лишней, ни одной забытой', () => {
    const изКаталога = ХАБЫ.map((g) => g.route).sort();
    expect(Object.keys(HUB_CONTENTS).sort()).toEqual(изКаталога);
    for (const [маршрут, список] of Object.entries(HUB_CONTENTS)) {
      expect(`${маршрут}: ${список.length > 0}`).toBe(`${маршрут}: true`);
    }
  });

  /**
   * 🔴 ГЛАВНАЯ ПРОВЕРКА. Рисуем КАЖДУЮ развилку под КАЖДЫМ профилем и сверяем
   * число строк с тем, что покажет значок на главной.
   */
  it('🔴 значок = число строк на экране развилки, у всех профилей', () => {
    const расхождения: string[] = [];
    for (const p of PROFILES) {
      mockПрофиль = p;
      const можно = new Set(filterAllowedGames(p).map((g) => g.route as string));
      for (const х of ХАБЫ) {
        const Экран = экранПоМаршруту(х.route);
        let r: any;
        TestRenderer.act(() => { r = TestRenderer.create(вОкружении(React.createElement(Экран))); });
        const внутри = строкСписка(r);
        r.unmount();
        const значок = hubBadgeCount(х.route, можно);
        if (значок !== внутри) расхождения.push(`${p.id}/${х.id}: значок ${значок}, внутри ${внутри}`);
      }
    }
    expect(расхождения).toEqual([]);
  });

  /**
   * ⚠️ И ЗНАЧОК НЕ БЫВАЕТ НУЛЁМ У ВИДИМОЙ КАРТОЧКИ. Ноль на значке — это пустой
   * экран за карточкой; соседний гейт (`hub-respects-profile`) ловит это со
   * стороны экрана, здесь — со стороны обещания.
   */
  it('🔴 у видимой профилю развилки значок больше нуля', () => {
    const пустые: string[] = [];
    for (const p of PROFILES) {
      const открыто = filterAllowedGames(p);
      const можно = new Set(открыто.map((g) => g.route as string));
      for (const х of открыто.filter((g) => isHubGame(g.id))) {
        if (hubBadgeCount(х.route, можно) === 0) пустые.push(`${p.id}/${х.id}`);
      }
    }
    expect(пустые).toEqual([]);
  });

  /**
   * ⚠️ ВТОРАЯ ПОЛОВИНА ОБЕЩАНИЯ — ГЛАВНЫЙ ЭКРАН, И ОНА ПРОВЕРЯЕТСЯ ПО ИСХОДНИКУ.
   *
   * Не от лени: отрисовать `app/index.tsx` в пробе не выходит — замер 05.09.2026,
   * рендер падает на `Cannot read properties of undefined (reading 'filter')` в
   * сервисах, которым нужно живое хранилище и фокус экрана. Поэтому здесь
   * проверяется единственное, что делало дефект возможным: СВОЙ подсчёт состава.
   *
   * Дефект был именно им — главная строила «развилка → дети» из поля `mergedInto`,
   * а экран рисовал свой список. Пока главная зовёт `hubBadgeCount`, разойтись
   * нечему; как только она снова начнёт считать сама, здесь станет красно.
   */
  it('🔴 главный экран не считает состав развилки сам — он его спрашивает', () => {
    const src = безКомментариев(fs.readFileSync(path.join(КОРЕНЬ, 'app/index.tsx'), 'utf8'));
    expect(`зовёт hubBadgeCount: ${src.includes('hubBadgeCount(')}`).toBe('зовёт hubBadgeCount: true');
    /**
     * `mergedInto` — про то, какая развилка ОТКРЫВАЕТ игру профилю
     * (`filterAllowedGames`), а не про то, что лежит внутри. Главной оно не нужно
     * ни для чего: она спрашивает готовое число.
     */
    expect(`главная трогает mergedInto: ${src.includes('mergedInto')}`)
      .toBe('главная трогает mergedInto: false');
  });

  /**
   * И НИ ОДИН ЭКРАН РАЗВИЛКИ НЕ НЕСЁТ СВОЕГО СПИСКА. Ровно та копия, из-за которой
   * значок и содержимое разъехались: состав был набран прямо в JSX шестнадцати
   * экранов. Вернуть список в экран — и здесь станет красно.
   */
  it('🔴 экраны развилок не хранят своих списков карточек', () => {
    const свои: string[] = [];
    for (const х of ХАБЫ) {
      const файл = path.join(КОРЕНЬ, 'app' + х.route + '.tsx');
      const src = безКомментариев(fs.readFileSync(файл, 'utf8'));
      const своих = [...src.matchAll(/route:\s*'\/games\//g)].length;
      if (своих) свои.push(`${х.route}: ${своих} карточек набрано в самом экране`);
    }
    expect(свои).toEqual([]);
  });
});

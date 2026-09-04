/* eslint-disable import/first, @typescript-eslint/no-require-imports */
/**
 * 🔴 КАРТОЧКА НАБОРА ОБЯЗАНА ОТКРЫВАТЬ РЕЖИМ, ОТКРЫТЫЙ ЭТОМУ ПРОФИЛЮ.
 *
 * Объединение 05.09.2026 (`src/constants/gameSuites.ts`) свело десять парадигм
 * хаба «Конфликт внимания» в пять карточек: четыре стрелочных стали одной
 * карточкой «Стрелки», две струповых — одной «Струп», CPT с переключением —
 * «Долгим потоком». Карточка ведёт на один маршрут, а режимов под ней несколько,
 * и вот здесь появляется ошибка, которой раньше не могло быть.
 *
 * 📍 ЗАМЕР, ИЗ-ЗА КОТОРОГО ЭТА ПРОБА НАПИСАНА. У профиля «chess» из четырёх
 * стрелочных парадигм открыта ОДНА — `choice-rt`. Наивная карточка ведёт на
 * первый режим списка, то есть на `flanker`, которого у шахматиста нет: он
 * попадает в закрытую игру, а открытый ему `choice-rt` при этом исчезает с
 * экрана вовсе. Обе половины дефекта молчаливы — карточка выглядит исправной.
 *
 * ⚠️ ПОЧЕМУ НЕ ХВАТИЛО СОСЕДНИХ ПРОБ. `hub-respects-profile` проверяет, что
 * развилка не пуста и не показывает лишнего. Мутация «вести на первый режим
 * вместо первого открытого» прошла ОБЕ её проверки: список не опустел, лишних
 * карточек не прибавилось — уехал только адрес под пальцем. Поэтому здесь
 * карточки НАЖИМАЮТСЯ, и проверяется, куда они привели.
 */
import React from 'react';
import { PROFILES, filterAllowedGames } from '@/src/constants/profiles';
import { GAME_SUITES } from '@/src/constants/gameSuites';

const TestRenderer = require('react-test-renderer');

/** Куда увели нажатия. Имя с `mock` — требование jest для замыканий в моках. */
const mockПереходы: string[] = [];
/** Экран, на котором «стоит» переключатель. Меняется прямо в пробе. */
let mockМаршрут = '/games/attention-conflict';
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (r: string) => { mockПереходы.push(String(r)); },
    replace: (r: string) => { mockПереходы.push(String(r)); },
    back: () => {},
  }),
  usePathname: () => mockМаршрут,
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

let mockПрофиль: any = null;
jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({ profile: mockПрофиль, ready: true }),
  ProfileProvider: ({ children }: any) => children,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

import AttentionConflictGame from '@/app/games/attention-conflict';
import SpanGame from '@/app/games/span';
import GameSuiteSwitch from '@/src/components/GameSuiteSwitch';
import { SafeAreaProvider } from 'react-native-safe-area-context';

function вОкружении(узел: any) {
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  return React.createElement(SafeAreaProvider, { initialMetrics: METRICS } as any,
    React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, узел)));
}

/**
 * 🔴 РАЗВИЛОК НЕСКОЛЬКО, И ПРОБА ОБЯЗАНА ОТКРЫТЬ КАЖДУЮ.
 *
 * Первый вариант рисовал только «Конфликт внимания». Когда 05.09.2026 появился
 * четвёртый набор — «Позиции» в «Охвате памяти», — проба этого не увидела и
 * зазеленела на развилке, которой в глаза не смотрела. Гейт, знающий один экран
 * из двух, врёт ровно в половине случаев.
 */
const РАЗВИЛКИ: { id: string; экран: any }[] = [
  { id: '/games/attention-conflict', экран: AttentionConflictGame },
  { id: '/games/span', экран: SpanGame },
];

function нарисоватьХаб(профиль: any, экран: any) {
  mockПрофиль = профиль;
  mockПереходы.length = 0;
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(вОкружении(React.createElement(экран)));
  });
  return r;
}

/** Все нажимаемые строки списка развилки. */
function карточки(r: any) {
  return r.root.findAll((n: any) => n.props?.accessibilityRole === 'button'
    && typeof n.props?.onPress === 'function'
    && typeof n.props?.activeOpacity === 'number');
}

const маршрутыНаборов = new Set(GAME_SUITES.flatMap((s) => s.modes.map((m) => m.route)));

describe('карточка набора и профиль', () => {
  it('есть что проверять: наборы существуют и в них больше одного режима', () => {
    expect(GAME_SUITES.length).toBeGreaterThan(0);
    for (const s of GAME_SUITES) expect(s.modes.length).toBeGreaterThan(1);
  });

  /**
   * 🔴 САМОПРОВЕРКА ОТ ПОВТОРА СЛЕПОТЫ. Проба открывает конечный список развилок;
   * набор, попавший в развилку не из списка, проверяться перестанет — и проба
   * останется зелёной. Ровно это случилось 05.09.2026 с «Позициями». Поэтому
   * здесь требуется, чтобы КАЖДЫЙ набор реестра встречался хотя бы в одной
   * открываемой развилке.
   */
  it('🔴 каждый набор реестра попадает хотя бы в одну открываемую развилку', () => {
    const самый = [...PROFILES].sort(
      (a, b) => filterAllowedGames(b).length - filterAllowedGames(a).length,
    )[0];
    const входы = new Set<string>();
    for (const развилка of РАЗВИЛКИ) {
      const r = нарисоватьХаб(самый, развилка.экран);
      for (const строка of карточки(r)) {
        mockПереходы.length = 0;
        TestRenderer.act(() => { строка.props.onPress(); });
        for (const куда of mockПереходы) входы.add(куда);
      }
      r.unmount();
    }
    const непроверенные = GAME_SUITES
      .filter((s) => !s.modes.some((m) => входы.has(m.route)))
      .map((s) => `${s.id} — ни одна открываемая развилка на него не ведёт, проба его не видит`);
    expect(непроверенные).toEqual([]);
  });

  it('🔴 нажатие на любую карточку ведёт в игру, открытую этому профилю', () => {
    const беды: string[] = [];
    for (const p of PROFILES) {
      const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
      for (const развилка of РАЗВИЛКИ) {
        const r = нарисоватьХаб(p, развилка.экран);
        for (const строка of карточки(r)) {
          mockПереходы.length = 0;
          TestRenderer.act(() => { строка.props.onPress(); });
          for (const куда of mockПереходы) {
            if (!можно.has(куда)) беды.push(`${p.id} @ ${развилка.id}: карточка ведёт в закрытый ${куда}`);
          }
        }
        r.unmount();
      }
    }
    expect(беды).toEqual([]);
  });

  it('🔴 открытый профилю режим набора не исчезает с экрана', () => {
    const потери: string[] = [];
    for (const p of PROFILES) {
      const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
      const ждём = [...маршрутыНаборов].filter((r) => можно.has(r));
      if (!ждём.length) continue;

      // куда уводят карточки ВСЕХ развилок
      const входы: string[] = [];
      for (const развилка of РАЗВИЛКИ) {
        const r = нарисоватьХаб(p, развилка.экран);
        for (const строка of карточки(r)) {
          mockПереходы.length = 0;
          TestRenderer.act(() => { строка.props.onPress(); });
          входы.push(...mockПереходы);
        }
        r.unmount();
      }

      // и куда можно уйти дальше плашками внутри набора
      const достижимо = new Set(входы);
      for (const вход of входы) {
        const набор = GAME_SUITES.find((s) => s.modes.some((m) => m.route === вход));
        if (набор) for (const m of набор.modes) if (можно.has(m.route)) достижимо.add(m.route);
      }
      for (const нужен of ждём) {
        if (!достижимо.has(нужен)) потери.push(`${p.id}: ${нужен} открыт профилю, но с развилки до него не дойти`);
      }
    }
    expect(потери).toEqual([]);
  });

  it('🔴 плашки переключателя показывают ровно открытые профилю режимы', () => {
    const беды: string[] = [];
    for (const p of PROFILES) {
      const можно = new Set(filterAllowedGames(p).map((g: any) => g.route));
      for (const набор of GAME_SUITES) {
        const открытые = набор.modes.filter((m) => можно.has(m.route));
        // встаём на первый открытый режим — именно туда приводит карточка
        const где = открытые[0]?.route ?? набор.modes[0].route;
        mockМаршрут = где;
        mockПрофиль = p;
        let r: any;
        TestRenderer.act(() => {
          r = TestRenderer.create(вОкружении(React.createElement(GameSuiteSwitch as any)));
        });
        /**
         * ⚠️ Одна плашка встречается в дереве ДВАЖДЫ — компонентом и его хостом,
         * и оба несут onPress. Считаем по подписи, иначе «плашек 8, режимов 4»
         * читалось бы как дефект там, где его нет.
         */
        const поПодписи = new Map<string, any>();
        for (const n of r.root.findAll((x: any) => x.props?.accessibilityRole === 'button' && typeof x.props?.onPress === 'function')) {
          const ключ = String(n.props?.accessibilityLabel ?? '');
          if (!поПодписи.has(ключ)) поПодписи.set(ключ, n);
        }
        const плашки = [...поПодписи.values()];
        const ждём = открытые.length >= 2 ? открытые.length : 0;
        if (плашки.length !== ждём) {
          беды.push(`${p.id}/${набор.id}: плашек ${плашки.length}, открыто режимов ${открытые.length}`);
        }
        // ни одна плашка не ведёт в закрытое
        for (const пл of плашки) {
          mockПереходы.length = 0;
          TestRenderer.act(() => { пл.props.onPress(); });
          for (const куда of mockПереходы) {
            if (!можно.has(куда)) беды.push(`${p.id}/${набор.id}: плашка ведёт в закрытый ${куда}`);
          }
        }
        r.unmount();
      }
    }
    mockМаршрут = '/games/attention-conflict';
    expect(беды).toEqual([]);
    expect(можноПроверить()).toBe(true);
  });
});

/** Самопроверка: профили вообще различаются по доступу, иначе пробы зелены вслепую. */
function можноПроверить(): boolean {
  const наборы = PROFILES.map((p) => filterAllowedGames(p).length);
  return new Set(наборы).size > 1;
}

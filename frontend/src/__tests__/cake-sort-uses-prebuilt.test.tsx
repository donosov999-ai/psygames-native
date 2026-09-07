/**
 * 🔴 ЭКРАН БЕРЁТ ВШИТУЮ ДОСКУ, А НЕ ПЕРЕСЧИТЫВАЕТ ЕЁ НА УСТРОЙСТВЕ.
 *
 * Требование ТЗ раздела дословно: «на 30–40 нишах перестаёт доказываться
 * решаемость — значит уровни генерировать офлайн и ВШИВАТЬ, а не считать на
 * устройстве». Файл с досками лежал с 06.09.2026, а экран всё это время звал
 * `deal` живьём и читал из файла только минимум ходов.
 *
 * ⚠️ ЦЕНА БЫЛА НЕ ТЕОРЕТИЧЕСКОЙ. `deal` это ДВА полных прогона решателя (заслон
 * раздачи и подтверждение решаемости), и они шли СИНХРОННО В РЕНДЕРЕ. Замер
 * 07.09.2026 на маке: 36 мс на L20, 117 мс на L60, 188 мс на L120; на телефоне
 * вчетверо. Столько экран стоял на месте при каждой смене уровня.
 *
 * 🔴 ПОЧЕМУ ПРОБА СЛЕДИТ ЗА ВЫЗОВОМ, А НЕ СРАВНИВАЕТ ДОСКИ. Вшитая доска и
 * раздача СОВПАДАЮТ по построению — это отдельно стережёт `cake-sort-prebuilt`.
 * Значит по самой доске «взял готовое» и «пересчитал заново» неразличимы, и
 * проба, сравнивающая доски, зелена в обоих случаях. Различает их только ФАКТ
 * ВЫЗОВА, поэтому раздача подменена счётчиком обращений.
 */
import React from 'react';
import { CIRCLE } from '@/src/games/cake-sort/core/plate';

/**
 * ⚠️ Имя начинается с `mock` не для красоты: `jest.mock` поднимается выше всех
 * объявлений, и обращаться из фабрики к обычной внешней переменной jest
 * запрещает — исключение сделано ровно для этого префикса.
 */
const mockЗвалиРаздачу: number[] = [];
jest.mock('@/src/games/cake-sort/core/level', () => {
  const настоящий = jest.requireActual('@/src/games/cake-sort/core/level');
  return {
    ...настоящий,
    deal: (L: number, attempts?: number) => {
      mockЗвалиРаздачу.push(L);
      return настоящий.deal(L, attempts);
    },
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports
const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const открытые: any[] = [];
afterEach(async () => {
  // Экран гасим: питомец в шапке тикает таймером и роняет прогон после `afterAll`.
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

async function открыть(уровень: number) {
  mockЗвалиРаздачу.length = 0;
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_cake_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/cake-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(Screen))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  открытые.push(r);
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  }
  return r;
}

function текстВнутри(n: any): string {
  const куски: string[] = [];
  const обойти = (x: any) => {
    if (!x) return;
    if (typeof x === 'string') { куски.push(x); return; }
    if (Array.isArray(x)) { x.forEach(обойти); return; }
    if (x.children) x.children.forEach(обойти);
  };
  обойти(n.children);
  return куски.join(' ');
}

/**
 * Тарелки на столе: круглые кнопки с подписью «Тарелка N: занято/вместимость».
 *
 * ⚠️ ЗНАМЕНАТЕЛЬ СВЕРЯЕТСЯ С КРУГОМ, и это не педантизм. Счётчик ходов в шапке —
 * тоже кнопка с подписью вида «Ходы: 0/101», и без этого условия он считался
 * двадцать первой тарелкой (замер: 21 против 20 на L60). Слово «тарелка» в
 * условие не годится: язык интерфейса меняется, круг — нет.
 */
function тарелок(r: any): number {
  const хвост = new RegExp(`: \\d+\\/${CIRCLE}$`);
  return new Set(r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityLabel === 'string'
    && хвост.test(n.props.accessibilityLabel))
    .map((n: any) => n.props.accessibilityLabel)).size;
}

describe('вшитый уровень приходит из файла', () => {
  const { PREBUILT_COUNT, prebuilt } = require('@/src/games/cake-sort/core/prebuilt');  // eslint-disable-line @typescript-eslint/no-require-imports

  it('есть что проверять: уровни вшиты и их много', () => {
    expect(PREBUILT_COUNT).toBeGreaterThanOrEqual(60);
  });

  it('🔴 на вшитом уровне экран не зовёт раздачу вовсе', async () => {
    const УРОВЕНЬ = 60;
    expect(prebuilt(УРОВЕНЬ)).not.toBeNull();
    const r = await открыть(УРОВЕНЬ);
    // Стол собрался — иначе проба хвалит экран, который не дошёл до доски.
    expect(тарелок(r)).toBe((prebuilt(УРОВЕНЬ) as { plates: number[][] }).plates.length);
    expect(mockЗвалиРаздачу).toEqual([]);
  }, 180_000);

  /**
   * 🔴 ОБРАТНАЯ СТОРОНА: за границей вшитого раздача ОБЯЗАНА работать. Без этого
   * пункта «не зовёт раздачу» можно было бы «починить», убрав её совсем, — и
   * уровни выше вшитых перестали бы существовать молча.
   */
  it('🔴 за границей вшитого экран раздаёт сам', async () => {
    const ЗА_ГРАНИЦЕЙ = PREBUILT_COUNT + 3;
    expect(prebuilt(ЗА_ГРАНИЦЕЙ)).toBeNull();
    const r = await открыть(ЗА_ГРАНИЦЕЙ);
    expect(тарелок(r)).toBeGreaterThan(3);
    expect(mockЗвалиРаздачу).toContain(ЗА_ГРАНИЦЕЙ);
  }, 180_000);

  /**
   * 🔴 ЗНАЧОК «ПРОВЕРЕН» ОПИРАЕТСЯ НА ЗАПИСАННЫЙ ФАКТ, А НЕ НА «РАЗ ЛЕЖИТ В
   * ФАЙЛЕ, ЗНАЧИТ ДОКАЗАН». Вывод читателя и утверждение автора — разные вещи;
   * обещание игроку должно опираться на второе.
   */
  it('🔴 у каждого вшитого уровня записана доказанность', () => {
    const без: number[] = [];
    for (let L = 1; L <= PREBUILT_COUNT; L += 1) {
      if ((prebuilt(L) as { proven?: boolean }).proven !== true) без.push(L);
    }
    expect(без).toEqual([]);
  });
});

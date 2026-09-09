/**
 * 🔴 ПЕРЕТАСКИВАНИЕ В ТОРТАХ ВООБЩЕ НАЧИНАЕТСЯ.
 *
 * 📍 Денис 09.09.2026: «режим драг и дроп не работает, перетаскивание».
 *
 * РАЗБОР ДЕФЕКТА, ДВЕ ПРИЧИНЫ СРАЗУ.
 *   1. Стол спрашивал ответчика ТОЛЬКО без Capture. Каждая тарелка —
 *      `TouchableOpacity`, он забирает ответчика НА КАСАНИИ и держит до
 *      отпускания; родителя система в это время не спрашивает вовсе. Значит
 *      `onResponderGrant` стола не срабатывал ни разу.
 *   2. Порог сдвига читал `locationX/locationY` — координату пальца ВНУТРИ
 *      элемента, а не смещение. У тарелки крупнее шести точек сумма превышала
 *      порог всегда, то есть даже полученный вопрос стол «съедал» на первом
 *      касании.
 *
 * ⚠️ ПОЧЕМУ ПРОБА ГОНЯЕТ ЭКРАН, А НЕ ЧИТАЕТ ИСХОДНИК. Обе причины — про
 * ПЕРЕГОВОРЫ о жесте, а не про текст: проверка «в файле есть слово Capture»
 * зазеленела бы и на неработающем пороге. Здесь события подаются в том же
 * порядке, в каком их подаёт система, и спрашивается результат — поднялась ли
 * тарелка.
 */
import React from 'react';
import { PLATE_GAP } from '@/src/games/cake-sort/core/layout';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Экраны гасим: незакрытый каркас держит таймер питомца и роняет прогон после вердикта. */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

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

async function открыть(уровень: string) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_cake_sort_level_free', уровень);
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/cake-sort').default;  // eslint-disable-line
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
  await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  return r;
}

/** Узел стола — тот, кто ведёт переговоры о жесте. */
const стол = (r: any) => r.root.findAll((n: any) =>
  typeof n.props?.onMoveShouldSetResponderCapture === 'function'
  && typeof n.props?.onResponderGrant === 'function')[0];

/** Кнопки тарелок: у них подпись «Тарелка N: занято/всего». */
const тарелки = (r: any) => r.root.findAll((n: any) => typeof n.type !== 'string'
  && n.props?.accessibilityRole === 'button'
  && typeof n.props?.accessibilityLabel === 'string'
  && /: \d+\/\d+$/.test(n.props.accessibilityLabel));

/**
 * Диаметр тарелки — со стиля самой кнопки, а не из повторно посчитанной формулы.
 * ⚠️ `StyleSheet.flatten`, а не разбор массива руками: стиль приходит списком, где
 * первым лежит зарегистрированный `styles.plateBox` (на нативе это число, не объект).
 */
function диаметр(r: any): number {
  const { StyleSheet } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  for (const т of тарелки(r)) {
    const плоско: any = StyleSheet.flatten(т.props?.style) || {};
    if (typeof плоско.width === 'number' && плоско.width > 0) return плоско.width;
  }
  return 0;
}

/** Сколько тарелок «поднято» — кольцо выбора рисуется у выбранной и у той, что в руке. */
const поднятых = (r: any) => r.root.findAll((n: any) =>
  n.props?.stroke === '#f59e0b' && n.props?.strokeWidth === 3).length;

describe('перетаскивание в тортах начинается', () => {
  it('🔴 стол спрашивают о жесте ЧЕРЕЗ CAPTURE — иначе тарелка не отдаст ответчика', async () => {
    const r = await открыть('1');
    const с = стол(r);
    expect(с).toBeTruthy();
    // Обе половины переговоров: старт-capture (запомнить точку) и move-capture (забрать жест).
    expect(typeof с.props.onStartShouldSetResponderCapture).toBe('function');
    expect(typeof с.props.onMoveShouldSetResponderCapture).toBe('function');
  });

  it('🔴 порог считает СМЕЩЕНИЕ, а не координату внутри тарелки', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    expect(d).toBeGreaterThan(20);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    await TestRenderer.act(async () => { с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } }); });
    // Палец не двигался — жест не забираем, иначе тап по тарелке съеден.
    expect(с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 1, pageY: y + 1 } })).toBe(false);
    // Ушёл дальше порога — забираем.
    expect(с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } })).toBe(true);
  });

  it('🔴 после касания и сдвига тарелка ПОДНИМАЕТСЯ, а не остаётся лежать', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    expect(поднятых(r)).toBe(0);
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: x + 40, pageY: y } });
    });
    expect(поднятых(r)).toBeGreaterThan(0);
    await TestRenderer.act(async () => { с.props.onResponderTerminate(); });
    expect(поднятых(r)).toBe(0);
  });

  it('🔴 жест доводится до соседней тарелки и там ОТПУСКАЕТСЯ', async () => {
    const r = await открыть('1');
    const с = стол(r);
    const d = диаметр(r);
    const x = PLATE_GAP / 2 + d / 2, y = PLATE_GAP / 2 + d / 2;
    const подписи = () => тарелки(r).map((n: any) => n.props.accessibilityLabel);
    const было = подписи();
    await TestRenderer.act(async () => {
      с.props.onStartShouldSetResponderCapture({ nativeEvent: { pageX: x, pageY: y } });
      с.props.onMoveShouldSetResponderCapture({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderGrant({ nativeEvent: { pageX: x + 40, pageY: y } });
      с.props.onResponderMove({ nativeEvent: { pageX: x + d + PLATE_GAP, pageY: y } });
      с.props.onResponderRelease();
    });
    await TestRenderer.act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
    // Ход либо прошёл (подписи изменились), либо был запрещён правилом укладки —
    // но «поднято» обязано погаснуть в обоих случаях: жест закончился.
    expect(поднятых(r)).toBe(0);
    expect(подписи().length).toBe(было.length);
  });
});

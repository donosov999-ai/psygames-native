/**
 * 🔴 ОТКАЗ ВИДЕН И ПРИ ВКЛЮЧЁННОМ «МЕНЬШЕ ДВИЖЕНИЯ».
 *
 * 📍 ПОВОД — МОЯ ОШИБКА, НАЙДЕННАЯ 09.09.2026 ПО ЧУЖОМУ РАЗБОРУ. В шапке
 * `shakeNiche` было написано: в щадящем режиме дрожания нет, «там остаётся звук
 * и тычок». Это неправда для нашей сборки: Tauri — вебвью, вибрации в ней нет
 * вовсе, а звук человек выключает первым делом. То есть при включённом
 * «меньше движения» отказ не имел НИ ОДНОГО канала и выглядел ровно как «не
 * нажалось» — тот самый дефект, ради которого дрожание и заводилось.
 *
 * Щадящий режим убирает ДВИЖЕНИЕ, а не сообщение. Поэтому в нём ниша не дрожит,
 * а на треть секунды обводится алым.
 *
 * ⚠️ ПРОБА ГОНЯЕТ ЭКРАН, А НЕ ЧИТАЕТ ИСХОДНИК: проверяется, что после отказа
 * НА ДОСКЕ появился признак — в обычном режиме сдвиг, в щадящем рамка, — и что
 * в щадящем сдвига нет. Проверка «в файле есть слово borderColor» зазеленела бы
 * и на коде, который этот стиль никуда не применяет.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

/** Флаг щадящего режима — переключается прямо в пробе (имя с `mock` обязательно: jest поднимает фабрику наверх). */
let mockЩадящий = true;
jest.mock('@/src/hooks/useReducedMotion', () => ({ useReducedMotion: () => mockЩадящий }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Экраны гасим: незакрытый каркас держит таймер питомца и роняет прогон ПОСЛЕ вердикта. */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

const НАСТОЯЩИЙ_RANDOM = Math.random;
afterEach(() => { Math.random = НАСТОЯЩИЙ_RANDOM; });

/** Расклад фиксируем семенем: раздача случайна, а проба обязана быть повторимой. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

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
  await AsyncStorage.setItem(`psygames_goods_sort_level_free`, уровень);
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line
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
  await TestRenderer.act(async () => { for (let i = 0; i < 60; i += 1) await Promise.resolve(); });
  открытые.push(r);
  const пуск = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start|Играть|Play/i.test(текстВнутри(n)))[0];
  if (пуск) {
    await TestRenderer.act(async () => { пуск.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 60; i += 1) await Promise.resolve(); });
  }
  return r;
}

/**
 * Две РАЗНЫЕ кнопки, и путать их нельзя — на этом развалилась первая редакция
 * пробы: тап по нише выбором товара НЕ является.
 *   ниша  — подпись «<Полка> N[, состояние]: <что лежит>», есть двоеточие;
 *   товар — подпись «<название>, <Полка> N», двоеточия нет.
 */
const ниши = (r: any) => r.root.findAll((n: any) => typeof n.type !== 'string'
  && n.props?.accessibilityRole === 'button'
  && typeof n.props?.accessibilityLabel === 'string'
  && /\s\d+(,[^:]*)?:\s/.test(n.props.accessibilityLabel));

const товары = (r: any) => r.root.findAll((n: any) => typeof n.type !== 'string'
  && n.props?.accessibilityRole === 'button'
  && typeof n.props?.accessibilityLabel === 'string'
  && !n.props.accessibilityLabel.includes(':')
  && /,\s*\S+\s+\d+\s*$/.test(n.props.accessibilityLabel));

/** Номер полки из подписи — последнее число. */
const номер = (n: any): number => Number((n.props.accessibilityLabel.match(/(\d+)\s*$/) || [])[1] ?? -1);

/** Полки С ПРЕПЯТСТВИЕМ: у них в подписи есть кусок состояния перед двоеточием. */
const запертые = (r: any) => ниши(r).filter((n: any) => /\s\d+,[^:]+:/.test(n.props.accessibilityLabel));
const номерЗапертой = (r: any): number => {
  const n = запертые(r)[0];
  return n ? Number((n.props.accessibilityLabel.match(/\s(\d+),/) || [])[1] ?? -1) : -1;
};

/**
 * Ниша, которая ОТКАЗАЛА, — по метке `niche-refused`.
 *
 * ⚠️ МЕТКА, А НЕ ПОИСК СДВИГА ПО ВСЕМУ ЭКРАНУ. Первая редакция этой пробы
 * спрашивала «есть ли на экране `translateX`» и была ЛОЖНО ЗЕЛЁНОЙ: замер
 * показал, что сдвиг вбок на этом экране есть и БЕЗ всякого отказа. Ровно ту же
 * ошибку экран уже пережил на оседании — там её вылечила метка `niche-settle`.
 */
const отказавшие = (r: any) => r.root.findAll((n: any) => n.props?.testID === 'niche-refused');

/** Стиль отказавшей ниши, сплющенный. */
function стильОтказа(r: any): any | null {
  const { StyleSheet } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  const n = отказавшие(r)[0];
  if (!n) return null;
  try { return StyleSheet.flatten(n.props?.style) || null; } catch { return null; }
}
const алаяРамка = (s: any) => !!s && s.borderColor === '#f43f5e' && (s.borderWidth ?? 0) > 0;
const сдвигВбок = (s: any) => !!s && Array.isArray(s.transform)
  && s.transform.some((t: any) => t && Object.prototype.hasOwnProperty.call(t, 'translateX'));

/**
 * Сделать заведомо запрещённый ход: ВЫБРАТЬ ТОВАР на живой полке и ткнуть в
 * полку с препятствием.
 *
 * ⚠️ Первый тап обязан быть по ТОВАРУ. `handleCellTap` начинается с `if (!sel)
 * return` — тап по самой нише ничего не выбирает, и без товара второй тап
 * молча уходит в никуда: отказа нет, а проба видит «экран как экран».
 */
async function отказ(r: any) {
  const заперта = номерЗапертой(r);
  const источник = товары(r).filter((n: any) => номер(n) !== заперта)[0];
  const цель = запертые(r)[0];
  if (!источник || !цель || заперта < 0) return false;
  await TestRenderer.act(async () => { источник.props.onPress?.(); });
  await TestRenderer.act(async () => { цель.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  return true;
}

describe('отказ виден в щадящем режиме', () => {
  it('есть что проверять — на уровне и правда есть полка с препятствием', async () => {
    mockЩадящий = true;
    Math.random = seeded(20260909);
    const r = await открыть('26');
    expect(ниши(r).length).toBeGreaterThan(5);
    expect(запертые(r).length).toBeGreaterThan(0);
    expect(товары(r).length).toBeGreaterThan(0);
    expect(номерЗапертой(r)).toBeGreaterThan(0);
  }, 120_000);

  it('🔴 в щадящем режиме отказ помечен рамкой, и НИ ОДНА полка при этом не дрожит', async () => {
    mockЩадящий = true;
    Math.random = seeded(20260909);
    const r = await открыть('26');
    expect(отказавшие(r)).toHaveLength(0);     // премиса: до отказа метки нет
    expect(await отказ(r)).toBe(true);
    expect(отказавшие(r).length).toBeGreaterThan(0);
    const s = стильОтказа(r);
    expect(алаяРамка(s)).toBe(true);
    expect(сдвигВбок(s)).toBe(false);          // щадящий режим убирает движение, и это тоже держим
  }, 120_000);

  it('🔴 в обычном режиме отказ помечен ДРОЖАНИЕМ, а не рамкой', async () => {
    mockЩадящий = false;
    Math.random = seeded(20260909);
    const r = await открыть('26');
    expect(отказавшие(r)).toHaveLength(0);
    expect(await отказ(r)).toBe(true);
    expect(отказавшие(r).length).toBeGreaterThan(0);
    const s = стильОтказа(r);
    expect(сдвигВбок(s)).toBe(true);
    expect(алаяРамка(s)).toBe(false);
  }, 120_000);
});

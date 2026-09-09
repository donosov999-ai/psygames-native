/**
 * 🔴 ПОЛКА НА ОДИН ТОВАР ВЫГЛЯДИТ ПОЛКОЙ НА ОДИН ТОВАР.
 *
 * 📍 Денис 09.09.2026, два сообщения подряд. Сначала боевой случай на 28-м
 * уровне: «я оттуда вытащил один товар, их было два изначально» — и обратно
 * второй не лез. Потом требование: «полка узкая должна быть под один товар, а не
 * широкая».
 *
 * ДВА РАЗНЫХ ДЕФЕКТА, И ПРОБА ДЕРЖИТ ОБА.
 *
 *   1. ВИД. Ниша любой вместимости рисовалась во всю ячейку. Полка на один товар
 *      отличалась от полки на три ровно ничем, и узнать её вместимость можно было
 *      единственным способом — попробовать положить второй товар и увидеть, что
 *      он вернулся. Насечки по низу ниши эту работу не делают: они мелкие и
 *      стоят там же, где стоят сами товары.
 *
 *   2. ПРАВДА О ДОСКЕ. Раздача обычного уровня ёмкостей не сохраняла, и на
 *      возврате в партию они пересчитывались СЕГОДНЯШНЕЙ формулой. Партия,
 *      розданная до появления `SINGLE_CAP_FROM`, встречала человека доской, где
 *      в нише на один товар лежат два: вынуть можно, положить назад нельзя.
 *      Это класс «правило поменяли, сохранённое состояние осталось старым», и он
 *      повторится при любой правке `capsFor`.
 *
 * ⚠️ Ширину проверяем ИСПОЛНЕНИЕМ, а не чтением стиля в исходнике: числа
 * приходят из `gsLayout` и зависят от ширины экрана, маски формы и вместимостей.
 * Проба спрашивает у нарисованной доски, какие ниши получились.
 */
import React from 'react';
import { gsLayout, gridFor, capsFor, capsForParty, targetSlots, CAP, CAP_ONE, CAP_MIN, SINGLE_CAP_FROM } from '@/src/games/goods-sort/core/level';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

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
  await AsyncStorage.setItem('psygames_goods_sort_level_free', уровень);
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
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start|Играть|Play/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 60; i += 1) await Promise.resolve(); });
  }
  return r;
}

/**
 * Ширины НИШ на нарисованной доске. Ниша — плитка шкафа, растянутая по нише
 * (`resizeMode="stretch"`); ни один другой узел экрана так не рисуется.
 */
function ширины(r: any): number[] {
  const { StyleSheet } = require('react-native');  // eslint-disable-line @typescript-eslint/no-require-imports
  return r.root.findAll((n: any) => n.props?.resizeMode === 'stretch' && n.props?.source !== undefined)
    .map((n: any) => (StyleSheet.flatten(n.props?.style) || {}).width)
    .filter((w: any) => typeof w === 'number' && w > 0);
}

describe('узкая полка под один товар', () => {
  it('есть что проверять — на 28-м уровне ёмкости РАЗНЫЕ и единица среди них есть', () => {
    const caps = capsFor(SINGLE_CAP_FROM, targetSlots(SINGLE_CAP_FROM));
    expect(new Set(caps).size).toBeGreaterThan(1);
    expect(caps).toContain(CAP_ONE);
  });

  it('🔴 ширина ниши растёт вместе с вместимостью, а на трёх упирается в ячейку', () => {
    const g = gridFor(SINGLE_CAP_FROM, true);
    for (const [w, h] of [[360, 600], [390, 640], [414, 700]] as [number, number][]) {
      const L = gsLayout(w, h, g.cols, g.rows, CAP, 44, 0);
      expect(L.nicheW(CAP_ONE)).toBeLessThan(L.nicheW(CAP_MIN));
      expect(L.nicheW(CAP_MIN)).toBeLessThan(L.nicheW(CAP));
      expect(L.nicheW(CAP)).toBe(L.cellW);
      // Узкая — это ЗАМЕТНО узкая, а не «на пару пикселей»: иначе метка не работает.
      expect(L.nicheW(CAP_ONE)).toBeLessThan(L.cellW * 0.65);
      // Но не уже своего товара — туда его просто не нарисовать.
      expect(L.nicheW(CAP_ONE)).toBeGreaterThan(L.itemBox(CAP_ONE).w);
    }
  });

  it('🔴 на доске 28-го уровня ниши РАЗНОЙ ширины, и самая узкая заметно уже широкой', async () => {
    const r = await открыть(String(SINGLE_CAP_FROM));
    const w = ширины(r);
    expect(w.length).toBeGreaterThan(6);
    const мин = Math.min(...w), макс = Math.max(...w);
    expect(new Set(w).size).toBeGreaterThan(1);
    expect(мин).toBeLessThan(макс * 0.65);
  }, 120_000);   // экран сортировки на 28-м уровне доказывает решаемость раздачи — это секунды, а не миллисекунды

  it('🔴 на раннем уровне все ниши одинаковой ширины — узость не украшение, а признак', async () => {
    const r = await открыть('3');
    const w = ширины(r);
    expect(w.length).toBeGreaterThan(4);
    expect(new Set(w).size).toBe(1);
  }, 120_000);

  it('🔴 ёмкость ниши НИКОГДА не меньше того, что в ней лежит', () => {
    // Ровно случай Дениса: полка на один товар держит два — так партия доехала
    // с прежних правил. Игра обязана доиграть её, а не запереть товар внутри.
    const cells = [[1, 1], [2], [], [3, 3, 3]];
    const caps = capsForParty(SINGLE_CAP_FROM, cells, [CAP_ONE, CAP_MIN, CAP, CAP]);
    expect(caps[0]).toBeGreaterThanOrEqual(2);
    expect(caps).toEqual([2, 2, CAP, CAP]);
  });

  it('🔴 запомненные при раздаче ёмкости сильнее сегодняшней формулы', () => {
    const cells = Array.from({ length: targetSlots(SINGLE_CAP_FROM) }, () => [] as number[]);
    const своё = cells.map(() => CAP);
    expect(capsForParty(SINGLE_CAP_FROM, cells, своё)).toEqual(своё);
    // Ёмкостей не запомнили — считаем формулой, как было.
    expect(capsForParty(SINGLE_CAP_FROM, cells, null)).toEqual(capsFor(SINGLE_CAP_FROM, cells.length));
    // Список не той длины доверия не заслуживает: это чужая доска.
    expect(capsForParty(SINGLE_CAP_FROM, cells, [CAP, CAP])).toEqual(capsFor(SINGLE_CAP_FROM, cells.length));
  });
});

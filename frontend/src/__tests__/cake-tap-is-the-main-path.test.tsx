/**
 * 🔴 ТАП — ГЛАВНЫЙ ПУТЬ, И ОН ОБЯЗАН ГОВОРИТЬ ТО ЖЕ, ЧТО ЖЕСТ.
 *
 * 📍 РЕШЕНИЕ ДЕНИСА 09.09.2026 по разбору жанра. Во всех водных сортировках
 * управление — ДВА ТАПА (источник, потом цель), перетаскивания нет вовсе:
 * Lipuzz, Water Sort: Color Tube Puzzle, Water Color Sort — «one-finger
 * gameplay, tap to pour». Наши переливалка, шарики и гайки сделаны так же.
 * Дословно: «тапы — главный путь… довести их до того же качества: отказ должен
 * быть виден, а не только слышен».
 *
 * 📍 ЧТО БЫЛО. Запрещённый ход тапом звал `hapticTap()` и `sndWrong()` — и всё.
 * В нашей сборке (Tauri = вебвью) вибрации НЕТ вовсе, звук человек выключает
 * первым делом, поэтому отказ выглядел ровно как «не нажалось». Та же дыра, что
 * в тот же день нашлась в сортировке товаров.
 *
 * ⚠️ ПРОБА ГОНЯЕТ ЭКРАН. Проверка «в коде есть sndWrong» зазеленела бы и на
 * молчащей игре: звук и есть то, чего человек не слышит.
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

/** Экраны гасим: незакрытый каркас держит таймер питомца и роняет прогон ПОСЛЕ вердикта. */
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

async function открыть(уровень = '1') {
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
  const пуск = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  await TestRenderer.act(async () => { пуск.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  return r;
}

/**
 * Кнопки тарелок. ⚠️ Счётчик ходов в шапке выглядит так же («N/M») — его надо
 * отсечь по слову, иначе съедет вся нумерация; и `findAll` отдаёт каждую
 * тарелку по нескольку раз, поэтому список сжимается по подписи.
 */
const тарелки = (r: any) => {
  const все = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityLabel === 'string'
    && /\s\d+:\s\d+\/\d+$/.test(n.props.accessibilityLabel)
    && !/^(Moves|Ходов)/.test(n.props.accessibilityLabel));
  const видели = new Set<string>();
  return все.filter((n: any) => {
    if (видели.has(n.props.accessibilityLabel)) return false;
    видели.add(n.props.accessibilityLabel);
    return true;
  });
};
const подписи = (r: any) => тарелки(r).map((n: any) => n.props.accessibilityLabel);
const тап = async (r: any, i: number) => {
  await TestRenderer.act(async () => { тарелки(r)[i]?.props.onPress?.(); });
  await TestRenderer.act(async () => { for (let k = 0; k < 10; k += 1) await Promise.resolve(); });
};

const сплошное = (r: any, цвет: string) => r.root.findAll((n: any) =>
  n.props?.stroke === цвет && (n.props?.strokeWidth ?? 0) >= 4
  && n.props?.strokeDasharray === undefined).length;
const пунктир = (r: any, цвет: string) => r.root.findAll((n: any) =>
  n.props?.stroke === цвет && typeof n.props?.strokeDasharray === 'string').length;

describe('тап — главный путь', () => {
  it('есть что проверять — на столе есть и полные тарелки, и пустые', async () => {
    const r = await открыть();
    const л = подписи(r);
    expect(л.filter((x: string) => /: 6\/6$/.test(x)).length).toBeGreaterThan(1);
    expect(л.filter((x: string) => /: 0\/6$/.test(x)).length).toBeGreaterThan(0);
  }, 120_000);

  it('🔴 два тапа делают ход', async () => {
    const r = await открыть();
    const было = подписи(r);
    const откуда = было.findIndex((л: string) => /: [1-9]\d*\/6$/.test(л));
    const куда = было.findIndex((л: string) => /: 0\/6$/.test(л));
    await тап(r, откуда);
    await тап(r, куда);
    expect(подписи(r)).not.toEqual(было);
  }, 120_000);

  it('🔴 после первого тапа ВИДНО, куда можно положить', async () => {
    const r = await открыть();
    expect(пунктир(r, '#38bdf8')).toBe(0);          // премиса: до выбора подсказок нет
    const откуда = подписи(r).findIndex((л: string) => /: [1-9]\d*\/6$/.test(л));
    await тап(r, откуда);
    expect(пунктир(r, '#38bdf8')).toBeGreaterThan(0);
  }, 120_000);

  it('🔴 запрещённый ход тапом ВИДЕН, а не только слышен', async () => {
    const r = await открыть();
    const л = подписи(r);
    // Обе полные: места нет, ход запрещён при любом цвете — не зависит от раздачи.
    const полные = л.map((x: string, i: number) => ({ x, i })).filter((o: any) => /: 6\/6$/.test(o.x));
    expect(полные.length).toBeGreaterThan(1);
    expect(сплошное(r, '#f43f5e')).toBe(0);         // премиса: до отказа метки нет
    await тап(r, полные[0].i);
    await тап(r, полные[1].i);
    expect(сплошное(r, '#f43f5e')).toBeGreaterThan(0);
    expect(подписи(r)).toEqual(л);                  // и доска при этом не изменилась
  }, 120_000);
});

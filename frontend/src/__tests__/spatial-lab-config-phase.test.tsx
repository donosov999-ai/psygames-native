/* psygames-spatial-lab-config-phase · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · задача f3fae4e2, отчёты 1bd5e1ce и 60913453 */
/**
 * 🔴 «СЕТЬ ТРУБ»: НАСТРОЙКА ОТДЕЛЬНО ОТ ПАРТИИ, ПОВОРОТ ДВОЙНЫМ НАЖАТИЕМ.
 *
 * Отчёт 1bd5e1ce (17.09.2026, 2.54.17, iPhone 430×932): «экран настроек слился с экраном
 * игры, что привело к недоразумению». Под полем стояли «Свободная игра · В уровнях пройдено ·
 * Проще · Начать уровни» и вкладки упражнений. Отчёт 60913453 там же: «по двойному нажатию
 * вращение, чтобы шло тоже».
 *
 * Проба монтирует настоящий экран `SpatialLab` и жмёт: настройка первой, «Начать» — партия без
 * выбора уровня и вкладок, пункт паузы «Настройки» — снова настройка с «Продолжить игру», партия
 * не пропала; «Выйти из упражнения» (onBack каркаса) уходит с экрана;
 * двойное нажатие по той же трубе — один поворот, по разным трубам — ни одного.
 * Каркас подменён узлом с настоящими пропами: нужна сцена, а не вёрстка шапки.
 */
import React from 'react';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', text: '#fff', textSecondary: '#999', border: '#333', primary: '#7c6cf0', surface: '#111' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
let mockProfileId = 'lab-phase-0';
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfileId }, ready: true }) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, default: (p: any) => React.createElement('GameShell', p, p.toolbar, p.children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
/** Ядро .mjs jest не преобразует — подменяем загрузкой через babel (см. helpers/mjsAsCjs). */
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/src/games/spatial-core/core.mjs', () => require('./helpers/mjsAsCjs').загрузить('core.mjs'));
jest.mock('@/src/games/spatial-core/net.mjs', () => require('./helpers/mjsAsCjs').загрузить('net.mjs'));
jest.mock('@/src/games/spatial-core/netslide-levels.mjs', () => require('./helpers/mjsAsCjs').загрузить('netslide-levels.mjs'));
jest.mock('@/src/games/spatial-core/snapshot.mjs', () => require('./helpers/mjsAsCjs').загрузить('snapshot.mjs'));
/* eslint-enable @typescript-eslint/no-require-imports */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SpatialLab = require('@/src/components/SpatialLab').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ДВОЙНОЕ_НАЖАТИЕ_МС } = require('@/src/components/SpatialLab');

const деревья: any[] = [];
beforeEach(() => { jest.useFakeTimers({ now: 1_000_000 }); });
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => { try { д.unmount(); } catch { /* снят */ } }); });
  jest.useRealTimers();
});

async function дождаться(мс = 0): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { if (мс) jest.advanceTimersByTime(мс / 6); await Promise.resolve(); });
}
const есть = (д: any, id: string) => д.root.findAll((n: any) => n.props?.testID === id).length > 0;
function нажать(д: any, id: string): void {
  const узел = д.root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];
  if (!узел) throw new Error(`нет нажимаемого ${id}`);
  TestRenderer.act(() => { узел.props.onPress(); });
}
const каркас = (д: any) => д.root.findAll((n: any) => n.type === 'GameShell')[0] ?? null;
const ходов = (д: any) => (каркас(д)?.props.hud ?? []).find((h: any) => h.key === 'moves')?.value;
const вкладки = (д: any) => д.root.findAll((n: any) => n.props?.accessibilityState?.selected !== undefined && typeof n.props?.onPress === 'function' && !String(n.props?.testID ?? '').startsWith('spatial-cell')).length;

let номер = 0;
async function экран(props: Record<string, unknown> = {}): Promise<any> {
  номер += 1;
  mockProfileId = `lab-phase-${номер}`;
  let д: any;
  await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(SpatialLab as React.ComponentType<Record<string, unknown>>, { onBack: jest.fn(), initialMode: 'net', ...props })); });
  деревья.push(д);
  await дождаться();
  return д;
}

describe('«Сеть труб»: настройка и партия — разные экраны (отчёт 1bd5e1ce)', () => {
  it('🔴 заход открывает настройку: поля нет, есть «Начать», «Свободная игра» и вкладки упражнений', async () => {
    const д = await экран();
    expect(`настройка ${есть(д, 'spatial-config')}, поле ${есть(д, 'spatial-board')}`).toBe('настройка true, поле false');
    expect(есть(д, 'spatial-start-level')).toBe(true);
    expect(есть(д, 'spatial-free-play')).toBe(true);
    expect(есть(д, 'spatial-continue')).toBe(false);
    expect(вкладки(д)).toBe(4);
  });

  it('🔴 «Начать» — партия: поле есть, выбора уровня, «Свободной игры» и вкладок под полем нет', async () => {
    const д = await экран();
    нажать(д, 'spatial-start-level');
    await дождаться();
    expect(`настройка ${есть(д, 'spatial-config')}, поле ${есть(д, 'spatial-board')}`).toBe('настройка false, поле true');
    expect(есть(д, 'spatial-free-play')).toBe(false);
    expect(есть(д, 'spatial-start-level')).toBe(false);
    expect(вкладки(д)).toBe(0);
    // пункт паузы «Настройки» ведёт обратно
    expect((каркас(д).props.pauseActions ?? []).map((a: any) => a.id)).toContain('settings');
  });

  it('🔴 пункт паузы «Настройки» — в настройку, партия не пропала: «Продолжить игру» возвращает ту же доску', async () => {
    const onBack = jest.fn();
    const д = await экран({ onBack });
    нажать(д, 'spatial-start-level');
    await дождаться();
    // ход кнопкой «Вправо»
    const вправо = д.root.findAll((n: any) => n.props?.accessibilityLabel === 'spatialLabTurnRight' && typeof n.props?.onPress === 'function')[0];
    TestRenderer.act(() => { вправо.props.onPress(); });
    await дождаться(500);
    expect(ходов(д)).toBe(1);
    const настройки = (каркас(д).props.pauseActions ?? []).find((a: any) => a.id === 'settings');
    await TestRenderer.act(async () => { настройки.onPress(); });
    await дождаться();
    expect(`настройка ${есть(д, 'spatial-config')}, выход с экрана ${onBack.mock.calls.length}`).toBe('настройка true, выход с экрана 0');
    expect(есть(д, 'spatial-continue')).toBe(true);
    нажать(д, 'spatial-continue');
    await дождаться();
    expect(`поле ${есть(д, 'spatial-board')}, ходов ${ходов(д)}`).toBe('поле true, ходов 1');
  });

  it('«назад» на настройке и «Выйти из упражнения» в партии уходят с экрана', async () => {
    const onBack = jest.fn();
    const д = await экран({ onBack });
    const назад = д.root.findAll((n: any) => n.props?.accessibilityLabel === 'back' && typeof n.props?.onPress === 'function')[0];
    TestRenderer.act(() => { назад.props.onPress(); });
    expect(onBack).toHaveBeenCalledTimes(1);
    нажать(д, 'spatial-start-level');
    await дождаться();
    expect(каркас(д).props.onBack).toBe(onBack);
  });

  it('шаг зарядки идёт сразу в партию — настройки нет', async () => {
    const д = await экран({ preset: { mode: 'net', level: 1, seed: 42 } });
    expect(`настройка ${есть(д, 'spatial-config')}, поле ${есть(д, 'spatial-board')}`).toBe('настройка false, поле true');
  });
});

describe('«Сеть труб»: поворот двойным нажатием (отчёт 60913453)', () => {
  /** Свободная игра: у первых ступеней запертых труб много (на 1-й свободна одна), а здесь нужны две разные. */
  async function партия(): Promise<any> {
    const д = await экран();
    нажать(д, 'spatial-free-play');
    await дождаться();
    return д;
  }
  /** Незапертая клетка поля: у ступени бывают запертые трубы. */
  const свободная = (д: any, кроме = -1) => д.root.findAll((n: any) => /^spatial-cell-\d+$/.test(String(n.props?.testID)) && typeof n.props?.onPress === 'function' && !n.props.disabled)
    .map((n: any) => Number(String(n.props.testID).slice(13))).find((i: number) => i !== кроме);
  const клетка = (д: any, i: number) => д.root.findAll((n: any) => n.props?.testID === `spatial-cell-${i}` && typeof n.props?.onPress === 'function')[0];

  it('🔴 два нажатия по одной трубе быстрее порога — один поворот', async () => {
    const д = await партия();
    const i = свободная(д);
    TestRenderer.act(() => { клетка(д, i).props.onPress(); });
    await дождаться();
    jest.advanceTimersByTime(Math.round(ДВОЙНОЕ_НАЖАТИЕ_МС / 2));
    TestRenderer.act(() => { клетка(д, i).props.onPress(); });
    await дождаться(500);
    expect(ходов(д)).toBe(1);
  });

  it('одно нажатие только выбирает', async () => {
    const д = await партия();
    const i = свободная(д);
    TestRenderer.act(() => { клетка(д, i).props.onPress(); });
    await дождаться(500);
    expect(ходов(д)).toBe(0);
  });

  it('два нажатия с паузой дольше порога — не поворот', async () => {
    const д = await партия();
    const i = свободная(д);
    TestRenderer.act(() => { клетка(д, i).props.onPress(); });
    await дождаться();
    jest.advanceTimersByTime(ДВОЙНОЕ_НАЖАТИЕ_МС + 200);
    TestRenderer.act(() => { клетка(д, i).props.onPress(); });
    await дождаться(500);
    expect(ходов(д)).toBe(0);
  });

  it('🔴 быстрые нажатия по РАЗНЫМ трубам — не поворот, а смена выбора', async () => {
    const д = await партия();
    const a = свободная(д);
    const b = свободная(д, a);
    TestRenderer.act(() => { клетка(д, a).props.onPress(); });
    await дождаться();
    jest.advanceTimersByTime(50);
    TestRenderer.act(() => { клетка(д, b).props.onPress(); });
    await дождаться(500);
    expect(ходов(д)).toBe(0);
  });
});

/* psygames-spatial-lab-board-fits-field · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · отчёт e5bfc2f0, задача 42dbd9bf */
/**
 * 🔴 ЛАБОРАТОРИЯ: ДОСКА ВПИСЫВАЕТСЯ В ПОЛЕ КАРКАСА ПО ИЗМЕРЕННОЙ ВЫСОТЕ — ПОЛЕ НЕ ЕЗДИТ.
 *
 * Каркас с 568bec9d прибивает поле, которое помещается, и оставляет прокрутку тому, что выше окна.
 * Замер WebKit на экспорте 17.09.2026 (вход в партию, колесо по пустому месту поля): лаборатория
 * ездила на 375×667 на 78–122 px, на 360×740 — на 21–65. Сторона доски считалась запасом 351 под
 * прежнюю раскладку. После правки — 76 замеров на 7 окнах, ездит 0.
 *
 * ⚠️ ПЕРВАЯ ПОПЫТКА НЕ СРАБОТАЛА, И ПРОБА СТОРОЖИТ ИМЕННО ЭТО. Высоту поля каркас отдаёт контекстом
 * ВНУТРЬ поля, а экран стоит над каркасом: хук наверху получал 0, и сторона оставалась 316 на 375×667.
 * Поэтому каркас здесь подменён узлом, который, как настоящий, кладёт высоту в контекст вокруг детей.
 *
 * Проба жмёт настоящий экран и отдаёт полю размеры через его onLayout, как браузер.
 */
import React from 'react';
import { StyleSheet } from 'react-native';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', text: '#fff', textSecondary: '#999', border: '#333', primary: '#7c6cf0', surface: '#111' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
let mockProfileId = 'lab-fit-0';
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: mockProfileId }, ready: true }) }));
let mockScreen = { w: 375, h: 667 };
jest.mock('@/src/hooks/useScreenWidth', () => ({
  ...jest.requireActual('@/src/hooks/useScreenWidth'),
  useScreenSize: () => mockScreen,
}));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Каркас-узел: как настоящий, кладёт высоту поля в контекст ВОКРУГ детей (не вокруг экрана). */
let mockFieldHeight = 0;
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { ВысотаПоляКаркаса } = require('@/src/components/GameFieldHeight');
  return { __esModule: true, default: (p: any) => React.createElement('GameShell', p, p.toolbar, React.createElement(ВысотаПоляКаркаса.Provider, { value: mockFieldHeight }, p.children)) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
const { FAB_SIZE } = require('@/src/services/fabPosition');

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => { try { д.unmount(); } catch { /* снят */ } }); });
});
async function дождаться(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
}
let номер = 0;
async function партия(вход: 'spatial-free-play' | 'spatial-start-level'): Promise<any> {
  номер += 1;
  mockProfileId = `lab-fit-${номер}`;
  let д: any;
  await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(SpatialLab as React.ComponentType<Record<string, unknown>>, { onBack: jest.fn(), initialMode: 'net' })); });
  деревья.push(д);
  await дождаться();
  const кнопка = д.root.findAll((n: any) => n.props?.testID === вход && typeof n.props?.onPress === 'function')[0];
  await TestRenderer.act(async () => { кнопка.props.onPress(); });
  await дождаться();
  return д;
}
const доска = (д: any) => д.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'spatial-board')[0];
const сторона = (д: any) => StyleSheet.flatten(доска(д).props.style).width as number;
const клеток = (д: any) => д.root.findAll((n: any) => typeof n.type === 'string' && /^spatial-cell-\d+$/.test(String(n.props?.testID))).length;
/** Узел поля экрана — родитель доски с onLayout. */
const поле = (д: any) => { let n = доска(д).parent; while (n && typeof n.props?.onLayout !== 'function') n = n.parent; return n; };
/** Браузер отдаёт полю размеры: высота = всё, кроме доски (`безДоски`), плюс текущая сторона. */
async function разметить(д: any, ширина: number, безДоски: number): Promise<void> {
  const высота = безДоски + сторона(д);
  await TestRenderer.act(async () => { поле(д).props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: ширина, height: высота } } }); });
  await дождаться();
}
/** Каркас измерил поле: новая высота уходит в контекст при следующей отрисовке. */
async function каркасИзмерил(д: any, высота: number): Promise<void> {
  mockFieldHeight = высота;
  await TestRenderer.act(async () => { д.update(React.createElement(SpatialLab as React.ComponentType<Record<string, unknown>>, { onBack: jest.fn(), initialMode: 'net' })); });
  await дождаться();
}

describe('лаборатория: сторона доски — от высоты поля каркаса (отчёт e5bfc2f0)', () => {
  beforeEach(() => { mockFieldHeight = 0; mockScreen = { w: 375, h: 667 }; });

  it('прибор жив: свободная «Сеть» — 5×5, без замера каркаса сторона прежняя (окно − 351)', async () => {
    const д = await партия('spatial-free-play');
    expect(клеток(д)).toBe(25);
    await разметить(д, 343, 260);
    expect(сторона(д)).toBe(667 - 351);
  });

  it('🔴 каркас измерил поле 560: сторона = 560 − 260 (всё, кроме доски) − 2 = 298', async () => {
    const д = await партия('spatial-free-play');
    await каркасИзмерил(д, 560);
    await разметить(д, 343, 260);
    expect(`сторона ${сторона(д)}`).toBe('сторона 298');
    // перекладка не качает: тот же замер после новой стороны — та же сторона
    await разметить(д, 343, 260);
    expect(`сторона ${сторона(д)}`).toBe('сторона 298');
  });

  it('🔴 пол — клетка 45, но не выше прежних 240: у 3×3 сторона может быть 143, у 5×5 не меньше 240 (пол 240 держал 3×3 большой)', async () => {
    const малая = await партия('spatial-start-level');
    expect(клеток(малая)).toBe(9);
    await каркасИзмерил(малая, 420);
    await разметить(малая, 343, 260);
    expect(`3×3: сторона ${сторона(малая)}`).toBe('3×3: сторона 158');
    const большая = await партия('spatial-free-play');
    await каркасИзмерил(большая, 420);
    await разметить(большая, 343, 260);
    expect(`5×5: сторона ${сторона(большая)}`).toBe('5×5: сторона 240');
  });

  it('замер «всё, кроме доски» только растёт: строка состояния, ставшая короче, доску туда-обратно не качает', async () => {
    const д = await партия('spatial-free-play');
    await каркасИзмерил(д, 600);
    await разметить(д, 343, 280);
    expect(сторона(д)).toBe(600 - 280 - 2);
    await разметить(д, 343, 258);
    expect(сторона(д)).toBe(600 - 280 - 2);
  });

  it('🔴 строки уровня под доской отступают от краёв на ширину кнопки отзыва: поле прибито, прокруткой их не поднять', async () => {
    const д = await партия('spatial-start-level');
    const строка = д.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'spatial-game-level')[0];
    let обёртка = строка.parent;
    while (обёртка && !(обёртка.type === 'View' && обёртка !== строка)) обёртка = обёртка.parent;
    const стиль = StyleSheet.flatten(обёртка.props.style);
    expect(`отступ ${стиль.paddingHorizontal}, растянут ${стиль.alignSelf}`).toBe(`отступ ${FAB_SIZE + 12}, растянут stretch`);
  });
});

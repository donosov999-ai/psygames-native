/* psygames-dots-board-region-fits · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · отчёт e5bfc2f0, задача 2752f33f */
/**
 * 🔴 «СОЕДИНИ ТОЧКИ»: ОБЛАСТЬ ДОСКИ — ТОЧНО ПО СТОРОНЕ; ДОСКА НЕ НАЕЗЖАЕТ НА СЧЁТЧИКИ И КНОПКИ.
 *
 * Замер WebKit на экспорте 17.09.2026 (вход в партию): на 375×667, уровень 30 (11×11) доска 344 px
 * стояла в области flex: 1 высотой 292 и наезжала на «Ходы · Покрытие», строку цели и «Отменить /
 * Начать заново»; на уровне 60 кнопки уходили за край окна на 128 px, прокрутка их не доставала.
 * Пол пальца (48 на клетку) у 11×11 — вся ширина, так что доска меньше не становится, а область
 * сжималась. После правки — наездов 0, всё вылезающее достаётся прокруткой.
 *
 * Проба монтирует настоящий модуль и отдаёт размеры его узлам через onLayout, как браузер:
 * окно фазы, содержимое, ширину области доски.
 */
import React from 'react';
import { StyleSheet } from 'react-native';

let mockScreen = { w: 390, h: 844 };
jest.mock('@/src/hooks/useScreenWidth', () => ({
  ...jest.requireActual('@/src/hooks/useScreenWidth'),
  useScreenSize: () => mockScreen,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DotsConnectGame = require('@/src/games/dots-connect/DotsConnectGame').default;

const ТЕМА = {
  background: '#fff', surface: '#eee', card: '#fff', text: '#000', textSecondary: '#666',
  primary: '#2563eb', border: '#ccc', success: '#0a0', error: '#a00', warning: '#fa0',
};

function смонтировать(level: number, экран: { w: number; h: number }) {
  mockScreen = экран;
  let д: any;
  TestRenderer.act(() => {
    д = TestRenderer.create(React.createElement(DotsConnectGame as React.ComponentType<Record<string, unknown>>, {
      seed: 'region-fit', level, locale: 'ru', theme: ТЕМА, skipIntro: true,
      gameGradient: ['#2563eb', '#0f766e'], gameGradientText: '#fff', now: () => 1000,
    }));
  });
  return д;
}

const доска = (д: any) => д.root.findAll((n: any) => n.props?.accessibilityRole === 'adjustable')[0];
/** Рамка стороны — родитель доски с числовыми width/height. */
const рамка = (д: any) => { let n = доска(д).parent; while (n && !(typeof n.type === 'string' && typeof StyleSheet.flatten(n.props.style)?.width === 'number')) n = n.parent; return n; };
/**
 * Ближайший предок со СВОИМ onLayout. У узла RN в дереве проб родитель — обёртка того же компонента
 * с теми же пропами, поэтому «первый предок с onLayout» дал бы саму область, а не содержимое.
 */
const предок = (узел: any) => { let n = узел.parent; while (n && (typeof n.props?.onLayout !== 'function' || n.props.onLayout === узел.props?.onLayout)) n = n.parent; return n; };
const область = (д: any) => предок(рамка(д));
const содержимое = (д: any) => предок(область(д));
const окно = (д: any) => предок(содержимое(д));
const сторона = (д: any) => StyleSheet.flatten(рамка(д).props.style).width as number;
const высотаОбласти = (д: any) => StyleSheet.flatten(область(д).props.style).height as number;
/** Прокручивается ли фаза: у ScrollView есть contentContainerStyle или тип-прокрутка. */
const прокрутка = (д: any) => {
  let n = окно(д);
  while (n && typeof n.type !== 'string') n = n.children?.[0];
  return /ScrollView/.test(String(n?.type ?? ''));
};
const разметка = (e: { width?: number; height?: number }) => ({ nativeEvent: { layout: { x: 0, y: 0, width: e.width ?? 0, height: e.height ?? 0 } } });

/** Браузер разметил фазу: ширина области, окно фазы, содержимое = «всё кроме доски» + текущая область. */
function разметить(д: any, { ширина, окноВысота, безДоски }: { ширина: number; окноВысота: number; безДоски: number }) {
  TestRenderer.act(() => { область(д).props.onLayout(разметка({ width: ширина, height: высотаОбласти(д) })); });
  TestRenderer.act(() => { окно(д).props.onLayout(разметка({ width: ширина, height: окноВысота })); });
  TestRenderer.act(() => { содержимое(д).props.onLayout(разметка({ width: ширина, height: безДоски + высотаОбласти(д) })); });
}

describe('«Соедини точки»: область доски по стороне (отчёт e5bfc2f0)', () => {
  it('прибор жив: 5×5 и 11×11 монтируются, узлы окна, содержимого и области найдены', () => {
    const малая = смонтировать(1, { w: 390, h: 844 });
    const большая = смонтировать(30, { w: 390, h: 844 });
    for (const д of [малая, большая]) {
      expect(Boolean(окно(д) && содержимое(д) && область(д))).toBe(true);
    }
    expect(`рамка малой ${сторона(малая) > 0}, большой ${сторона(большая) > 0}`).toBe('рамка малой true, большой true');
  });

  it('помещается (390×844, 5×5): сторона от ширины, область заполняет остаток окна, фаза неподвижна', () => {
    const д = смонтировать(1, { w: 390, h: 844 });
    разметить(д, { ширина: 374, окноВысота: 617, безДоски: 210 });
    expect(`сторона ${сторона(д)} · область ${высотаОбласти(д)} · прокрутка ${прокрутка(д)}`).toBe('сторона 374 · область 407 · прокрутка false');
  });

  it('🔴 11×11 на 375×667: доска на полу по ширине, область РОВНО в сторону — не меньше доски; фаза прокручивается', () => {
    const д = смонтировать(30, { w: 375, h: 667 });
    разметить(д, { ширина: 359, окноВысота: 440, безДоски: 221 });
    expect(`сторона ${сторона(д)} · область ${высотаОбласти(д)} · прокрутка ${прокрутка(д)}`).toBe('сторона 359 · область 359 · прокрутка true');
    // тот же замер после перекладки — ничего не качается
    разметить(д, { ширина: 359, окноВысота: 440, безДоски: 221 });
    expect(`сторона ${сторона(д)} · область ${высотаОбласти(д)} · прокрутка ${прокрутка(д)}`).toBe('сторона 359 · область 359 · прокрутка true');
  });

  it('«всё кроме доски» только растёт: строка короче — доска не качается; строка выше — доска меньше', () => {
    const д = смонтировать(1, { w: 390, h: 700 });
    разметить(д, { ширина: 374, окноВысота: 560, безДоски: 250 });
    expect(сторона(д)).toBe(310);
    разметить(д, { ширина: 374, окноВысота: 560, безДоски: 230 });
    expect(сторона(д)).toBe(310);
    разметить(д, { ширина: 374, окноВысота: 560, безДоски: 280 });
    expect(сторона(д)).toBe(280);
  });

  it('невысокое окно — плотнее: зазор 8 и поля 6 (у 844 — прежние 12)', () => {
    const стиль = (д: any) => StyleSheet.flatten(содержимое(д).props.style);
    const низкое = смонтировать(1, { w: 375, h: 667 });
    const высокое = смонтировать(1, { w: 390, h: 844 });
    expect(`${стиль(низкое).gap}/${стиль(низкое).paddingVertical} · ${стиль(высокое).gap}/${стиль(высокое).paddingVertical}`).toBe('8/6 · 12/12');
  });
});

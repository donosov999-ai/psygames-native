/* psygames-prl-circles-clear-feedback-button · VER 1 · 16.09.2026 */
/**
 * КРУГИ ОТВЕТА PRL НЕ ЗАХОДЯТ ПОД КНОПКУ «СООБЩИТЬ О ПРОБЛЕМЕ».
 *
 * 📍 ЗАМЕР ДО (16.09.2026, живая сборка, партия L1, прибор
 * ~/dev/psygames/attention-chat/кнопка-отзыва-в-партии.mjs по всем 18 экранам раздела и двум
 * окнам): органы ответа под кнопкой отзыва нашлись у одного экрана, PRL. Кнопка 48×48 слева
 * внизу закрывала круг «A»: 236 pt² на 390×844 и 844 pt² на 360×640.
 *
 * Причина: полоса ответа каркаса отступает под кнопку на 66 с обеих сторон (ПОЛЯ_ОТВЕТА 132),
 * а два круга по 130 с зазором 28 — 288, шире полосы уже на 390. Ряд вылезал из отступа.
 *
 * Проба двух видов: модель по ширинам экранов и рендер экрана в идущей партии на двух окнах —
 * круги берутся из дерева, размер из их стиля. Без рендера модель проверяла бы сама себя.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWindow.width, height: mockWindow.height, scale: 2, fontScale: 1 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/games/prl',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { кругОтвета, ЗАЗОР_КРУГОВ } = require('@/app/games/prl');
const { ПОЛЯ_ОТВЕТА, ПАЛЕЦ } = require('@/src/components/gameLayout');
const { FAB_SIZE } = require('@/src/services/fabPosition');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Левый край кнопки отзыва по умолчанию — FeedbackWidget.tsx, `{ left: 14 }`. */
const FAB_LEFT = 14;
const ПРАВЫЙ_КРАЙ_КНОПКИ = FAB_LEFT + FAB_SIZE;

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
});
const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };

async function партия(width: number, height: number) {
  mockWindow = { width, height };
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/prl').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width, height }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  // карточка правила L1 открыта на настройке — закрываем, потом «Start»
  const нажимаемые = () => r.root.findAll((n: any) => n.props && typeof n.props.onPress === 'function', { deep: true });
  const сТекстом = (re: RegExp) => нажимаемые().find((b: any) =>
    b.findAll((x: any) => typeof x.props?.children === 'string' && re.test(x.props.children.trim()), { deep: true }).length > 0);
  const понятно = сТекстом(/^got it$/i);
  if (понятно) { await TestRenderer.act(async () => { понятно.props.onPress(); }); await осесть(); }
  const старт = нажимаемые().find((b: any) => String(b.props.accessibilityLabel) === 'Start');
  expect(`кнопка Start найдена: ${!!старт}`).toBe('кнопка Start найдена: true');
  await TestRenderer.act(async () => { старт.props.onPress(); });
  await осесть();
  /* Круг — нажимаемый узел, внутри которого текст ровно «A» или «B». Берём самый внешний
     (у TouchableOpacity стиль с размером висит на нём), по одному на букву. */
  const круги = (['A', 'B'] as const).map((буква) => {
    const узлы = нажимаемые().filter((b: any) => b.props.style
      && b.findAll((x: any) => x.props?.children === буква, { deep: true }).length > 0);
    const s = StyleSheet.flatten(узлы[0]?.props.style) || {};
    return { буква, w: s.width, h: s.height, узлов: узлы.length };
  });
  return круги;
}

describe('PRL: круги ответа не заходят под кнопку отзыва', () => {
  it('модель: на ширинах 320…430 ряд помещается в полосу ответа, круг не мельче пальца', () => {
    const плохие: string[] = [];
    for (const w of [320, 360, 375, 390, 412, 430]) {
      const к = кругОтвета(w);
      const ряд = 2 * к + ЗАЗОР_КРУГОВ;
      const полоса = w - ПОЛЯ_ОТВЕТА;
      const левыйКрайA = (w - ряд) / 2;
      if (ряд > полоса) плохие.push(`${w}: ряд ${ряд} шире полосы ${полоса}`);
      if (к < ПАЛЕЦ) плохие.push(`${w}: круг ${к} мельче пальца ${ПАЛЕЦ}`);
      if (левыйКрайA < ПРАВЫЙ_КРАЙ_КНОПКИ) плохие.push(`${w}: левый край «A» ${левыйКрайA} левее правого края кнопки отзыва ${ПРАВЫЙ_КРАЙ_КНОПКИ}`);
    }
    expect(плохие).toEqual([]);
  });

  it('модель не раздувает круг: на широком экране не крупнее прежних 130', () => {
    expect(`круг на 430: ${кругОтвета(430)}, на 1024: ${кругОтвета(1024)}`).toBe('круг на 430: 130, на 1024: 130');
  });

  for (const [w, h] of [[390, 844], [360, 640]] as const) {
    it(`🔴 рендер ${w}×${h}: в идущей партии круги «A» и «B» размера кругОтвета и ряд в полосе`, async () => {
      const круги = await партия(w, h);
      const к = кругОтвета(w);
      for (const c of круги) {
        expect(`«${c.буква}»: узлов ${c.узлов > 0 ? 'есть' : 'нет'}, ${c.w}×${c.h}`).toBe(`«${c.буква}»: узлов есть, ${к}×${к}`);
      }
      const ряд = (круги[0].w as number) + (круги[1].w as number) + ЗАЗОР_КРУГОВ;
      expect(`ряд ${ряд} ≤ полоса ${w - ПОЛЯ_ОТВЕТА}: ${ряд <= w - ПОЛЯ_ОТВЕТА}`).toBe(`ряд ${ряд} ≤ полоса ${w - ПОЛЯ_ОТВЕТА}: true`);
    });
  }
});

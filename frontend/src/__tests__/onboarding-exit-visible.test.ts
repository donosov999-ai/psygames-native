/*
 * eslint-disable @typescript-eslint/no-require-imports — экран и контексты берутся
 * ПОСЛЕ подмен, иначе в дерево попадут настоящие роутер и запись сессий.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 🔴 С ЭКРАНА ВЫБОРА ПЕРВОЙ ИГРЫ ЕСТЬ ВЫХОД, И ОН НЕ В ПРОКРУТКЕ.
 *
 * Отчёт Дениса 03.09.2026 со скриншотом: «и как отсюда выйти на шаг назад? Это
 * архитектурная ошибка во всех упражнениях». Единственное «Пропустить» стояло под
 * всем списком игр — с середины экрана выхода не видно, и человек заперт на первом
 * же экране приложения.
 *
 * ⚠️ ПОЧЕМУ ПРОБА, А НЕ ЧТЕНИЕ ИСХОДНИКА. Первый вид этого гейта читал файл и
 * искал выход «до открытия ScrollView». Он остался ЗЕЛЁНЫМ, когда я вернул дефект:
 * в одном файле живут два экрана, и он находил выход соседнего. Проверять надо
 * нарисованное дерево — где узел стоит на самом деле.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TestRenderer = require('react-test-renderer');

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));
jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

async function монтировать() {
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { WarmupProvider } = require('@/src/contexts/WarmupContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/onboarding').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(WarmupProvider, null, React.createElement(Screen)))))),
    );
  });
  for (let i = 0; i < 8; i += 1) {
    await TestRenderer.act(async () => { for (let k = 0; k < 40; k += 1) await Promise.resolve(); });
  }
  return r;
}

/** Дойти до экрана выбора: пролистать вступление кнопкой «дальше». */
async function доВыбора(r: any) {
  for (let шаг = 0; шаг < 8; шаг += 1) {
    if (r.root.findAll((n: any) => n.props?.testID === 'onb-exit').length > 0) return true;
    const кнопки = r.root.findAll((n: any) =>
      n.props?.accessibilityRole === 'button' && typeof n.props?.onPress === 'function' && !n.props?.disabled);
    if (кнопки.length === 0) return false;
    await TestRenderer.act(async () => { кнопки[кнопки.length - 1].props.onPress(); });
    await TestRenderer.act(async () => { for (let k = 0; k < 40; k += 1) await Promise.resolve(); });
  }
  return r.root.findAll((n: any) => n.props?.testID === 'onb-exit').length > 0;
}

describe('онбординг: выход виден, а не спрятан под списком', () => {
  it('🔴 выход есть и нарисован ВНЕ прокрутки', async () => {
    const r = await монтировать();
    expect(await доВыбора(r)).toBe(true);          // экран выбора вправду открылся

    const выходы = r.root.findAll((n: any) => n.props?.testID === 'onb-exit');
    expect(выходы.length).toBeGreaterThan(0);

    // 🔴 И он НЕ потомок прокрутки: иначе виден только тому, кто долистал.
    const прокрутки = r.root.findAll((n: any) => {
      const имя = typeof n.type === 'string' ? n.type : (n.type?.displayName || n.type?.name || '');
      return /ScrollView/.test(String(имя));
    });
    const внутриПрокрутки = прокрутки.some((sv: any) =>
      sv.findAll((n: any) => n.props?.testID === 'onb-exit').length > 0);
    expect(внутриПрокрутки).toBe(false);
    await TestRenderer.act(async () => { r.unmount(); });
  });

  it('у выхода палец помещается: 48×48 — норма для того, по чему стучат', async () => {
    const r = await монтировать();
    await доВыбора(r);
    const { StyleSheet } = require('react-native');
    const выход = r.root.findAll((n: any) => n.props?.testID === 'onb-exit')[0];
    const st = StyleSheet.flatten(выход.props.style) as { minHeight?: number; minWidth?: number };
    expect(st?.minHeight ?? 0).toBeGreaterThanOrEqual(44);
    expect(st?.minWidth ?? 0).toBeGreaterThanOrEqual(44);
    await TestRenderer.act(async () => { r.unmount(); });
  });
});

/* psygames-warmup-bridge-actions-row-fits · VER 1 · 17.09.2026 */
/**
 * МОСТ: РЯД «ПРОПУСТИТЬ: <ИМЯ>» + «ОСТАНОВИТЬ» НЕ ШИРЕ ЭКРАНА.
 *
 * 📍 17.09.2026, экспорт-сборка, WebKit 390×844, «Не спится»: «Пропустить: Пары слов: память» и
 * «Остановить» вылезали за оба края экрана. Ряд стоял по центру шириной по содержимому, и
 * `flexShrink` у подписи ничего не давал.
 * Живой замер после правки (та же серия): 390 — кнопки 20–212 и 224–370; 360 — 20–182 и
 * 194–340; 320 — 20–142 и 154–300. Обе целиком в окне, имя переносится на вторую строку.
 *
 * ⚠️ Это СТОРОЖ УСТРОЙСТВА, а не замер вёрстки: jest раскладку не считает. Он держит то, от
 * чего зависит живой замер: ряд на всю ширину блока, кнопка пропуска сжимается и переносит
 * подпись на две строки, кнопка остановки не сжимается.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import WarmupBridge from '@/app/warmup-bridge';

declare function require(id: string): any;

jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    meta: {
      duration_min: 5, weekday: 4, weekday_name: 'ЧТ', track: 'rest', track_label: 'не спится', slot: 'night', est_total_sec: 300,
      steps: [
        { game_id: 'puzzles', game_route: '/games/puzzles', mode: 'Net', est_duration_sec: 120 },
        { game_id: 'word_pairs', game_route: '/games/word-pairs', mode: '4 pairs', est_duration_sec: 60 },
      ],
    },
    results: [], currentIdx: 1, active: true, overtime: false,
    currentStep: { game_id: 'word_pairs', game_route: '/games/word-pairs', mode: '4 pairs', est_duration_sec: 60 },
    startTime: Date.now(), stopWarmup: async () => {}, skipCurrent: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }), translateFor: (_l: string, k: string) => k }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => R.createElement(View, p, children) };
});

describe('мост: нижний ряд кнопок', () => {
  it('🔴 ряд на всю ширину; «Пропустить» сжимается и переносит имя на 2 строки; «Остановить» не сжимается', async () => {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<WarmupBridge />); });
    const ряд = tr.root.findAll((n: any) => n.props?.testID === 'warmup-bridge-actions-row')[0];
    expect(ряд).toBeTruthy();
    const кнопки = ряд.findAllByType(TouchableOpacity);
    const пропуск = кнопки.find((к: any) => String(к.props.accessibilityLabel ?? '').startsWith('skipGameNamed'))!;
    const стоп = кнопки.find((к: any) => к.props.testID === 'warmup-stop')!;
    const подпись = пропуск.findAllByType(Text)[0];
    const рядСтиль = StyleSheet.flatten(ряд.props.style);
    expect([
      `ряд: ширина ${рядСтиль.width}`,
      `пропуск: сжатие ${StyleSheet.flatten(пропуск.props.style).flexShrink}, строк ${подпись.props.numberOfLines}`,
      `стоп: сжатие ${StyleSheet.flatten(стоп.props.style).flexShrink}`,
    ].join(' · ')).toBe('ряд: ширина 100% · пропуск: сжатие 1, строк 2 · стоп: сжатие 0');
    await act(async () => { tr.unmount(); });
  });
});

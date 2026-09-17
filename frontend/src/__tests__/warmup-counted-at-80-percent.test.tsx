/* psygames-warmup-counted-at-80-percent · VER 1 · 17.09.2026 */
/**
 * СЕРИЯ ЗАСЧИТАНА, ЕСЛИ СЫГРАНО НЕ МЕНЬШЕ 80 % ШАГОВ.
 *
 * Решение Дениса 17.09.2026. Было: один пропущенный шаг из шести давал «ЗАРЯДКА ОСТАНОВЛЕНА»,
 * в историю уходило `completed: false`, и день не шёл в стрик. Живой проход 17.09 (экспорт
 * 1101b52b): дневная пятиминутка дважды остановлена из-за одного шага.
 *
 * Монтируется настоящий экран итога; подменены зарядка (с пойманным `stopWarmup`), навигация,
 * профиль и сервисы с сетью.
 *   · граница: 5 из 6, 4 из 5, 8 из 10 — засчитано; 4 из 6, 5 из 7 — нет;
 *   · 5 из 6 — «ЗАРЯДКА ЗАВЕРШЕНА», в историю `completed: true`, пропущенный шаг назван;
 *   · 4 из 6 — «ОСТАНОВЛЕНА», `completed: false`.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import WarmupComplete from '@/app/warmup-complete';
import { серияЗасчитана } from '@/src/services/warmup';

declare function require(id: string): any;

const mockStopWarmup = jest.fn(async (_completed?: boolean) => {});
let mockMeta: any = null;
let mockResults: any[] = [];

jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    meta: mockMeta, results: mockResults, startTime: Date.now() - 125_000,
    stopWarmup: mockStopWarmup, startPlaylist: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const R = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...p }: any) => R.createElement(View, p, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#eee', text: '#000', textSecondary: '#666', border: '#ccc', primary: '#7c6cf0', card: '#eee' } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }), translateFor: (_l: string, k: string) => k }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/components/GradientSurface', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children, ...p }: any) => R.createElement(View, p, children) };
});
jest.mock('@/src/services/api', () => ({ getSessions: async () => [] }));
jest.mock('@/src/services/weakSkill', () => ({ saveWeakSkill: async () => {} }));
jest.mock('@/src/services/tokens', () => ({ addTokens: async () => {}, comboBonus: () => ({ bonus: 0, streakLen: 0 }) }));
jest.mock('@/src/services/reminders', () => ({
  loadReminderSettings: async () => ({ morning: false, evening: false }), saveReminderSettings: async () => {},
  applyReminders: async () => {}, requestReminderPermission: async () => false, DEFAULT_REMINDERS: {},
}));
jest.mock('@/src/services/aiInsight', () => ({ getAiInsight: async () => null, toneForProfile: () => 'default', dayKey: () => 'd' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const шаг = (id: string) => ({ game_id: id, game_route: `/games/${id}`, est_duration_sec: 60 });
const ИГРЫ = ['corsi', 'sdmt', 'flanker', 'mental_rotation', 'switching_task', 'n_back'];
const дневная = () => ({
  duration_min: 5, weekday: 4, weekday_name: 'ЧТ', track: 'training', track_label: 'перерыв',
  steps: ИГРЫ.map(шаг), est_total_sec: 360, slot: 'day', вид: 'слот',
});
const результат = (id: string) => ({ game_type: id, score: 10, time_seconds: 30, errors: 0 });

async function итог(сыграно: number): Promise<{ tr: TestRenderer.ReactTestRenderer; текст: string }> {
  mockMeta = дневная();
  mockResults = ИГРЫ.slice(0, сыграно).map(результат);
  mockStopWarmup.mockClear();
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupComplete />); });
  const текст = tr.root.findAll((n: any) => Array.isArray(n.props?.children) || typeof n.props?.children === 'string')
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number').join(' ');
  return { tr, текст };
}

describe('зачёт серии — от 80 % сыгранных шагов', () => {
  it('🔴 граница в целых: 5/6, 4/5, 8/10, 6/7, 10/12 — да; 4/6, 3/5, 7/10, 5/7, 9/12 — нет', () => {
    const пары: [number, number][] = [[6, 6], [6, 5], [6, 4], [5, 4], [5, 3], [10, 8], [10, 7], [7, 6], [7, 5], [12, 10], [12, 9], [1, 1], [1, 0], [0, 0], [6, 9]];
    expect(пары.map(([шагов, сыграно]) => `${сыграно}/${шагов} ${серияЗасчитана(шагов, сыграно) ? 'да' : 'нет'}`)).toEqual([
      '6/6 да', '5/6 да', '4/6 нет', '4/5 да', '3/5 нет', '8/10 да', '7/10 нет', '6/7 да', '5/7 нет',
      '10/12 да', '9/12 нет', '1/1 да', '0/1 нет', '0/0 нет', '9/6 да',
    ]);
  });

  it('🔴 5 шагов из 6 — «ЗАРЯДКА ЗАВЕРШЕНА», в историю completed: true, пропущенный шаг назван', async () => {
    const { tr, текст } = await итог(5);
    expect(`завершена: ${текст.includes('warmupDoneTitle')}, остановлена: ${текст.includes('warmupStoppedTitle')}`)
      .toBe('завершена: true, остановлена: false');
    expect(mockStopWarmup.mock.calls.map((в) => в[0])).toEqual([true]);
    expect(текст).toContain('skippedNamed');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 4 шага из 6 — «ОСТАНОВЛЕНА», в историю completed: false', async () => {
    const { tr, текст } = await итог(4);
    expect(`завершена: ${текст.includes('warmupDoneTitle')}, остановлена: ${текст.includes('warmupStoppedTitle')}`)
      .toBe('завершена: false, остановлена: true');
    expect(mockStopWarmup.mock.calls.map((в) => в[0])).toEqual([false]);
    await act(async () => { tr.unmount(); });
  });

  it('контроль: все 6 из 6 — завершена, без строки «Пропущено»', async () => {
    const { tr, текст } = await итог(6);
    expect(mockStopWarmup.mock.calls.map((в) => в[0])).toEqual([true]);
    expect(текст).not.toContain('skippedNamed');
    await act(async () => { tr.unmount(); });
  });
});

/* psygames-warmup-complete-repeat-and-pinned-actions · VER 1 · 17.09.2026 */
/**
 * ИТОГ СЕРИИ: «ЕЩЁ РАЗ» ПОВТОРЯЕТ ТО, ЧТО СЫГРАНО, А КНОПКИ НЕ УЕЗЖАЮТ ЗА КРАЙ.
 *
 * 📍 Живой проход серий 17.09.2026, экспорт-сборка origin/main 1101b52b, WebKit 390×844:
 *   · «Ещё раз» собирал повтор ЗАНОВО по слоту: день, вечер и ночь — всегда на пять минут,
 *     какую длину ни выбирал человек; утро — по `duration_min`, которого в сетке нет;
 *     своя серия и тема хаба — утреннюю или дневную зарядку вместо себя;
 *   · своя серия подписывалась «Утренняя» (слот у неё служебный);
 *   · «Мнемоника» с 11 ошибками на пяти словах давала «+-6»;
 *   · у дневной зарядки из пяти результатов «ЕЩЁ РАЗ» и «На главную» стояли ниже края
 *     экрана — отчёты 1e47d75d и fef9d101: «нижний тулбар сделать фиксированно».
 *
 * Монтируется настоящий экран, подменены зарядка, навигация, профиль и сервисы с сетью.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ScrollView } from 'react-native';
import WarmupComplete from '@/app/warmup-complete';

declare function require(id: string): any;

const mockStartPlaylist = jest.fn();
const mockStartEvening = jest.fn();
const mockStartDay = jest.fn();
const mockStartNight = jest.fn();
const mockStartWarmup = jest.fn();
let mockMeta: any = null;
let mockResults: any[] = [];

jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    meta: mockMeta, results: mockResults, startTime: Date.now() - 125_000,
    stopWarmup: async () => {},
    startPlaylist: mockStartPlaylist, startEvening: mockStartEvening, startDay: mockStartDay,
    startNight: mockStartNight, startWarmup: mockStartWarmup,
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
const набор = (over: any) => ({
  duration_min: 14, weekday: 4, weekday_name: 'ЧТ', track: 'training', track_label: 'перед сном',
  steps: ['corsi', 'word_pairs', 'hanoi', 'mahjong', 'goods_sort', 'set_game', 'tower_london', 'sudoku', 'puzzles', 'pause', 'eye_gym', 'breathing'].map(шаг),
  est_total_sec: 850, slot: 'evening', вид: 'слот', ...over,
});
const результат = (id: string, score = 10) => ({ game_type: id, score, time_seconds: 30, errors: 0 });

beforeEach(() => {
  for (const f of [mockStartPlaylist, mockStartEvening, mockStartDay, mockStartNight, mockStartWarmup]) f.mockClear();
});

async function итог(meta: any, results: any[]): Promise<TestRenderer.ReactTestRenderer> {
  mockMeta = meta; mockResults = results;
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupComplete />); });
  return tr;
}
const тексты = (узел: TestRenderer.ReactTestInstance): string[] =>
  узел.findAll((n: any) => typeof n.props?.children === 'string' || typeof n.props?.children === 'number')
    .map((n: any) => String(n.props.children));
const всеТексты = (tr: TestRenderer.ReactTestRenderer): string =>
  tr.root.findAll((n: any) => Array.isArray(n.props?.children) || typeof n.props?.children === 'string')
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number').join(' ');
const кнопкаСТекстом = (tr: TestRenderer.ReactTestRenderer, текст: string) =>
  tr.root.findAll((n: any) => typeof n.props?.onPress === 'function' && тексты(n).includes(текст))[0];

describe('итог серии', () => {
  it('🔴 «ЕЩЁ РАЗ» и «На главную» — вне прокрутки, в закреплённой панели', async () => {
    const tr = await итог(набор({}), набор({}).steps.slice(0, 5).map((s: any) => результат(s.game_id)));
    const панель = tr.root.findAll((n: any) => n.props?.testID === 'warmup-complete-actions')[0];
    expect(панель).toBeTruthy();
    const прокрутка = tr.root.findByType(ScrollView);
    expect(`кнопок в прокрутке: ${[кнопкаСТекстом(tr, 'ctaAgain'), кнопкаСТекстом(tr, 'goHome')]
      .filter((к) => к && прокрутка.findAll((n) => n === к).length > 0).length}`).toBe('кнопок в прокрутке: 0');
    expect(тексты(панель)).toEqual(expect.arrayContaining(['ctaAgain', 'goHome']));
    await act(async () => { tr.unmount(); });
  });

  it('🔴 «Ещё раз» у вечера на 15 минут повторяет те же 12 шагов, а не собирает пятиминутку', async () => {
    const meta = набор({});
    const tr = await итог(meta, meta.steps.map((s: any) => результат(s.game_id)));
    await act(async () => { кнопкаСТекстом(tr, 'ctaAgain').props.onPress(); });
    expect(`startEvening: ${mockStartEvening.mock.calls.length}, startPlaylist: ${mockStartPlaylist.mock.calls.length}`)
      .toBe('startEvening: 0, startPlaylist: 1');
    const повтор = mockStartPlaylist.mock.calls[0][0];
    expect(повтор.steps.map((s: any) => s.game_id)).toEqual(meta.steps.map((s: any) => s.game_id));
    expect(`${повтор.slot} · ${повтор.вид}`).toBe('evening · слот');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 своя серия подписана своим названием и повторяет саму себя, а не утреннюю зарядку', async () => {
    const meta = набор({ slot: 'morning', вид: 'набор', track_label: 'Рабочая память · 5 мин', steps: ['corsi', 'digit_span', 'n_back'].map(шаг) });
    const tr = await итог(meta, meta.steps.map((s: any) => результат(s.game_id)));
    const всё = всеТексты(tr);
    expect(всё).toContain('Рабочая память · 5 мин');
    expect(всё).not.toContain('slotMorning');
    await act(async () => { кнопкаСТекстом(tr, 'ctaAgain').props.onPress(); });
    expect(`startWarmup: ${mockStartWarmup.mock.calls.length}, startPlaylist: ${mockStartPlaylist.mock.calls.length}`)
      .toBe('startWarmup: 0, startPlaylist: 1');
    expect(mockStartPlaylist.mock.calls[0][0].steps.map((s: any) => s.game_id)).toEqual(['corsi', 'digit_span', 'n_back']);
    await act(async () => { tr.unmount(); });
  });

  it('у FIN BRAIN кнопки «Ещё раз» нет — у замера остывание 14 дней', async () => {
    const meta = набор({ track: 'financial-battery', slot: undefined, вид: 'набор', steps: ['iowa', 'bart', 'prl'].map(шаг) });
    const tr = await итог(meta, meta.steps.map((s: any) => результат(s.game_id)));
    expect(кнопкаСТекстом(tr, 'ctaAgain')).toBeUndefined();
    expect(кнопкаСТекстом(tr, 'goHome')).toBeTruthy();
    await act(async () => { tr.unmount(); });
  });

  it('отрицательные очки со знаком минус, без «+-»', async () => {
    const meta = набор({ steps: ['mnemonics', 'word_pairs'].map(шаг) });
    const tr = await итог(meta, [результат('mnemonics', -6), результат('word_pairs', 0)]);
    const всё = всеТексты(tr);
    expect(всё).not.toContain('+-6');
    expect(всё).toContain('−6');
    await act(async () => { tr.unmount(); });
  });
});

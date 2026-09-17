/* psygames-warmup-night-no-score · VER 1 · 17.09.2026 */
/**
 * «НЕ СПИТСЯ» — ИТОГ И МОСТ БЕЗ СЧЁТА И БЕЗ СЕРИИ ДНЕЙ.
 *
 * Решение Дениса 17.09.2026: «итог без счёта и без серии дней». Карточка обещает «очки не
 * начисляются», а итог показывал очки у каждой игры, «Общий счёт», разбор по навыкам и
 * «N дней подряд», мост — очки шага.
 *
 * Монтируются настоящие экраны итога и моста; подменены зарядка, навигация, профиль, сервисы
 * с сетью и чтение истории (в ней вчерашняя утренняя зарядка — стрику есть что показать).
 *   · ночь: на итоге нет очков, ошибок, «Общего счёта» и стрика; время у игр есть; разбор
 *     навыков не считается, слабое место не пишется, бонус за чистые игры не начисляется;
 *   · контроль — та же история и те же игры утром: всё это на месте;
 *   · мост ночью — время шага без очков; утром — с очками.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import WarmupComplete from '@/app/warmup-complete';
import WarmupBridge from '@/app/warmup-bridge';
import { localDateKey } from '@/src/services/warmup';

declare function require(id: string): any;

let mockMeta: any = null;
let mockResults: any[] = [];
let mockCurrentIdx = 0;
const mockSaveWeakSkill = jest.fn(async (_р: any) => {});
const mockComboBonus = jest.fn((_r: any) => ({ bonus: 0, streakLen: 0 }));
const mockHistory = { value: '[]' };

jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    meta: mockMeta, results: mockResults, startTime: Date.now() - 125_000,
    active: true, overtime: false, currentIdx: mockCurrentIdx, currentStep: mockMeta?.steps[mockCurrentIdx] ?? null,
    stopWarmup: async () => {}, startPlaylist: jest.fn(), skipCurrent: jest.fn(),
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
jest.mock('@/src/services/weakSkill', () => ({ saveWeakSkill: (р: any) => mockSaveWeakSkill(р) }));
jest.mock('@/src/services/tokens', () => ({ addTokens: async () => {}, comboBonus: (r: any) => mockComboBonus(r) }));
jest.mock('@/src/services/reminders', () => ({
  loadReminderSettings: async () => ({ morning: true, evening: true }), saveReminderSettings: async () => {},
  applyReminders: async () => {}, requestReminderPermission: async () => false, DEFAULT_REMINDERS: {},
}));
jest.mock('@/src/services/aiInsight', () => ({ getAiInsight: async () => null, toneForProfile: () => 'default', dayKey: () => 'd' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
/* История зарядок читается динамическим `import()`, а jest без --experimental-vm-modules его не
   исполняет: через хранилище она всегда пуста. Подменяем только чтение истории. */
jest.mock('@/src/services/warmup', () => ({
  ...jest.requireActual('@/src/services/warmup'),
  loadWarmupHistory: async () => JSON.parse(mockHistory.value),
}));

const шаг = (id: string) => ({ game_id: id, game_route: `/games/${id}`, est_duration_sec: 60 });
const ИГРЫ = ['breathing', 'word_pairs', 'corsi'];
const набор = (ночь: boolean) => ({
  duration_min: 5, weekday: 4, weekday_name: 'ЧТ',
  track: ночь ? 'rest' : 'training', track_label: ночь ? 'не спится' : 'тренировка',
  steps: ИГРЫ.map(шаг), est_total_sec: 300, slot: ночь ? 'night' : 'morning', вид: 'слот',
});
const РЕЗУЛЬТАТЫ = [
  { game_type: 'breathing', score: 114, time_seconds: 114, errors: 0 },
  { game_type: 'word_pairs', score: 5, time_seconds: 50, errors: 2 },
  { game_type: 'corsi', score: 700, time_seconds: 47, errors: 0 },
];

beforeEach(() => {
  const вчера = new Date(); вчера.setDate(вчера.getDate() - 1);
  mockHistory.value = JSON.stringify([{
    date: localDateKey(вчера), weekday: 3, duration_min: 5, track: 'training',
    total_score: 900, completed: true, steps_done: 5, steps_total: 5,
  }]);
  mockSaveWeakSkill.mockClear();
  mockComboBonus.mockClear();
});

const всеТексты = (tr: TestRenderer.ReactTestRenderer): string =>
  tr.root.findAll((n: any) => Array.isArray(n.props?.children) || typeof n.props?.children === 'string' || typeof n.props?.children === 'number')
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number').join(' ');

async function смонтировать(экран: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(экран); });
  // История грузится цепочкой ожиданий после записи итога — даём ей договорить.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return tr;
}

function чтоНаИтоге(текст: string): string {
  return [
    `очки ${['+114', '+5', '+700'].filter((о) => текст.includes(о)).length}`,
    `ошибки ${текст.includes('✗') ? 1 : 0}`,
    `общий счёт ${текст.includes('totalScoreLabel') ? 1 : 0}`,
    `стрик ${/streakDay(One|sMany)/.test(текст) ? 1 : 0}`,
  ].join(' · ');
}

describe('«Не спится»: без счёта и без серии дней', () => {
  it('🔴 итог ночи: нет очков, ошибок, «Общего счёта» и стрика; время у игр есть', async () => {
    mockMeta = набор(true); mockResults = РЕЗУЛЬТАТЫ;
    const tr = await смонтировать(<WarmupComplete />);
    const текст = всеТексты(tr);
    expect(чтоНаИтоге(текст)).toBe('очки 0 · ошибки 0 · общий счёт 0 · стрик 0');
    expect(текст).toContain('114.0');
    expect(`разбор навыков ${mockSaveWeakSkill.mock.calls.length} · бонус ${mockComboBonus.mock.calls.length}`)
      .toBe('разбор навыков 0 · бонус 0');
    await act(async () => { tr.unmount(); });
  });

  it('контроль: те же игры и та же история утром — очки, ошибки, счёт, стрик, разбор и бонус на месте', async () => {
    mockMeta = набор(false); mockResults = РЕЗУЛЬТАТЫ;
    const tr = await смонтировать(<WarmupComplete />);
    expect(чтоНаИтоге(всеТексты(tr))).toBe('очки 3 · ошибки 1 · общий счёт 1 · стрик 1');
    expect(`разбор навыков ${mockSaveWeakSkill.mock.calls.length} · бонус ${mockComboBonus.mock.calls.length}`)
      .toBe('разбор навыков 1 · бонус 1');
    await act(async () => { tr.unmount(); });
  });

  it('🔴 мост ночью — время шага без очков и ошибок; утром — с очками', async () => {
    const мост = async (ночь: boolean) => {
      mockMeta = набор(ночь); mockResults = [РЕЗУЛЬТАТЫ[1]]; mockCurrentIdx = 2;
      const tr = await смонтировать(<WarmupBridge />);
      const текст = всеТексты(tr);
      await act(async () => { tr.unmount(); });
      return `очки ${текст.includes('+5') ? 1 : 0} · ошибки ${текст.includes('✗') ? 1 : 0} · время ${текст.includes('50.0') ? 1 : 0}`;
    };
    expect(`ночь: ${await мост(true)} | утро: ${await мост(false)}`)
      .toBe('ночь: очки 0 · ошибки 0 · время 1 | утро: очки 1 · ошибки 1 · время 1');
  });
});

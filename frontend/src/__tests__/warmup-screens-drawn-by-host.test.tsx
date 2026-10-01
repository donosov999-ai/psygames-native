/* psygames-warmup-screens-drawn-by-host · VER 1 · 01.10.2026 */
/**
 * ВЫБОР ЗАРЯДКИ И ИТОГ ПОД ОБОЛОЧКОЙ РИСУЕТ FLUTTER, А СЧИТАЕТ ЭТОТ ЖЕ ЭКРАН.
 *
 * Задача 748c3f5f, решение Дениса 01.10.2026: «всё, что не на Flutter, — переводить».
 * Экраны: выбор (/warmup-picker), итог (/warmup-complete), веб-мост (/warmup-bridge).
 * См. `services/warmupUi.ts`. Монтируются настоящие экраны; подменены профиль, зарядка,
 * навигация, хранилище, сервисы с сетью и сама оболочка (`window.PsyBridge`,
 * `window.__psyHostNativeRoutes`):
 *   · без оболочки экран ничего не шлёт и действий не заводит — работает как раньше;
 *   · под оболочкой выбор отдаёт модель: четыре слота, выбран ровно один;
 *   · подпись каждой веб-карточки = «заголовок. описание» из модели — один расчёт на двоих;
 *   · нажатия оболочки двигают тот же экран: выбор слота меняет модель, «Начать» запускает;
 *   · итог отдаёт результаты партий и «На главную» уводит страницу на главную.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import WarmupPicker from '@/app/warmup-picker';
import WarmupComplete from '@/app/warmup-complete';
import WarmupBridge from '@/app/warmup-bridge';

declare function require(id: string): any;

const mockStartDay = jest.fn();
const mockStartPlaylist = jest.fn();
const mockReplace = jest.fn();
let mockMeta: any = null;
let mockResults: any[] = [];
let mockCurrentIdx = 0;
let mockOvertime = false;
const mockSkipCurrent = jest.fn();
const mockStopWarmup = jest.fn(async (_c: boolean) => {});

jest.mock('@/src/contexts/ProfileContext', () => ({
  useProfile: () => ({
    profile: { id: 'nzt48', allowed_games: 'all', assessment_enabled: false, financial_brain_day_enabled: false },
    составИзФайла: null,
  }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({
  useWarmup: () => ({
    meta: mockMeta, results: mockResults, startTime: Date.now() - 95_000,
    active: !!mockMeta, currentIdx: mockCurrentIdx, currentStep: mockMeta?.steps[mockCurrentIdx] ?? null,
    overtime: mockOvertime, stepsLeft: mockMeta ? mockMeta.steps.length - mockCurrentIdx : 0,
    dismissOvertime: jest.fn(), skipCurrent: mockSkipCurrent,
    stopWarmup: (c: boolean) => mockStopWarmup(c), startPlaylist: mockStartPlaylist,
    startDay: mockStartDay, startNight: jest.fn(), startEvening: jest.fn(), startWarmup: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }) }));
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
jest.mock('@/src/services/assessment', () => ({ getAssessmentStatus: async () => null, ASSESSMENT_PLAYLIST: [] }));
jest.mock('@/src/services/api', () => ({ getSessions: async () => [] }));
jest.mock('@/src/services/weakSkill', () => ({ saveWeakSkill: async () => {} }));
jest.mock('@/src/services/tokens', () => ({ addTokens: async () => {}, comboBonus: () => ({ bonus: 0, streakLen: 0 }) }));
jest.mock('@/src/services/reminders', () => ({
  loadReminderSettings: async () => ({ morning: true, evening: true }), saveReminderSettings: async () => {},
  applyReminders: async () => {}, requestReminderPermission: async () => false, DEFAULT_REMINDERS: {},
}));
jest.mock('@/src/services/aiInsight', () => ({ getAiInsight: async () => null, toneForProfile: () => 'default', dayKey: () => 'd' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const w = window as any;
const posted: any[] = [];

function оболочка() {
  w.PsyBridge = { postMessage: (s: string) => posted.push(JSON.parse(s)) };
  w.__psyHostNativeRoutes = ['/warmup-picker', '/warmup-complete', '/warmup-bridge', '/games/digit-span', '/games/schulte'];
  w.__psyHostLang = 'ru';
}

beforeEach(() => {
  posted.length = 0;
  mockStartDay.mockClear();
  mockStartPlaylist.mockClear();
  mockReplace.mockClear();
  delete w.PsyBridge;
  delete w.__psyHostNativeRoutes;
  delete w.__psyWarmupUi;
});

const последняя = (screen: string) => [...posted].reverse().find((m) => m.op === 'warmupUi' && m.screen === screen)?.model;

async function открыть(el: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> {
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(el); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return tr;
}

describe('выбор зарядки', () => {
  it('без оболочки — ни модели, ни действий: экран как раньше', async () => {
    const tr = await открыть(<WarmupPicker />);
    expect(posted).toHaveLength(0);
    expect(w.__psyWarmupUi?.picker).toBeUndefined();
    await act(async () => { tr.unmount(); });
  });

  it('🔴 под оболочкой отдаёт модель: четыре слота, выбран ровно один', async () => {
    оболочка();
    const tr = await открыть(<WarmupPicker />);
    const m = последняя('picker');
    expect(m).toBeTruthy();
    expect(m.slots.map((c: any) => c.key)).toEqual(['morning', 'day', 'evening', 'night']);
    expect(m.slots.filter((c: any) => c.on)).toHaveLength(1);
    expect(m.start.label).toBe('start');
    expect(m.help.rows).toHaveLength(4);
    await act(async () => { tr.unmount(); });
    expect(w.__psyWarmupUi?.picker).toBeUndefined();
  });

  it('🔴 веб-карточка и модель — один расчёт: подпись = «заголовок. описание»', async () => {
    оболочка();
    const tr = await открыть(<WarmupPicker />);
    const m = последняя('picker');
    const подписи = tr.root.findAllByType(TouchableOpacity)
      .filter((n: any) => n.props?.accessibilityRole === 'radio' && !/ unitMin$/.test(String(n.props.accessibilityLabel ?? '')))
      .map((n: any) => n.props.accessibilityLabel);
    for (const c of m.slots) expect(подписи).toContain(`${c.title}. ${c.desc}`);
    await act(async () => { tr.unmount(); });
  });

  it('🔴 нажатия оболочки двигают тот же экран: «Дневная» → выбрана, «Начать» → запуск дня', async () => {
    оболочка();
    const tr = await открыть(<WarmupPicker />);
    const day = последняя('picker').slots.find((c: any) => c.key === 'day');
    if (day.off) { await act(async () => { tr.unmount(); }); return; }   // в день отдыха слот гаснет
    await act(async () => { w.__psyWarmupUi.picker.pick('day'); });
    expect(последняя('picker').slots.find((c: any) => c.key === 'day').on).toBe(true);
    await act(async () => { w.__psyWarmupUi.picker.launch(); });
    expect(mockStartDay).toHaveBeenCalledTimes(1);
    await act(async () => { tr.unmount(); });
  });

  it('повторная просьба оболочки «пришли ещё раз» — та же модель', async () => {
    оболочка();
    const tr = await открыть(<WarmupPicker />);
    const было = posted.length;
    await act(async () => { w.__psyWarmupUi.picker.post(); });
    expect(posted.length).toBe(было + 1);
    expect(posted[posted.length - 1]).toEqual(posted[было - 1]);
    await act(async () => { tr.unmount(); });
  });
});

describe('итог зарядки', () => {
  const ЦИФРЫ = { game_id: 'digit_span', game_route: '/games/digit-span', est_duration_sec: 60 };
  const ШУЛЬТЕ = { game_id: 'schulte_table', game_route: '/games/schulte', est_duration_sec: 60 };

  beforeEach(() => {
    mockMeta = {
      duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning',
      steps: [ЦИФРЫ, ШУЛЬТЕ], est_total_sec: 120,
    };
    mockResults = [
      { game_type: 'digit_span', score: 7, time_seconds: 31.2, errors: 1, шаг: 0 },
      { game_type: 'schulte_table', score: 12, time_seconds: 40.5, errors: 0, шаг: 1 },
    ];
  });

  it('🔴 под оболочкой отдаёт итог: засчитано, обе партии, счёт; «На главную» — на главную', async () => {
    оболочка();
    const tr = await открыть(<WarmupComplete />);
    const m = последняя('complete');
    expect(m.empty).toBe(false);
    expect(m.completed).toBe(true);
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].time).toBe('31.2secShort');
    expect(m.rows[0].errors).toBe(1);
    expect(m.rows[1].errors).toBeNull();
    expect(m.total.value).toBe('19');
    expect(m.home).toBe('goHome');
    await act(async () => { w.__psyWarmupUi.complete.home(); });
    expect(mockReplace).toHaveBeenCalledWith('/');
    await act(async () => { tr.unmount(); });
  });

  it('без оболочки итог ничего не шлёт', async () => {
    const tr = await открыть(<WarmupComplete />);
    expect(posted).toHaveLength(0);
    await act(async () => { tr.unmount(); });
  });
});

describe('веб-мост зарядки', () => {
  const ЦИФРЫ = { game_id: 'digit_span', game_route: '/games/digit-span', est_duration_sec: 60 };
  const НБЭК = { game_id: 'n_back', game_route: '/games/n-back', est_duration_sec: 60 };

  beforeEach(() => {
    jest.useFakeTimers();
    mockMeta = {
      duration_min: 5, weekday: 1, weekday_name: 'пн', track: 'training', track_label: '', slot: 'morning',
      steps: [ЦИФРЫ, НБЭК], est_total_sec: 120,
    };
    mockResults = [{ game_type: 'digit_span', score: 7, time_seconds: 31.2, errors: 2, шаг: 0 }];
    mockCurrentIdx = 1;
    mockOvertime = false;
    mockSkipCurrent.mockClear();
    mockStopWarmup.mockClear();
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  async function мост(): Promise<TestRenderer.ReactTestRenderer> {
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<WarmupBridge />); });
    return tr;
  }

  it('🔴 под оболочкой отдаёт модель: что сыграно, что дальше, отсчёт; секунда — новая модель', async () => {
    оболочка();
    const tr = await мост();
    const m = последняя('bridge');
    expect(m.done.title).toBeTruthy();
    expect(m.done.errors).toBe(2);
    expect(m.next.route).toBe('/games/n-back');
    expect(m.next.nameKey).toBeTruthy();
    expect(m.seconds).toBe(5);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(последняя('bridge').seconds).toBe(4);
    await act(async () => { tr.unmount(); });
  });

  it('🔴 «Остановить» оболочки переспрашивает и только потом останавливает — взвод через 800 мс', async () => {
    оболочка();
    const tr = await мост();
    await act(async () => { w.__psyWarmupUi.bridge.stopAsk(); });
    expect(последняя('bridge').ask).toBeNull();   // палец с итога игры не стирает серию
    await act(async () => { jest.advanceTimersByTime(900); });
    await act(async () => { w.__psyWarmupUi.bridge.stopAsk(); });
    expect(последняя('bridge').ask).toBeTruthy();
    await act(async () => { w.__psyWarmupUi.bridge.stopConfirm(); });
    expect(mockStopWarmup).toHaveBeenCalledWith(false);
    await act(async () => { tr.unmount(); });
  });

  it('«Старт сейчас» оболочки — страница уходит на следующую игру', async () => {
    оболочка();
    const tr = await мост();
    mockReplace.mockClear();
    await act(async () => { w.__psyWarmupUi.bridge.start(); });
    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/games/n-back' }));
    await act(async () => { tr.unmount(); });
  });

  it('без оболочки мост ничего не шлёт', async () => {
    const tr = await мост();
    expect(posted).toHaveLength(0);
    expect(w.__psyWarmupUi?.bridge).toBeUndefined();
    await act(async () => { tr.unmount(); });
  });
});

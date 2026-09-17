/* psygames-warmup-skipped-step-and-mode-names · VER 1 · 17.09.2026 */
/**
 * МОСТ ПОСЛЕ ПРОПУСКА ГОВОРИТ «ПРОПУЩЕНО», А ШАГИ-ГОЛОВОЛОМКИ НАЗВАНЫ СВОИМ РЕЖИМОМ.
 *
 * 📍 17.09.2026, «Не спится» живьём (экспорт ветки, WebKit 390×844, nzt48): шаг 1 «Сеть»
 * пропущен — мост пишет «✓ СЫГРАНО · 1/5» и «Чёт-нечет»; в итоге «Пропущено: Чёт-нечет».
 * Две причины:
 *   · мост брал ПОСЛЕДНИЙ результат, а не результат этого шага: после сыгранной игры и
 *     пропуска следующей он показал бы очки прошлой партии под именем пропущенной;
 *   · имя шага искалось по `game_id`, а у 42 головоломок одна карточка каталога (`puzzles` →
 *     `puzzlesUnruly`). Правило имени по режиму — `services/stepName.ts` (координатор, bd9d3912).
 *
 * Монтируются настоящие мост, итог и провайдер зарядки:
 *   · провайдер ставит результату номер шага;
 *   · мост: пропуск после сыгранной игры — «Пропущено», имя режима, чужого времени нет;
 *     контроль — сыгранный шаг с его временем; следующий шаг и кнопка пропуска — имя режима;
 *   · итог: «Пропущено» по номерам шагов — имя режима и повторяющаяся игра, сыгранная один раз.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import WarmupBridge from '@/app/warmup-bridge';
import WarmupComplete from '@/app/warmup-complete';
import { WarmupProvider, useWarmup } from '@/src/contexts/WarmupContext';
import { ключИмениШага } from '@/src/services/stepName';

declare function require(id: string): any;

let mockWarmup: any = null;
const mockReplace = jest.fn();
let mockListener: ((s: any) => Promise<void> | void) | null = null;

/* Мост и итог получают подменённую зарядку; провайдер в третьем блоке — настоящий
   (`jest.requireActual`), подмена отдаёт его, пока `mockWarmup` не задан. */
jest.mock('@/src/contexts/WarmupContext', () => {
  const настоящий = jest.requireActual('@/src/contexts/WarmupContext');
  return { ...настоящий, useWarmup: () => mockWarmup ?? настоящий.useWarmup() };
});
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
jest.mock('@/src/services/api', () => ({ getSessions: async () => [], setSessionListener: (fn: any) => { mockListener = fn; } }));
jest.mock('@/src/services/feedback', () => ({ fbCorrect: () => {}, fbComplete: () => {} }));
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

const шаг = (id: string, route: string, mode?: string) => ({ game_id: id, game_route: route, est_duration_sec: 60, ...(mode ? { mode } : {}) });
const ПАРЫ = шаг('word_pairs', '/games/word-pairs', '4 pairs');
const СЕТЬ = шаг('puzzles', '/games/puzzles', 'Net');
const РЕЛЬСЫ = шаг('puzzles', '/games/puzzles', 'Train Tracks');
const КОРСИ = шаг('corsi', '/games/corsi');
const набор = (steps: any[], over: any = {}) => ({
  duration_min: 5, weekday: 4, weekday_name: 'ЧТ', track: 'training', track_label: 'тренировка',
  steps, est_total_sec: 300, slot: 'day', вид: 'слот', ...over,
});
const результат = (id: string, номер: number, сек: number) => ({ game_type: id, score: 10, time_seconds: сек, errors: 0, шаг: номер });

const всеТексты = (tr: TestRenderer.ReactTestRenderer): string =>
  tr.root.findAll((n: any) => Array.isArray(n.props?.children) || typeof n.props?.children === 'string' || typeof n.props?.children === 'number')
    .flatMap((n: any) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children]))
    .filter((c: any) => typeof c === 'string' || typeof c === 'number').join(' ');

async function мост(meta: any, currentIdx: number, results: any[]): Promise<string> {
  mockWarmup = {
    meta, results, currentIdx, currentStep: meta.steps[currentIdx] ?? null, active: true, overtime: false,
    startTime: Date.now(), stopWarmup: async () => {}, skipCurrent: jest.fn(),
  };
  let tr!: TestRenderer.ReactTestRenderer;
  await act(async () => { tr = TestRenderer.create(<WarmupBridge />); });
  const текст = всеТексты(tr);
  await act(async () => { tr.unmount(); });
  return текст;
}

afterEach(() => { mockWarmup = null; });

describe('мост: пропущенный шаг и имя режима', () => {
  it('🔴 «Пары слов» сыграны, «Сеть» пропущена — мост пишет «Пропущено» и «Сеть», без времени «Пар слов»', async () => {
    const текст = await мост(набор([ПАРЫ, СЕТЬ, КОРСИ]), 2, [результат('word_pairs', 0, 50)]);
    expect([
      `пропущено ${текст.includes('skippedNamed') ? 1 : 0}`, `сыграно ${текст.includes('bridgeJustPlayed') ? 1 : 0}`,
      `имя ${текст.includes('puzzlesNet') ? 'режима' : текст.includes('puzzlesUnruly') ? 'карточки' : 'нет'}`,
      `чужое время ${текст.includes('50.0') ? 1 : 0}`,
    ].join(' · ')).toBe('пропущено 1 · сыграно 0 · имя режима · чужое время 0');
  });

  it('контроль: сыгранный шаг — «Сыграно», его имя и его время', async () => {
    const текст = await мост(набор([ПАРЫ, СЕТЬ, КОРСИ]), 1, [результат('word_pairs', 0, 50)]);
    expect(`пропущено ${текст.includes('skippedNamed') ? 1 : 0} · сыграно ${текст.includes('bridgeJustPlayed') ? 1 : 0} · время ${текст.includes('50.0') ? 1 : 0}`)
      .toBe('пропущено 0 · сыграно 1 · время 1');
  });

  it('🔴 следующий шаг «Сеть»: на карточке «Дальше» и на кнопке пропуска — имя режима, не «Чёт-нечет»', async () => {
    const текст = await мост(набор([ПАРЫ, СЕТЬ, КОРСИ]), 1, [результат('word_pairs', 0, 50)]);
    // Каждый <Text> виден в дереве дважды (составной и host) — считаем места, а не вхождения.
    expect(`кнопка пропуска ${текст.includes('skipGameNamed puzzlesNet') ? 'по режиму' : 'нет'} · режим на карточке ${текст.includes('puzzlesNet') ? 1 : 0} · общая карточка ${текст.includes('puzzlesUnruly') ? 1 : 0}`)
      .toBe('кнопка пропуска по режиму · режим на карточке 1 · общая карточка 0');
  });
});

describe('итог: «Пропущено» по номерам шагов', () => {
  it('🔴 пропущены «Сеть» и «Рельсы» — названы своими режимами; повторяющийся «Корси», сыгранный раз, назван', async () => {
    const meta = набор([СЕТЬ, КОРСИ, ПАРЫ, КОРСИ, РЕЛЬСЫ]);
    mockWarmup = {
      meta, results: [результат('corsi', 1, 30), результат('word_pairs', 2, 40)], startTime: Date.now() - 60_000,
      stopWarmup: async () => {}, startPlaylist: jest.fn(),
    };
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<WarmupComplete />); });
    const узел = tr.root.findAll((n: any) => Array.isArray(n.props?.children) && n.props.children[0] === 'skippedNamed')[0];
    const строка = узел ? String(узел.props.children[2]) : '(строки «Пропущено» нет)';
    await act(async () => { tr.unmount(); });
    expect(строка).toBe([СЕТЬ, КОРСИ, РЕЛЬСЫ].map((ш) => ключИмениШага(ш)).join(', '));
    expect(строка).not.toContain('puzzlesUnruly');
  });
});

describe('провайдер: результат знает номер своего шага', () => {
  it('🔴 партия на шаге 2 записана с шаг: 2', async () => {
    jest.useFakeTimers();
    let ctx: any = null;
    function Probe() {
      const c = useWarmup();
      React.useEffect(() => { ctx = c; });
      return null;
    }
    let tr!: TestRenderer.ReactTestRenderer;
    await act(async () => { tr = TestRenderer.create(<WarmupProvider><Probe /></WarmupProvider>); });
    await act(async () => { ctx.startPlaylist(набор([ПАРЫ, СЕТЬ, КОРСИ])); });
    await act(async () => { ctx.skipCurrent(); });
    await act(async () => { jest.advanceTimersByTime(900); });
    await act(async () => { ctx.skipCurrent(); });
    await act(async () => { jest.advanceTimersByTime(10); });
    await act(async () => { await mockListener!({ game_type: 'corsi', score: 7, time_seconds: 30, errors: 0, details: {} }); });
    expect(`шаг ${ctx.currentIdx} · результатов ${ctx.results.length} · номер ${ctx.results[0]?.шаг}`).toBe('шаг 2 · результатов 1 · номер 2');
    await act(async () => { tr.unmount(); });
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});

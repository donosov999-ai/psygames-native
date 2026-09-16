/* psygames-streak-badge-leaves-the-hud · VER 1 · 17.09.2026 */
/**
 * ЗНАЧОК СЕРИИ НЕ ВХОДИТ В ПОЛОСУ СЧЁТЧИКОВ — ПОЛЕ НЕ ПРЫГАЕТ ПОСРЕДИ ПАРТИИ.
 *
 * 📍 Задача cca5f572, замер «Внимания» 16.09.2026: после второго верного ответа подряд
 * каркас клал «🔥 2» в плашку счётчиков, ряд с `flexWrap` переносился, и поле уезжало на
 * 54 точки вниз (5 экранов из 11 при 390×844), а на ошибке возвращалось.
 *
 * Проба монтирует настоящий каркас с четырьмя счётчиками и шлёт события игры:
 *   · после двух «верно» в плашке `game-stats` нет значка с огнём, а длина серии ушла
 *     в общее хранилище (`gameStreakNow`) — оттуда её рисует угол питомца;
 *   · ошибка обнуляет серию, уход с экрана — тоже.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { gameGood, gameBad } from '@/src/services/gameEvents';
import { gameStreakNow, setGameStreak } from '@/src/services/petMood';
import { __resetGameClock } from '@/src/services/gamePause';

jest.mock('@/src/hooks/useExitGuard', () => ({ useExitGuard: () => ({ asking: false, requestExit: jest.fn(), stay: jest.fn(), confirmExit: jest.fn() }) }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/flanker', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { View } = require('react-native');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', surface: '#fff', card: '#eee', border: '#ccc', text: '#000', textSecondary: '#666', primary: '#07c' } }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmupSafe: () => null }));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/feedback', () => ({
  sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
  soundOn: () => true, hapticEnabledNow: () => true, setSoundEnabled: () => {}, setHapticEnabled: () => {},
}));
jest.mock('@/src/services/streak', () => ({ bumpBestStreak: () => Promise.resolve() }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

const HUD = [
  { key: 'level', icon: 'trending-up', label: 'Уровень', value: '3' },
  { key: 'correct', icon: 'checkmark', label: 'Верно', value: 5 },
  { key: 'errors', icon: 'close', label: 'Ошибки', value: 1 },
  { key: 'time', icon: 'time', label: 'Время', value: '0:24' },
];

afterEach(() => { setGameStreak(0); __resetGameClock(); });

/** Значок с огнём внутри плашки счётчиков — ровно то, что переносило ряд. */
const огоньВПлашке = (tr: TestRenderer.ReactTestRenderer): number => {
  const плашка = tr.root.findAll((n: any) => n.props?.testID === 'game-stats')[0];
  return плашка ? плашка.findAll((n: any) => n.props?.icon === 'flame').length : -1;
};

describe('значок серии не переносит полосу счётчиков', () => {
  it('🔴 две «верно» подряд: в плашке огня нет, серия ушла в хранилище угла питомца', () => {
    let tr!: TestRenderer.ReactTestRenderer;
    act(() => { tr = TestRenderer.create(<GameShell title="Фланкер" onBack={() => {}} hud={HUD as any}><Text>поле</Text></GameShell>); });
    act(() => { gameGood(); });
    act(() => { gameGood(); });
    expect(`огня в плашке: ${огоньВПлашке(tr)}, серия: ${gameStreakNow()}`).toBe('огня в плашке: 0, серия: 2');
    act(() => { gameBad(); });
    expect(gameStreakNow()).toBe(0);
    act(() => { gameGood(); gameGood(); gameGood(); });
    expect(gameStreakNow()).toBe(3);
    act(() => { tr.unmount(); });
    expect(`после ухода с экрана: ${gameStreakNow()}`).toBe('после ухода с экрана: 0');
  });

  it('свой питомец у экрана — серия в угол не уходит, как не показывалась и в плашке', () => {
    let tr!: TestRenderer.ReactTestRenderer;
    act(() => { tr = TestRenderer.create(<GameShell title="Фланкер" onBack={() => {}} hud={HUD as any} pet="idle"><Text>поле</Text></GameShell>); });
    act(() => { gameGood(); gameGood(); });
    expect(gameStreakNow()).toBe(0);
    act(() => { tr.unmount(); });
  });
});

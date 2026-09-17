/* psygames-warmup-position-rendered · VER 1 · 17.09.2026 */
/**
 * «ИГРА n ИЗ m» РИСУЕТСЯ В ШАПКЕ ПАРТИИ, КОГДА ИДЁТ ЗАРЯДКА — ПРОВЕРКА ПОВЕДЕНИЕМ.
 *
 * 📍 Отчёт 5f4eac8e (08.09.2026, iOS 2.51.0): «Сколько всего серия длится? Нужно визуальное
 * отображение, где находимся. Я таблиц 7 решил, сколько ещё?» Починка de1215709 (в метке
 * v2.52.12) поставила счётчик в шапку каркаса. Её проба `warmup-position-in-game` читает
 * исходник и гоняет КОПИЮ правила — задача b4076ccf, заведённая 16.09 по грепу ключа
 * `warmupStepOf`, этого счётчика не увидела: он пишется через `unitGames`, а не через тот ключ.
 *
 * Здесь каркас монтируется по-настоящему с поданным состоянием зарядки и считается то,
 * что нарисовано: шаг 2 из 3 → «2/3», подпись для скринридера словами; серии нет или шаг
 * один → счётчика нет.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';

declare function require(id: string): any;

let mockWarmup: any = null;
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmupSafe: () => mockWarmup }));
jest.mock('@/src/hooks/useExitGuard', () => ({
  useExitGuard: () => ({ asking: false, requestExit: () => {}, stay: () => {}, confirmExit: () => {} }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/games/proofreading', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/feedback', () => ({
  sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
  soundOn: () => true, hapticEnabledNow: () => true, setSoundEnabled: () => {}, setHapticEnabled: () => {},
}));
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {}, setGameStreak: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

const шаг = (id: string) => ({ game_id: id, game_route: `/games/${id}`, difficulty: 'easy', est_duration_sec: 60 });

/** Что нарисовано в счётчике серии: текст и подпись, или «нет». */
function счётчик(): string {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Корректура" onBack={() => {}}>
        <Text>поле</Text>
      </GameShell>,
    );
  });
  const узлы = tr.root.findAll((n: any) => n.props?.testID === 'warmup-position' && typeof n.type === 'string');
  const текст = узлы.length === 0 ? '' : узлы[0].findAll((n: any) => n.type === 'Text').map((n: any) => n.props.children).join('');
  const итог = узлы.length === 0 ? 'нет' : `${текст} · ${узлы[0].props.accessibilityLabel}`;
  act(() => { tr.unmount(); });
  return итог;
}

describe('счётчик серии в шапке партии', () => {
  afterEach(() => { mockWarmup = null; });

  it('🔴 идёт зарядка, шаг 2 из 3 — в шапке «2/3», подпись словами', () => {
    const steps = [шаг('schulte'), шаг('proofreading'), шаг('stroop')];
    mockWarmup = { active: true, meta: { steps }, currentIdx: 1, currentStep: steps[1], skipCurrent: () => {} };
    expect(счётчик()).toBe('2/3 · unitGames: 2/3');
  });

  it('🔴 зарядки нет — счётчика нет', () => {
    mockWarmup = null;
    expect(счётчик()).toBe('нет');
  });

  it('шаг один — это не серия, счётчика нет', () => {
    const steps = [шаг('proofreading')];
    mockWarmup = { active: true, meta: { steps }, currentIdx: 0, currentStep: steps[0], skipCurrent: () => {} };
    expect(счётчик()).toBe('нет');
  });
});

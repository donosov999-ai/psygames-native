/** Real PuzzlesScreen/useGamePreset/usePersistentLevel/API, mocked external
 * puzzle engine and presentation only. Victory eligibility stays in the screen. */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PuzzlesScreen from '@/app/games/puzzles';
import { getSessions } from '@/src/services/api';
import { resetLevelCacheForTests } from '@/src/services/levelCache';

declare function require(id: string): any;
const { LocalRouteParamsContext } = require('expo-router/build/Route');
const { create, act } = require('react-test-renderer');
const mockSteps = [{ индекс: 0, имя: 'Easy 4x4', параметры: '4de' }, { индекс: 1, имя: 'Hard 5x5', параметры: '5dh' }];
const mockBoard = (status: number, position = 'start') => ({
  ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: [],
  статус: status, ход: null, подорвался: false, тупик: status < 0, position,
});
let mockNextStatus = 1;
const mockTeach = jest.fn((_input: any) => [{
  нажатия: [{ x: 1, y: 1 }], рамки: [], текст: () => 'lesson', приём: 'one-step',
}]);
jest.mock('@/src/games/tatham-bridge', () => ({
  движки: async () => [{ индекс: 0, имя: 'Towers', решаем: true, ступени: mockSteps }], доскаСтрок: () => [],
}));
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: async () => mockBoard(0),
  клавиша: async () => ({ партия: mockBoard(mockNextStatus, 'played'), подействовало: true }),
  нажать: async () => ({ партия: mockBoard(1, 'lesson-finished'), подействовало: true }),
  решить: async () => mockBoard(1, 'solved'), отменить: async () => mockBoard(0),
  указатель: jest.fn(), стрелка: jest.fn(),
}));
jest.mock('@/src/games/tatham-bridge/teach', () => ({
  УЧИТЕЛЯ: { Towers: { нуженРешатель: false, урок: (...args: any[]) => (mockTeach as any)(...args) } },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: require('expo-router/build/hooks/useLocalSearchParams').useLocalSearchParams,
}));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'alice' } }) }));
jest.mock('@/src/contexts/ThemeContext', () => ({ useTheme: () => ({ colors: {
  background: '#fff', bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0', surface: '#fff',
} }) }));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/services/supabase', () => ({ getSupabase: () => null, SUPABASE_TABLE: 'unused' }));
jest.mock('@/src/services/earn', () => ({ recordRound: async () => {} }));
jest.mock('@/src/services/cleanRun', () => ({ tickCleanRun: async () => {} }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaView: require('react-native').View, SafeAreaProvider: ({ children }: any) => children,
}));
jest.mock('@/src/components/GameShell', () => ({
  __esModule: true,
  default: ({ children, overlay }: any) => require('react').createElement(require('react-native').View, null, children, overlay),
}));
jest.mock('@/src/components/LevelCleared', () => ({
  __esModule: true, default: (props: any) => require('react').createElement('LevelCleared', props),
}));
jest.mock('@/src/components/LessonPlayer', () => ({
  __esModule: true, длительностьШага: () => 1000,
  default: (props: any) => props.visible ? require('react').createElement('LessonPlayer', props) : null,
}));

const g = globalThis as any;
const w = window as any;
const trainingKey = 'psygames_puzzles_towers_warmup_level_alice';
const personalKey = 'psygames_puzzles_towers_level_alice';
let trees: any[] = [];
let oldLocation: PropertyDescriptor | undefined;
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

async function mount() {
  let tree: any;
  await act(async () => { tree = create(React.createElement(LocalRouteParamsContext.Provider,
    { value: { wu: '1', progress: '1', auto: '1', mode: 'Towers' } }, React.createElement(PuzzlesScreen))); });
  trees.push(tree);
  await settle();
  return tree;
}
async function press(tree: any, label: string) {
  const button = tree.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  expect(button).toBeTruthy();
  await act(async () => { button.props.onPress(); });
  await settle();
}
beforeEach(async () => {
  await AsyncStorage.clear(); resetLevelCacheForTests();
  mockNextStatus = 1; mockTeach.mockClear();
  g.__psygames_active_profile_id = 'alice';
  oldLocation = Object.getOwnPropertyDescriptor(w, 'location');
  Object.defineProperty(w, 'location', { configurable: true, value: {
    pathname: '/games/puzzles', search: '?wu=1&progress=1&auto=1&mode=Towers', origin: 'http://localhost',
  } });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  delete g.__psygames_active_profile_id;
  if (oldLocation) Object.defineProperty(w, 'location', oldLocation); else delete w.location;
  jest.restoreAllMocks();
});

test('real screen counted victory advances L1 -> L2 and reopens there, without touching personal', async () => {
  const tree = await mount();
  await press(tree, '1');
  expect(tree.root.findByType('LevelCleared').props).toMatchObject({ level: 1, passed: true });
  expect(await AsyncStorage.getItem(trainingKey)).toBe('2');
  expect(await AsyncStorage.getItem(personalKey)).toBeNull();
  expect((await getSessions())[0]).toMatchObject({ passed: true, details: { warmup_progress: true } });
  await act(async () => { tree.unmount(); }); trees = [];
  resetLevelCacheForTests();
  const reopened = await mount();
  await press(reopened, '1');
  expect(reopened.root.findByType('LevelCleared').props.level).toBe(2);
  expect(await AsyncStorage.getItem(trainingKey)).toBe('3');
});

test('teacher uses the current played position; completing the lesson does not advance', async () => {
  const tree = await mount();
  mockNextStatus = 0;
  await press(tree, '1'); // a real user move before requesting the lesson
  await press(tree, 'teachButton');
  expect(mockTeach.mock.calls[0][0]).toMatchObject({ партия: { position: 'played', статус: 0 } });
  const lesson = tree.root.findByType('LessonPlayer');
  await act(async () => { await lesson.props.onДальше(); });
  await settle();
  expect(tree.root.findAllByType('LevelCleared')).toHaveLength(0);
  expect(await AsyncStorage.getItem(trainingKey)).toBe('1');
  expect(await AsyncStorage.getItem(personalKey)).toBeNull();
  expect((await getSessions())[0]).toMatchObject({ passed: false, details: { solver_used: true, warmup_progress: true } });
});

test('showing the solution is not a counted win even though the engine returns solved status', async () => {
  const tree = await mount();
  await press(tree, 'puzzleShowSolution');
  expect(await AsyncStorage.getItem(trainingKey)).toBe('1');
  expect((await getSessions())[0]).toMatchObject({ passed: false, details: { solver_used: true, warmup_progress: true } });
});

test('terminal failure in the real screen keeps its training step', async () => {
  await AsyncStorage.setItem(trainingKey, '3');
  const tree = await mount();
  mockNextStatus = -1;
  await press(tree, '1');
  expect(tree.root.findByType('LevelCleared').props.passed).toBe(false);
  expect(await AsyncStorage.getItem(trainingKey)).toBe('3');
  expect((await getSessions())[0]).toMatchObject({ passed: false, details: { warmup_progress: true } });
});

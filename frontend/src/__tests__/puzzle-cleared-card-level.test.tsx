/* psygames-puzzle-cleared-card-level · VER 1 · 17.09.2026 */
/**
 * 🔴 КАРТОЧКА ИТОГА НАЗЫВАЕТ СЫГРАННЫЙ УРОВЕНЬ, А НЕ ТОТ, ДО КОТОРОГО ПОДНЯЛИ.
 *
 * 📍 ПОВОД. Проход семи сеток раздела «Судоку» касаниями в WebKit на окне iPhone 390×844,
 * 17.09.2026, сборка fc931c9c. Прошёл ПЕРВУЮ ступень «Судоку Тэтхэма» (шапка «1/5», доска
 * `3x3db`) — карточка: «Уровень 2 пройден!» и «Уровень 3 запускается…», на карте отмечены
 * 1 и 2, котик на тройке. Раздали после этого ВТОРУЮ ступень (шапка «2/5», доска `3x3di`).
 * То же на всех семи играх, первый уровень каждой.
 *
 * ПОЧЕМУ. Эффект конца партии сначала зовёт `lvl.reach(lvl.level + 1)` — тот сразу ставит
 * уровень 2, — и только потом `setФаза('cleared')`. Карточка рисуется уже на следующем
 * кадре и читала `level={lvl.level}`, то есть двойку. Общий экран — значит, у всех сорока.
 *
 * ⚠️ Проба смотрит на то, что экран ОТДАЁТ карточке и что раздаёт после неё, а не на
 * исходник: условие «карточка + 1 = следующая раздача» ломается при любой причине сдвига.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PuzzlesScreen from '@/app/games/puzzles';
import { лестницаДвижка } from '@/src/games/tatham-bridge/names';
import { открыть } from '@/src/games/tatham-bridge/play';

const mockAuthorSteps = [{ индекс: 0, имя: 'Easy 4x4', параметры: '4de' }, { индекс: 1, имя: 'Hard 5x5', параметры: '5dh' }];
/**
 * ⚠️ КАЖДАЯ ПРОБА НА СВОЁМ РЕЖИМЕ. Уровень помнит не только AsyncStorage, но и память модуля
 * (`levelCache.ts`), и `AsyncStorage.clear()` её не сбрасывает: вторая проба на том же режиме
 * стартовала со ступени, до которой дошла первая. Свой режим — свой ключ уровня.
 */
let mockMode = 'Towers';

jest.mock('@/src/games/tatham-bridge', () => ({
  движки: () => Promise.resolve(['Towers', 'Unequal', 'Keen'].map((имя, индекс) => ({ индекс, имя, умеетТекстом: false, решаем: true, ступени: mockAuthorSteps }))),
  доскаСтрок: () => [],
}));
const mockПартия = (статус: number) => ({ ширина: 100, высота: 100, палитра: ['rgb(255,255,255)'], примитивы: [], статус, ход: null, подорвался: false, тупик: false });
jest.mock('@/src/games/tatham-bridge/play', () => ({
  открыть: jest.fn(async () => mockПартия(0)),
  // Любая цифра решает доску: нас занимает, что экран делает ПОСЛЕ победы.
  клавиша: jest.fn(async () => ({ партия: mockПартия(1), подействовало: true })),
  указатель: jest.fn(), стрелка: jest.fn(), отменить: jest.fn(), решить: jest.fn(),
}));
jest.mock('@/src/hooks/useGamePreset', () => ({
  useGamePreset: () => ({ isPreset: false, isCalm: false, autostart: true }),
  useAutostartWhenReady: () => {},
}));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#fff', bg: '#fff', text: '#000', textSecondary: '#666', card: '#eee', border: '#ccc', primary: '#7c6cf0', surface: '#fff' }, isDark: false }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'free' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ mode: mockMode }),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Каркас подменён: нужны шапка (что показано игроку как «N/M») и слой поверх поля. */
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View, Text } = require('react-native');
  return { __esModule: true, default: ({ hud, overlay, children }: any) => React.createElement(View, null,
    (hud ?? []).map((п: any) => React.createElement(Text, { key: п.key }, `${п.key}=${п.value}`)), children, overlay) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
/** Карточка подменена узлом с теми же пропами: её текст строится из `level` внутри неё. */
jest.mock('@/src/components/LevelCleared', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, default: (p: any) => React.createElement('LevelCleared', p) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => д.unmount()); });
  await AsyncStorage.clear();
  (открыть as jest.Mock).mockClear();
});

const лестница = (режим: string) => лестницаДвижка(режим, mockAuthorSteps);

async function дождаться(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
}
function шапка(дерево: any): string {
  const узел = дерево.root.findAll((n: any) => typeof n.props?.children === 'string' && n.props.children.startsWith('level=')).at(0);
  return узел ? узел.props.children.slice('level='.length) : '—';
}
const параметрыРаздачи = () => (открыть as jest.Mock).mock.calls.at(-1)?.[1];

/** Победа нажатием цифры — тем же путём, что палец: `onPress` клавиши ряда. */
async function выиграть(дерево: any): Promise<any> {
  const клавиша = дерево.root.findAll((n: any) => n.props?.accessibilityLabel === '1' && typeof n.props.onPress === 'function').at(0);
  expect(клавиша).toBeTruthy();
  await TestRenderer.act(async () => { клавиша.props.onPress(); });
  await дождаться();
  const карточки = дерево.root.findAll((n: any) => n.type === 'LevelCleared');
  expect(карточки).toHaveLength(1);
  return карточки[0];
}

async function партия(режим: string): Promise<any> {
  mockMode = режим;
  let дерево: any;
  await TestRenderer.act(async () => { дерево = TestRenderer.create(React.createElement(PuzzlesScreen)); });
  деревья.push(дерево);
  await дождаться();
  return дерево;
}

describe('карточка итога головоломки называет сыгранный уровень', () => {
  it('у всех трёх режимов своя лестница длиннее трёх — иначе проба мерила бы край', () => {
    expect(['Towers', 'Unequal', 'Keen'].map((р) => `${р} ${лестница(р).length > 3}`)).toEqual(['Towers true', 'Unequal true', 'Keen true']);
  });

  it('🔴 первая ступень: карточка «1», следующей раздают вторую', async () => {
    const Л = лестница('Towers');
    const д = await партия('Towers');
    expect(`шапка ${шапка(д)} · доска ${параметрыРаздачи()}`).toBe(`шапка 1/${Л.length} · доска ${Л[0].параметры}`);
    const карточка = await выиграть(д);
    // Пропсы узла живые: после «Дальше» карточки нет, поэтому число снимается ДО продолжения.
    const { level: пройден, passed: засчитан, onContinue: дальше } = карточка.props;
    expect(`пройден ${пройден}, засчитан ${засчитан}`).toBe('пройден 1, засчитан true');
    await TestRenderer.act(async () => { дальше(); });
    await дождаться();
    // Обещание карточки «Уровень N+1 запускается» обязано совпасть с тем, что раздали.
    expect(`шапка ${шапка(д)} · доска ${параметрыРаздачи()}`).toBe(`шапка ${пройден + 1}/${Л.length} · доска ${Л[1].параметры}`);
  });

  it('🔴 две победы подряд: карточки «1», потом «2», раздача идёт за ними', async () => {
    const д = await партия('Unequal');
    const { level: перваяУр, onContinue: дальше1 } = (await выиграть(д)).props;
    await TestRenderer.act(async () => { дальше1(); });
    await дождаться();
    const { level: втораяУр, onContinue: дальше2 } = (await выиграть(д)).props;
    expect(`${перваяУр} → ${втораяУр}`).toBe('1 → 2');
    await TestRenderer.act(async () => { дальше2(); });
    await дождаться();
    expect(параметрыРаздачи()).toBe(лестница('Unequal')[2].параметры);
  });

  it('🔴 сохранённая третья ступень: доска третьей, карточка «3»', async () => {
    await AsyncStorage.setItem('psygames_puzzles_keen_level_free', '3');
    const д = await партия('Keen');
    expect(параметрыРаздачи()).toBe(лестница('Keen')[2].параметры);
    const карточка = await выиграть(д);
    expect(карточка.props.level).toBe(3);
  });
});

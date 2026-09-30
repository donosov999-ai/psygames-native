/**
 * 🔴 ПУСТАЯ ПОЛОСА ПОКАЗАТЕЛЕЙ НЕ СЪЕДАЕТ ЭКРАН.
 *
 * Замер раздела «Зарядки и серии» 23.09.2026 (экспорт main 165f5e6d, WebKit 390×844,
 * маршрут `/games/pause`): полоса `game-hud` 390×61, плашка внутри схлопнулась до 18×8 —
 * белый огрызок без текста, а между заголовком и содержимым 79 px пустоты, 9,4 % экрана.
 * Забота об этом случае в каркасе БЫЛА (`statsPlateBare` сжимал плашку), но внешний
 * контейнер держал `minHeight` и место съедалось всё равно.
 *
 * ⚠️ Проба смотрит на НАЛИЧИЕ узла, а не на стиль: стиль перепишут, а вопрос «занимает ли
 * полоса место, когда показывать нечего» останется тем же.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';

declare function require(id: string): any;

const mockGuard = { asking: false, requestExit: jest.fn(), stay: jest.fn(), confirmExit: jest.fn() };
jest.mock('@/src/hooks/useExitGuard', () => ({ useExitGuard: () => mockGuard }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/sudoku', useRouter: () => ({ push: () => {}, back: () => {} }) }));
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
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmupSafe: () => null }));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => `${k}·т`, language: 'ru' }),
}));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
/**
 * ⚠️ ПОДМЕНА ОБЯЗАНА ОТДАВАТЬ ВСЁ, ЧТО КАРКАС ЗОВЁТ. С появлением пункта «тихий
 * режим» (10.09.2026) `GameShell` читает `soundOn`/`hapticEnabledNow` и пишет
 * `setSoundEnabled`/`setHapticEnabled`. Неполная подмена валила ВЕСЬ набор с
 * `soundOn is not a function` — семь проб разом, и ни одна из них не про звук.
 */
jest.mock('@/src/services/feedback', () => {
  // ⚠️ Состояние держим ВНУТРИ фабрики: jest не пускает в неё внешние переменные.
  let звук = true;
  return {
    sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
    soundOn: () => звук, hapticEnabledNow: () => звук,
    setSoundEnabled: (v: boolean) => { звук = v; }, setHapticEnabled: () => {},
  };
});
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {}, setGameStreak: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));


const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted.length = 0;
});

function смонтировать(props: Record<string, unknown>) {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Пауза" onBack={() => {}} {...(props as any)}>
        <Text testID="поле">поле</Text>
      </GameShell>,
    );
  });
  mounted.push(tr);
  return tr;
}
const есть = (tr: TestRenderer.ReactTestRenderer, id: string) => tr.root.findAllByProps({ testID: id }).length > 0;

describe('полоса показателей', () => {
  it('🔴 экрану без счётчиков полоса не рисуется вовсе', () => {
    const tr = смонтировать({});
    expect(есть(tr, 'поле')).toBe(true);        // экран поднялся — проверять есть что
    expect(есть(tr, 'game-hud')).toBe(false);
  });

  it('🔴 со счётчиками полоса на месте — правило не сломано', () => {
    const tr = смонтировать({ hud: [{ key: 'level', label: 'Уровень', value: '3' }] });
    expect(есть(tr, 'game-hud')).toBe(true);
    expect(есть(tr, 'game-stats')).toBe(true);
  });

  it('модификаторы без счётчиков — тоже повод показать полосу', () => {
    const tr = смонтировать({ mods: [{ key: 'calm', icon: 'moon', label: 'тихий режим' }] });
    expect(есть(tr, 'game-hud')).toBe(true);
  });

  it('прежняя вёрстка `stats` держит полосу так же, как раньше', () => {
    const tr = смонтировать({ stats: <Text>3/10</Text> });
    expect(есть(tr, 'game-hud')).toBe(true);
  });

  it('🔴 при заданном frame полосу НЕ прячем: её высота посчитана в раскладке поля', () => {
    const tr = смонтировать({ frame: { stats: 61, top: 0 } });
    expect(есть(tr, 'game-hud')).toBe(true);
  });
});

/* psygames-gate-pause-menu-fullscreen · VER 2 · 17.09.2026 */
/**
 * ПУНКТ «ПОЛНОЭКРАННЫЙ РЕЖИМ» В МЕНЮ ПАУЗЫ — У ЭКРАНА, КОТОРЫЙ ЕГО ОБЪЯВИЛ.
 *
 * Меню паузы общее, его собирает каркас для всех игр. С 17.09.2026 (решение Дениса «делай на все») полный
 * экран объявляет САМ каркас — у каждой игры (`immersive`, по умолчанию да), поэтому пункт есть у всех. Экран,
 * которому панели нужны (`immersive={false}`), режим не объявляет — и пункта у него нет: кнопка, от которой
 * ничего не меняется, хуже отсутствующей.
 *
 * Проба монтирует каркас, открывает меню стрелкой «назад» и смотрит на пункт; потом
 * нажимает его и проверяет, что выбор ушёл в службу и подпись сменилась.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { __resetGameClock } from '@/src/services/gamePause';
import { __resetImmersive, declareImmersiveCapable, immersiveEnabled } from '@/src/services/immersive';

declare function require(id: string): any;

const mockGuard = { asking: false, requestExit: jest.fn(), stay: jest.fn(), confirmExit: jest.fn() };
jest.mock('@/src/hooks/useExitGuard', () => ({ useExitGuard: () => mockGuard }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/number-run', useRouter: () => ({ push: () => {}, back: () => {} }) }));
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
  useLanguage: () => ({ t: (k: string) => k, language: 'ru' }),
}));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/feedback', () => ({
  sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
  soundOn: () => true, hapticEnabledNow: () => true,
  setSoundEnabled: () => {}, setHapticEnabled: () => {},
}));
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {}, setGameStreak: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));

const смонтированные: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { смонтированные.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  смонтированные.length = 0;
  __resetGameClock();
  __resetImmersive();
});

function открытьМеню(immersive?: boolean): TestRenderer.ReactTestRenderer {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Числовой забег" onBack={() => {}} immersive={immersive}>
        <Text>поле</Text>
      </GameShell>,
    );
  });
  смонтированные.push(tr);
  act(() => { tr.root.findAllByProps({ testID: 'game-back' })[0].props.onPress(); });
  return tr;
}

/** Композит пункта (у него есть onPress), а не хост-узел под ним. */
const пункт = (tr: TestRenderer.ReactTestRenderer) =>
  tr.root.findAll((n) => n.props?.testID === 'pause-action:fullscreen' && typeof n.props?.onPress === 'function')[0];

const подписьПункта = (tr: TestRenderer.ReactTestRenderer): string => {
  const узел = пункт(tr);
  if (!узел) return '—';
  const тексты = узел.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children as string);
  return тексты.find((s) => s.startsWith('pauseFullscreen')) ?? '?';
};

describe('меню паузы: полноэкранный режим', () => {
  it('🔴 экран без полноэкранного режима (`immersive={false}`) — пункта нет', () => {
    const tr = открытьМеню(false);
    expect(`пункт: ${подписьПункта(tr)}`).toBe('пункт: —');
  });

  it('🔴 любая игра на каркасе — режим объявлен каркасом: пункт есть и выключает его', () => {
    const tr = открытьМеню();
    expect(`пункт: ${подписьПункта(tr)}`).toBe('пункт: pauseFullscreenOff');
    act(() => { пункт(tr).props.onPress(); });
    expect(`включено: ${immersiveEnabled()}, пункт: ${подписьПункта(tr)}`)
      .toBe('включено: false, пункт: pauseFullscreenOn');
  });

  it('режим объявлен уже при открытом меню — пункт появляется без переоткрытия', () => {
    const tr = открытьМеню(false);
    let снять!: () => void;
    act(() => { снять = declareImmersiveCapable(); });
    try {
      expect(`пункт: ${подписьПункта(tr)}`).toBe('пункт: pauseFullscreenOff');
    } finally {
      act(() => { снять(); });
    }
    expect(`после снятия: ${подписьПункта(tr)}`).toBe('после снятия: —');
  });
});

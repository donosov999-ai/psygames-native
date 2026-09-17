/* psygames-game-field-scrolls-above-feedback-button · VER 1 · 17.09.2026 */
/**
 * ПРОКРУЧИВАЕМОЕ ПОЛЕ ДОТЯГИВАЕТ ПОСЛЕДНЮЮ СТРОКУ ВЫШЕ КНОПКИ ОТЗЫВА.
 *
 * 📍 Задача 2fb25cbc (замер раздела «Судоку», WebKit с касаниями): у «Лишних чисел» 10×10
 * и 12×12 на 360×640 угловая клетка лежала под плавающей кнопкой «Сообщить о проблеме»
 * при ЛЮБОЙ прокрутке — поле кончалось ровно там, где висит кнопка. Решатель автора
 * зачёркивает эту клетку у 42 % досок 10×10 и 49 % досок 12×12: касанием уровень не пройти.
 *
 * Замер на экспорте 17.09.2026, `/games/puzzles?mode=Singles`, 360×640, ступени 4 и 5:
 * до правки угловая клетка под кнопкой и до, и после прокрутки; после правки прокрутка
 * до конца поднимает её на доску (scrollHeight 647 при clientHeight 521). На 390×844
 * поле помещается целиком, прокрутка не появилась (725 / 725).
 *
 * Проба монтирует настоящий каркас и читает стиль того ScrollView, что он отдаёт полем:
 * запас внизу обязан быть не меньше верхнего края кнопки над безопасной зоной
 * (`FAB_BOTTOM + FAB_SIZE`). Меньше — последнюю строку поднять нечем.
 *
 * ⚠️ Случай с `toolbar` проба не сторожит: там низ экрана занимает панель инструментов,
 * а поле кончается над ней, и запас под кнопку — вопрос панели, а не поля.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { FAB_BOTTOM, FAB_SIZE } from '@/src/services/fabPosition';

declare function require(id: string): any;

jest.mock('@/src/hooks/useExitGuard', () => ({
  useExitGuard: () => ({ asking: false, requestExit: () => {}, stay: () => {}, confirmExit: () => {} }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/games/puzzles', useRouter: () => ({ push: () => {}, back: () => {} }) }));
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
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
jest.mock('@/src/services/feedback', () => ({
  sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
  soundOn: () => true, hapticEnabledNow: () => true, setSoundEnabled: () => {}, setHapticEnabled: () => {},
}));
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {}, setGameStreak: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

describe('прокручиваемое поле каркаса и кнопка отзыва', () => {
  it('🔴 запас внизу поля не меньше верхнего края кнопки над безопасной зоной', () => {
    let tr!: TestRenderer.ReactTestRenderer;
    act(() => {
      tr = TestRenderer.create(
        <GameShell title="Лишние числа" onBack={() => {}} scrollableField>
          <Text>поле</Text>
        </GameShell>,
      );
    });
    const поле = tr.root.findAll((n: any) => n.props?.testID === 'game-field' && n.props.contentContainerStyle !== undefined)[0];
    const запас = Number(StyleSheet.flatten(поле?.props.contentContainerStyle)?.paddingBottom ?? 0);
    const верхКнопки = FAB_BOTTOM + FAB_SIZE;
    expect(`запас ${запас} ≥ верх кнопки ${верхКнопки}: ${запас >= верхКнопки ? 'да' : 'нет'}`)
      .toBe(`запас ${запас} ≥ верх кнопки ${верхКнопки}: да`);
    act(() => { tr.unmount(); });
  });
});

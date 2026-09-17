/* psygames-game-field-scrolls-above-feedback-button · VER 2 · 17.09.2026 */
/**
 * ПРОКРУЧИВАЕМОЕ ПОЛЕ ДОТЯГИВАЕТ ПОСЛЕДНЮЮ СТРОКУ ВЫШЕ КНОПКИ ОТЗЫВА — ПО ФЛАГУ ЭКРАНА.
 *
 * 📍 Задача 2fb25cbc (замер раздела «Судоку», WebKit с касаниями): у «Лишних чисел» 10×10
 * и 12×12 на 360×640 угловая клетка лежала под плавающей кнопкой «Сообщить о проблеме»
 * при ЛЮБОЙ прокрутке — поле кончалось ровно там, где висит кнопка. Решатель автора
 * зачёркивает эту клетку у 42 % досок 10×10 и 49 % досок 12×12: касанием уровень не пройти.
 *
 * Замер на экспорте 17.09.2026 прибором раздела fab-cover.mjs, 360×640, 7 сеток × 5 ступеней:
 * до запаса — 2 недостижимые клетки (Singles L4, L5, прокрутка 0 px), с запасом — 0.
 *
 * VER 2. В VER 1 запас получали ВСЕ прокручиваемые поля без панели. Это сломало расчёт
 * «Корректуры»: `сеткаКорректуры` держит свой резерв под кнопку и считает отступ каркаса
 * равным 8 — поле стало бы прокручиваться на 156 px в пустоту, а протяжка по сетке филвордов
 * спорит с прокруткой. Теперь запас только по флагу `reserveUnderFab`, и проба сторожит
 * обе стороны: с флагом запас есть, без флага отступ прежний.
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

/** Нижний отступ содержимого того ScrollView, что каркас отдаёт полем. */
function запасПоля(пропсы: Record<string, unknown>): number {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="поле" onBack={() => {}} scrollableField {...(пропсы as any)}>
        <Text>поле</Text>
      </GameShell>,
    );
  });
  const поле = tr.root.findAll((n: any) => n.props?.testID === 'game-field' && n.props.contentContainerStyle !== undefined)[0];
  const запас = Number(StyleSheet.flatten(поле?.props.contentContainerStyle)?.paddingBottom ?? 0);
  act(() => { tr.unmount(); });
  return запас;
}

const верхКнопки = FAB_BOTTOM + FAB_SIZE;

describe('прокручиваемое поле каркаса и кнопка отзыва', () => {
  it('🔴 с флагом reserveUnderFab запас внизу не меньше верхнего края кнопки', () => {
    const запас = запасПоля({ reserveUnderFab: true });
    expect(`запас ${запас} ≥ верх кнопки ${верхКнопки}: ${запас >= верхКнопки ? 'да' : 'нет'}`)
      .toBe(`запас ${запас} ≥ верх кнопки ${верхКнопки}: да`);
  });

  /**
   * 🔴 БЕЗ ФЛАГА — ПРЕЖНИЕ 8. На это число опирается расчёт сетки «Корректуры»
   * (`ОТСТУП_ПОЛЯ_СНИЗУ` в src/games/attention/layout.ts): другой отступ — и её сетка,
   * рассчитанная помещаться без прокрутки, начнёт ездить.
   */
  it('🔴 без флага отступ поля прежний — 8, чужие резервы не удваиваются', () => {
    expect(`без флага: ${запасПоля({})}`).toBe('без флага: 8');
  });
});

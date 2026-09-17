/* psygames-solution-button-in-shell · VER 1 · 17.09.2026 */
/**
 * «ПОКАЗАТЬ РЕШЕНИЕ» ИЗ КАРКАСА — ПРОВЕРКА ПОВЕДЕНИЕМ (задача 3afc4172).
 *
 * 📍 Денис 16.09.2026: «во всех играх нужно внизу где-то добавить кнопку „Показать
 * решение“». Каркас даёт одно место и один вид: игра передаёт `solution`, каркас ставит
 * лампочку в конце поля и тот же пункт в меню паузы.
 *
 * Что сторожим на настоящем GameShell:
 *   1. дан `solution` — кнопка в поле есть, нажатие зовёт обработчик игры; пункт в паузе есть;
 *   2. `available: false` — кнопка на месте, но выключена; в паузе пункта нет;
 *   3. своё меню паузы игры уже с этим пунктом — дубля нет;
 *   4. проп не дан — ни кнопки, ни пункта (78 экранов, не подключивших решение, не меняются).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { __resetGameClock } from '@/src/services/gamePause';

declare function require(id: string): any;

jest.mock('@/src/hooks/useExitGuard', () => ({
  useExitGuard: () => ({ asking: false, requestExit: () => {}, stay: () => {}, confirmExit: () => {} }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/games/digit-span', useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }) }));
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

const смонтированные: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { смонтированные.splice(0).forEach((tr) => tr.unmount()); });
  __resetGameClock();
});

function каркас(пропсы: Record<string, unknown>): TestRenderer.ReactTestRenderer {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Объём цифр" onBack={() => {}} {...(пропсы as any)}>
        <Text>поле</Text>
      </GameShell>,
    );
  });
  смонтированные.push(tr);
  return tr;
}

/** Кнопка решения в поле: узел кнопки внутри ряда `game-solution-row`. */
function кнопкаВПоле(tr: TestRenderer.ReactTestRenderer): any | null {
  const ряд = tr.root.findAll((n: any) => n.props?.testID === 'game-solution-row')[0];
  if (!ряд) return null;
  return ряд.findAll((n: any) => n.props?.testID === 'game-aux' && typeof n.props.onPress === 'function')[0] ?? null;
}
function пунктыПаузы(tr: TestRenderer.ReactTestRenderer): string[] {
  const стрелка = tr.root.findAll((n: any) => n.props?.testID === 'game-back' && typeof n.props.onPress === 'function')[0];
  act(() => { стрелка.props.onPress(); });
  // Один пункт — несколько узлов дерева с тем же testID (обёртка и сама кнопка): считаем по id.
  return [...new Set(tr.root.findAll((n: any) => typeof n.props?.testID === 'string' && n.props.testID.startsWith('pause-action:'))
    .map((n: any) => String(n.props.testID).slice('pause-action:'.length)))];
}

describe('«Показать решение» из каркаса', () => {
  it('🔴 дан solution — лампочка в поле зовёт обработчик игры, пункт в паузе есть', () => {
    const показать = jest.fn();
    const tr = каркас({ solution: { onPress: показать } });
    const кнопка = кнопкаВПоле(tr);
    expect(`кнопка: ${кнопка ? кнопка.props.accessibilityLabel : 'нет'}`).toBe('кнопка: puzzleShowSolution');
    act(() => { кнопка.props.onPress(); });
    expect(показать).toHaveBeenCalledTimes(1);
    const пункты = пунктыПаузы(tr);
    expect(`в паузе решение: ${пункты.filter((id) => id === 'solution').length}`).toBe('в паузе решение: 1');
  });

  it('🔴 available: false — кнопка на месте, но выключена; в паузе пункта нет', () => {
    const tr = каркас({ solution: { onPress: () => {}, available: false } });
    const кнопка = кнопкаВПоле(tr);
    expect(`кнопка: ${кнопка ? 'есть' : 'нет'}, выключена: ${кнопка?.props.accessibilityState?.disabled}`).toBe('кнопка: есть, выключена: true');
    expect(пунктыПаузы(tr).includes('solution')).toBe(false);
  });

  it('🔴 своё меню игры уже с этим пунктом — дубля нет', () => {
    const tr = каркас({
      solution: { onPress: () => {} },
      pauseActions: [
        { id: 'resume', label: 'exitConfirmStay', icon: 'play', primary: true },
        { id: 'hint', label: 'puzzleShowSolution', icon: 'bulb-outline', onPress: () => {} },
        { id: 'exit', label: 'pauseExitGame', icon: 'exit-outline', leave: true },
      ],
    });
    const пункты = пунктыПаузы(tr);
    expect(`пунктов «решение»: ${пункты.filter((id) => id === 'solution' || id === 'hint').length}`).toBe('пунктов «решение»: 1');
  });

  it('🔴 проп не дан — ни кнопки в поле, ни пункта в паузе', () => {
    const tr = каркас({});
    expect(кнопкаВПоле(tr)).toBeNull();
    expect(пунктыПаузы(tr).includes('solution')).toBe(false);
  });

  it('прокручиваемое поле — кнопка тоже в конце поля', () => {
    const tr = каркас({ scrollableField: true, solution: { onPress: () => {} } });
    expect(кнопкаВПоле(tr) ? 'есть' : 'нет').toBe('есть');
  });
});

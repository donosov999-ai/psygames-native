/* psygames-one-line-service-row · VER 1 · 17.09.2026 */
/* psygames-spatial-claude-mac · решение Дениса 17.09.2026 */
/**
 * 🔴 «ОДНА ЛИНИЯ»: «ОТМЕНИТЬ», «НАЧАТЬ ЗАНОВО», «ПОДСКАЗКА» — ОДНИМ РЯДОМ ЗНАЧКОВ ПОД ДОСКОЙ.
 *
 * Денис 17.09.2026 по кадру «Соедини точки»: «их место снизу иконками под окном упражнения, рядом с „Отменить“
 * и „Начать заново“. Это надо везде такое правило делать». У «Одной линии» три подписанные кнопки модуля
 * стояли двумя рядами ([Отменить][Подсказка] / [Начать заново]).
 *
 * Настоящий экран и настоящий модуль (каркас подменён узлом): после «Начать» под доской три compact-значка
 * `GameAuxAction` по порядку, текстовых кнопок модуля нет; значки живые — подсказка ставит метку на вершину,
 * ход вершиной зажигает отмену, отмена его снимает и гаснет.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OneLineScreen from '@/app/games/one-line';
import { getOneLineStrings } from '@/src/games/one-line/core/index';
import { GameAuxAction } from '@/src/components/GameAuxAction';

jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { background: '#000', bg: '#000', text: '#fff', textSecondary: '#999', card: '#222', border: '#333', primary: '#7c6cf0', surface: '#111', success: '#0c0', error: '#c00', warning: '#fa0' }, isDark: true }),
}));
jest.mock('@/src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'ru' }) }));
jest.mock('@/src/contexts/ProfileContext', () => ({ useProfile: () => ({ profile: { id: 'service-row-line' } }) }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/src/services/api', () => ({ saveSession: jest.fn(async () => ({})) }));
jest.mock('react-native-safe-area-context', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  const { View } = require('react-native');
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: ({ children, ...p }: any) => React.createElement(View, p, children), SafeAreaProvider: ({ children }: any) => children };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/GameShell', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const React = require('react');
  return { __esModule: true, PAD_H: 16, БЕЗ_ЖЕСТА_ПРОКРУТКИ: {}, default: (p: any) => React.createElement('GameShell', p, p.children) };
  /* eslint-enable @typescript-eslint/no-require-imports */
});
jest.mock('@/src/components/LevelCleared', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/components/LevelProgressMap', () => ({ __esModule: true, default: () => null }));
jest.mock('@/src/games/balls/BallStylePicker', () => ({ __esModule: true, default: () => null }));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports
const S = getOneLineStrings('ru');

const деревья: any[] = [];
afterEach(async () => {
  await TestRenderer.act(async () => { деревья.splice(0).forEach((д) => { try { д.unmount(); } catch { /* снят */ } }); });
});

async function дождаться(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await TestRenderer.act(async () => { await Promise.resolve(); });
}

async function партия(): Promise<any> {
  // знакомство уже пройдено — «Начать» ведёт сразу в партию
  await AsyncStorage.setItem('psygames_one_line_intro_seen_service-row-line', '1');
  let д: any;
  await TestRenderer.act(async () => { д = TestRenderer.create(React.createElement(OneLineScreen)); });
  деревья.push(д);
  await дождаться();
  const старт = д.root.findAll((n: any) => typeof n.props?.onPress === 'function' && n.findAll((m: any) => m.props?.children === 'start').length > 0)[0];
  await TestRenderer.act(async () => { старт.props.onPress(); });
  await дождаться();
  return д;
}
const значки = (д: any) => д.root.findAll((n: any) => n.type === GameAuxAction);

describe('«Одна линия»: служебный ряд — значками под доской (решение Дениса 17.09.2026)', () => {
  it('🔴 после «Начать» — три compact-значка по порядку, текстовых кнопок модуля нет, шапка каркаса пуста', async () => {
    const д = await партия();
    expect(значки(д).map((n: any) => `${n.props.icon}:${n.props.compact}:${n.props.label}`))
      .toEqual([`arrow-undo:true:${S.undo}`, `refresh:true:${S.restart}`, `bulb-outline:true:${S.hint}`]);
    const подписи = д.root.findAll((n: any) => typeof n.props?.children === 'string').map((n: any) => n.props.children);
    expect(подписи).not.toContain(S.hint);
    expect(д.root.findAll((n: any) => n.type === 'GameShell')[0].props.headerActions).toBeUndefined();
  });

  it('значки живые: подсказка ставит метку на вершину; ход вершиной зажигает отмену; отмена снимает ход и гаснет', async () => {
    const д = await партия();
    const вершины = () => д.root.findAll((n: any) => typeof n.props?.onPress === 'function' && /^Вершина \d+/.test(String(n.props?.accessibilityLabel ?? '')))
      .filter((n: any, i: number, все: any[]) => все.findIndex((m: any) => m.props.accessibilityLabel === n.props.accessibilityLabel) === i);
    const отмена = () => значки(д)[0];
    expect(Boolean(отмена().props.disabled)).toBe(true);
    expect(вершины().some((n: any) => String(n.props.accessibilityLabel).includes(S.hintMarker))).toBe(false);
    await TestRenderer.act(async () => { значки(д)[2].props.onPress(); });
    await дождаться();
    const подсказанные = вершины().filter((n: any) => String(n.props.accessibilityLabel).includes(S.hintMarker));
    expect(подсказанные.length).toBeGreaterThan(0);
    await TestRenderer.act(async () => { подсказанные[0].props.onPress(); });
    await дождаться();
    expect(Boolean(отмена().props.disabled)).toBe(false);
    await TestRenderer.act(async () => { отмена().props.onPress(); });
    await дождаться();
    expect(Boolean(отмена().props.disabled)).toBe(true);
  });
});

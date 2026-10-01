/* psygames-stats-balance-follows-profile · VER 1 · 30.09.2026 */
/**
 * 🔴 «БАЛАНС ТРЕНИРОВОК» СЛУШАЕТ ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЯ.
 *
 * Отчёты dfd6b290 и 54c73576 (18–19.09.2026): «у двух разных людей одна фигура». На кадре
 * переключатель стоит на «Микро-релакс», а баланс показывает 458 партий всего устройства и
 * восстановление 1 %. Баланс считался один раз при загрузке — по всем партиям всех профилей,
 * — и переключателя не слушал вовсе.
 *
 * КАК ПРОВЕРЯЕТСЯ — ПОВЕДЕНИЕМ. На устройстве партии двух профилей; экран монтируется целиком,
 * баланс читается из подписей строк (`<область>: <доля>%, <партий>`), затем нажимается
 * «Все игры» — и баланс обязан смениться. Язык подписей не важен: сверяются числа.
 * 🔴 СЛЕПОЕ = КРАСНОЕ: строк баланса нет — проба краснеет с причиной, а не зеленеет.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/statistics',
  useFocusEffect: () => {},
  useNavigation: () => ({ addListener: () => () => {}, setOptions: () => {} }),
  Redirect: () => null,
  router: { canGoBack: () => false, back: () => {}, replace: () => {}, push: () => {} },
}));

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
/* eslint-enable @typescript-eslint/no-require-imports */

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
});

const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); }); };

const день = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const партии = (profile_id: string, game_type: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${profile_id}-${game_type}-${i}`, profile_id, game_type, score: 10, time_seconds: 60, timestamp: день(1 + i),
  }));

/**
 * Строки баланса: подпись `<область>: <доля>%, <партий>` → партий по строкам, по убыванию.
 * Только узлы платформы (`type` — строка): у составного View те же props, и без этого
 * каждая строка считалась бы дважды.
 */
const баланс = (r: any): number[] => r.root
  .findAll((n: any) => typeof n.type === 'string' && typeof n.props?.accessibilityLabel === 'string'
    && /: \d+%, \d+$/.test(n.props.accessibilityLabel), { deep: true })
  .map((n: any) => Number(/, (\d+)$/.exec(n.props.accessibilityLabel)![1]))
  .sort((a: number, b: number) => b - a);

const текст = (n: any): string => n.findAll((x: any) => typeof x.props?.children === 'string', { deep: true })
  .map((x: any) => x.props.children).join(' ');

async function смонтировать() {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'women');
  await AsyncStorage.setItem('psygames_sessions', JSON.stringify([
    ...партии('women', 'breathing', 4),     // восстановление
    ...партии('women', 'sudoku', 4),        // логика
    ...партии('nzt48', 'sudoku', 12),       // чужой профиль на том же устройстве
    ...партии('nzt48', 'corsi', 12),
  ]));
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/statistics').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, {
      initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } },
    }, React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
      React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  return r;
}

describe('«Баланс тренировок» и переключатель профиля', () => {
  it('профиль — только его партии; «Все игры» — все партии устройства', async () => {
    const r = await смонтировать();

    const свой = баланс(r);
    expect(свой.length ? 'строки баланса есть' : 'строк баланса нет — мерить нечего').toBe('строки баланса есть');
    // «Микро-релакс»: 4 дыхания + 4 судоку. Чужие 24 партии в его балансе быть не должны.
    expect(свой).toEqual([4, 4]);

    const всеИгры = r.root.findAll((n: any) => typeof n.props?.onPress === 'function', { deep: true })
      // Текст кнопки собирается из вложенных узлов дважды («All games All games»).
      .find((b: any) => /^((Все игры|All games)\s*)+$/.test(текст(b).trim()));
    expect(всеИгры ? 'кнопка «Все игры» есть' : 'нет кнопки «Все игры»').toBe('кнопка «Все игры» есть');
    await TestRenderer.act(async () => { всеИгры.props.onPress(); });
    await осесть();

    // Все игры: логика 16 (судоку обоих), память 12 (Корси), восстановление 4.
    expect(баланс(r)).toEqual([16, 12, 4]);
  });
});

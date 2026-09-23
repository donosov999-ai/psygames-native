/* psygames-cake-screen-does-not-search-on-device · VER 1 · 17.09.2026 */
/**
 * 🔴 ЭКРАН ТОРТОВ НЕ ИЩЕТ МИНИМУМ НА УСТРОЙСТВЕ — ИНАЧЕ ИГРА СТОИТ СЕКУНДАМИ.
 *
 * 📍 17.09.2026, перед выпуском 2.54.14. Эффект экрана звал `minMoves(board, 30000)` в
 * `setTimeout(0)` и зависел от `board`, то есть после КАЖДОГО хода. `setTimeout` не уводит
 * работу в фон: поиск идёт в потоке отрисовки. С правилом «ход любым куском» один вызов
 * стал идти секундами (jest, загруженный мак: L5 3,9 с, L10 13,3 с, L60 61,6 с) и ни разу
 * не дошёл до ответа. Живьём на экспорт-сборке старт L10 дал долгую задачу 4 556 мс.
 *
 * Проба монтирует настоящий экран на уровне 10, запускает партию и ждёт отложенных вызовов.
 * `minMoves` подменён шпионом поверх настоящего решателя: звать его экран не должен ни разу.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('@/src/games/cake-sort/core/solver', () => {
  const настоящий = jest.requireActual('@/src/games/cake-sort/core/solver');
  return { ...настоящий, minMoves: jest.fn(настоящий.minMoves), solvePath: jest.fn(настоящий.solvePath) };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

function текстВнутри(n: any): string {
  const куски: string[] = [];
  const обойти = (x: any) => {
    if (!x) return;
    if (typeof x === 'string') { куски.push(x); return; }
    if (Array.isArray(x)) { x.forEach(обойти); return; }
    if (x.children) x.children.forEach(обойти);
  };
  обойти(n.children);
  return куски.join(' ');
}

it('🔴 на уровне 10 экран не зовёт minMoves ни на старте, ни после отложенных вызовов', async () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_cake_sort_level_free', '10');
  const { minMoves } = require('@/src/games/cake-sort/core/solver');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/cake-sort').default;  // eslint-disable-line
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null,
              React.createElement(Screen))))),
    );
  });
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  открытые.push(r);
  const пуск = r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function' && /Начать|Start/i.test(текстВнутри(n)))[0];
  expect(пуск).toBeTruthy();
  await TestRenderer.act(async () => { пуск.props.onPress?.(); });
  // Отложенный эффект экрана — setTimeout(0): даём ему и перерисовкам несколько оборотов.
  for (let i = 0; i < 5; i += 1) {
    await TestRenderer.act(async () => { await new Promise((res) => setTimeout(res, 20)); });
  }
  const подписи: string[] = [...new Set<string>(r.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string').map((n: any) => n.props.accessibilityLabel))];
  const уровень = подписи.find((l) => /^(Lvl|Ур\.): /.test(l));
  expect(`${уровень}; вызовов minMoves: ${(minMoves as jest.Mock).mock.calls.length}`).toMatch(/: 10; вызовов minMoves: 0$/);

  /**
   * 🔴 ПОДСКАЗКА НА L10 — С БЮДЖЕТОМ 400, А НЕ 20 000. С полным бюджетом одно нажатие шло 9 с
   * (L10, загруженный мак), и всё это время экран стоял.
   */
  /**
   * 🔴 НА ВШИТОМ УРОВНЕ ПОДСКАЗКА НЕ ИЩЕТ ВООБЩЕ (задача af4c7ff1).
   *
   * 📍 Раньше здесь стояло «бюджеты подсказки: 400»: экран искал путь при каждом
   * нажатии, просто урезанным бюджетом. Замер 23.09.2026 показал, чего стоит
   * поиск: на полном бюджете L10 — 25,0 с, L20 — больше минуты; урезанный
   * спасает от замирания (82–756 мс), но это всё равно работа в кадре.
   * Теперь путь вшитых уровней найден офлайн и лежит в `core/solutions.json`:
   * первая подсказка на нетронутой доске обязана стоить НОЛЬ вызовов поиска.
   *
   * ⚠️ И ВТОРАЯ ПОЛОВИНА, БЕЗ КОТОРОЙ ГЕЙТ БЫЛ БЫ ЛОЖНО ЗЕЛЁНЫМ: стоит игроку
   * свернуть с записанного пути, записи для его стола уже нет, и поиск обязан
   * вернуться — с тем самым бюджетом 400, а не с полным.
   */
  const { solvePath } = require('@/src/games/cake-sort/core/solver');  // eslint-disable-line @typescript-eslint/no-require-imports
  const подсказка = r.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && /^(Hint|Подсказка)/.test(String(n.props?.accessibilityLabel ?? '')))[0];
  expect(подсказка).toBeTruthy();
  await TestRenderer.act(async () => { подсказка.props.onPress(); });
  expect(`вызовов поиска на вшитом уровне: ${(solvePath as jest.Mock).mock.calls.length}`)
    .toBe('вызовов поиска на вшитом уровне: 0');

  /* Сворачиваем с пути: тапаем по тарелкам, пока ход не пройдёт. */
  const тарелки = r.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && /^(Plate|Тарелка)/.test(String(n.props?.accessibilityLabel ?? '')));
  if (тарелки.length >= 2) {
    await TestRenderer.act(async () => { тарелки[0].props.onPress(); });
    await TestRenderer.act(async () => { тарелки[1].props.onPress(); });
    await TestRenderer.act(async () => { подсказка.props.onPress(); });
    const бюджеты = (solvePath as jest.Mock).mock.calls.map((c: any[]) => c[1]);
    expect(`бюджеты поиска после своего хода: ${бюджеты.join(',') || 'поиска не было'}`)
      .toMatch(/^бюджеты поиска после своего хода: (400|поиска не было)$/);
  }
}, 120_000);

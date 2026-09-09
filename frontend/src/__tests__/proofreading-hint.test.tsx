/**
 * ПОДСКАЗКА В КОРРЕКТУРЕ СУЩЕСТВУЕТ И ПОКАЗЫВАЕТ ЦЕЛЬ.
 *
 * 📍 ДВА ОТЧЁТА NZT-48 ОБ ОДНОМ И ТОМ ЖЕ, С РАЗНИЦЕЙ В ТРИ ДНЯ:
 *   `26af9227` 05.09.2026 — «Подсказка ни фига не работает»;
 *   `19eaaa3a` 08.09.2026 — «Подсказки не работают».
 * Первый закрыли версией 2.43.0 БЕЗ `fix_note` — то есть без следа, что именно
 * чинили, — и он вернулся слово в слово.
 *
 * 🔴 ЗАМЕР 09.09 ОБЪЯСНИЛ ПОВТОР: подсказки в этом режиме НЕ БЫЛО ВОВСЕ. Кнопка
 * рисовалась при `fwPlaying`, то есть только в змейке-филвордах; в самой
 * корректуре — сетке букв, которую человек и проходит, — её не было. «Не
 * работает» было точным описанием, а не преувеличением.
 *
 * ЧТО СТЕРЕЖЁТ ПРОБА (три утверждения, каждое ломается своей мутацией):
 *   1. кнопка подсказки есть в режиме БУКВ, а не только в змейке;
 *   2. нажатие ПОКАЗЫВАЕТ ровно одну ненайденную цель, а не засчитывает её —
 *      число найденных не меняется, подсвеченная клетка одна;
 *   3. запас конечен: после трёх нажатий кнопка гаснет.
 *
 * ⚠️ Проба смотрит на ЦВЕТ подсвеченной клетки, а не на имя переменной: цвет —
 * это то, что видит человек, и он переживёт переименование состояния.
 */
import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
}));

jest.mock('@/src/services/api', () => ({
  ...jest.requireActual('@/src/services/api'),
  saveSession: async (s: any) => s,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');
const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Цвет подсказанной клетки — тот же, что у плиток задания в шапке. */
const ЦВЕТ_ПОДСКАЗКИ = '#fbbf24';

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) {
    const r = поднятые.pop();
    try { TestRenderer.act(() => { r.unmount(); }); } catch { /* уже погашено */ }
  }
});

async function осесть() {
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
}

async function поднять() {
  await AsyncStorage.clear();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const Screen = require('@/app/games/proofreading').default;
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(
      React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
        React.createElement(ProfileProvider, null,
          React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(Screen))))),
    );
  });
  await осесть();
  поднятые.push(r);
  return r;
}

/** Все нажимаемые узлы с подписью — по ним ищем и вход в партию, и подсказку. */
const кнопки = (r: any) => r.root.findAll((n: any) => n.props
  && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function', { deep: true });

/** Подпись без служебных глифов шрифта значков (они попадают в текст узла). */
const подпись = (b: any): string => {
  const из: string[] = [];
  const идти = (x: any) => {
    if (typeof x === 'string') из.push(x);
    else if (Array.isArray(x)) x.forEach(идти);
    else if (x && x.props) идти(x.props.children);
  };
  идти(b.props.children);
  return [...из.join('')].filter((c) => {
    const k = c.charCodeAt(0);
    return !(k >= 0xE000 && k <= 0xF8FF);
  }).join('').trim();
};

/** Сколько клеток поля сейчас подсвечено как подсказка. */
function подсвечено(r: any): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- StyleSheet после моков
  const { StyleSheet } = require('react-native');
  /*
   * ⚠️ `findAll` отдаёт ВЛОЖЕННЫЕ узлы одного элемента: клетка приходит пятью
   * записями подряд, и наивный `.length` дал 5 вместо 1. Отбираем сам
   * `TouchableOpacity` клетки — у него есть `activeOpacity`, которого нет у
   * обёрток, — и считаем элементы, а не узлы дерева.
   */
  const свои = new Set<unknown>();
  r.root.findAll((n: any) => {
    if (!n.props || n.props.accessibilityRole !== 'button' || !n.props.style) return false;
    const плоско = StyleSheet.flatten(n.props.style) as Record<string, unknown>;
    if (!плоско || плоско.backgroundColor !== ЦВЕТ_ПОДСКАЗКИ) return false;
    // Ссылка на обработчик одна на КЛЕТКУ и переживает любое число обёрток.
    if (typeof n.props.onPress === 'function') свои.add(n.props.onPress);
    return false;
  }, { deep: true });
  return свои.size;
}

/**
 * Кнопка подсказки. Ищем по НАЧАЛУ подписи, а не по точному равенству: общая
 * кнопка `GameAuxAction` дописывает к слову остаток запаса («Hint — 3»), и
 * строгое сравнение промахивалось мимо существующей кнопки. Берём ту, у которой
 * объявлено состояние: компонент рисует внешний и внутренний нажимаемые узлы.
 */
const найтиПодсказку = (r: any) => кнопки(r)
  .filter((b: any) => /^Hint\b/i.test(String(b.props.accessibilityLabel ?? '')))
  .find((b: any) => b.props.accessibilityState !== undefined)
  ?? кнопки(r).find((b: any) => /^Hint\b/i.test(String(b.props.accessibilityLabel ?? '')));

async function войтиВПартию(r: any) {
  const старт = кнопки(r).find((b: any) => String(b.props.accessibilityLabel ?? '') === 'Start');
  expect(старт).toBeTruthy();
  await TestRenderer.act(async () => { старт.props.onPress(); });
  await осесть();
}

it('🔴 в режиме букв кнопка подсказки ЕСТЬ — её отсутствие и было «не работает»', async () => {
  const r = await поднять();
  await войтиВПартию(r);
  const подсказка = найтиПодсказку(r);
  expect(подсказка).toBeTruthy();
  expect(подсказка.props.accessibilityState?.disabled).toBeFalsy();
});

it('🔴 подсказка ПОКАЗЫВАЕТ одну цель, а не засчитывает её', async () => {
  const r = await поднять();
  await войтиВПартию(r);
  expect(подсвечено(r)).toBe(0);              // до нажатия поле ровное

  const было = найтиПодсказку(r).props;
  await TestRenderer.act(async () => { было.onPress(); });
  await осесть();

  // Ровно одна клетка показана…
  expect(подсвечено(r)).toBe(1);
  // …и она НЕ засчитана: счётчик найденного не сдвинулся. Ищем его в шапке —
  // «0/N» так и осталось нулём слева.
  const тексты: string[] = [];
  r.root.findAll((n: any) => typeof n.type === 'string', { deep: true }).forEach((n: any) => {
    const c = n.props && n.props.children;
    if (typeof c === 'string' && /^\d+\/\d+$/.test(c.trim())) тексты.push(c.trim());
  });
  expect(тексты.length).toBeGreaterThan(0);
  expect(тексты[0]!.split('/')[0]).toBe('0');
});

it('🔴 запас подсказок конечен — после трёх кнопка гаснет', async () => {
  const r = await поднять();
  await войтиВПартию(r);
  for (let i = 0; i < 3; i += 1) {
    const b = найтиПодсказку(r);
    expect(b.props.accessibilityState?.disabled).toBeFalsy();
    await TestRenderer.act(async () => { b.props.onPress(); });
    await осесть();
  }
  expect(найтиПодсказку(r).props.accessibilityState?.disabled).toBe(true);
});

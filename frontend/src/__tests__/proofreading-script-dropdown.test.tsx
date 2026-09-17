/* psygames-proofreading-script-dropdown · VER 1 · 17.09.2026 */
/**
 * «КОРРЕКТУРА»: «АЛФАВИТ» — ОБЩИЙ ВЫПАДАЮЩИЙ СПИСОК, И ВЫБОР В НЁМ РЕАЛЬНО МЕНЯЕТ ПАРТИЮ.
 *
 * 📍 БЫЛО (main 15264942, задача 6552ffb5): семь плашек письменностей в четыре ряда — группа 192 px,
 * настройка 1,6 экрана на 390×844 и 2,3 на 360×640, кнопка отзыва при открытии закрывала 28 % «Цифр».
 * Решение Дениса 17.09.2026 — выпадающим списком, общим на приложение (`DropdownSelect`).
 *
 * Сам список сторожит `dropdown-select-one-choice`. Здесь — то, чего он знать не может: что экран
 * отдал в список все семь вариантов и что выбор доезжает до партии.
 * КАК ПРОВЕРЯЕТСЯ — ПОВЕДЕНИЕМ: экран монтируется целиком, список раскрывается нажатием, выбирается
 * вариант, «Start» — и читаются символы задания и клетки поля.
 * 🔴 СЛЕПОЕ = КРАСНОЕ: нет списка, нет варианта, пустое поле — проверка краснеет с причиной.
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

/* eslint-disable @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock */
const TestRenderer = require('react-test-renderer');
const { SCRIPTS, SCRIPT_IDS } = require('@/src/constants/scripts');
/* eslint-enable @typescript-eslint/no-require-imports */

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
const ID = 'proofreading-script';

const поднятые: any[] = [];
afterEach(() => {
  while (поднятые.length) { const r = поднятые.pop(); try { TestRenderer.act(() => { r.unmount(); }); } catch { /* погашено */ } }
});
const осесть = async () => { await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };

async function поднять() {
  await AsyncStorage.clear();
  /* eslint-disable @typescript-eslint/no-require-imports -- провайдеры после моков */
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');
  const { SafeAreaProvider } = require('react-native-safe-area-context');
  const Screen = require('@/app/games/proofreading').default;
  /* eslint-enable @typescript-eslint/no-require-imports */
  let r: any;
  await TestRenderer.act(async () => {
    r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: METRICS },
      React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
        React.createElement(LanguageProvider, null, React.createElement(Screen))))));
  });
  await осесть();
  поднятые.push(r);
  return r;
}

/** Нажимаемый узел по testID. Pressable даёт несколько узлов с одним testID — берём тот, у кого onPress. */
const поTestID = (r: any, id: string) => r.root.findAll((n: any) => n.props?.testID === id && typeof n.props.onPress === 'function', { deep: true })[0];
async function нажать(узел: any) { await TestRenderer.act(async () => { узел.props.onPress(); }); await осесть(); }

/** Значения вариантов раскрытого списка: testID строк вида `${ID}-<значение>`, без `-text` и `-mark`. */
const вариантыСписка = (r: any): string[] => [...new Set<string>(r.root
  .findAll((n: any) => typeof n.props?.testID === 'string' && n.props.testID.startsWith(`${ID}-`) && typeof n.props.onPress === 'function', { deep: true })
  .map((n: any) => n.props.testID.slice(ID.length + 1)))];

async function выбрать(r: any, значение: string): Promise<string> {
  const строка = поTestID(r, ID);
  if (!строка) return `нет закрытой строки списка «${ID}» на настройке`;
  await нажать(строка);
  const вариант = поTestID(r, `${ID}-${значение}`);
  if (!вариант) return `в раскрытом списке нет варианта «${значение}»`;
  await нажать(вариант);
  return 'выбрано';
}

async function войтиВПартию(r: any): Promise<string> {
  const старт = r.root.findAll((n: any) => n.props?.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && String(n.props.accessibilityLabel ?? '') === 'Start', { deep: true })[0];
  if (!старт) return 'нет кнопки Start';
  await нажать(старт);
  return 'в партии';
}

/** Символы задания (плитки «Find:») и клеток поля. */
function символыПартии(r: any): { задание: string[]; поле: string[] } {
  const текстыВ = (testID: string) => {
    const узлы = r.root.findAll((n: any) => n.props?.testID === testID, { deep: true });
    if (!узлы.length) return [];
    return узлы[0].findAll((n: any) => typeof n.props?.children === 'string', { deep: true }).map((n: any) => n.props.children as string);
  };
  // Клетка поля букв — нажимаемая плитка с текстом символа (подписи для скринридера у неё нет).
  const клетки = [...new Set<string>(текстыВ('proof-grid').filter((s: string) => s.length === 1))];
  const задание = текстыВ('proof-target').filter((s: string) => s.length === 1);
  return { задание, поле: клетки };
}

describe('«Корректура»: «Алфавит» выпадающим списком', () => {
  it('список закрыт при открытии, в нём все 7 вариантов: 6 письменностей и цифры', async () => {
    const r = await поднять();
    const строка = поTestID(r, ID);
    expect(строка ? 'строка списка есть' : `нет строки «${ID}»`).toBe('строка списка есть');
    expect(строка.props['aria-expanded']).toBe(false);
    expect(вариантыСписка(r)).toEqual([]);   // закрыт — строк списка нет
    await нажать(строка);
    expect(поTestID(r, ID).props['aria-expanded']).toBe(true);
    expect(вариантыСписка(r).sort()).toEqual([...SCRIPT_IDS, 'digits'].sort());
  });

  it('выбранная строка читается: контраст её текста с поверхностью темы не ниже 4,5', async () => {
    // Живой кадр 390×844 первой редакции: акцент игры #a8edea на белом — контраст 1,32, «Кириллица» не видна.
    /* eslint-disable @typescript-eslint/no-require-imports -- после моков */
    const { StyleSheet } = require('react-native');
    const { contrastRatio } = require('@/src/services/onGradientText');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const r = await поднять();
    await нажать(поTestID(r, ID));
    const текст = r.root.findAll((n: any) => n.props?.testID === `${ID}-latin-text` && n.props.style, { deep: true })[0];
    expect(текст ? 'текст выбранной строки есть' : 'нет текста строки «latin»').toBe('текст выбранной строки есть');
    const цвет = (StyleSheet.flatten(текст.props.style) as { color?: string }).color;
    // Фон — настоящая поверхность карточки, на которой стоит список, а не цвет из головы.
    let узел = r.root.findAll((n: any) => n.props?.testID === `${ID}-box`, { deep: true })[0];
    let фон: string | undefined;
    while (узел && !фон) { фон = (StyleSheet.flatten(узел.props?.style) as { backgroundColor?: string } | undefined)?.backgroundColor; узел = узел.parent; }
    expect(фон ? 'фон карточки найден' : 'у списка нет карточки с фоном').toBe('фон карточки найден');
    expect(Number(contrastRatio(String(цвет), String(фон)).toFixed(2))).toBeGreaterThanOrEqual(4.5);
  });

  it('выбор «цифры» закрывает список, показывается в строке и даёт партию цифрами', async () => {
    const r = await поднять();
    expect(await выбрать(r, 'digits')).toBe('выбрано');
    expect(вариантыСписка(r)).toEqual([]);
    const значение = r.root.findAll((n: any) => n.props?.testID === `${ID}-value` && typeof n.props.children === 'string', { deep: true })[0];
    expect(значение?.props.children).toBe('Digits');
    expect(await войтиВПартию(r)).toBe('в партии');
    const { задание, поле } = символыПартии(r);
    expect(задание.length ? 'задание есть' : 'в партии нет символов задания').toBe('задание есть');
    expect(поле.length ? 'поле есть' : 'в партии пустое поле').toBe('поле есть');
    expect([...задание, ...поле].filter((c) => !/^\d$/.test(c))).toEqual([]);
  });

  it('выбор письменности доезжает до партии: «греческий» — только греческие буквы', async () => {
    const r = await поднять();
    expect(await выбрать(r, 'greek')).toBe('выбрано');
    expect(await войтиВПартию(r)).toBe('в партии');
    const { задание, поле } = символыПартии(r);
    expect(поле.length ? 'поле есть' : 'в партии пустое поле').toBe('поле есть');
    expect([...задание, ...поле].filter((c) => !SCRIPTS.greek.chars.includes(c))).toEqual([]);
  });
});

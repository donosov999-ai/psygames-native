/**
 * 🔴 ЗАДНИЙ РЯД ВИДЕН ДО ХОДА, А НЕ ПОСЛЕ.
 *
 * С L52 у части ниш за спиной стоит вторая полка: она выйдет вперёд, когда ниша
 * опустеет. Без метки такая ниша неотличима от обычной, и человек узнаёт о
 * втором ряде единственным способом — разобрав первый и получив неожиданное.
 * Ровно та угадайка, из-за которой рядом рисуются насечки ёмкости (смешанные
 * ниши) и звезда джокера.
 *
 * ⚠️ ПРОБА СМОТРИТ НА ДЕРЕВО, А НЕ НА ИСХОДНИК. Соседний набор `goods-sort-feel`
 * сверяет ТЕКСТ кода — и уже покраснел от переезда каскада в ядро при
 * неизменном поведении. Здесь монтируется настоящий экран.
 *
 * ⚠️ И ЦВЕТ МЕТКИ — ТОЖЕ ЗАМЕР, А НЕ ВКУС. Первая редакция красила край второй
 * полки тёмным «чтобы читалось как глубина», и метка пропала: замер по снимку
 * живой игры дал интерьер ниши RGB(42,23,12), а метку поверх — (52,31,12).
 * Сейчас край деревянный и притенённый: на экране (204,167,127) против
 * интерьера (82,47,36), контраст 5,25:1.
 */
import React from 'react';

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/** Смонтировать «Сортировку товаров» на заданном уровне и войти в партию. */
async function открыть(уровень: number) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  // Ключ ровно тот, что строит usePersistentLevel: `psygames_<игра>_level_<профиль>`.
  await AsyncStorage.setItem('psygames_goods_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
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
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  }
  return r;
}

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

/** Плоский стиль: он бывает массивом. */
function плоско(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(плоско));
  return style;
}

/**
 * Сколько ниш помечено вторым рядом.
 *
 * 🔴 ИЩЕМ ПО ЦВЕТУ КРАЯ, А НЕ ПО ИМЕНИ СТИЛЯ. Имя стиля — внутреннее дело
 * экрана и переживёт переименование молча; цвет — то, что человек видит.
 */
function помечено(r: any): number {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && плоско(n.props?.style).backgroundColor === 'rgba(200,170,130,0.55)').length;
}

/** Ниши на доске: кнопки-цели с подписью полки. */
function ниш(r: any): number {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /^Полка \d+:|^Shelf \d+:/.test(String(n.props?.accessibilityLabel ?? ''))).length;
}

describe('задний ряд виден на доске', () => {
  /*
   * ⚠️ БЕРЁМ L52, А НЕ L58. Задние ряды идут с L52, схлопывание — с L56, и на
   * уровне с очередью раздача гоняет решателя до доказательства: замер дал 34 с
   * против штатных 20 с у пробы. Механика, которую мы проверяем, на L52 та же,
   * а стоит она секунды. Запас по времени всё равно ставим явно: набор гоняют
   * все чаты разом, и на занятой машине счёт другой.
   */
  it('🔴 на уровне с задними рядами метка есть, и не на всех нишах', async () => {
    const r = await открыть(52);
    const всего = ниш(r);
    // Иначе проба хвалит пустоту: экран не дошёл до доски.
    expect(всего).toBeGreaterThan(10);

    const меток = помечено(r);
    expect(меток).toBeGreaterThan(0);
    /*
     * И не на всех: задние ряды даются ЧАСТИ ниш (`backRowCount` — не больше
     * четырёх). Метка на каждой нише означала бы, что рисуют её не по данным, а
     * по факту уровня — то есть она ничего не сообщает.
     */
    expect(меток).toBeLessThan(всего);
  }, 60_000);

  it('🔴 на уровне ДО порога задних рядов метки нет ни одной', async () => {
    const r = await открыть(20);
    expect(ниш(r)).toBeGreaterThan(5);
    expect(помечено(r)).toBe(0);
  }, 60_000);
});

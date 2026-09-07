/**
 * 🔴 ТАП И ПОЛЁТ ТОВАРА — ИСПОЛНЕНИЕМ, А НЕ ЧТЕНИЕМ ИСХОДНИКА.
 *
 * Три утверждения переехали сюда из `goods-sort-drag` и `goods-sort-feel`, где
 * сверялся ТЕКСТ экрана: `onPress={() => handleItemTap(i, s)}`,
 * `accessibilityLabel={cellLabel(i, cell)}`, `const arriving = fly?.toCell === i…`.
 *
 * 📍 Все три покраснели 07.09.2026 от переноса стопки товаров в запоминающий
 * компонент — при полностью неизменном поведении. Это второй такой случай за
 * сутки (первым был переезд каскада в ядро) и ровно тот самый гейт-призрак: он
 * краснеет от переименования и молчит о поломке. Обратная сторона хуже — сними
 * кто `onPress` с товара, оставив строку в другом месте файла, и проверка
 * осталась бы зелёной, пока игра со скринридером стала бы непроходимой.
 *
 * ⚠️ ДОСТУПНОСТЬ ЗДЕСЬ НЕ УКРАШЕНИЕ. Со скринридером перетащить нельзя в
 * принципе: озвучка забирает жест себе, и человек ведёт экран по одной кнопке
 * за раз. Тап — единственный способ играть, и он обязан остаться.
 */
import React from 'react';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useLocalSearchParams: () => ({}),
  router: { canGoBack: () => false, back: () => {}, replace: () => {} },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),  // eslint-disable-line @typescript-eslint/no-require-imports
}));

const TestRenderer = require('react-test-renderer');  // eslint-disable-line @typescript-eslint/no-require-imports
const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

/*
 * 🔴 РАСКЛАД ФИКСИРУЕМ СЕМЕНЕМ. Раздача уровня мешает пул без семени, и партия,
 * которую ведёт проба, на одном раскладе доходит до хода, а на другом встаёт.
 * Первая редакция этой пробы падала через раз именно поэтому — и выглядело это
 * как «тест флакует», а было незакрытым окном.
 */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const НАСТОЯЩИЙ_RANDOM = Math.random;

const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
  // ⚠️ Семя держится ДО КОНЦА пробы: раздача доезжает эффектами, уже после `открыть`.
  Math.random = НАСТОЯЩИЙ_RANDOM;
});

async function открыть(уровень: number) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  await AsyncStorage.setItem('psygames_goods_sort_level_free', String(уровень));
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require('@/app/games/goods-sort').default;  // eslint-disable-line @typescript-eslint/no-require-imports
  Math.random = seeded(7);
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
  const старт = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (старт) {
    await TestRenderer.act(async () => { старт.props.onPress?.(); });
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

/** Кнопки товаров конкретной полки: подпись кончается на «, Полка N». */
function товары(r: any, полка: number): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && new RegExp(`, (Полка|Shelf) ${полка}$`).test(String(n.props?.accessibilityLabel ?? '')));
}

/** Кнопки-цели полок: подпись начинается с «Полка N». */
function полки(r: any): any[] {
  const по = new Map<number, any>();
  r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /^(Полка|Shelf) \d+[,:]/.test(String(n.props?.accessibilityLabel ?? '')))
    .forEach((n: any) => {
      const номер = Number(String(n.props.accessibilityLabel).match(/(?:Полка|Shelf) (\d+)/)![1]);
      if (!по.has(номер)) по.set(номер, n);
    });
  return [...по.values()];
}

/** Плоский стиль: он бывает массивом. */
function плоско(style: any): any {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(плоско));
  return style;
}

describe('тап остаётся способом играть', () => {
  it('🔴 у ниши есть кнопка с подписью и обработчиком', async () => {
    const r = await открыть(30);
    const все = полки(r);
    expect(все.length).toBeGreaterThan(6);
    все.forEach((n: any) => {
      expect(typeof n.props.onPress).toBe('function');
      expect(n.props.accessibilityRole).toBe('button');
      // Подпись называет МЕСТО и содержимое: «Полка 6: кола, кефир» либо «пусто».
      expect(String(n.props.accessibilityLabel)).toMatch(/^(Полка|Shelf) \d+[,:]/);
    });
  }, 180_000);

  it('🔴 у каждого товара есть своя кнопка с озвучкой', async () => {
    const r = await открыть(30);
    const непустая = полки(r)
      .map((n: any) => Number(String(n.props.accessibilityLabel).match(/(?:Полка|Shelf) (\d+)/)![1]))
      .find((номер: number) => товары(r, номер).length > 0);
    expect(непустая).toBeDefined();
    const кнопки = товары(r, непустая as number);
    expect(кнопки.length).toBeGreaterThan(0);
    кнопки.forEach((n: any) => {
      expect(typeof n.props.onPress).toBe('function');
      expect(n.props.accessibilityRole).toBe('button');
      // Подпись товара называет и товар, и полку: «кефир, Полка 6».
      expect(String(n.props.accessibilityLabel)).toMatch(/, (Полка|Shelf) \d+$/);
    });
  }, 180_000);

  /**
   * 🔴 И ТАП ДЕЙСТВИТЕЛЬНО ХОДИТ, А НЕ ПРОСТО ВИСИТ. Без этого пункта проверка
   * выше зелена и у кнопки, обработчик которой ничего не делает.
   */
  it('🔴 тап по товару выделяет его, а не проходит впустую', async () => {
    const r = await открыть(30);
    const номер = полки(r)
      .map((n: any) => Number(String(n.props.accessibilityLabel).match(/(?:Полка|Shelf) (\d+)/)![1]))
      .find((n: number) => товары(r, n).length > 0) as number;
    const до = товары(r, номер).map((n: any) => n.props.accessibilityState?.selected);
    await TestRenderer.act(async () => { товары(r, номер)[товары(r, номер).length - 1]?.props.onPress?.(); });
    const после = товары(r, номер).map((n: any) => n.props.accessibilityState?.selected);
    expect(после).not.toEqual(до);
    expect(после.some(Boolean)).toBe(true);
  }, 180_000);
});

describe('полёт копии не рисует товар дважды', () => {
  /**
   * 🔴 ПОКА КОПИЯ ЛЕТИТ, НАСТОЯЩИЙ ТОВАР ПРОЗРАЧЕН. Иначе на экране две штуки
   * одного товара — читается как сбой отрисовки, а не как движение.
   *
   * ⚠️ Меряем СТИЛЬ узла, а не наличие строки в исходнике: прозрачность — это
   * то, что видит человек, а строка — то, как она сегодня записана.
   */
  it('🔴 у прилетевшего товара нулевая прозрачность, пока идёт полёт', async () => {
    const r = await открыть(30);
    const номера = полки(r).map((n: any) => Number(String(n.props.accessibilityLabel).match(/(?:Полка|Shelf) (\d+)/)![1]));
    const источник = номера.find((n: number) => товары(r, n).length > 0) as number;
    const пустая = номера.find((n: number) => товары(r, n).length === 0);
    const цель = пустая ?? номера.find((n: number) => n !== источник) as number;

    /*
     * 🔴 ВРЕМЯ ОСТАНАВЛИВАЕМ НА ВРЕМЯ ХОДА, И БЕЗ ЭТОГО ПРОБА — МОНЕТКА.
     *
     * 📍 Первая редакция шла на настоящих таймерах. Соло она проходила, а в
     * общем прогоне падала: полёт копии длится доли секунды, и под нагрузкой
     * сорока наборов он успевал ЗАКОНЧИТЬСЯ прямо внутри `act` — летящих узлов
     * не оставалось ни одного. Симптом «то зелено, то красно» выглядел как
     * шумная машина, а был проверкой ПРЕХОДЯЩЕГО состояния на живых часах.
     *
     * С поддельными таймерами анимация не двигается вовсе, пока мы её не
     * двинем, и «пока копия летит» становится определённым состоянием.
     */
    jest.useFakeTimers();
    await TestRenderer.act(async () => { товары(r, источник)[товары(r, источник).length - 1]?.props.onPress?.(); });
    await TestRenderer.act(async () => { полки(r).find((n: any) => new RegExp(`^(Полка|Shelf) ${цель}[,:]`).test(String(n.props.accessibilityLabel)))?.props.onPress?.(); });

    /*
     * ⚠️ Нишу-получателя ищем ПО ПРИЗНАКУ ПОЛЁТА, а не по номеру, который
     * вычислили заранее. Раздача случайна, и ход не всегда уходит туда, куда
     * целились: первая редакция брала заранее выбранный номер, ловила там
     * пустоту и падала через раз — «то проходит, то нет» на ровном месте.
     */
    const летит = r.root.findAll((n: any) => n.props?.arrivingLast === true && typeof n.props?.niche === 'number');
    expect(летит.length).toBe(1);
    const прилетевшие = товары(r, (летит[0].props.niche as number) + 1);
    expect(прилетевшие.length).toBeGreaterThan(0);
    const верхний = прилетевшие[прилетевшие.length - 1];
    expect(плоско(верхний.props.style).opacity).toBe(0);
    jest.useRealTimers();
  }, 180_000);
});

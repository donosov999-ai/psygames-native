/**
 * 🔴 СОСУД НЕ ЗАКРЫВАЕТ ШАРЫ.
 *
 * Денис 06.09.2026: «по сосудам, для шариков нужны другие — эти сосуды
 * закрывают часть шариков, надо рисовать, чтобы не перекрывали».
 *
 * ЗАМЕР, КОТОРЫМ ЭТО ПОДТВЕРЖДЕНО (альфа-канал самого файла
 * assets/images/games/water-sort/tube-glass.png, 192×577, внутренняя область
 * между стенками 0,182…0,818):
 *     закрыто площади внутри сосуда ......... 43,1%
 *     средняя альфа внутри .................. 98 из 255 (38%)
 *     пикселей почти непрозрачных (α ≥ 224) .. 31%
 * Для ВОДЫ это блик на стекле — она и должна читаться сквозь стекло. Для ШАРА
 * это закрашенный предмет: под пятном оказываются и цвет, и знак-дублёр,
 * которым цвет продублирован для дальтоника.
 *
 * ⚠️ ПОЧЕМУ ПРОБА ВООБЩЕ ЗАВЕДЕНА. До неё вид сосудов не сторожило НИЧТО: ни
 * одна проба не монтировала экран со шкуркой `balls` или `nuts`. Решение
 * «у шаров стекло уходит в фон» жило одним комментарием — вернуть стекло
 * поверх можно было, не покраснив ни одной проверки.
 *
 * ⚠️ И ПРОВЕРЯЕТСЯ НЕ НАЛИЧИЕ КАРТИНКИ, А ПОРЯДОК СЛОЁВ И ДОЛЯ ЗАКРЫТОГО.
 * «Стекло есть» истинно в обоих случаях — и когда оно под шарами, и когда
 * поверх них. Одного порядка тоже мало: это назвала выжившая мутация «положить
 * стекло и в фон, и спереди» — первая картинка остаётся под шарами, а шары
 * закрыты целиком. Поэтому спереди меряется ВЫСОТА окна: ободок 10%, порог 20%.
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

/** Смонтировать экран игры и войти в партию. */
async function открыть(путь: string) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  const { ThemeProvider } = require('@/src/contexts/ThemeContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { LanguageProvider } = require('@/src/contexts/LanguageContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { ProfileProvider } = require('@/src/contexts/ProfileContext');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { SafeAreaProvider } = require('react-native-safe-area-context');  // eslint-disable-line @typescript-eslint/no-require-imports
  const Screen = require(путь).default;  // eslint-disable-line
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
  await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
  const кнопка = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && /Начать|Start/i.test(текстВнутри(n)))[0];
  if (кнопка) {
    await TestRenderer.act(async () => { кнопка.props.onPress?.(); });
    await TestRenderer.act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
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

/**
 * Порядок слоёв внутри одного сосуда, в порядке обхода дерева.
 *
 * 🔴 РАЗЛИЧАЕМ ПО `resizeMode`, А НЕ ПО ИСТОЧНИКУ. Картинка стекла растягивается
 * (`stretch`) — иначе она не села бы на сосуд любой высоты; шар вписывается
 * (`contain`) — иначе он раздался бы в овал. Это и есть разница по смыслу, а не
 * по имени файла: сравнение `source` сломается от первой же замены ассета.
 */
function слои(сосуд: any): string[] {
  const из: string[] = [];
  сосуд.findAll((n: any) => typeof n.type !== 'string' && n.props?.resizeMode !== undefined)
    .forEach((n: any) => из.push(n.props.resizeMode === 'stretch' ? 'стекло' : 'шар'));
  return из;
}

/** Плоская высота из стиля (стиль может быть массивом). */
function высотаСтиля(style: any): number {
  if (!style) return 0;
  if (Array.isArray(style)) return style.reduce((m: number, s: any) => Math.max(m, высотаСтиля(s)), 0);
  return typeof style.height === 'number' ? style.height : 0;
}

/**
 * СКОЛЬКО ВЫСОТЫ СОСУДА ЗАКРЫТО СТЕКЛОМ, СТОЯЩИМ ПОВЕРХ ШАРОВ.
 *
 * 🔴 Проверять «первая картинка — стекло» НЕДОСТАТОЧНО, и это назвала выжившая
 * мутация: положи стекло и в фон, и спереди — первая картинка по-прежнему под
 * шарами, а шары снова закрыты целиком. Значит мерить надо не порядок, а долю.
 *
 * Считаем по ОКНУ, в котором картинка живёт: ободок нарисован как контейнер с
 * `overflow: 'hidden'` высотой в горловину, и наружу стекло из него не выходит.
 * Нет такого окна — считаем всю высоту картинки.
 */
function закрытоСпереди(сосуд: any): number {
  const все = сосуд.findAll((n: any) => typeof n.type !== 'string' && n.props?.resizeMode !== undefined);
  const первыйШар = все.findIndex((n: any) => n.props.resizeMode !== 'stretch');
  if (первыйШар < 0) return 0;
  let закрыто = 0;
  все.slice(первыйШар + 1).forEach((n: any) => {
    if (n.props.resizeMode !== 'stretch') return;
    let окно = высотаСтиля(n.props.style);
    let p = n.parent;
    for (let i = 0; i < 4 && p; i += 1) {
      const s = p.props?.style;
      const плоско = Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s;
      if (плоско?.overflow === 'hidden' && typeof плоско.height === 'number') { окно = Math.min(окно, плоско.height); break; }
      p = p.parent;
    }
    закрыто += окно;
  });
  return закрыто;
}

/** Сосуды на поле: кнопки с подписью из знаков-дублёров либо «пусто». */
function сосуды(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && n.props?.activeOpacity !== undefined
    && n.props?.style !== undefined);
}

describe('сосуд не закрывает шары', () => {
  it('🔴 у шариков стекло стоит в дереве РАНЬШЕ шаров', async () => {
    const r = await открыть('@/app/games/ball-sort');
    const все = сосуды(r);
    // Иначе проба хвалит пустоту: экран не дошёл до поля, и сравнивать нечего.
    expect(все.length).toBeGreaterThan(2);

    let сНачинкой = 0;
    for (const c of все) {
      const п = слои(c);
      const шар = п.indexOf('шар');
      if (шар < 0) continue;                       // пустой сосуд — сравнивать нечего
      сНачинкой += 1;
      const стекло = п.indexOf('стекло');
      expect(стекло).toBeGreaterThanOrEqual(0);    // сосуд остался сосудом
      expect(стекло).toBeLessThan(шар);            // и он ПОД шарами

      /*
       * И спереди закрыта только горловина. Порог 20% высоты сосуда: ободок по
       * замеру занимает 10% (`ВНУТРИ_СВЕРХУ`), запас вдвое — чтобы проба не
       * краснела от правки ободка на пару пикселей, но краснела от возврата
       * полного стекла (100%).
       */
      const высотаСосуда = высотаСтиля(c.props.style);
      expect(высотаСосуда).toBeGreaterThan(0);
      expect(закрытоСпереди(c) / высотаСосуда).toBeLessThan(0.2);
    }
    expect(сНачинкой).toBeGreaterThan(0);
  });

  it('🔴 у воды стекло, наоборот, стоит ПОВЕРХ — жидкость видна сквозь него', async () => {
    const r = await открыть('@/app/games/water-sort');
    const все = сосуды(r);
    expect(все.length).toBeGreaterThan(2);
    /*
     * У воды порций-картинок нет вовсе: жидкость рисуется цветными View. Значит
     * единственный слой с `resizeMode` — само стекло, и оно обязано быть ровно
     * одно: две картинки означали бы, что ветка шариков подтекла в воду.
     */
    const счёт = все.map((c: any) => слои(c));
    expect(счёт.every((п: string[]) => п.every((x) => x === 'стекло'))).toBe(true);
    expect(счёт.filter((п: string[]) => п.length === 1).length).toBeGreaterThan(2);
  });
});

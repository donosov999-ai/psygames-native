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

declare const __dirname: string;

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



/** Сосуды на поле: кнопки с подписью из знаков-дублёров либо «пусто». */
function сосуды(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && n.props?.activeOpacity !== undefined
    && n.props?.style !== undefined);
}

describe('сосуд не закрывает шары', () => {
  /**
   * 🔴 ЗДЕСЬ МЕРИЛСЯ ПОРЯДОК СЛОЁВ, А ТЕПЕРЬ — САМА КАРТИНКА, И ЭТО СИЛЬНЕЕ.
   *
   * 📍 Порядок был ОБХОДНЫМ ПУТЁМ: старое стекло закрывало полость на 49%, и
   * единственный способ не спрятать шары был убрать стекло за них, оставив
   * спереди ободок. Тестировщик увидел ровно это и написал «нужны другие колбы»
   * (`578d0560`): сосуда не было, был ободок.
   *
   * 09.09.2026 «Шарикам» нарисовано СВОЁ стекло с пустой полостью (1,5% против
   * 49,1%), и оно снова рисуется целиком поверх шаров — как настоящее стекло.
   * Порядок слоёв перестал быть признаком: теперь важна не очерёдность, а то,
   * СКОЛЬКО закрывает картинка. Это и проверяется — прямо по альфа-каналу файла,
   * а не по косвенному признаку в дереве.
   */
  const { PNG } = require('pngjs');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { readFileSync } = require('fs');  // eslint-disable-line @typescript-eslint/no-require-imports
  const { join } = require('path');  // eslint-disable-line @typescript-eslint/no-require-imports

  /**
   * Доля закрытого внутри сосуда и средняя альфа там же.
   *
   * ⚠️ Полоса берётся МЕЖДУ СТЕНКАМИ и ниже горловины — там, где лежат шары.
   * Мерить весь кадр бессмысленно: стенки и ободок непрозрачны по определению,
   * и любое стекло дало бы высокий процент.
   */
  function внутриСосуда(файл: string): { закрыто: number; альфа: number } {
    const png = PNG.sync.read(readFileSync(join(__dirname, '..', '..', 'assets', 'images', 'games', 'water-sort', файл)));
    const { width: w, height: h, data } = png;
    const альфаВ = (x: number, y: number) => data[(y * w + x) * 4 + 3] as number;
    // Внутренние грани стенок — по строке на 55% высоты.
    const y0 = Math.floor(h * 0.55);
    let слева = 0; let справа = w - 1;
    while (слева < w && альфаВ(слева, y0) <= 70) слева += 1;
    while (справа > 0 && альфаВ(справа, y0) <= 70) справа -= 1;
    let внутрЛ = слева;
    while (внутрЛ < справа && альфаВ(внутрЛ, y0) > 40) внутрЛ += 1;
    let внутрП = справа;
    while (внутрП > внутрЛ && альфаВ(внутрП, y0) > 40) внутрП -= 1;
    let сумма = 0; let закрытых = 0; let всего = 0;
    for (let y = Math.floor(h * 0.18); y < Math.floor(h * 0.93); y += 1) {
      for (let x = внутрЛ + 3; x < внутрП - 2; x += 1) {
        const a = альфаВ(x, y);
        сумма += a; всего += 1;
        if (a > 40) закрытых += 1;
      }
    }
    expect(всего).toBeGreaterThan(1000);   // иначе полоса выродилась и проба слепа
    return { закрыто: (закрытых / всего) * 100, альфа: сумма / всего };
  }

  it('🔴 у стекла для шариков полость ПУСТАЯ — шар под ним ничем не закрыт', () => {
    const н = внутриСосуда('tube-glass-balls.png');
    expect(н.закрыто).toBeLessThan(5);
    expect(н.альфа).toBeLessThan(25);
  });

  /**
   * 🔴 ОБРАТНАЯ СТОРОНА, БЕЗ КОТОРОЙ ПЕРВАЯ ПРОВЕРКА НИЧЕГО НЕ ЗНАЧИТ: у
   * ВОДЯНОГО стекла полость как раз ЗАКРЫТА, и это не дефект. Для воды плёнка
   * внутри — блик на стекле, жидкость сама заливает объём. Числа разные в разы,
   * и подмена одного файла другим краснит пробу с обеих сторон.
   */
  it('🔴 у водяного стекла полость, наоборот, закрыта — потому шарикам и нужно своё', () => {
    const в = внутриСосуда('tube-glass.png');
    expect(в.закрыто).toBeGreaterThan(25);
    expect(в.альфа).toBeGreaterThan(60);
  });

  it('🔴 шарики и вода берут РАЗНЫЕ файлы стекла', async () => {
    const шары = await открыть('@/app/games/ball-sort');
    const вода = await открыть('@/app/games/water-sort');
    const стёкла = (r: any) => new Set(r.root.findAll((n: any) => typeof n.type !== 'string'
      && n.props?.resizeMode === 'stretch' && n.props?.source !== undefined)
      .map((n: any) => JSON.stringify(n.props.source)));
    const ш = стёкла(шары); const в = стёкла(вода);
    expect(ш.size).toBeGreaterThan(0);
    expect(в.size).toBeGreaterThan(0);
    expect([...ш].some((x) => в.has(x))).toBe(false);
  });

  it('🔴 у воды стекло по-прежнему одно на сосуд, ветка шариков в неё не подтекла', async () => {
    const r = await открыть('@/app/games/water-sort');
    const все = сосуды(r);
    expect(все.length).toBeGreaterThan(2);
    const счёт = все.map((c: any) => слои(c));
    expect(счёт.every((п: string[]) => п.every((x) => x === 'стекло'))).toBe(true);
    expect(счёт.filter((п: string[]) => п.length === 1).length).toBeGreaterThan(2);
  });
});

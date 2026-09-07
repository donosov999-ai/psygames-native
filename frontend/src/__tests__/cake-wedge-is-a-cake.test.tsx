/**
 * 🔴 КУСОК ТОРТА ВЫГЛЯДИТ ТОРТОМ, А НЕ ДОЛЕЙ ДИАГРАММЫ.
 *
 * Денис 07.09.2026: «тортики надо отрисовать, щас страшные». Клинья рисовались
 * одноцветными треугольниками — шесть заливок в круге читаются как круговая
 * диаграмма, а не как кондитерская.
 *
 * ЧТО ПРОВЕРЯЕТСЯ, И ПОЧЕМУ ИМЕННО ЭТО:
 *   1. на каждый кусок приходится КАРТИНКА, обрезанная маской сектора;
 *   2. под картинкой ОСТАЁТСЯ цветная заливка вида начинки;
 *   3. маски именованы РАЗНО для разных тарелок.
 *
 * ⚠️ Пункт 2 — не украшение. Цвет вида начинки это единственный канал, по
 * которому игрок отличает виды друг от друга; рисунок добавляет второй, но не
 * заменяет первый. Убери заливку — и при недоехавшем ассете стол станет
 * нечитаемым, а не просто скучным.
 *
 * ⚠️ Пункт 3 — про то, как устроен SVG: `id` живёт в ОДНОМ пространстве имён на
 * весь документ, а тарелок на столе до двадцати. Совпади имена масок — все
 * куски обрезались бы одной, то есть кусок одной тарелки взял бы форму другой.
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

/**
 * 🔴 ЭКРАНЫ ГАСИМ ПОСЛЕ КАЖДОЙ ПРОБЫ, И ЭТО НЕ ОПРЯТНОСТЬ, А УСЛОВИЕ ПРОГОНА.
 *
 * 📍 Замер 07.09.2026: без гашения прогон печатал `PASS`, а следом ронял процесс
 * узла — `TypeError: window.dispatchEvent is not a function` из `reportGlobalError`,
 * без единой строки FAIL. Причина: питомец в шапке каркаса (`PetSprite`) держит
 * `setTimeout` смены кадра; шесть незакрытых экранов продолжают тикать после
 * `afterAll`, и первый же кадр после сноса окружения падает на `import` уже
 * разобранного модуля.
 *
 * ⚠️ Верить коду выхода при этом нельзя: смерть наступает ПОСЛЕ вердикта.
 */
const открытые: any[] = [];
afterEach(async () => {
  while (открытые.length) {
    const r = открытые.pop();
    await TestRenderer.act(async () => { r.unmount(); });
  }
});

async function открыть(путь = '@/app/games/cake-sort', уровни: Record<string, string> = {}, начинать = true) {
  const AsyncStorage = require('@react-native-async-storage/async-storage');  // eslint-disable-line @typescript-eslint/no-require-imports
  await AsyncStorage.clear();
  await AsyncStorage.setItem('psygames_active_profile', 'free');
  for (const [игра, номер] of Object.entries(уровни)) {
    // Ключ ровно тот, что строит usePersistentLevel: `psygames_<игра>_level_<профиль>`.
    await AsyncStorage.setItem(`psygames_${игра}_level_free`, номер);
  }
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
  await TestRenderer.act(async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); });
  открытые.push(r);
  const кнопка = начинать ? r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.onPress === 'function'
    && /Начать|Start/i.test(текстВнутри(n)))[0] : null;
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

/** Картинки тортов на столе: узлы с `href` и маской сектора. */
function картинкиКусков(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.href !== undefined
    && typeof n.props?.clipPath === 'string'
    && n.props.clipPath.includes('cake-'));
}

/**
 * Источники картинок ПОСУДЫ: по одной на тарелку, берутся изнутри её кнопки.
 *
 * ⚠️ Ищем не «картинку на экране», а картинку ВНУТРИ кнопки тарелки: значков и
 * оформления на экране хватает, и проба, считающая их все, зазеленеет от шапки.
 */
function посудаНаСтоле(r: any): Set<string> {
  const тарелки = r.root.findAll((n: any) => typeof n.type !== 'string'
    && n.props?.accessibilityRole === 'button'
    && typeof n.props?.accessibilityLabel === 'string'
    && /: \d+\/\d+$/.test(n.props.accessibilityLabel));
  const источники = new Set<string>();
  тарелки.forEach((т: any) => т.findAll((n: any) => n.props?.source !== undefined
    && n.props?.resizeMode === 'contain')
    .forEach((n: any) => источники.add(JSON.stringify(n.props.source))));
  return источники;
}

/** Заливки секторов: пути с цветом и с командой дуги (то есть именно клинья). */
function заливкиКусков(r: any): any[] {
  return r.root.findAll((n: any) => typeof n.type !== 'string'
    && typeof n.props?.d === 'string'
    && n.props.d.includes(' A ')
    && typeof n.props?.fill === 'string'
    && n.props.fill !== 'none');
}

describe('кусок торта — картинка, а не доля диаграммы', () => {
  it('🔴 у каждого куска есть картинка, обрезанная маской сектора', async () => {
    const r = await открыть();
    const картинок = картинкиКусков(r);
    // Иначе проба хвалит пустоту: экран не дошёл до стола.
    expect(картинок.length).toBeGreaterThan(3);
    // У каждой картинки свой источник и своя маска — пустых нет.
    картинок.forEach((n: any) => {
      expect(n.props.href).toBeTruthy();
      expect(n.props.clipPath).toMatch(/^url\(#cake-\d+-\d+\)$/);
    });
  }, 120_000);

  it('🔴 под картинкой остаётся цветная заливка вида начинки', async () => {
    const r = await открыть();
    const заливок = заливкиКусков(r);
    const картинок = картинкиКусков(r);
    expect(картинок.length).toBeGreaterThan(3);
    /*
     * Заливок не меньше, чем картинок: на каждый кусок приходится и то и другое.
     * Не «ровно столько же» — обводка сектора рисуется тем же путём, и считать
     * её отдельно значило бы привязываться к числу слоёв, а не к утверждению.
     */
    expect(заливок.length).toBeGreaterThanOrEqual(картинок.length);
    // И цвета настоящие, а не прозрачные заглушки.
    expect(заливок.every((n: any) => /^#[0-9a-fA-F]{6}$/.test(n.props.fill))).toBe(true);
  }, 120_000);

  it('🔴 маски разных тарелок названы по-разному', async () => {
    const r = await открыть();
    const маски = r.root.findAll((n: any) => typeof n.type !== 'string'
      && typeof n.props?.id === 'string' && n.props.id.startsWith('cake-'))
      .map((n: any) => n.props.id);
    expect(маски.length).toBeGreaterThan(3);
    /*
     * ⚠️ Проверяем ИМЕННО номер тарелки в имени: маски `cake-0-0` и `cake-1-0`
     * это разные сектора разных тарелок. Совпади они — вторая тарелка обрезала
     * бы свои куски маской первой.
     */
    expect(new Set(маски).size).toBe(маски.length);
    const тарелки = new Set(маски.map((s: string) => s.split('-')[1]));
    expect(тарелки.size).toBeGreaterThan(1);
  }, 120_000);
});

describe('пицца — та же механика, другие картинки', () => {
  /**
   * 🔴 РЕЖИМ ПИЦЦЫ ОТЛИЧАЕТСЯ ИМЕННО КАРТИНКАМИ, А НЕ ПРАВИЛАМИ.
   *
   * Денис 07.09.2026: «ещё сделать режим пиццы, смысл тот же, картинки разные».
   * Значит проверять надо две вещи сразу: что круг собирается ТЕМ ЖЕ способом
   * (маски секторов на месте) и что рисунки ДРУГИЕ — иначе «режим» существует
   * только в названии.
   */
  it('🔴 у пиццы свои картинки, а не тортовые', async () => {
    const торты = await открыть('@/app/games/cake-sort');
    const пицца = await открыть('@/app/games/pizza-sort');
    const источники = (r: any) => new Set(картинкиКусков(r).map((n: any) => JSON.stringify(n.props.href)));
    const т = источники(торты); const п = источники(пицца);
    expect(т.size).toBeGreaterThan(0);
    expect(п.size).toBeGreaterThan(0);
    // Ни одного общего источника: наборы разные целиком.
    expect([...п].some((x) => т.has(x))).toBe(false);
  }, 180_000);

  it('🔴 круг у пиццы собирается тем же способом — маски секторов на месте', async () => {
    const r = await открыть('@/app/games/pizza-sort');
    expect(картинкиКусков(r).length).toBeGreaterThan(3);
    expect(заливкиКусков(r).length).toBeGreaterThanOrEqual(картинкиКусков(r).length);
  }, 120_000);

  /**
   * 🔴 И ПОСУДА У ПИЦЦЫ СВОЯ, А НЕ КОНДИТЕРСКИЕ ТАРЕЛКИ ТЕМЫ ПРОФИЛЯ.
   *
   * 📍 Пункт заведён по ВЫЖИВШЕЙ МУТАЦИИ: `boardsFor` с телом `return тарелкиТемы;`
   * не красит ни одной пробы. Видно это было на живом экране — пицца стояла на
   * фарфоре с золотой каймой из «сладкой» темы: нарядно и не по делу. Тарелки
   * несут ТЕМУ ПРОФИЛЯ (сладкая, шахматная, биохак), а пицце нужен МАТЕРИАЛ —
   * дерево, металл, керамика.
   *
   * ⚠️ Сверяем ИСТОЧНИКИ картинок, а не их наличие: картинка под кругом есть у
   * обеих игр всегда, и проба «посуда нарисована» зелена при любой подмене.
   */
  it('🔴 у пиццы своя посуда, ни одной тарелки из тем тортов', async () => {
    const торты = await открыть('@/app/games/cake-sort');
    const пицца = await открыть('@/app/games/pizza-sort');
    const т = посудаНаСтоле(торты); const п = посудаНаСтоле(пицца);
    // Больше одной: иначе проба хвалит стол, который не доехал до тарелок.
    expect(т.size).toBeGreaterThan(1);
    expect(п.size).toBeGreaterThan(1);
    expect([...п].some((x) => т.has(x))).toBe(false);
  }, 180_000);
});

describe('у пиццы своя лестница', () => {
  /**
   * 🔴 РЕЖИМ — ЭТО НЕ ТОЛЬКО ДРУГИЕ КАРТИНКИ, НО И СВОЙ ПРОГРЕСС.
   *
   * 📍 Пункт заведён по ВЫЖИВШЕЙ МУТАЦИИ: подмена `gameId="pizza_sort"` на
   * `"cake_sort"` не покраснила ни одной пробы. А цена подмены прямая — пройденное
   * в тортах открывало бы пиццу, недоигранная партия одной игры поднималась бы в
   * другой, и два «режима» оказались бы одной игрой с двумя обложками.
   *
   * Проверяем наблюдаемым: кладём РАЗНЫЕ сохранённые уровни двум играм и смотрим,
   * какой номер каждая показывает у себя на экране.
   */
  it('🔴 сохранённый уровень пиццы не берётся у тортов', async () => {
    const уровни = { cake_sort: '3', pizza_sort: '7' };
    const торты = await открыть('@/app/games/cake-sort', уровни, false);
    const пицца = await открыть('@/app/games/pizza-sort', уровни, false);
    const номер = (r: any) => {
      const весь = текстВнутри(r.root);
      const м = весь.match(/(?:Уровень|Level)\s+(\d+)/);
      return м ? Number(м[1]) : -1;
    };
    expect(номер(торты)).toBe(3);
    expect(номер(пицца)).toBe(7);
  }, 180_000);
});

/**
 * 🔴 МАРШРУТ И ИЗУЧЕНИЕ ПОМЕЩАЮТСЯ В ЭКРАН, И ИМЯ ПРЕДМЕТА ОСТАЁТСЯ ЧИТАЕМЫМ.
 *
 * ОТКУДА. Фаза размещения ужата 05.09.2026 (см. `memory-palace-place-fits-screen`),
 * а две соседние фазы остались на прежней плитке `locusTile` — `minHeight: 150`,
 * `flexBasis: 145`. На 375 точках такая плитка встаёт в ряд ПО ОДНОЙ: 2 × 145 +
 * зазор 10 = 300 против 287 внутренних.
 *
 * 📍 ЗАМЕР ДО, живая сборка 05.09.2026, 375×812, ru, видимая высота игры 741:
 *   маршрут, уровень 1  — содержимое 1146, за экраном 405, сцена мест 820
 *   маршрут, уровень 15 — содержимое 2266, за экраном 1525, сцена мест 1940
 *   изучение, уровень 1 — содержимое 1166, за экраном 425, сцена мест 869
 *
 * 📍 ЗАМЕР ПОСЛЕ, та же сборка и тот же экран:
 *   маршрут, уровень 15, ru — 594, за экраном 0 (сцена 280)
 *   маршрут, уровень 15, de — 594, за экраном 0
 *   изучение, уровень 15, ru — 733, за экраном 0 (сцена 472)
 *   изучение, уровень 15, de — 744, за экраном 3 (в повторном прогоне 746 и 5:
 *     заголовок отрисовывается то в 90, то в 92 точки; у немецкого заголовок фазы
 *     «Mach die Assoziationen lebendig» занимает три строки кеглем 26 — 92 точки
 *     против 61 у русского; ниже сгиба остаётся край клавиатурной подсказки,
 *     весь дворец и кнопка видны)
 *
 * ⚠️ ЧЕМ ЭТА ПРОБА ОТЛИЧАЕТСЯ ОТ ЧТЕНИЯ ИСХОДНИКА. Проверок три, и порознь
 * каждая дырявая:
 *   1. ЖИВОЕ ДЕРЕВО. Партия доводится до нужной фазы и рисуется
 *      react-test-renderer'ом; из дерева снимаются НАСТОЯЩИЕ стили плиток и
 *      проверяется, что в изучении ИМЯ предмета действительно выведено текстом,
 *      а в маршруте нет слота под предмет. Без этого формула могла бы быть
 *      верной при неверной разметке.
 *   2. ВЫСОТА ПО ФОРМУЛЕ `memoryPalaceRouteHeight`/`memoryPalaceStudyHeight` —
 *      той же, из которой собраны стили, на всех 15 уровнях × 12 языках.
 *   3. ПОДПИСЬ НЕ РВЁТСЯ ВНУТРИ СЛОВА. Ширина плитки считается из той же
 *      раскладки; самое длинное слово каждого языка обязано в неё влезать. Это
 *      и есть причина трёх колонок вместо четырёх, и проверка краснеет, если
 *      колонок станет четыре.
 *
 * ⚠️ ШИРИНУ ФОРМУЛЫ БЕРЁМ 355, А НЕ 375. Замер 05.09.2026: экран игры лежит в
 * контейнере с `padding: 0 10px`, поэтому прокрутке достаётся 355 точек. С 375
 * модель считала бы строки по ширине, которой на экране нет.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { MemoryPalaceGame } from '@/src/games/memory-palace/MemoryPalaceGame';
import {
  PLACE_LAYOUT,
  memoryPalaceRouteHeight,
  memoryPalaceScrollWidth,
  memoryPalaceStudyHeight,
  palaceColumns,
  palaceLocusBasis,
  palaceTileHeight,
  palaceTileTextWidth,
  type RouteTextLengths,
  type StudyTextLengths,
} from '@/src/games/memory-palace/placeLayout';
import {
  confirmMemoryPalacePlacements,
  continueToPlacement,
  createMemoryPalaceSession,
  FIXED_PALACE_ROUTE,
  getItemLabel,
  getLocusLabel,
  getMemoryPalaceStrings,
  interpolateMemoryPalace,
  memoryPalaceLociCountForLevel,
  PALACE_ITEM_LIBRARY,
  placeSelectedItemAtLocus,
  selectPlacementItem,
  startMemoryPalaceRound,
  MEMORY_PALACE_LOCALES,
  type MemoryPalaceLocale,
  type MemoryPalaceSession,
} from '@/src/games/memory-palace/core';

const TestRenderer = require('react-test-renderer'); // eslint-disable-line @typescript-eslint/no-require-imports

/** Экран тестировщицы: iPhone-портрет. */
const ЭКРАН = { высота: 812 };
/** Ширина ПРОКРУТКИ игры: экран минус поле контейнера, см. `screenGutter`. */
const ШИРИНА = memoryPalaceScrollWidth(375);
/** Видимая высота самой игры: экран минус шапка приложения (замер 05.09.2026). */
const ВИДИМО = 741;

const тема = {
  background: '#fff', surface: '#f4f4f5', card: '#fff', text: '#111',
  textSecondary: '#555', primary: '#7c3aed', border: '#ddd',
  success: '#16a34a', error: '#dc2626', warning: '#f59e0b',
};

function партияВМаршруте(level: number): MemoryPalaceSession {
  return startMemoryPalaceRound(createMemoryPalaceSession({ seed: 'проба-фаз', level }), 1_000);
}

/** Партия, доведённая до изучения: все предметы разложены по местам по порядку. */
function партияВИзучении(level: number): MemoryPalaceSession {
  let s = continueToPlacement(партияВМаршруте(level));
  s.round.targetItems.forEach((item, index) => {
    s = selectPlacementItem(s, item.id);
    s = placeSelectedItemAtLocus(s, index);
  });
  return confirmMemoryPalacePlacements(s);
}

function длиныМаршрута(locale: MemoryPalaceLocale, мест: number): RouteTextLengths {
  const s = getMemoryPalaceStrings(locale);
  return {
    title: s.routeTitle.length,
    count: interpolateMemoryPalace(s.routeCount, { count: мест }).length,
    purpose: s.purpose.length,
    body: s.routeBody.length,
    keyboardHelp: s.keyboardHelp.length,
  };
}

function длиныИзучения(locale: MemoryPalaceLocale): StudyTextLengths {
  const s = getMemoryPalaceStrings(locale);
  return { title: s.studyTitle.length, body: s.studyBody.length, keyboardHelp: s.keyboardHelp.length };
}

function нарисовать(session: MemoryPalaceSession, level: number, locale: MemoryPalaceLocale = 'ru') {
  let r: any;
  TestRenderer.act(() => {
    r = TestRenderer.create(
      <MemoryPalaceGame
        seed="проба-фаз"
        level={level}
        locale={locale}
        theme={тема}
        gameGradient={['#7c3aed', '#2dd4bf'] as const}
        gameGradientText="#fff"
        showOwnResults={false}
        now={() => 1_000}
        initialSession={session}
      />,
    );
  });
  const узлы = r.root.findAll((n: any) => typeof n.type === 'string' && n.props?.style)
    .map((n: any) => StyleSheet.flatten(n.props.style) as any)
    .filter(Boolean);
  /** Весь текст дерева одной строкой — по нему видно, что выведено, а что нет. */
  const тексты: string[] = [];
  const собрать = (node: any) => {
    if (typeof node === 'string') { тексты.push(node); return; }
    if (Array.isArray(node)) { node.forEach(собрать); return; }
    if (node && node.children) node.children.forEach(собрать);
  };
  собрать(r.toJSON());
  return { r, узлы, тексты };
}

describe('Дворец памяти · маршрут и изучение помещаются в экран', () => {
  it('есть что проверять: партии действительно в нужных фазах', () => {
    const м = партияВМаршруте(15);
    const и = партияВИзучении(15);
    expect(м.phase).toBe('route');
    expect(и.phase).toBe('study');
    expect(и.round.lociCount).toBe(12);
    expect(и.placements.filter(Boolean).length).toBe(12);
  });

  /**
   * 🔴 ПЛИТКИ МАРШРУТА КОМПАКТНЫЕ И В ТРИ КОЛОНКИ. Старая плитка узнаётся по
   * `minHeight: 150` и `flexBasis: 145` — их в дереве быть не должно.
   */
  it('🔴 маршрут: плитки 62 точки, три колонки, старой раскладки нет', () => {
    for (const level of [1, 9, 15]) {
      const session = партияВМаршруте(level);
      const { r, узлы } = нарисовать(session, level);
      const мест = session.round.lociCount;
      const плитки = узлы.filter((s: any) => s.minHeight === PLACE_LAYOUT.routeTileHeight);
      expect(плитки.length).toBe(мест);
      for (const п of плитки) expect(п.flexBasis).toBe('31%');
      expect(узлы.some((s: any) => s.minHeight === 150)).toBe(false);
      expect(узлы.some((s: any) => s.flexBasis === 145)).toBe(false);
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /**
   * 🔴 В МАРШРУТЕ НЕТ НИ СЛОВА «ПУСТО», НИ СЛОТА ПОД ПРЕДМЕТ. Предметов в этой
   * фазе не существует: старая плитка писала «Пусто» под каждым местом и держала
   * место под картинку — 20 точек в каждой из двенадцати плиток.
   */
  it('🔴 маршрут: подписи «Пусто» и слота под предмет нет', () => {
    const session = партияВМаршруте(15);
    const { r, узлы, тексты } = нарисовать(session, 15);
    expect(тексты).not.toContain(getMemoryPalaceStrings('ru').emptyLocus);
    // слот под предмет — единственный блок ровно такой высоты
    expect(узлы.some((s: any) => s.height === PLACE_LAYOUT.tileAssetSize)).toBe(false);
    TestRenderer.act(() => { r.unmount(); });
  });

  /**
   * 🔴 ГЛАВНОЕ В ИЗУЧЕНИИ: ИМЯ ПРЕДМЕТА ВЫВЕДЕНО ТЕКСТОМ, А НЕ УШЛО В
   * `accessibilityLabel`. На опросе кандидатов рисует полная плитка `ItemChoice`
   * С ПОДПИСЬЮ — предмет, выученный как «зелёный кружок», пришлось бы называть
   * там словом, которого человек ни разу не читал.
   */
  it('🔴 изучение: у каждого места выведены и название, и имя предмета', () => {
    for (const level of [1, 15]) {
      const session = партияВИзучении(level);
      const { r, тексты } = нарисовать(session, level);
      for (const locus of session.round.loci) {
        expect(тексты).toContain(getLocusLabel(locus, 'ru'));
      }
      for (const item of session.round.targetItems) {
        expect(тексты).toContain(getItemLabel(item, 'ru'));
      }
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /** Плитка изучения выше плитки маршрута ровно на фигуру предмета и его имя. */
  it('🔴 изучение: плитки 110 точек, три колонки', () => {
    for (const level of [1, 9, 15]) {
      const session = партияВИзучении(level);
      const { r, узлы } = нарисовать(session, level);
      const плитки = узлы.filter((s: any) => s.minHeight === PLACE_LAYOUT.studyTileHeight);
      expect(плитки.length).toBe(session.round.lociCount);
      for (const п of плитки) expect(п.flexBasis).toBe('31%');
      expect(узлы.some((s: any) => s.minHeight === 150)).toBe(false);
      TestRenderer.act(() => { r.unmount(); });
    }
  });

  /**
   * 🔴 ОБЪЯВЛЕННАЯ ВЫСОТА ПЛИТКИ НЕ МЕНЬШЕ СУММЫ ЕЁ СОДЕРЖИМОГО.
   *
   * Без этой проверки константа высоты тавтологична: сдвинь её — и проба,
   * которая ищет плитки ПО ЭТОЙ ЖЕ константе, останется зелёной, а на экране
   * содержимое распрёт коробку (у View в react-native-web `box-sizing:
   * border-box`, поле и рамка ВХОДЯТ в `minHeight` — на этом уже спотыкались
   * при вводе компактной плитки размещения: объявили 88, живые вышли 90).
   *
   * Слагаемые берутся ИЗ ЖИВОГО ДЕРЕВА, а не переписываются числом: ромб,
   * межстрочный подписи места (две строки), фигура предмета, межстрочный имени
   * предмета (две строки), поле, рамка и зазоры самой плитки.
   */
  it('🔴 высота плитки изучения не меньше того, что в ней лежит', () => {
    const session = партияВИзучении(15);
    const { r, узлы } = нарисовать(session, 15);
    const плитка = узлы.find((s: any) => s.minHeight === PLACE_LAYOUT.studyTileHeight);
    const ромб = узлы.find((s: any) => s.width === 26 && s.height === 26);
    const названиеМеста = узлы.find((s: any) => s.fontSize === 10 && s.fontWeight === '800');
    const фигура = узлы.find((s: any) => s.width === PLACE_LAYOUT.tileAssetSize
      && s.height === PLACE_LAYOUT.tileAssetSize);
    const имяПредмета = узлы.find((s: any) => s.fontSize === 10 && s.fontWeight === '600');
    const блокПредмета = узлы.find((s: any) => s.alignItems === 'center' && s.gap === 2 && !s.minHeight);
    for (const [имя, знач] of Object.entries({ плитка, ромб, названиеМеста, фигура, имяПредмета, блокПредмета })) {
      expect(имя + ': ' + (знач ? 'есть' : 'НЕТ')).toBe(имя + ': есть');
    }
    const содержимое = ромб.height
      + плитка.gap + 2 * названиеМеста.lineHeight
      + плитка.gap + (фигура.height + блокПредмета.gap + 2 * имяПредмета.lineHeight);
    const коробка = содержимое + 2 * плитка.paddingVertical + 2 * плитка.borderWidth;
    expect(PLACE_LAYOUT.studyTileHeight).toBeGreaterThanOrEqual(коробка);
    TestRenderer.act(() => { r.unmount(); });
  });

  /** Высота плитки в разметке и в формуле — одно и то же число, не два похожих. */
  it('высоты плиток берутся из формулы раскладки', () => {
    expect(palaceTileHeight('route')).toBe(PLACE_LAYOUT.routeTileHeight);
    expect(palaceTileHeight('study')).toBe(PLACE_LAYOUT.studyTileHeight);
    expect(palaceTileHeight('place')).toBe(PLACE_LAYOUT.locusTileHeight);
  });

  /**
   * 🔴 СОДЕРЖИМОЕ НЕ ВЫШЕ ОКНА 812 — все 15 уровней, все 12 языков, обе фазы.
   * До правки маршрут на пятнадцатом уровне был 2266.
   */
  it('🔴 маршрут и изучение не выше окна 812 на всех уровнях и языках', () => {
    const плохие: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (let level = 1; level <= 15; level += 1) {
        const мест = memoryPalaceLociCountForLevel(level);
        const м = memoryPalaceRouteHeight(ШИРИНА, мест, длиныМаршрута(locale, мест));
        const и = memoryPalaceStudyHeight(ШИРИНА, мест, длиныИзучения(locale));
        if (м.total > ЭКРАН.высота) плохие.push(`маршрут ${locale} L${level}: ${м.total}`);
        if (и.total > ЭКРАН.высота) плохие.push(`изучение ${locale} L${level}: ${и.total}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  /**
   * 🔴 В РУССКОМ ПРОКРУЧИВАТЬ НЕ ПРИХОДИТСЯ ВООБЩЕ — ни одной точки за экраном
   * ни на одном из пятнадцати уровней.
   *
   * 📍 Живой замер 05.09.2026: маршрут L15 — 594 при видимых 741, изучение L15 —
   * 733. Именно это и держат три экономии, каждая из которых по отдельности
   * выглядит мелочью: инструкция кеглем 13/18 вместо 16/24 (−18 в изучении,
   * −12 в маршруте), счётчик мест убран из шапки изучения (−18) и слот под
   * предмет убран из плитки маршрута (−22 на каждую строку сетки). Уберите
   * любую — и русское изучение снова уедет за сгиб.
   */
  it('🔴 русский: обе фазы помещаются целиком, все 15 уровней', () => {
    const плохие: string[] = [];
    for (let level = 1; level <= 15; level += 1) {
      const мест = memoryPalaceLociCountForLevel(level);
      const м = memoryPalaceRouteHeight(ШИРИНА, мест, длиныМаршрута('ru', мест));
      const и = memoryPalaceStudyHeight(ШИРИНА, мест, длиныИзучения('ru'));
      if (м.total > ВИДИМО) плохие.push(`маршрут L${level}: ${м.total} > ${ВИДИМО}`);
      if (и.total > ВИДИМО) плохие.push(`изучение L${level}: ${и.total} > ${ВИДИМО}`);
    }
    expect(плохие).toEqual([]);
  });

  /**
   * 🔴 ХУДШИЙ ЯЗЫК УХОДИТ ЗА СГИБ НЕ БОЛЬШЕ ЧЕМ НА 25 ТОЧЕК ПО МОДЕЛИ.
   *
   * 📍 Замер 05.09.2026: хуже всех немецкий и французский на пятнадцатом уровне
   * — ЖИВЫЕ 744 против видимых 741, то есть 3 точки, и это край клавиатурной
   * подсказки; заголовок фазы у них занимает три строки кеглем 26 (92 точки
   * против 61 у русского).
   *
   * ⚠️ ПОРОГ 25, А НЕ 10, И ЭТО НЕ ЗАПАС «НА ВСЯКИЙ СЛУЧАЙ». Модель
   * `textBlockHeight` считает строки по числу знаков и не знает о границах слов,
   * поэтому на немецком теле изучения (79 знаков при 39 в строке) она даёт три
   * строки там, где браузер верстает две: модель 763,5 против живых 746 — ошибка
   * ровно в одну строку и всегда В ЗАПАС. Порог берётся по модели, потому что
   * гейт живёт в jest, где шрифта нет; 25 — это модельные 22,5 плюс округление.
   * Проверено мутацией: верните инструкции кегль 16/24 и счётчик в шапку
   * изучения — модель даст 58 точек за сгибом, и проба покраснеет.
   */
  it('🔴 ни один язык не уходит за сгиб больше чем на 25 точек (по модели)', () => {
    const плохие: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (let level = 1; level <= 15; level += 1) {
        const мест = memoryPalaceLociCountForLevel(level);
        const м = memoryPalaceRouteHeight(ШИРИНА, мест, длиныМаршрута(locale, мест));
        const и = memoryPalaceStudyHeight(ШИРИНА, мест, длиныИзучения(locale));
        if (м.total - ВИДИМО > 25) плохие.push(`маршрут ${locale} L${level}: за экраном ${м.total - ВИДИМО}`);
        if (и.total - ВИДИМО > 25) плохие.push(`изучение ${locale} L${level}: за экраном ${и.total - ВИДИМО}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  /**
   * 🔴 ВЕСЬ ДВОРЕЦ ВИДЕН РАЗОМ — низ сцены мест не ниже видимых 741 точек. Это
   * и есть смысл обеих фаз: в маршруте порядок мест запоминают целиком, в
   * изучении целиком же просматривают связки. До правки низ сцены в маршруте на
   * пятнадцатом уровне стоял на 2118.
   */
  it('🔴 сцена мест видна целиком в обеих фазах на всех языках', () => {
    const плохие: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      for (let level = 1; level <= 15; level += 1) {
        const мест = memoryPalaceLociCountForLevel(level);
        const м = memoryPalaceRouteHeight(ШИРИНА, мест, длиныМаршрута(locale, мест));
        const и = memoryPalaceStudyHeight(ШИРИНА, мест, длиныИзучения(locale));
        if (м.sceneBottom > ВИДИМО) плохие.push(`маршрут ${locale} L${level}: низ сцены ${м.sceneBottom}`);
        if (и.sceneBottom > ВИДИМО) плохие.push(`изучение ${locale} L${level}: низ сцены ${и.sceneBottom}`);
      }
    }
    expect(плохие).toEqual([]);
  });

  /**
   * 🔴 ПОДПИСЬ НЕ РВЁТСЯ ВНУТРИ СЛОВА — ЭТО И ЕСТЬ ПРИЧИНА ТРЁХ КОЛОНОК.
   *
   * У `Text` в react-native-web стоит `overflow-wrap: break-word`: слово, не
   * влезающее в строку целиком, разрывается посередине. Название места и имя
   * предмета здесь материал упражнения — человек их проговаривает, и
   * «Обсерва/тория» ломает не вид, а сам приём.
   *
   * 📍 ЖИВОЙ ЗАМЕР 05.09.2026, браузер, системный шрифт, кегль 10, начертание
   * 800 — ширина САМОГО ШИРОКОГО СЛОВА каждого языка в точках (таблица ниже).
   * Ширину шрифта jest измерить не может, поэтому замер записан числом; чтобы
   * запись не устарела молча, рядом стоит ЧИСЛО ЗНАКОВ в самом длинном слове
   * языка, и первая проверка сверяет его с живым словарём. Появится подпись
   * длиннее — проба покраснеет и потребует перезамер, а не промолчит.
   */
  const САМОЕ_ШИРОКОЕ_СЛОВО: Record<string, { длинное: string; знаков: number; точек: number }> = {
    ru: { длинное: 'Обсерватория', знаков: 12, точек: 78.2 },
    en: { длинное: 'Observatory', знаков: 11, точек: 65.6 },
    es: { длинное: 'Observatorio', знаков: 12, точек: 68.7 },
    de: { длинное: 'Korallenmuschel', знаков: 15, точек: 88.8 },
    zh: { длинное: '薄荷色相机', знаков: 5, точек: 48.0 },
    hi: { длинное: 'चित्रशाला', знаков: 9, точек: 44.1 },
    pt: { длинное: 'Observatório', знаков: 12, точек: 68.7 },
    fr: { длинное: 'Bibliothèque', знаков: 12, точек: 68.4 },
    it: { длинное: 'Osservatorio', знаков: 12, точек: 67.8 },
    ja: { длинное: 'だいだい色のランプ', знаков: 9, точек: 88.2 },
    ko: { длинное: '바이올린', знаков: 4, точек: 34.6 },
    ar: { длинное: 'النافورة', знаков: 8, точек: 27.4 },
  };

  const словаЯзыка = (locale: MemoryPalaceLocale): string[] => [
    ...FIXED_PALACE_ROUTE.map((l: any) => l.label[locale] as string),
    ...PALACE_ITEM_LIBRARY.map((i: any) => i.label[locale] as string),
  ].flatMap((s) => s.split(/[\s‐-―-]+/).filter(Boolean));

  /** Сторож замера: словарь не должен уезжать от таблицы незаметно. */
  it('🔴 замер ширин не устарел: самое длинное слово каждого языка — то же', () => {
    const устарело: string[] = [];
    for (const locale of MEMORY_PALACE_LOCALES) {
      const макс = Math.max(...словаЯзыка(locale).map((w) => [...w].length));
      const т = САМОЕ_ШИРОКОЕ_СЛОВО[locale];
      if (макс !== т.знаков) {
        устарело.push(`${locale}: в словаре слово из ${макс} знаков, замерено ${т.знаков} («${т.длинное}») — перемерить ширины`);
      }
    }
    expect(устарело).toEqual([]);
  });

  /**
   * 🔴 ТРИ КОЛОНКИ ВМЕЩАЮТ САМОЕ ШИРОКОЕ СЛОВО, ЧЕТЫРЕ — НЕТ. Проверка
   * двусторонняя: без второй половины «три колонки» выглядели бы просто
   * осторожностью, а не вынужденным выбором.
   */
  it('🔴 самое широкое слово влезает в три колонки и НЕ влезает в четыре', () => {
    const три = palaceTileTextWidth(ШИРИНА, 12, 'study');
    const четыре = (() => {
      const сцена = ШИРИНА - 2 * PLACE_LAYOUT.contentPadding - 2 - 2 * PLACE_LAYOUT.scenePadding;
      return (сцена - 3 * PLACE_LAYOUT.sceneGap) / 4 - 6 - 2;
    })();
    expect(Math.round(три)).toBe(92);
    expect(Math.round(четыре)).toBe(66);

    const рвутсяПриТрёх = MEMORY_PALACE_LOCALES.filter((l) => САМОЕ_ШИРОКОЕ_СЛОВО[l].точек > три);
    expect(рвутсяПриТрёх).toEqual([]);

    const рвутсяПриЧетырёх = MEMORY_PALACE_LOCALES.filter((l) => САМОЕ_ШИРОКОЕ_СЛОВО[l].точек > четыре);
    // ru, es, de, pt, fr, it, ja — семь языков из двенадцати
    expect(рвутсяПриЧетырёх.length).toBeGreaterThanOrEqual(7);
    expect(рвутсяПриЧетырёх).toContain('ru');
    expect(рвутсяПриЧетырёх).toContain('de');
  });

  /** Колонок в маршруте и изучении ровно три при любом числе мест. */
  it('маршрут и изучение всегда в три колонки, размещение — по-прежнему по числу мест', () => {
    for (const мест of [5, 6, 7, 9, 12]) {
      expect(palaceColumns(мест, 'route')).toBe(3);
      expect(palaceColumns(мест, 'study')).toBe(3);
      expect(palaceLocusBasis(мест, 'route')).toBe('31%');
      expect(palaceLocusBasis(мест, 'study')).toBe('31%');
    }
    expect(palaceColumns(6, 'place')).toBe(3);
    expect(palaceColumns(7, 'place')).toBe(4);
  });

  /** Цель нажатия и в самой низкой плитке остаётся не меньше 48 точек. */
  it('цели нажатия остаются не меньше 48 точек', () => {
    expect(PLACE_LAYOUT.routeTileHeight).toBeGreaterThanOrEqual(48);
    expect(PLACE_LAYOUT.studyTileHeight).toBeGreaterThanOrEqual(48);
  });
});

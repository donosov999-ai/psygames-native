/* psygames-memory-palace-place-layout · VER 2 · 05.09.2026 */

/**
 * РАСКЛАДКА ФАЗ МАРШРУТА, РАЗМЕЩЕНИЯ И ИЗУЧЕНИЯ — ОДНА ФОРМУЛА НА РАЗМЕТКУ И НА ПРОБУ.
 *
 * ЗАЧЕМ ЭТОТ ФАЙЛ ВООБЩЕ ЕСТЬ. Отзыв тестировщицы (`app_feedback` afa77c5a,
 * 02.09.2026): «надо бегать вверх вниз чтобы что-то с чем-то совместить по сути
 * между двумя страницами бегаешь целую игру». Замер живой сборки 05.09.2026 на
 * 375×812 (уровень 1, пять мест) объясняет жалобу цифрой: видимая область игры
 * 741 точка, содержимое фазы размещения — 1595, то есть 854 точки за экраном.
 * Предметы стояли на 396…558, первое место начиналось на 613 — пара «предмет +
 * место», которую и надо совместить, физически не помещалась вместе, и цена
 * платилась НА КАЖДОМ ХОДУ.
 *
 * 🔴 ПОЧЕМУ ФОРМУЛА ВЫНЕСЕНА ИЗ РАЗМЕТКИ. В этом же проекте уже был случай, где
 * тест повторял расчёт игры у себя и молча отстал (см. шапку
 * `src/__tests__/goods-sort-fit.test.ts`): гейт был зелёный и добросовестно
 * проверял формулу, которой в игре нет. Поэтому здесь константы объявлены ОДИН
 * раз, стили `MemoryPalaceGame.tsx` собираются из них, и проба считает высоту по
 * ним же. Разойтись нечему: вернуть старую раскладку, не тронув эти числа,
 * нельзя.
 */

export const PLACE_LAYOUT = {
  /** Поле контейнера игры. Было 20 — семь точек с каждой стороны отданы сцене. */
  contentPadding: 14,
  /** Зазор между блоками стопки. Было 18: на прежних десяти блоках — 162 точки. */
  contentGap: 8,
  /** Поле внутри рамки сцены. */
  scenePadding: 6,
  /** Зазор между плитками мест. */
  sceneGap: 6,
  /**
   * Высота компактной плитки места — 86.
   *
   * Слагаемые: 26 ромб с номером + 2 + 24 название в две строки (10/12) + 2 + 20
   * слот под предмет = 74 содержимого, плюс поле 4×2 и рамка 1×2 = 86.
   *
   * ⚠️ СЧИТАТЬ ОБЯЗАТЕЛЬНО ПО КОРОБКЕ CSS: у всех View в react-native-web стоит
   * `box-sizing: border-box`, поле и рамка ВХОДЯТ в `minHeight`. Замер
   * 05.09.2026: первая редакция объявила 88, не заложив поле с рамкой, — живые
   * плитки в четыре колонки вышли 90, содержимое распёрло коробку, и модель
   * высоты разошлась с экраном на шесть точек.
   *
   * Для сравнения: полная плитка — 150 и ОДНА в ряд на 375 (flexBasis 145 +
   * зазор 10 против 287 внутренних), то есть 820 точек сцены на пять мест.
   */
  locusTileHeight: 86,
  /**
   * Высота плитки места в фазе МАРШРУТА — 62.
   *
   * Слагаемые: 26 ромб с номером + 2 зазор + 24 название в две строки (10/12) =
   * 52 содержимого, плюс поле 4×2 и рамка 1×2.
   *
   * Предметов в этой фазе НЕТ ни одного — маршрут показывают до того, как игра
   * их выдала, — поэтому слота под предмет здесь нет вовсе, и подпись «Пусто»
   * под каждым местом тоже убрана: она сообщала об отсутствии того, чего в этой
   * фазе и не бывает, а стоила 20 точек в каждой из двенадцати плиток.
   */
  routeTileHeight: 62,
  /**
   * Высота плитки места в фазе ИЗУЧЕНИЯ — 110.
   *
   * Слагаемые: 26 ромб + 2 + 24 название места (10/12, две строки) + 2 + 20
   * фигура предмета + 2 + 24 ИМЯ предмета (10/12, две строки) = 100
   * содержимого, плюс поле 4×2 и рамка 1×2.
   *
   * 🔴 ПОЧЕМУ ИМЯ ПРЕДМЕТА ЗДЕСЬ ОБЯЗАТЕЛЬНО, А В РАЗМЕЩЕНИИ — НЕТ. В фазе
   * размещения предмет только что взят из ленты, где его имя подписано, и рядом
   * стоит живая строка «Выбрано: …» — фигуры в плитке достаточно, чтобы узнать
   * своё. В изучении человек заучивает связку, которую на ОПРОСЕ придётся
   * достать по имени: `recall` рисует кандидатов полной плиткой `ItemChoice`
   * (без `compact`), то есть С ПОДПИСЬЮ. Предмет, выученный как «зелёный
   * кружок», на опросе пришлось бы называть словом, которое человек не читал.
   */
  studyTileHeight: 110,
  /** Сторона фигуры предмета в компактной плитке — одна на размещение и изучение. */
  tileAssetSize: 20,
  /**
   * ГОРИЗОНТАЛЬНОЕ ПОЛЕ ЭКРАНА ИГРЫ — 10 точек с каждой стороны.
   *
   * 📍 Замер живой сборки 05.09.2026: прокрутка игры лежит в контейнере с
   * `padding: 0 10px`, поэтому на экране 375 её ширина 355, а не 375, и
   * содержимое внутри поля 14 получает 327 точек, а не 347. Ширину для формул
   * считает `memoryPalaceScrollWidth` — писать 355 числом нельзя: 375 в вызове
   * выглядит правильно и молча считает строки по ширине, которой на экране нет.
   */
  screenGutter: 10,
  /** Наименьшая ширина плитки места: цель нажатия приложения — не меньше 48. */
  locusTileMinWidth: 56,
  /** Наибольшая — чтобы на планшете четыре плитки не растянулись в полосы. */
  locusTileMaxWidth: 132,
  /** Сторона плитки предмета в ленте. Тоже цель нажатия, с запасом. */
  itemTile: 76,
  /** Зазор между плитками ленты. */
  itemGap: 10,
  /** Высота кнопки действия (`actionButton.minHeight`). */
  actionHeight: 48,
} as const;

/**
 * ШИРИНА ПРОКРУТКИ ИГРЫ ПО ШИРИНЕ ЭКРАНА. Формулы фаз принимают именно её.
 * На 375 даёт 355 — замер 05.09.2026, см. `PLACE_LAYOUT.screenGutter`.
 */
export function memoryPalaceScrollWidth(screenWidth: number): number {
  return screenWidth - 2 * PLACE_LAYOUT.screenGutter;
}

/** Фазы, которые рисуют сетку мест компактной плиткой. */
export type PalacePhaseLayout = 'place' | 'route' | 'study';

/**
 * СКОЛЬКО КОЛОНОК МЕСТ. Порог 6 взят не на глаз: при семи и более местах третья
 * строка сетки стоит 92 точки (плитка 86 плюс зазор 6), а четвёртая колонка
 * убирает её целиком —
 * 7…8 мест ложатся в две строки, 9…12 в три. Ниже семи четвёртая колонка только
 * сжимает название места без выигрыша по высоте (5 и 6 мест — две строки и там,
 * и там).
 *
 * 🔴 В МАРШРУТЕ И ИЗУЧЕНИИ КОЛОНОК ВСЕГДА ТРИ, И ЭТО ЗАМЕР, А НЕ ВКУС.
 *
 * 📍 Живой замер 05.09.2026 (браузер, системный шрифт, кегль 10, начертание
 * 800): подпись переносится ВНУТРИ СЛОВА, если слово шире плитки. При четырёх
 * колонках плитке достаётся 66 точек содержимого, и по всем двенадцати языкам
 * так рвутся 14 подписей — «Обсерватория» (78 точек), «Фиолетовый змей»,
 * «Observatorio», «Eingangsbogen», «Wintergarten», «Himmelsbrücke»,
 * «Bernsteinkrone», «Korallenmuschel» (87), «Stahlkompass», «Kastanienbraune
 * Geige», «Observatório», «Bibliothèque», «Observatoire», «Osservatorio». При
 * трёх колонках содержимого 92 точки и не рвётся НИ ОДНА из 336 подписей.
 *
 * Название места и имя предмета здесь — материал упражнения, человек их
 * проговаривает; «Обсерва/тория» ломает не вид, а сам приём. Размещение платит
 * этим сознательно: там четвёртая колонка снимает целую строку сетки, без
 * которой фаза не влезает в экран. Маршруту и изучению платить нечем — у них
 * запас есть, поэтому они берут три колонки и читаемые подписи.
 */
export function palaceColumns(lociCount: number, phase: PalacePhaseLayout = 'place'): number {
  if (phase !== 'place') return 3;
  return lociCount > 6 ? 4 : 3;
}

/** Высота компактной плитки места — своя у каждой из трёх фаз. */
export function palaceTileHeight(phase: PalacePhaseLayout = 'place'): number {
  if (phase === 'route') return PLACE_LAYOUT.routeTileHeight;
  if (phase === 'study') return PLACE_LAYOUT.studyTileHeight;
  return PLACE_LAYOUT.locusTileHeight;
}

/**
 * Доля ширины под плитку места. Проценты, а не пиксели: на 320-точечном экране
 * фиксированные 96 дают две колонки вместо трёх, и сетка снова растёт вверх.
 * 31% × 3 + 2 зазора и 22% × 4 + 3 зазора влезают в строку на любой ширине от
 * 320, а следующая плитка — уже нет, поэтому перенос встаёт ровно по колонкам.
 */
export function palaceLocusBasis(lociCount: number, phase: PalacePhaseLayout = 'place'): string {
  return palaceColumns(lociCount, phase) === 4 ? '22%' : '31%';
}

/** Сколько строк займут места при выбранном числе колонок. */
export function palaceRows(lociCount: number, phase: PalacePhaseLayout = 'place'): number {
  return Math.ceil(lociCount / palaceColumns(lociCount, phase));
}

/** Высота сцены мест целиком, вместе с её собственным полем. */
export function palaceSceneHeight(lociCount: number, phase: PalacePhaseLayout = 'place'): number {
  const rows = palaceRows(lociCount, phase);
  return rows * palaceTileHeight(phase)
    + Math.max(0, rows - 1) * PLACE_LAYOUT.sceneGap
    + 2 * PLACE_LAYOUT.scenePadding
    // рамка сцены: `scene.borderWidth` сверху и снизу
    + 2;
}

/**
 * Высота ленты предметов. ЛЕНТА, А НЕ СЕТКА: горизонтальная прокрутка держит
 * ряд одной строкой при любом числе предметов (шесть на первом уровне, двенадцать
 * на пятнадцатом), тогда как переносимая сетка давала 162 точки на шести и 250 на
 * двенадцати — и ровно на эту величину отодвигала места от предметов.
 */
export function palaceStripHeight(): number {
  return PLACE_LAYOUT.itemTile;
}

/**
 * ШИРИНА СИМВОЛА ОТ КЕГЛЯ. Коэффициент подобран по четырём живым блокам замера
 * 05.09.2026 (375×812, ru, системный шрифт): строка смысла 118 знаков кеглем 14 —
 * 4 строки, `placeBody` 108 знаков кеглем 16 — 4 строки, подсказка про смену 54
 * знака кеглем 13 — 2 строки, клавиатурная подсказка 78 знаков кеглем 13 — 2
 * строки. Все четыре одновременно выполняются при коэффициенте из отрезка
 * 0,608…0,661; взята середина. Это модель переноса, а не метрика шрифта: точность
 * ей нужна до строки, а не до точки.
 */
export const TEXT_WIDTH_FACTOR = 0.63;

/** Высота текстового блока: сколько строк по модели переноса × межстрочный. */
export function textBlockHeight(
  chars: number,
  fontSize: number,
  lineHeight: number,
  width: number,
): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * TEXT_WIDTH_FACTOR)));
  return Math.max(1, Math.ceil(chars / perLine)) * lineHeight;
}

/** Длины строк фазы размещения — проба берёт их из словаря модуля. */
export interface PlaceTextLengths {
  /** Название фазы в шапке. */
  title: number;
  /** Счётчик под названием («Заполнено 0 из 5»). */
  progress: number;
  /** Строка смысла игры. */
  purpose: number;
  /** Инструкция размещения вместе с подсказкой про свободную смену. */
  instructions: number;
  /** Живая строка выбора («Сначала выберите предмет» / «Выбрано: …»). */
  selected: number;
  /** Клавиатурная подсказка внизу. */
  keyboardHelp: number;
}

export interface PlaceHeightBreakdown {
  header: number;
  purpose: number;
  instructions: number;
  strip: number;
  selected: number;
  scene: number;
  action: number;
  keyboardHelp: number;
  gaps: number;
  padding: number;
  total: number;
  columns: number;
  rows: number;
  /** Верх ленты предметов от верха содержимого. */
  stripTop: number;
  /**
   * Низ сцены мест от верха содержимого. ЭТО И ЕСТЬ ЖАЛОБА В ЧИСЛЕ: пара
   * «предмет + место» видна одновременно ровно тогда, когда `sceneBottom` не
   * больше видимой высоты игры (741 точка на 375×812 — экран минус шапка
   * приложения). До правки сцена кончалась на 1433.
   */
  sceneBottom: number;
}

/** Ширина кнопки «Пауза» в шапке — замер 05.09.2026, 88 точек. */
const PAUSE_WIDTH = 88;
/** Зазор между текстом шапки и кнопкой (`gameHeader.gap`). */
const HEADER_GAP = 12;

/**
 * ВЫСОТА СОДЕРЖИМОГО ФАЗЫ РАЗМЕЩЕНИЯ. Считает ровно ту стопку, что рисует
 * `MemoryPalaceGame`, сверху вниз: шапка, смысл, инструкция, лента предметов,
 * строка выбора, сцена мест, кнопка, клавиатурная подсказка.
 */
export function memoryPalacePlaceHeight(
  width: number,
  lociCount: number,
  text: PlaceTextLengths,
): PlaceHeightBreakdown {
  const inner = width - 2 * PLACE_LAYOUT.contentPadding;
  const headerText = Math.max(120, inner - PAUSE_WIDTH - HEADER_GAP);

  const header = Math.max(
    PLACE_LAYOUT.actionHeight,
    textBlockHeight(text.title, 26, 30.5, headerText)
      + textBlockHeight(text.progress, 15, 18, headerText),
  );
  const purpose = textBlockHeight(text.purpose, 14, 19, inner);
  const instructions = textBlockHeight(text.instructions, 13, 18, inner);
  const strip = palaceStripHeight();
  const selected = textBlockHeight(text.selected, 16, 19, inner);
  const scene = palaceSceneHeight(lociCount);
  const action = PLACE_LAYOUT.actionHeight;
  const keyboardHelp = textBlockHeight(text.keyboardHelp, 13, 19, inner);

  const blocks = [header, purpose, instructions, strip, selected, scene, action, keyboardHelp];
  const gaps = (blocks.length - 1) * PLACE_LAYOUT.contentGap;
  const padding = 2 * PLACE_LAYOUT.contentPadding;
  const g = PLACE_LAYOUT.contentGap;
  const stripTop = PLACE_LAYOUT.contentPadding + header + g + purpose + g + instructions + g;
  const sceneBottom = stripTop + strip + g + selected + g + scene;

  return {
    stripTop,
    sceneBottom,
    header,
    purpose,
    instructions,
    strip,
    selected,
    scene,
    action,
    keyboardHelp,
    gaps,
    padding,
    total: blocks.reduce((sum, value) => sum + value, 0) + gaps + padding,
    columns: palaceColumns(lociCount),
    rows: palaceRows(lociCount),
  };
}

/* ------------------------------------------------------------------ *
 *  МАРШРУТ И ИЗУЧЕНИЕ                                                  *
 * ------------------------------------------------------------------ */

/**
 * ШИРИНА, ОСТАЮЩАЯСЯ ПОДПИСИ ВНУТРИ КОМПАКТНОЙ ПЛИТКИ.
 *
 * Считается по той же цепочке, что рисует браузер: ширина прокрутки → минус
 * поле контейнера → минус рамка и поле сцены → делится на колонки с зазорами
 * (плитки объявлены `flexGrow: 1`, поэтому ряд занимает всю ширину без остатка)
 * → минус горизонтальное поле и рамка самой плитки.
 *
 * 📍 Сверено с живой сборкой 05.09.2026 при ширине прокрутки 355: три колонки —
 * 92 точки подписи (замер 92), четыре — 66 (замер 66). На этих двух числах и
 * стоит выбор колонок, см. `palaceColumns`.
 */
export function palaceTileTextWidth(
  width: number,
  lociCount: number,
  phase: PalacePhaseLayout = 'place',
): number {
  const sceneInner = width - 2 * PLACE_LAYOUT.contentPadding - 2 - 2 * PLACE_LAYOUT.scenePadding;
  const columns = palaceColumns(lociCount, phase);
  const tile = (sceneInner - (columns - 1) * PLACE_LAYOUT.sceneGap) / columns;
  // `locusTileCompact`: paddingHorizontal 3 с двух сторон и рамка 1 с двух сторон
  return tile - 6 - 2;
}

/** Длины строк фазы маршрута — проба берёт их из словаря модуля. */
export interface RouteTextLengths {
  /** Название фазы в шапке. */
  title: number;
  /** Счётчик мест под названием («12 мест»). */
  count: number;
  /** Строка смысла игры. */
  purpose: number;
  /** Инструкция обхода. */
  body: number;
  /** Клавиатурная подсказка внизу. */
  keyboardHelp: number;
}

/** Длины строк фазы изучения. Счётчика в шапке нет, см. `memoryPalaceStudyHeight`. */
export interface StudyTextLengths {
  title: number;
  body: number;
  keyboardHelp: number;
}

export interface PhaseHeightBreakdown {
  header: number;
  purpose: number;
  body: number;
  scene: number;
  action: number;
  keyboardHelp: number;
  gaps: number;
  padding: number;
  total: number;
  columns: number;
  rows: number;
  /** Низ сцены мест от верха содержимого: весь дворец виден, пока он ≤ 741. */
  sceneBottom: number;
}

/** Высота шапки: заголовок фазы плюс необязательный счётчик, но не меньше кнопки. */
function phaseHeader(headerTextWidth: number, title: number, count: number | null): number {
  const heading = textBlockHeight(title, 26, 30.5, headerTextWidth);
  const counter = count === null ? 0 : textBlockHeight(count, 15, 18, headerTextWidth);
  return Math.max(PLACE_LAYOUT.actionHeight, heading + counter);
}

/**
 * ВЫСОТА СОДЕРЖИМОГО ФАЗЫ МАРШРУТА. Стопка сверху вниз: шапка, смысл игры,
 * инструкция обхода, сцена мест, кнопка «Перейти к размещению», клавиатурная
 * подсказка.
 *
 * 📍 ЗАМЕР ДО, живая сборка 05.09.2026, 375×812, ru: уровень 1 — содержимое
 * 1146 при видимых 741 (за экраном 405), уровень 15 — 2266 (за экраном 1525).
 * Сцена мест занимала 820 и 1940 точек: полная плитка объявлена `flexBasis:
 * 145` и на этой ширине встаёт ПО ОДНОЙ в ряд.
 */
export function memoryPalaceRouteHeight(
  width: number,
  lociCount: number,
  text: RouteTextLengths,
): PhaseHeightBreakdown {
  const inner = width - 2 * PLACE_LAYOUT.contentPadding;
  const headerText = Math.max(120, inner - PAUSE_WIDTH - HEADER_GAP);

  const header = phaseHeader(headerText, text.title, text.count);
  const purpose = textBlockHeight(text.purpose, 14, 19, inner);
  const body = textBlockHeight(text.body, 13, 18, inner);
  const scene = palaceSceneHeight(lociCount, 'route');
  const action = PLACE_LAYOUT.actionHeight;
  const keyboardHelp = textBlockHeight(text.keyboardHelp, 13, 19, inner);

  const blocks = [header, purpose, body, scene, action, keyboardHelp];
  const g = PLACE_LAYOUT.contentGap;
  const gaps = (blocks.length - 1) * g;
  const padding = 2 * PLACE_LAYOUT.contentPadding;
  const sceneBottom = PLACE_LAYOUT.contentPadding + header + g + purpose + g + body + g + scene;

  return {
    header,
    purpose,
    body,
    scene,
    action,
    keyboardHelp,
    gaps,
    padding,
    sceneBottom,
    total: blocks.reduce((sum, value) => sum + value, 0) + gaps + padding,
    columns: palaceColumns(lociCount, 'route'),
    rows: palaceRows(lociCount, 'route'),
  };
}

/**
 * ВЫСОТА СОДЕРЖИМОГО ФАЗЫ ИЗУЧЕНИЯ. Стопка: шапка, инструкция, сцена мест с
 * предметами, кнопка «Начать проверку», клавиатурная подсказка.
 *
 * 🔴 СЧЁТЧИКА МЕСТ В ШАПКЕ ЗДЕСЬ НЕТ, и это не экономия ради экономии. В
 * маршруте «12 мест» говорит, какой длины дорога, до того как по ней пошли; в
 * размещении «Заполнено 2 из 5» — сколько осталось сделать. В изучении делать
 * нечего и идти некуда: все двенадцать связок уже лежат на экране и их видно
 * глазами, а строка повторяет их число за 18 точек высоты.
 *
 * 📍 ЗАМЕР ДО, живая сборка 05.09.2026, 375×812, ru, уровень 1: содержимое 1166
 * при видимых 741 — за экраном 425, сцена мест 869.
 */
export function memoryPalaceStudyHeight(
  width: number,
  lociCount: number,
  text: StudyTextLengths,
): PhaseHeightBreakdown {
  const inner = width - 2 * PLACE_LAYOUT.contentPadding;
  const headerText = Math.max(120, inner - PAUSE_WIDTH - HEADER_GAP);

  const header = phaseHeader(headerText, text.title, null);
  const body = textBlockHeight(text.body, 13, 18, inner);
  const scene = palaceSceneHeight(lociCount, 'study');
  const action = PLACE_LAYOUT.actionHeight;
  const keyboardHelp = textBlockHeight(text.keyboardHelp, 13, 19, inner);

  const blocks = [header, body, scene, action, keyboardHelp];
  const g = PLACE_LAYOUT.contentGap;
  const gaps = (blocks.length - 1) * g;
  const padding = 2 * PLACE_LAYOUT.contentPadding;
  const sceneBottom = PLACE_LAYOUT.contentPadding + header + g + body + g + scene;

  return {
    header,
    purpose: 0,
    body,
    scene,
    action,
    keyboardHelp,
    gaps,
    padding,
    sceneBottom,
    total: blocks.reduce((sum, value) => sum + value, 0) + gaps + padding,
    columns: palaceColumns(lociCount, 'study'),
    rows: palaceRows(lociCount, 'study'),
  };
}

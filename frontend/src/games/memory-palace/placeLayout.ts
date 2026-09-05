/* psygames-memory-palace-place-layout · VER 1 · 05.09.2026 */

/**
 * РАСКЛАДКА ФАЗЫ РАЗМЕЩЕНИЯ — ОДНА ФОРМУЛА НА РАЗМЕТКУ И НА ПРОБУ.
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
 * СКОЛЬКО КОЛОНОК МЕСТ. Порог 6 взят не на глаз: при семи и более местах третья
 * строка сетки стоит 92 точки (плитка 86 плюс зазор 6), а четвёртая колонка
 * убирает её целиком —
 * 7…8 мест ложатся в две строки, 9…12 в три. Ниже семи четвёртая колонка только
 * сжимает название места без выигрыша по высоте (5 и 6 мест — две строки и там,
 * и там).
 */
export function palaceColumns(lociCount: number): number {
  return lociCount > 6 ? 4 : 3;
}

/**
 * Доля ширины под плитку места. Проценты, а не пиксели: на 320-точечном экране
 * фиксированные 96 дают две колонки вместо трёх, и сетка снова растёт вверх.
 * 31% × 3 + 2 зазора и 22% × 4 + 3 зазора влезают в строку на любой ширине от
 * 320, а следующая плитка — уже нет, поэтому перенос встаёт ровно по колонкам.
 */
export function palaceLocusBasis(lociCount: number): string {
  return palaceColumns(lociCount) === 4 ? '22%' : '31%';
}

/** Сколько строк займут места при выбранном числе колонок. */
export function palaceRows(lociCount: number): number {
  return Math.ceil(lociCount / palaceColumns(lociCount));
}

/** Высота сцены мест целиком, вместе с её собственным полем. */
export function palaceSceneHeight(lociCount: number): number {
  const rows = palaceRows(lociCount);
  return rows * PLACE_LAYOUT.locusTileHeight
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

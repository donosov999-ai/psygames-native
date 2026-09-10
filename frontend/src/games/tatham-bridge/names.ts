/* psygames-tatham-bridge-names · VER 3 · 10.09.2026 */
/**
 * СОРОК ДВИЖКОВ КАНОНА — СОРОК РЕЖИМОВ. Решение Дениса 10.09.2026: «берём все».
 *
 * ⚠️ Прежняя редакция прятала Solo, Towers и Unequal, потому что у нас есть свои судоку,
 * небоскрёбы и неравенства. Правило отменено тем же решением: «похоже» — это не отказ, а
 * указание сделать режимом. У его Solo своя лестница (16 авторских ступеней против нашей
 * своей), свой генератор с гарантией единственности и свой набор подсказок — это ВТОРАЯ
 * игра под тем же правилом, а не копия первой.
 *
 * Порядок в этом списке = порядок карточек в развилке. Сперва то, что решается
 * рассуждением на сетке, потом линии и петли, потом манипуляция доской, в конце —
 * аркадное, где единственного решения нет по построению.
 */
export const ПО_УМОЛЧАНИЮ = 'Unruly';

/**
 * Имя движка (как его зовёт сам Тэтхэм) → ключ словаря.
 * ⚠️ Имена — ключи в `psy_name`, менять их нельзя: по ним ищется движок.
 */
export const КЛЮЧ_ИМЕНИ: Record<string, string> = {
  // ── закраска и расстановка по подсказкам ──
  Unruly: 'puzzlesUnruly',
  Mines: 'puzzlesMines',
  Mosaic: 'puzzlesMosaic',
  Pattern: 'puzzlesPattern',
  Singles: 'puzzlesSingles',
  Range: 'puzzlesRange',
  'Light Up': 'puzzlesLightUp',
  Tents: 'puzzlesTents',
  Magnets: 'puzzlesMagnets',
  Undead: 'puzzlesUndead',
  // ── латинский квадрат ──
  Keen: 'puzzlesKeen',
  Solo: 'puzzlesSolo',
  Towers: 'puzzlesTowers',
  Unequal: 'puzzlesUnequal',
  // ── разрезание поля на области ──
  Rectangles: 'puzzlesRectangles',
  Filling: 'puzzlesFilling',
  Palisade: 'puzzlesPalisade',
  Galaxies: 'puzzlesGalaxies',
  Map: 'puzzlesMap',
  // ── петли, линии и пути ──
  Loopy: 'puzzlesLoopy',
  Pearl: 'puzzlesPearl',
  Slant: 'puzzlesSlant',
  Bridges: 'puzzlesBridges',
  'Train Tracks': 'puzzlesTracks',
  Signpost: 'puzzlesSignpost',
  Dominosa: 'puzzlesDominosa',
  Untangle: 'puzzlesUntangle',
  // ── манипуляция доской командой ──
  Net: 'puzzlesNet',
  Netslide: 'puzzlesNetslide',
  Twiddle: 'puzzlesTwiddle',
  Sixteen: 'puzzlesSixteen',
  Fifteen: 'puzzlesFifteen',
  Flip: 'puzzlesFlip',
  Cube: 'puzzlesCube',
  // ── скрытая информация: платная проба ──
  'Black Box': 'puzzlesBlackBox',
  Guess: 'puzzlesGuess',
  // ── аркада: единственного решения нет по построению ──
  Flood: 'puzzlesFlood',
  'Same Game': 'puzzlesSameGame',
  Pegs: 'puzzlesPegs',
  Inertia: 'puzzlesInertia',
};

/** Ключ описания — тем же порядком, для карточек развилки. */
export const КЛЮЧ_ОПИСАНИЯ: Record<string, string> = Object.fromEntries(
  Object.entries(КЛЮЧ_ИМЕНИ).map(([имя, ключ]) => [имя, `${ключ}Desc`]),
);

/**
 * 🔴 КОМУ НУЖНА КРЕСТОВИНА, А НЕ НАЖАТИЕ ПО ДОСКЕ. Замер 10.09.2026 по исходникам:
 * `interpret_move` у `cube.c` и `inertia.c` читает только CURSOR_*, координат мыши у
 * них нет вовсе. Показывать таким доску как нажимаемую — врать: тап не сделает ничего.
 */
export const СТРЕЛОЧНЫЕ = new Set(['Cube', 'Inertia']);

/**
 * 🔴 ДВА ДВИЖКА НЕ ОТДАЮТ СВОЮ ЛЕСТНИЦУ, И ЭТО ВИДНО ИГРОКУ. Замер 10.09.2026:
 * `psy_presets` у Mines и Loopy возвращает 0 — меню пресетов у них устроено иначе, и
 * `fetch_preset` молчит. На экране это выглядело как «Уровень 1/0»: счётчик обещал ноль
 * ступеней, то есть врал прямо в шапке.
 *
 * Лестницу этим двум набираем РАЗМЕРОМ ПОЛЯ — так и записано в README моста. Каждая
 * строка проверена вызовом `psy_open` + `psy_draw`: доска открывается и рисуется.
 * Замер (примитивов / ширина поля):
 *   Mines 9x9n10 380/240 · 12x12n25 728/300 · 16x16n40 1335/380 · 20x16n60 1569/460 ·
 *         24x20n99 2479/540
 *   Loopy 7x7t0de 205/257 · 7x7t0dn 205/257 · 10x10t0dh 396/353 · 12x10t0dh 468/417 ·
 *         15x15t0dh 839/513
 * ⚠️ 30x16n99 у Mines НЕ берём: ширина 660 против 540 — на телефоне клетка стала бы
 * меньше пальца. Потолок лестницы задан шириной экрана, а не амбицией.
 */
export const СВОЯ_ЛЕСТНИЦА: Record<string, { имя: string; параметры: string }[]> = {
  Mines: [
    { имя: '9×9, 10 мин', параметры: '9x9n10' },
    { имя: '12×12, 25 мин', параметры: '12x12n25' },
    { имя: '16×16, 40 мин', параметры: '16x16n40' },
    { имя: '20×16, 60 мин', параметры: '20x16n60' },
    { имя: '24×20, 99 мин', параметры: '24x20n99' },
  ],
  Loopy: [
    { имя: '7×7, лёгкая', параметры: '7x7t0de' },
    { имя: '7×7, обычная', параметры: '7x7t0dn' },
    { имя: '10×10, трудная', параметры: '10x10t0dh' },
    { имя: '12×10, трудная', параметры: '12x10t0dh' },
    { имя: '15×15, трудная', параметры: '15x15t0dh' },
  ],
};

export const РЕЖИМЫ = Object.keys(КЛЮЧ_ИМЕНИ);

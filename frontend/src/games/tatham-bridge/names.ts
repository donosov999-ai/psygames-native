/* psygames-tatham-bridge-names · VER 2 · 10.09.2026 */
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

export const РЕЖИМЫ = Object.keys(КЛЮЧ_ИМЕНИ);

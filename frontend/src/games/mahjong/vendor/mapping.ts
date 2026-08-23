/* psygames-mahjong-vendor-mapping · VER 1 · 23.08.2026 */
/**
 * РАЗБОР КОМПАКТНОГО ФОРМАТА РАСКЛАДОК — КОД ИЗ ЧУЖОГО ПРОЕКТА.
 *
 * Источник:  https://github.com/ffalt/mah  (ветка main, коммит 22.08.2026)
 * Файл:      src/app/model/mapping.ts (функции expandMapping / expandCells /
 *            expandRepeatedCells) и типы из src/app/model/types.ts
 * Автор:     ffalt
 * Лицензия:  MIT — «Copyright (c) 2016 ffalt».
 *            Полный текст: src/games/mahjong/vendor/LICENSE-mah (рядом).
 *
 * 🔴 ПОЧЕМУ ЭТО НЕ ПЕРЕПИСАНО СВОИМИ СЛОВАМИ. Формат `map` выглядит как
 * «[слой, [строка, [начало, длина]]]», но на КАЖДОМ из трёх уровней вложенности
 * массив может быть заменён «голым» числом:
 *   [7,[0,[26,2]]]   → слой 7, строка 0, cells = ОДИН отрезок [26,2]
 *   [7,[0,26]]       → слой 7, строка 0, cells = ОДНО число 26 (одна плитка)
 *   [7,[0,[26,[4,3]]]] → строка 0: плитка на 26 и отрезок [4,3]
 * Разгадывать это по образцам — значит однажды молча потерять строку. Поэтому взят
 * ИХ разбор, один в один, и рядом лежит их лицензия.
 *
 * ⚠️ ШАГ ОТРЕЗКА — ДВА, А НЕ ОДИН. `[26, 2]` это x=26 и x=28, а не 26 и 27:
 * координаты в ПОЛУКЛЕТКАХ, плитка занимает 2×2, поэтому соседняя плитка стоит
 * через две полуклетки. Комментарий источника: `[x, amount (with 2 steps each)]`.
 */

/** Отрезок/плитки одной строки. Число = одна плитка; [начало, сколько] = отрезок. */
export type CompactMappingX = number | Array<number | number[]>;
/** [номер строки y, содержимое строки]. */
export type CompactMappingY = [number, CompactMappingX];
/** [номер слоя z, строки слоя]. */
export type CompactMappingZ = [number, CompactMappingY[]];
/** Раскладка целиком — массив слоёв. */
export type CompactMapping = CompactMappingZ[];

/** Одно место под плитку: [z, x, y]. Порядок полей — как в источнике. */
export type Place = [number, number, number];
export type Mapping = Place[];

/** Отрезок «начиная с startX, count плиток» — шаг 2, потому что плитка 2×2. */
function expandRepeatedCells(z: number, y: number, startX: number, count: number): Place[] {
  return Array.from({ length: count }, (_, index) => [z, startX + index * 2, y] as Place);
}

/** Содержимое одной строки: одиночное число, либо смесь чисел и отрезков. */
function expandCells(z: number, y: number, cells: CompactMappingX): Place[] {
  if (!Array.isArray(cells)) return [[z, cells, y]];
  return cells.flatMap((cell) => (
    Array.isArray(cell) ? expandRepeatedCells(z, y, cell[0] as number, cell[1] as number) : [[z, cell, y] as Place]
  ));
}

/** Компактная раскладка → плоский список мест [z, x, y]. */
export function expandMapping(map: CompactMapping): Mapping {
  return map.flatMap(([z, rows]) => rows.flatMap(([y, cells]) => expandCells(z, y, cells)));
}

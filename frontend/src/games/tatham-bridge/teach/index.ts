/* psygames-tatham-bridge-teach-index · VER 1 · 17.09.2026 */
/**
 * ВСЕ УЧИТЕЛЯ РЕЖИМОВ ОДНОЙ КАРТОЙ — собираются из файлов разделов, как `names.ts` собирает режимы.
 * Здесь ничего не пишут руками: свой режим вписывается в `sections/<раздел>.teach.ts`.
 */
import type { УчительРежима } from './types';
import { УЧИТЕЛЯ_РАЗДЕЛА as СЧЁТ } from '../sections/counting.teach';
import { УЧИТЕЛЯ_РАЗДЕЛА as ГОЛОВОЛОМКИ } from '../sections/puzzles.teach';
import { УЧИТЕЛЯ_РАЗДЕЛА as ПОИСК } from '../sections/search.teach';
import { УЧИТЕЛЯ_РАЗДЕЛА as СОРТИРОВКА } from '../sections/sorting.teach';
import { УЧИТЕЛЯ_РАЗДЕЛА as ПРОСТРАНСТВО } from '../sections/spatial.teach';
import { УЧИТЕЛЯ_РАЗДЕЛА as СУДОКУ } from '../sections/sudoku.teach';

export const УЧИТЕЛЯ: Record<string, УчительРежима> = {
  ...СЧЁТ, ...ГОЛОВОЛОМКИ, ...ПОИСК, ...СОРТИРОВКА, ...ПРОСТРАНСТВО, ...СУДОКУ,
};

export type { УчительРежима, КарточкаУрока, РамкаУрока, НажатиеУрока, ВходУрока } from './types';

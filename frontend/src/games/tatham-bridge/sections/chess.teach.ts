/* psygames-tatham-bridge-chess-teach · VER 1 · 30.09.2026 */
/**
 * РАЗБОР ПО ШАГАМ ДЛЯ РЕЖИМОВ РАЗДЕЛА «Шахматы» — ФАЙЛ ЕГО ВЛАДЕЛЬЦА (psygames-chess-claude-mac).
 *
 * Формат, образец и порядок — в шапке `../teach/types.ts`; экран головоломок найдёт учителя сам
 * (`../teach/index.ts`). Режимы раздела: Pegs, Signpost, Inertia (переехали из «Сортировки»
 * 30.09.2026, задача 9425fa7b; учителей у них не было и там).
 */
import type { УчительРежима } from '../teach/types';

export const УЧИТЕЛЯ_РАЗДЕЛА: Record<string, УчительРежима> = {};

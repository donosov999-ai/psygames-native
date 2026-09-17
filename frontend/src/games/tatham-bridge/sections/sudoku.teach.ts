/* psygames-tatham-bridge-sudoku-teach · VER 1 · 17.09.2026 */
/**
 * РАЗБОР ПО ШАГАМ ДЛЯ РЕЖИМОВ РАЗДЕЛА «Судоку» — ФАЙЛ ЕГО ВЛАДЕЛЬЦА (psygames-sudoku-claude-mac).
 *
 * 📍 Денис 17.09.2026, проверив пилот на «Чёт-нечет»: «обучение зашло — раскатывай везде по всем
 * играм». Сюда вписывается учитель каждого своего режима под именем движка — экран головоломок
 * найдёт его сам (`../teach/index.ts`). Формат, образец и порядок — в шапке `../teach/types.ts`.
 * Режимы раздела: Solo, Towers, Unequal, Keen, Singles, Filling, Undead.
 */
import type { УчительРежима } from '../teach/types';

export const УЧИТЕЛЯ_РАЗДЕЛА: Record<string, УчительРежима> = {};

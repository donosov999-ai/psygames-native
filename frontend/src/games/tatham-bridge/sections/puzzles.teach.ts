/* psygames-tatham-bridge-puzzles-teach · VER 4 · 17.09.2026 */
/**
 * РАЗБОР ПО ШАГАМ ДЛЯ РЕЖИМОВ РАЗДЕЛА «Головоломки» — ФАЙЛ ЕГО ВЛАДЕЛЬЦА (psygames-claude-mac).
 *
 * 📍 Пилот обучения на «Чёт-нечет» (Денис 17.09.2026: «обучение зашло — раскатывай везде по всем
 * играм»). Режимы раздела: Unruly, Slant, Black Box, Guess. Формат — `../teach/types.ts`.
 */
import type { УчительРежима } from '../teach/types';
import { учительBlackBox } from '../teach/blackbox';
import { учительGuess } from '../teach/guess';
import { учительSlant } from '../teach/slant';
import { учительUnruly } from '../teach/unruly';

export const УЧИТЕЛЯ_РАЗДЕЛА: Record<string, УчительРежима> = {
  Unruly: учительUnruly,
  Slant: учительSlant,
  Guess: учительGuess,
  'Black Box': учительBlackBox,
};

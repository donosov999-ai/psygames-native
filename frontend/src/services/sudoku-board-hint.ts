/* psygames-sudoku-board-hint · VER 1 · 20.08.2026 */
/**
 * СТРОКА-ОБЪЯСНЕНИЕ НАД ДОСКОЙ: одно место, где судоку говорит, во что человек играет.
 *
 * 🔴 ЗАЧЕМ. Три репорта Вали от 19.08.2026 — про сэндвич («что значит сумма от одного
 * до девяти с краю, сумма чего, из чего сумма»), про кнопку отмены («зачем появилась,
 * какая-то бесполезная») и про раскраску клеток («что это даёт вообще непонятно») —
 * это один и тот же провал: механика появляется, а объяснения на экране нет. Оно есть
 * в окне правил, но окно открывается один раз при входе на уровень, закрывается кнопкой
 * «ПОНЯТНО» и больше не показывается. Вопрос человек задаёт ПОЗЖЕ и НЕ ТАМ — глядя на
 * доску, где по краям стоят числа 5, 24, 0, 12 и ничто не говорит, что это.
 *
 * ⚠️ ПОЧЕМУ НЕ ЕЩЁ ОДНО ОКНО. Окно уже не сработало: его закрывают, чтобы добраться до
 * доски, и второе окно закроют так же. Ответ обязан быть НА ДОСКЕ и не требовать
 * закрытия — поэтому строка, а не модалка.
 *
 * ⚠️ ПОЧЕМУ ОТДЕЛЬНЫЙ СЕРВИС, А НЕ ТЕРНАРНИК В ЭКРАНЕ. Вариантов у судоку ДВЕНАДЦАТЬ
 * (см. `Variant` в sudoku-core) плюс killer, и беда у всех одна. Лестница «что показать
 * сейчас» — это правило, а не вёрстка: его надо прогонять тестом на каждом варианте и
 * на каждом из 12 языков, иначе тринадцатый вариант заведут без текста и никто не
 * заметит. В экране такое не прогнать: там React и разметка.
 *
 * ЛЕСТНИЦА ПРИОРИТЕТА (сверху вниз, первое подошедшее побеждает):
 *   1) `clue`  — человек ткнул в число у края доски: объясняем ИМЕННО ЭТО число;
 *   2) `paint` — включён режим цвета: отвечаем «зачем красить», а не «как красить»
 *                (как — написано под палитрой);
 *   3) `undo`  — только что нажали отмену либо она впервые стала доступной: говорим,
 *                что она возвращает и чего НЕ возвращает;
 *   4) правило доски — killer, вариант уровня или базовое правило судоку.
 * Четвёртый пункт — состояние покоя: строка не пустует никогда, поэтому её высота
 * постоянна и доска под ней не прыгает.
 */
import { translateFor } from '../contexts/LanguageContext';
import { Variant, variantRule } from './sudoku-core';

/** Число у края доски (сэндвич): по какой оси стоит и сколько показывает. */
export interface SudokuEdgeClue {
  axis: 'row' | 'col';
  /** Номер строки/столбца с нуля — нужен подписи для скринридера. */
  index: number;
  sum: number;
}

/** На что смотрит человек прямо сейчас. null = ни на что особенное, показываем правило. */
export type SudokuHintFocus =
  | { kind: 'clue'; clue: SudokuEdgeClue }
  | { kind: 'paint' }
  | { kind: 'undo' }
  | null;

export interface SudokuHintCtx {
  variant: Variant;
  killer: boolean;
  /** Сторона доски: 6 или 9. Подставляется в базовое правило. */
  N: number;
  focus: SudokuHintFocus;
}

/**
 * Правило самой доски — то, что видно, когда человек ни во что не ткнул.
 *
 * Сэндвичу мало одной строки: на доске Вали по краям стояли ДВА НУЛЯ, а ноль — это не
 * «сумма ноль», это «между 1 и 9 нет ни одной клетки». Без этой оговорки правило
 * читается как ошибка генератора.
 */
export function sudokuBoardRule(ctx: SudokuHintCtx, lang: string): string {
  const base = translateFor(lang, 'sudokuBaseRule').replace('{n}', String(ctx.N));
  if (ctx.killer) return translateFor(lang, 'sudokuKillerRule');
  if (ctx.variant === 'none') return base;
  const rule = variantRule(ctx.variant, lang);
  return ctx.variant === 'sandwich' ? `${rule} ${translateFor(lang, 'sudokuSandwichZeroNote')}` : rule;
}

/** Что значит КОНКРЕТНОЕ число у края. Ноль объясняется отдельно — это не сумма. */
export function sudokuClueText(clue: SudokuEdgeClue, lang: string): string {
  if (clue.sum === 0) return translateFor(lang, 'sudokuSandwichClueZero');
  const key = clue.axis === 'row' ? 'sudokuSandwichClueRow' : 'sudokuSandwichClueCol';
  return translateFor(lang, key).replace('{n}', String(clue.sum));
}

/** Строка над доской: лестница приоритета целиком. Пустой не бывает. */
export function sudokuBoardHint(ctx: SudokuHintCtx, lang: string): string {
  const f = ctx.focus;
  if (f && f.kind === 'clue') return sudokuClueText(f.clue, lang);
  if (f && f.kind === 'paint') return translateFor(lang, 'sudokuColorWhy');
  if (f && f.kind === 'undo') return translateFor(lang, 'sudokuUndoWhy');
  return sudokuBoardRule(ctx, lang);
}

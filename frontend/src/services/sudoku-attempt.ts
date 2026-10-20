/* psygames-sudoku-attempt · VER 2 · 20.10.2026 */
export const SUDOKU_REVEALED_KEY = 'psygames_sudoku_revealed_boards';

/**
 * Как у Flutter (`resume.dart`): нет поля в старом снимке — не раскрытие. 🔴 Подсказка открывает
 * ОДНУ цифру — это помощь, а не показанное решение (ступень засчитывается, рейтинг — нет). С 04.10
 * по 20.10 подсказка ставила и `answersRevealed`, поэтому рядом с подсказками этот флаг — её.
 */
export function sudokuResumeRevealed(snapshot: {
  answersRevealed?: unknown; lesson?: unknown; hintUses?: unknown;
}): boolean {
  const hints = typeof snapshot.hintUses === 'number' ? snapshot.hintUses : 0;
  return snapshot.lesson === true || (snapshot.answersRevealed === true && hints === 0);
}

/**
 * Учебная ли партия: ответы ЭТОЙ доски показаны (флаг или реестр). Подсказки — помощь, не
 * раскрытие; запись в реестре при подсказках поставила подсказка (правило 04.10–20.10), учитель
 * помечает только свою отдельную доску. Битый реестр по-прежнему закрывает зачёт.
 */
export function sudokuEducational(
  solution: number[][], answersRevealed: boolean, hintUses: number, ledger: string | null,
): boolean {
  if (answersRevealed) return true;
  if (ledger === null) return false;
  try {
    const ids: unknown = JSON.parse(ledger);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return true;
    return ids.includes('*') || (hintUses === 0 && ids.includes(JSON.stringify(solution)));
  } catch { return true; }
}

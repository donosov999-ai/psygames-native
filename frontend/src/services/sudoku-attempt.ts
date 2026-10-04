/* psygames-sudoku-attempt · VER 1 · 04.10.2026 */
export const SUDOKU_REVEALED_KEY = 'psygames_sudoku_revealed_boards';

/** Same answer identity as Flutter; never trust a restored board as independent
 * solely because the old web snapshot did not contain the new optional flag. */
export function sudokuEducational(
  solution: number[][], answersRevealed: boolean, hintUses: number, ledger: string | null,
): boolean {
  if (answersRevealed || hintUses > 0) return true;
  if (ledger === null) return false;
  try {
    const ids: unknown = JSON.parse(ledger);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) return true;
    return ids.includes('*') || ids.includes(JSON.stringify(solution));
  } catch { return true; }
}

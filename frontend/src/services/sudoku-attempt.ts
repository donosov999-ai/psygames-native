/* psygames-sudoku-attempt · VER 1 · 04.10.2026 */
export const SUDOKU_REVEALED_KEY = 'psygames_sudoku_revealed_boards';

/** Match Flutter resume compatibility: missing legacy metadata is not a reveal.
 * The independent-completion guard still checks hints and the durable ledger. */
export function sudokuResumeRevealed(snapshot: {
  answersRevealed?: unknown; lesson?: unknown; hintUses?: unknown;
}): boolean {
  return snapshot.answersRevealed === true || snapshot.lesson === true
    || (typeof snapshot.hintUses === 'number' && snapshot.hintUses > 0);
}

/** Same answer identity and actual-disclosure guard as Flutter. */
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

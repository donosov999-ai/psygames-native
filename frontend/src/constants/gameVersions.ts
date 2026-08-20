/* psygames-game-versions · VER 1 · 20.08.2026 */
/**
 * РЕДАКЦИИ ЭКРАНОВ УПРАЖНЕНИЙ — СГЕНЕРИРОВАНО, РУКАМИ НЕ ПРАВИТЬ.
 *
 * Источник — штамп первой строкой в `app/games/*.tsx`. Пересобрать:
 *   node scripts/gen-game-versions.mjs
 *
 * 🔴 ЗАЧЕМ ЭТО В КОДЕ. Репорт тестировщика несёт версию приложения, но не
 * редакцию экрана, на который жалуются. Жалоба «всё поплыло» на сборке 1.204.0
 * ничего не говорит о том, какая тогда была сортировка товаров; редакция —
 * говорит. Ключ — имя файла экрана, то же, что уходит в репорт как `game_id`.
 */
export interface GameVersion { ver: number; date: string }

export const GAME_VERSIONS: Record<string, GameVersion> = {
  'anagrams': { ver: 1, date: '19.08.2026' },
  'ant': { ver: 1, date: '19.08.2026' },
  'attention-conflict': { ver: 1, date: '19.08.2026' },
  'bart': { ver: 1, date: '19.08.2026' },
  'breathing': { ver: 1, date: '19.08.2026' },
  'chess-blind': { ver: 1, date: '19.08.2026' },
  'choice-rt': { ver: 1, date: '19.08.2026' },
  'cloze': { ver: 1, date: '19.08.2026' },
  'corsi': { ver: 1, date: '19.08.2026' },
  'counter': { ver: 1, date: '19.08.2026' },
  'cpt': { ver: 1, date: '19.08.2026' },
  'digit-span': { ver: 1, date: '19.08.2026' },
  'dots-connect': { ver: 2, date: '20.08.2026' },
  'eye-gym': { ver: 1, date: '19.08.2026' },
  'faces-names': { ver: 2, date: '20.08.2026' },
  'find-differences': { ver: 1, date: '19.08.2026' },
  'flanker': { ver: 1, date: '19.08.2026' },
  'go-no-go': { ver: 1, date: '19.08.2026' },
  'goods-sort': { ver: 1, date: '19.08.2026' },
  'hanoi': { ver: 1, date: '19.08.2026' },
  'inhibition': { ver: 1, date: '19.08.2026' },
  'iowa': { ver: 1, date: '19.08.2026' },
  'lexical-decision': { ver: 1, date: '19.08.2026' },
  'listening-span': { ver: 1, date: '19.08.2026' },
  'mahjong': { ver: 1, date: '19.08.2026' },
  'math-slider': { ver: 2, date: '17.08.2026' },
  'math-sprint': { ver: 1, date: '19.08.2026' },
  'memory-matrix': { ver: 1, date: '19.08.2026' },
  'memory-palace': { ver: 1, date: '19.08.2026' },
  'mental-rotation': { ver: 1, date: '19.08.2026' },
  'mnemonics': { ver: 1, date: '19.08.2026' },
  'n-back': { ver: 1, date: '19.08.2026' },
  'navigator': { ver: 2, date: '20.08.2026' },
  'number-bonds': { ver: 1, date: '19.08.2026' },
  'object-tracker': { ver: 2, date: '20.08.2026' },
  'one-line': { ver: 2, date: '20.08.2026' },
  'ospan': { ver: 1, date: '19.08.2026' },
  'pattern': { ver: 1, date: '19.08.2026' },
  'phoneme-pairs': { ver: 1, date: '19.08.2026' },
  'phonemic-fluency': { ver: 1, date: '19.08.2026' },
  'picture-pairs': { ver: 1, date: '19.08.2026' },
  'posner': { ver: 1, date: '19.08.2026' },
  'prl': { ver: 1, date: '19.08.2026' },
  'proofreading': { ver: 1, date: '19.08.2026' },
  'pseudoword-echo': { ver: 1, date: '19.08.2026' },
  'quick-count': { ver: 1, date: '19.08.2026' },
  'reading-span': { ver: 1, date: '19.08.2026' },
  'rhythm-pitch': { ver: 2, date: '20.08.2026' },
  'rmet': { ver: 1, date: '19.08.2026' },
  'schulte': { ver: 1, date: '19.08.2026' },
  'sdmt': { ver: 1, date: '19.08.2026' },
  'semantic-sort': { ver: 1, date: '19.08.2026' },
  'set-game': { ver: 1, date: '19.08.2026' },
  'simon': { ver: 1, date: '19.08.2026' },
  'span': { ver: 1, date: '19.08.2026' },
  'spatial-span': { ver: 1, date: '19.08.2026' },
  'stop-signal': { ver: 1, date: '19.08.2026' },
  'story-recall': { ver: 1, date: '19.08.2026' },
  'stroop-emotional': { ver: 1, date: '19.08.2026' },
  'stroop': { ver: 1, date: '19.08.2026' },
  'sudoku-fractal': { ver: 1, date: '19.08.2026' },
  'sudoku-hub': { ver: 1, date: '20.08.2026' },
  'sudoku-samurai': { ver: 3, date: '20.08.2026' },
  'sudoku': { ver: 4, date: '20.08.2026' },
  'switching-task': { ver: 1, date: '19.08.2026' },
  'targets': { ver: 1, date: '19.08.2026' },
  'tower-london': { ver: 1, date: '19.08.2026' },
  'trail-making': { ver: 1, date: '19.08.2026' },
  'visual-search': { ver: 1, date: '19.08.2026' },
  'vocab-srs': { ver: 1, date: '19.08.2026' },
  'wcst': { ver: 1, date: '19.08.2026' },
  'word-pairs': { ver: 1, date: '19.08.2026' },
};

/** Редакция экрана по его id. `null`, если экран не проштампован. */
export function gameVersionOf(gameId?: string | null): GameVersion | null {
  if (!gameId) return null;
  return GAME_VERSIONS[gameId] ?? null;
}

/** Короткая подпись для репорта: `VER 1 · 19.08.2026`. */
export function gameVersionLabel(gameId?: string | null): string | null {
  const v = gameVersionOf(gameId);
  return v ? `VER ${v.ver} · ${v.date}` : null;
}

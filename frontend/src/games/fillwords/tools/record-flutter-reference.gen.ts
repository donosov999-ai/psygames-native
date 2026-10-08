/* psygames-fillwords-record-flutter-reference · VER 1 · 07.10.2026 */
/**
 * ЭТАЛОН, ПУЛЫ СЛОВ И ПОДПИСИ ДЛЯ FLUTTER-ПОЛОВИНЫ ФИЛВОРДОВ. Пишет четыре файла:
 *   · `flutter/assets/fillwords/pools.json` — пулы слов языков режима ровно такими, какими
 *     их собирает `wordPool` веба (три источника, фильтр письменности, порядок);
 *   · `flutter/lib/games/fillwords/core/words_data.g.dart` — список языков режима
 *     (`FILLWORDS_LOCALES`) и пол длины слова каждого языка (`полДлиныЯзыка`);
 *   · `flutter/assets/l10n/fillwords.json` — подписи режима из `core/i18n.ts`, 12 языков;
 *   · `flutter/test/fixtures/fillwords-reference.json` — эталон: поток ГПСЧ, лестница,
 *     ширина поля, ~160 полей (языки × уровни × сиды, без диагоналей, отступление пола) и
 *     сценарии партий — ЗАПИСАННЫЕ жесты с ответами ядра.
 *
 * 🔴 ЗАЧЕМ. Dart-перенос (`flutter/lib/games/fillwords/core/`, задача 8e61079a) сверяется с
 * прогоном ЖИВОГО TS число в число: одно зерно обязано давать одно поле в обеих половинах.
 * Пулы переезжают данными, а не переписанным фильтром: правило «заглавная — один символ»
 * у JS и Dart расходится на `ß`.
 *
 * ⚠️ ЭКСПОРТЁР ЛЕЖИТ В РЕПО: вшитые данные без экспортёра не чинятся. ПОСЛЕ ЛЮБОЙ ПРАВКИ
 * `src/games/fillwords/core/*`, его источников слов (`constants/translationVocab.ts`,
 * `constants/anagramWords.json`, наборы «Все слова») — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ВСЁ.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/fillwords/tools/record-flutter-reference.gen.ts'
 */
import {
  FILLWORDS_LOCALES,
  FILLWORDS_UI_LOCALES,
  applyTrace,
  areAdjacent,
  createFillwordsSession,
  createRng,
  fillwordsLevel,
  generateFillwords,
  getFillwordsStrings,
  isCleared,
  lettersLeft,
  normalizeSeed,
  порядокДляПартии,
  resolveTrace,
  stepTrace,
  takeHint,
  wordPool,
  полДлиныЯзыка,
  type CellIndex,
  type FillwordsPuzzle,
  type FillwordsSession,
  type FillwordsTrace,
} from '../core';
import { ширинаПодПоле } from '../core/generator';
import type { ПорядокСдачи } from '../core/types';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync, mkdirSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const FLUTTER = join(__dirname, '../../../../../flutter');
const POOLS_PATH = join(FLUTTER, 'assets/fillwords/pools.json');
const DATA_PATH = join(FLUTTER, 'lib/games/fillwords/core/words_data.g.dart');
const STRINGS_PATH = join(FLUTTER, 'assets/l10n/fillwords.json');
const REFERENCE_PATH = join(FLUTTER, 'test/fixtures/fillwords-reference.json');

/** Двенадцать языков приложения: пол длины пишется для каждого, режим решает порог. */
const APP_LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt', 'ru', 'zh'];

/** Порядок сдачи — латинским кодом, как `SubmitOrder.code` в Dart. */
const ORDER_CODE: Record<ПорядокСдачи, string> = { свободно: 'free', поСписку: 'listed', обратный: 'reverse' };

function traceOut(t: FillwordsTrace): { ok: boolean; wordIndex: number; reason: string | null } {
  return t.ok ? { ok: true, wordIndex: t.wordIndex, reason: null } : { ok: false, wordIndex: -1, reason: t.reason };
}

function puzzleOut(p: FillwordsPuzzle) {
  return {
    rows: p.rows,
    cols: p.cols,
    locale: p.locale,
    seed: p.seed,
    diagonals: p.диагонали,
    letters: p.letters.join(''),
    words: p.words.map((w) => ({ word: w.word, path: w.path })),
  };
}

/** Клетка, НЕ соседняя с данной: для жеста-прыжка. */
function farCell(p: FillwordsPuzzle, from: CellIndex): CellIndex {
  for (let c = p.rows * p.cols - 1; c >= 0; c--) {
    if (c !== from && !areAdjacent(from, c, p.cols, p.диагонали)) return c;
  }
  return from;
}

/**
 * Сценарий партии: записанные жесты и ответ ядра на каждый. Dart проигрывает ТЕ ЖЕ жесты
 * и сверяет ответы, а не придумывает свои.
 */
function playScript(p: FillwordsPuzzle, порядок: ПорядокСдачи, seed: number) {
  const rng = createRng(seed);
  let s: FillwordsSession = createFillwordsSession(p, порядок);
  const steps: unknown[] = [];
  const w0 = p.words[0].path;
  const gestures: CellIndex[][] = [
    [],
    [w0[0]],
    [w0[0], w0[0]],
    [w0[0], farCell(p, w0[0])],
    [w0[0], w0[1]],
  ];
  const order = rng.shuffle(p.words.map((_, i) => i));
  order.forEach((wi, k) => {
    const path = p.words[wi].path;
    gestures.push(k % 2 === 0 ? [...path] : [...path].reverse());
    if (k === 1) gestures.push([...p.words[order[0]].path]);
  });
  for (const g of gestures) {
    const before = resolveTrace(s, g);
    const r = applyTrace(s, g);
    s = r.session;
    steps.push({
      path: g,
      resolve: traceOut(before),
      trace: traceOut(r.trace),
      mistakes: s.mistakes,
      found: [...s.found],
      lettersLeft: lettersLeft(s),
      cleared: isCleared(s),
    });
  }
  return { order: ORDER_CODE[порядок], steps };
}

/** Подсказки до конца поля: какое слово и какие клетки отдаёт каждая. */
function hintScript(p: FillwordsPuzzle) {
  let s = createFillwordsSession(p);
  const hints: unknown[] = [];
  for (let i = 0; i < p.words.length + 1; i++) {
    const h = takeHint(s);
    s = h.session;
    hints.push(h.hint ? { wordIndex: h.hint.wordIndex, cells: h.hint.cells, hints: s.hints } : null);
    if (h.hint) s = applyTrace(s, h.hint.cells).session;
  }
  return hints;
}

/** Ведение линии по клеткам: шаг вперёд, возврат на предпоследнюю, прыжок, занятая клетка. */
function stepScript(p: FillwordsPuzzle) {
  let s = createFillwordsSession(p);
  s = applyTrace(s, p.words[0].path).session;
  const target = p.words[p.words.length - 1].path;
  const moves: CellIndex[] = [
    p.words[0].path[0],
    ...target,
    target[target.length - 2] ?? target[0],
    farCell(p, target[target.length - 1]),
    target[target.length - 1],
  ];
  let path: CellIndex[] = [];
  const out: unknown[] = [];
  for (const cell of moves) {
    path = stepTrace(s, path, cell);
    out.push({ cell, path: [...path] });
  }
  return out;
}

test('эталон филвордов, пулы слов и подписи для Flutter', () => {
  // ── пулы и пол длины ──
  const pools: Record<string, string[]> = {};
  for (const loc of FILLWORDS_LOCALES) pools[loc] = wordPool(loc).all;
  mkdirSync(join(FLUTTER, 'assets/fillwords'), { recursive: true });
  writeFileSync(POOLS_PATH, JSON.stringify(pools) + '\n');

  const minLen: Record<string, number> = {};
  for (const loc of APP_LOCALES) minLen[loc] = полДлиныЯзыка(loc);
  writeFileSync(DATA_PATH, [
    '// СГЕНЕРИРОВАНО: frontend/src/games/fillwords/tools/record-flutter-reference.gen.ts — руками не править.',
    '// Языки режима (`FILLWORDS_LOCALES`) и пол длины слова (`полДлиныЯзыка`), как их считает веб.',
    '',
    `const fillwordsLocalesData = <String>[${FILLWORDS_LOCALES.map((l) => `'${l}'`).join(', ')}];`,
    '',
    `const fillwordsMinLenData = <String, int>{${Object.entries(minLen).map(([l, n]) => `'${l}': ${n}`).join(', ')}};`,
    '',
  ].join('\n'));

  // ── подписи ──
  const strings: Record<string, unknown> = {};
  for (const loc of FILLWORDS_UI_LOCALES) strings[loc] = getFillwordsStrings(loc);
  writeFileSync(STRINGS_PATH, JSON.stringify(strings, null, 1) + '\n');

  // ── эталон ──
  const rng = [1, 7, 42, 2026, 123456789, 0, -5, 4294967295, 4294967296].map((seed) => {
    const r = createRng(seed);
    return {
      seed,
      normalized: normalizeSeed(seed),
      next: Array.from({ length: 12 }, () => r.next()),
      ints: Array.from({ length: 12 }, (_, i) => r.int(i + 1)),
    };
  });

  const levels = Array.from({ length: 320 }, (_, i) => {
    const c = fillwordsLevel(i + 1);
    return { ...c, порядок: undefined, order: ORDER_CODE[c.порядок] };
  });

  const widths = [320, 360, 390, 414, 768, 1024, 1366].flatMap((w) => [true, false].map((aside) => ({
    width: w, aside, field: ширинаПодПоле(w, aside),
  })));

  const requests: { rows: number; cols: number; locale: string; seed: number; maxWordLen?: number; minWordLen?: number; diagonals?: boolean }[] = [];
  for (const locale of FILLWORDS_LOCALES) {
    for (const level of [1, 10, 34, 50, 94, 150, 300]) {
      const c = fillwordsLevel(level);
      for (const seed of [1, 2]) {
        requests.push({ rows: c.rows, cols: c.cols, locale, seed: seed * 1000 + level, maxWordLen: c.maxWordLen, minWordLen: c.minWordLen });
      }
    }
    requests.push({ rows: 8, cols: 6, locale, seed: 77, diagonals: false });
    requests.push({ rows: 16, cols: 9, locale, seed: 78, maxWordLen: 8, minWordLen: 5, diagonals: false });
  }
  // Отступление пола: поле, которого словарь не тянет с полом 7 (замер веба: de 18×9, 20×9).
  for (const locale of FILLWORDS_LOCALES.filter((l) => l === 'de' || l === 'pt')) {
    requests.push({ rows: 20, cols: 9, locale, seed: 5, maxWordLen: 8, minWordLen: 7 });
  }

  const puzzles = requests.map((req) => {
    const p = generateFillwords({
      rows: req.rows, cols: req.cols, locale: req.locale, seed: req.seed,
      maxWordLen: req.maxWordLen, minWordLen: req.minWordLen, диагонали: req.diagonals,
    });
    return { request: req, puzzle: puzzleOut(p) };
  });

  const scripted = puzzles.filter((_, i) => i % 9 === 0).map(({ request }) => {
    const p = generateFillwords({
      rows: request.rows, cols: request.cols, locale: request.locale, seed: request.seed,
      maxWordLen: request.maxWordLen, minWordLen: request.minWordLen, диагонали: request.diagonals,
    });
    return {
      request,
      games: (['свободно', 'поСписку', 'обратный'] as ПорядокСдачи[]).map((o, k) => playScript(p, o, request.seed + k)),
      hints: hintScript(p),
      steps: stepScript(p),
    };
  });

  const orderForGame = (['свободно', 'поСписку', 'обратный'] as ПорядокСдачи[]).flatMap((o) => [true, false].map((visible) => ({
    level: ORDER_CODE[o], visible, game: ORDER_CODE[порядокДляПартии(o, visible)],
  })));

  writeFileSync(REFERENCE_PATH, JSON.stringify({
    источник: 'frontend/src/games/fillwords/tools/record-flutter-reference.gen.ts',
    locales: FILLWORDS_LOCALES,
    minLen,
    poolSizes: Object.fromEntries(Object.entries(pools).map(([l, all]) => [l, all.length])),
    rng,
    levels,
    widths,
    orderForGame,
    puzzles,
    scripted,
  }) + '\n');

  expect(puzzles.length).toBeGreaterThan(100);
});

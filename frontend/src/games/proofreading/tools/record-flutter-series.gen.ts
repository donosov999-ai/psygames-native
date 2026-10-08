/* psygames-proofreading-record-flutter-series · VER 1 · 07.10.2026 */
/**
 * СЕРИЯ «КОРРЕКТУРЫ» ДЛЯ FLUTTER-ПОЛОВИНЫ: ДАННЫЕ И ЭТАЛОН. Пишет два файла:
 *   · `flutter/assets/proofreading/series.json` — языки серии (`PROOF_SENSE_LOCALES`),
 *     категорийные пулы блока «Смысл» ровно такими, какими их собирает `sensePool` веба
 *     (`byCategory` и `targets`), имена категорий словом общего словаря (`catVocab_<cat>`)
 *     и подписи серии (`core/i18n.ts`) на 12 языках;
 *   · `flutter/test/fixtures/proofreading-series-reference.json` — эталон: поля серии
 *     (языки × размеры 5…8 × зёрна), исходы прогресса (`afterProofSeries`), вход в серию
 *     (`proofSeriesEntry`), запись партии (`seriesSession`) и записанные нажатия блоков.
 *
 * 🔴 ЗАЧЕМ. Dart-перенос серии (`flutter/lib/games/proofreading/series/`, задача f4bb47dc)
 * сверяется с прогоном ЖИВОГО TS число в число: одно зерно — одно поле в обеих половинах,
 * иначе разности блоков (цена сегментации, цена смысла) у натива мерили бы другое поле.
 * Пулы категорий переезжают ДАННЫМИ: их источники (корпус переводов и банк анаграмм с
 * темами) в нативе целиком не лежат, а переписанный фильтр разошёлся бы с вебом молча.
 *
 * ⚠️ ВЫГРУЗЧИК ЛЕЖИТ В РЕПО: вшитые данные без выгрузчика не чинятся. ПОСЛЕ ЛЮБОЙ ПРАВКИ
 * `src/games/proofreading/core/*`, `src/services/series.ts`, корпуса переводов, банка
 * анаграмм или ключей `catVocab_*` — ПЕРЕЗАПУСТИТЬ И ЗАКОММИТИТЬ ОБА ФАЙЛА.
 *
 * ЗАПУСК ЯВНЫЙ (файл вне `__tests__`, в обычный прогон не попадает):
 *   npx jest --testMatch '**\/proofreading/tools/record-flutter-series.gen.ts'
 */
import {
  PROOF_MAX_SIZE,
  PROOF_MIN_SIZE,
  PROOF_SENSE_LOCALES,
  PROOF_SERIES_PLAN,
  afterProofSeries,
  blockDone,
  blockStep,
  buildProofField,
  getProofSeriesStrings,
  nextBlock,
  openBlock,
  parseProofProgress,
  pressSignCell,
  pressWordTrace,
  proofSeriesEntry,
  sensePool,
  type ProofField,
  type ProofSeriesProgress,
  type ProofSeriesState,
} from '../core';
import { recordBlock, seriesSession, startSeries, type SeriesRun } from '@/src/services/series';
import { translateFor } from '@/src/contexts/LanguageContext';

declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { writeFileSync, mkdirSync } = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

const FLUTTER = join(__dirname, '../../../../../flutter');
const ASSET_PATH = join(FLUTTER, 'assets/proofreading/series.json');
const FIXTURE_PATH = join(FLUTTER, 'test/fixtures/proofreading-series-reference.json');

/** Двенадцать языков интерфейса — подписи серии есть на каждом (на чужом — английские). */
const UI_LOCALES = ['ru', 'en', 'de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar'] as const;
const SEEDS = [1, 2, 3, 77, 4242, 99991];

function fieldJson(f: ProofField) {
  return {
    locale: f.locale,
    size: f.size,
    letters: f.puzzle.letters,
    words: f.puzzle.words.map((w) => ({ word: w.word, path: [...w.path] })),
    signs: [...f.signs],
    signCells: [...f.signCells],
    category: f.category,
    senseWords: [...f.senseWords],
  };
}

/** Партия одного блока нажатиями: что видит ядро на каждом шаге. */
function playBlock(state: ProofSeriesState): { steps: { input: unknown; result: string; step: number }[]; state: ProofSeriesState } {
  const steps: { input: unknown; result: string; step: number }[] = [];
  let s = state;
  const key = PROOF_SERIES_PLAN[s.blockIndex];
  if (key === 'sign') {
    // Промах по чужой букве, затем все знаки по порядку поля.
    const wrong = s.field.puzzle.letters.findIndex((ch) => !s.field.signs.includes(ch));
    if (wrong >= 0) {
      const r = pressSignCell(s, wrong);
      s = r.state;
      steps.push({ input: { cell: wrong }, result: r.result, step: blockStep(s) });
    }
    for (const cell of s.field.signCells) {
      const r = pressSignCell(s, cell);
      s = r.state;
      steps.push({ input: { cell }, result: r.result, step: blockStep(s) });
    }
    // Повтор по уже взятой — «ignored».
    const again = pressSignCell(s, s.field.signCells[0]);
    steps.push({ input: { cell: s.field.signCells[0] }, result: again.result, step: blockStep(again.state) });
    return { steps, state: s };
  }
  const words = s.field.puzzle.words;
  // «Смысл»: сперва чужое слово (промах), потом все слова категории.
  if (key === 'sense') {
    const foreign = words.findIndex((_, i) => !s.field.senseWords.includes(i));
    if (foreign >= 0) {
      const r = pressWordTrace(s, words[foreign].path);
      s = r.state;
      steps.push({ input: { path: [...words[foreign].path] }, result: r.result, step: blockStep(s) });
    }
  }
  const order = key === 'sense' ? [...s.field.senseWords] : words.map((_, i) => i);
  for (const i of order) {
    const r = pressWordTrace(s, words[i].path);
    s = r.state;
    steps.push({ input: { path: [...words[i].path] }, result: r.result, step: blockStep(s) });
  }
  return { steps, state: s };
}

function progressCases() {
  const cases: unknown[] = [];
  const runs: { name: string; progress: ProofSeriesProgress; run: SeriesRun; ladder: number }[] = [];
  const full = (level: number, errs: [number, number, number], done = true): SeriesRun => {
    let run = startSeries('proofreading_series', level, PROOF_SERIES_PLAN, 0);
    PROOF_SERIES_PLAN.forEach((key, i) => {
      run = recordBlock(run, { key, timeMs: 10000 + i * 2500, errors: errs[i], done: done || i < 2 });
    });
    return run;
  };
  const p0 = parseProofProgress(null);
  runs.push({ name: 'первая полная, без ошибок', progress: p0, run: full(5, [0, 0, 0]), ladder: 5 });
  const p1 = afterProofSeries(p0, full(5, [0, 0, 0]), 5).progress;
  runs.push({ name: 'вторая полная — подъём', progress: p1, run: full(5, [0, 1, 2]), ladder: 5 });
  runs.push({ name: 'вторая, «Смысл» с 3 ошибками — держит', progress: p1, run: full(5, [0, 0, 3]), ladder: 5 });
  runs.push({ name: 'неполная — разностей нет, уровень прежний', progress: p1, run: full(5, [0, 0, 0], false), ladder: 5 });
  runs.push({ name: 'лестница филвордов тянет «Слово» вверх', progress: p0, run: full(6, [0, 0, 0]), ladder: 7 });
  const top = parseProofProgress(JSON.stringify({ sizes: { sign: 8, word: 8, sense: 8 }, streaks: { sign: 1, word: 1, sense: 1 } }));
  runs.push({ name: 'потолок 8×8 — расти некуда', progress: top, run: full(8, [0, 0, 0]), ladder: 8 });
  for (const c of runs) {
    const out = afterProofSeries(c.progress, c.run, c.ladder);
    cases.push({
      name: c.name,
      progress: c.progress,
      ladder: c.ladder,
      run: { level: c.run.level, blocks: c.run.blocks },
      entryBefore: proofSeriesEntry(c.progress, c.ladder),
      outcome: out,
      session: seriesSession(c.run),
    });
  }
  return cases;
}

describe('выгрузка серии «Корректуры» для Flutter', () => {
  it('пишет данные и эталон', () => {
    const sense: Record<string, unknown> = {};
    for (const locale of PROOF_SENSE_LOCALES) {
      const pool = sensePool(locale);
      const byCategory: Record<string, Record<string, string[]>> = {};
      for (const [cat, lengths] of pool.byCategory) {
        byCategory[cat] = {};
        for (const [len, list] of lengths) byCategory[cat][String(len)] = [...list];
      }
      const names: Record<string, string> = {};
      for (const cat of pool.targets) names[cat] = translateFor(locale, `catVocab_${cat}`);
      sense[locale] = { byCategory, targets: [...pool.targets], categoryNames: names };
    }
    const strings: Record<string, unknown> = {};
    for (const loc of UI_LOCALES) strings[loc] = getProofSeriesStrings(loc as never);

    mkdirSync(join(FLUTTER, 'assets/proofreading'), { recursive: true });
    writeFileSync(ASSET_PATH, JSON.stringify({
      meta: { source: 'frontend/src/games/proofreading/tools/record-flutter-series.gen.ts', ver: 1 },
      locales: PROOF_SENSE_LOCALES,
      plan: PROOF_SERIES_PLAN,
      minSize: PROOF_MIN_SIZE,
      maxSize: PROOF_MAX_SIZE,
      strings,
      sense,
    }));

    const fields: unknown[] = [];
    const plays: unknown[] = [];
    for (const locale of PROOF_SENSE_LOCALES) {
      for (let size = PROOF_MIN_SIZE; size <= PROOF_MAX_SIZE; size += 1) {
        for (const seed of SEEDS) {
          const f = buildProofField(locale, size, seed);
          fields.push({ request: { locale, size, seed }, field: fieldJson(f) });
        }
      }
      // Записанная серия по полю 5×5: три блока подряд, ответы ядра на каждом нажатии.
      const f = buildProofField(locale, 6, 5);
      let state = openBlock(f, 0);
      const blocks: unknown[] = [];
      for (let b = 0; b < PROOF_SERIES_PLAN.length; b += 1) {
        const played = playBlock(state);
        blocks.push({ key: PROOF_SERIES_PLAN[b], steps: played.steps, errors: played.state.errors, done: blockDone(played.state) });
        state = played.state;
        if (b < PROOF_SERIES_PLAN.length - 1) state = nextBlock(state);
      }
      plays.push({ request: { locale, size: 6, seed: 5 }, blocks });
    }
    // Размер вне 5…8 зажимается, а не роняет сборку.
    const clamp = [3, 5, 9, 12].map((size) => ({ size, got: buildProofField(PROOF_SENSE_LOCALES[0], size, 7).size }));

    writeFileSync(FIXTURE_PATH, JSON.stringify({
      meta: { source: 'frontend/src/games/proofreading/tools/record-flutter-series.gen.ts', ver: 1 },
      fields,
      plays,
      clamp,
      progress: progressCases(),
      parse: [null, '', 'не json', '{"sizes":{"sign":99,"word":2,"sense":"x"},"streaks":{"sign":-1,"word":1.7}}']
        .map((raw) => ({ raw, got: parseProofProgress(raw) })),
    }));
    expect(PROOF_SENSE_LOCALES.length).toBeGreaterThan(0);
    expect(fields.length).toBe(PROOF_SENSE_LOCALES.length * 4 * SEEDS.length);
  });
});

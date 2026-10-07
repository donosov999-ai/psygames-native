// VER 1 · 01.10.2026 · psygames-search-claude-mac
// ЭТАЛОН «ПАТТЕРНОВ» ДЛЯ FLUTTER — flutter/test/fixtures/pattern-reference.json прогоном ЖИВОГО
// patternSequences.ts. Сверка переноса — flutter/test/pattern_test.dart.
//
// 🔴 ВЫГРУЗЧИК ВОССТАНОВЛЕН. Первый снимали 23.09.2026 скриптом, которого в репозитории не оказалось:
// эталон жил без экспортёра, и ни одну правку генератора нельзя было перенести, не угадывая, как
// он собран (урок export_script_must_live_in_the_repo). Этот выгрузчик повторяет прежний файл
// ПОБАЙТНО по всем разделам, которые считает сам (проверка — `--check`), и добавляет новые.
//
// Разделы:
//   rows       — 26 уровней × 5 рядов makeSequence, зерно createRng('pattern|L');
//   picks      — те же уровни × 4 сырые выборки pickSequence, зерно 'pick|L';
//   reads      — прочтения и честность девяти рядов (входы — примеры из заслона неоднозначности);
//   optionSets — 6 ответов × 6 наборов makeOptions без хвоста, зерно 'opt|ответ';
//   leak       — утечка без хвоста: «ближе к среднему» и «последний + шаг», 8 уровней × 2000;
//   optionSetsTail, leakTail — то же С ПРИМАНКОЙ У ХВОСТА (задача 94f9c7c1);
//   cells      — раскладка ряда `cellSize` из app/games/pattern.tsx. Экран тянет React Native и
//                в node не поднимается, поэтому раздел ПЕРЕНОСИТСЯ из прежнего файла как есть:
//                правило раскладки этой правкой не тронуто.
//
// Запуск (из корня репозитория):
//   node frontend/src/games/counting/tools/record-pattern-reference.mjs           — записать;
//   node frontend/src/games/counting/tools/record-pattern-reference.mjs --check   — сверить без записи.
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {
  makeSequence, pickSequence, readings, fair, makeOptions, tailLure, mixScale, levelLabelKey, MIX_FROM,
} from '../patternSequences.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../flutter/test/fixtures/pattern-reference.json');

// Строковое зерно — FNV-1a + mulberry32, как `createRng` в Dart (shell/js_compat.dart).
function createRng(seed) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  let state = (hash >>> 0) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const LEVELS = [...Array.from({length: 23}, (_, i) => i + 1), 26, 30, 40];
const READS = [[2, 3, 5, 8], [4, 5, 7, 10], [2, 4, 8, 16], [1, 4, 9, 16, 25], [3, 6, 9, 12], [1, 11, 21, 1211],
  [2, 3, 5, 7, 11], [1, 4, 8, 11, 22], [5, 10, 6, 12, 7]];
const ANSWERS = [7, 12, 40, 144, -18, 1000];
const LEAK_LEVELS = [1, 5, 9, 13, 17, 21, 25, 30];

// Ряд без подсказки прежний выгрузчик писал `"ruleParams": null` — повторяем, иначе файл разойдётся.
const seqJson = (s) => ({items: s.items, answer: s.answer, classKey: s.classKey, ruleKey: s.ruleKey, ruleParams: s.ruleParams ?? null});
const rows = LEVELS.map((level) => {
  const rng = createRng(`pattern|${level}`);
  return {level, label: levelLabelKey(level), mixScale: mixScale(level), seqs: Array.from({length: 5}, () => seqJson(makeSequence(level, rng)))};
});
const picks = LEVELS.map((level) => {
  const rng = createRng(`pick|${level}`);
  return {level, seqs: Array.from({length: 4}, () => { const s = pickSequence(level, rng); return {items: s.items, answer: s.answer, classKey: s.classKey}; })};
});
const reads = READS.map((items) => {
  const r = readings(items);
  return {items, readings: r.map((x) => ({rule: x.rule, surplus: x.surplus, answer: x.answer})), fairProof: fair({items, answer: r.length ? r[0].answer : 0})};
});
const optionSets = ANSWERS.map((answer) => {
  const rng = createRng(`opt|${answer}`);
  return {answer, sets: Array.from({length: 6}, () => makeOptions(answer, 4, rng))};
});

// Утечка: как в пробе Dart — первый наименьший по порядку вариантов (строгое «меньше»).
function leakAt(level, withTail) {
  const rng = createRng(`${withTail ? 'leakTail' : 'leak'}|${level}`), n = 2000;
  let nearMean = 0, lastStep = 0;
  for (let i = 0; i < n; i += 1) {
    const s = makeSequence(level, rng);
    const tail = s.items.at(-1) + (s.items.at(-1) - s.items.at(-2));
    const opts = withTail ? makeOptions(s.answer, 4, rng, tailLure(s.items)) : makeOptions(s.answer, 4, rng);
    const mean = opts.reduce((a, b) => a + b, 0) / opts.length;
    let byMean = opts[0], byStep = opts[0];
    for (const v of opts) {
      if (Math.abs(v - mean) < Math.abs(byMean - mean)) byMean = v;
      if (Math.abs(v - tail) < Math.abs(byStep - tail)) byStep = v;
    }
    if (byMean === s.answer) nearMean += 1;
    if (byStep === s.answer) lastStep += 1;
  }
  return {level, n, nearMeanRate: nearMean / n, lastStepRate: lastStep / n};
}
const leak = LEAK_LEVELS.map((l) => leakAt(l, false));

// С приманкой у хвоста: ответы с хвостом рядом (квадраты, растущие разности) и далеко.
const TAIL_CASES = [[12, 10], [25, 23], [121, 119], [30, 31], [1000, 998], [-18, -20], [144, 100], [7, 7]];
const optionSetsTail = TAIL_CASES.map(([answer, tail]) => {
  const rng = createRng(`optTail|${answer}|${tail}`);
  return {answer, tail, sets: Array.from({length: 6}, () => makeOptions(answer, 4, rng, tail))};
});
const leakTail = LEAK_LEVELS.map((l) => leakAt(l, true));

const old = JSON.parse(readFileSync(OUT, 'utf8'));
const next = {mixFrom: MIX_FROM, rows, picks, reads, optionSets, leak, optionSetsTail, leakTail, cells: old.cells};

if (process.argv.includes('--check')) {
  let bad = 0;
  for (const key of ['mixFrom', 'rows', 'picks', 'reads', 'optionSets', 'leak']) {
    // Через JSON, как в файле: `ruleParams: undefined` у ряда без подсказки в файл не пишется вовсе.
    const same = isDeepStrictEqual(JSON.parse(JSON.stringify(next[key])), old[key]);
    if (!same) bad += 1;
    console.log(`${same ? '✓' : '✗'} ${key}`);
  }
  process.exit(bad ? 1 : 0);
}
// Вид прежнего файла: отступ в один пробел, без перевода строки в конце — разность правки остаётся читаемой.
writeFileSync(OUT, JSON.stringify(next, null, 1));
console.log(`записан ${OUT}: рядов ${rows.length * 5}, наборов ${optionSets.length * 6} + с хвостом ${optionSetsTail.length * 6}`);
for (const e of leakTail) console.log(`  L${e.level}: с хвостом «последний + шаг» ${(100 * e.lastStepRate).toFixed(1)} %, «ближе к среднему» ${(100 * e.nearMeanRate).toFixed(1)} %`);

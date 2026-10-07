#!/usr/bin/env node
/* psygames-export-deep-portals · VER 1 · 02.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЭТАЛОН ПОРТАЛОВ «БЕЗДНЫ» — ПРОГОНОМ ЖИВОГО TS.
 *
 * 🔴 ЗАЧЕМ (сверка «веб против натива» 138f7818, «Бездна» строки 6 и 33). Портал — пара
 * листьев-сиблингов с общей цифрой: на каждой стороне снята одна подсказка банковской
 * доски, и каждая порознь неоднозначна (`frontend/src/services/fractal-deep.ts`,
 * `deepPortalsFor`). В вебе порталы включены ВСЕГДА, в нативе их не было — лист натива
 * имел на одну подсказку больше и другой порог, и снимок веба, продолженный в нативе,
 * ставил руку на клетку, которая у натива — подсказка. План порталов детерминирован
 * (зерно, путь родителя, настройка), поэтому натив обязан выдать его БИТ В БИТ — это и
 * сверяет `flutter/test/deep_portals_test.dart` по этому файлу.
 *
 * Пишет `flutter/test/fixtures/deep-portals-reference.json`: для каждого зерна × объёма ×
 * ступени — родители предпоследнего слоя (у «Разведки» корень, у «Похода»/«Бездны» первые
 * --parents кормимых детей корня), их план порталов и сторона каждого листа после снятия
 * подсказки (blanks и порог — формулой экрана `app/games/sudoku-fractal-deep.tsx`, nodeAt).
 *
 * Запуск из корня репо: node flutter/tools/export-deep-portals.cjs [--parents=4]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createLoader, root } = require('./ts-load.cjs');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([a-z-]+)=(.*)$/.exec(a);
  if (!m || m[1] !== 'parents') throw Error(`непонятный аргумент «${a}»; есть: --parents=N`);
  return [m[1], m[2]];
}));
const PARENTS = Number(args.parents ?? 4);

const load = createLoader();
const deep = load('services/fractal-deep.ts');

// Объёмы — как PRESETS экрана веба (app/games/sudoku-fractal-deep.tsx) и `_presets` натива.
const PRESETS = [
  { key: 'scout', depth: 2, feedCount: 9, unlockShare: 0.24 },
  { key: 'trek', depth: 3, feedCount: 12, unlockShare: 0.24 },
  { key: 'abyss', depth: 3, feedCount: 'all', unlockShare: 0.24 },
];
const BANDS = [0, 3, 5];
// Зёрна: кириллица, латиница и вид, которым натив сеет партию (`бездна-<мс>-<случай>`).
const SEEDS = ['бездна-эталон-порталов', 'abyss-portal-ref', 'бездна-1727853000000-417', 'Бездна  Проба_Пробелов'];

const cases = [];
let portalsTotal = 0;
for (const seed of SEEDS) {
  for (const p of PRESETS) {
    for (const band of BANDS) {
      const cfg = { depth: p.depth, feedCount: p.feedCount, rating: deep.deepBandRating(band), unlockShare: p.unlockShare, spice: false };
      const root0 = deep.materializeNode(seed, '', cfg, 0);
      const parents = p.depth === 2 ? [''] : root0.feedCells.slice(0, PARENTS).map(([r, c]) => deep.childPath('', r, c));
      for (const parentPath of parents) {
        const chain = deep.materializeChain(seed, parentPath, cfg);
        const parent = chain[chain.length - 1];
        const portals = deep.deepPortalsFor(seed, parentPath, cfg, parent.solution);
        portalsTotal += portals.length;
        const leaves = [];
        for (const pt of portals) {
          for (const leaf of [pt.aPath, pt.bPath]) {
            const side = deep.portalOfLeaf(portals, leaf);
            const cell = deep.parentOf(leaf).cell;
            const node = deep.materializeNode(seed, leaf, cfg, parent.solution[cell[0]][cell[1]]);
            const blanks = node.blanks + 1;
            leaves.push({
              path: leaf,
              cell: side.cell, drop: side.drop, partnerPath: side.partnerPath, partnerCell: side.partnerCell, digit: side.digit,
              blanks,
              unlockCells: Math.max(1, Math.min(blanks, Math.ceil(blanks * cfg.unlockShare))),
            });
          }
        }
        cases.push({ seed, preset: p.key, band, parentPath, portals, leaves });
      }
    }
  }
}

const out = path.join(root, 'flutter/test/fixtures/deep-portals-reference.json');
fs.writeFileSync(out, JSON.stringify({
  'выгружено': 'node flutter/tools/export-deep-portals.cjs (живой fractal-deep.ts: deepPortalsFor, portalOfLeaf)',
  presets: PRESETS,
  bands: BANDS.map((b) => ({ band: b, rating: deep.deepBandRating(b) })),
  cases,
}, null, 1) + '\n');
console.log(`родителей ${cases.length} · порталов ${portalsTotal} · без порталов ${cases.filter((c) => c.portals.length === 0).length} → ${path.relative(root, out)}`);

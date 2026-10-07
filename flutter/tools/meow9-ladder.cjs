/* psygames-meow9-ladder · VER 1 · 02.10.2026 · psygames-sudoku-claude-mac */
'use strict';
/**
 * ДОСКИ «МЯУ — ДРУЗЬЯ» 9×9 ДЛЯ СТУПЕНЕЙ ЛЕСТНИЦЫ С ВАРИАНТОМ 'friends'.
 *
 * Генератора правила друзей на TS нет: доски строит MindLab по зерну, выгрузка —
 * `python3 flutter/tools/export_kids_boards.py --meow9` → `flutter/assets/levels/sudoku-meow9-boards.json`
 * (24 доски, проверены выгрузчиком и пробой `flutter/test/sudoku_meow9_boards_test.dart`).
 * `export-sudoku-boards.cjs` для такой ступени не зовёт генератор, а берёт доски отсюда.
 *
 * НОМЕРОВ ЗДЕСЬ НЕТ. Номера ставит развилка лестницы в `levelConfig` (план v4 — 129–132), а доски
 * берутся по ПОЗИЦИИ ступени в блоке подряд идущих ступеней 'friends': первая ступень блока —
 * первая ступень выгрузки (30 подсказок), вторая — вторая (28) и так далее. Сдвинули блок — доски
 * поехали с ним; блок длиннее выгрузки, другое поле или другое число пустых — выгрузчик падает с
 * причиной, а не подкладывает не ту доску.
 *
 * Правило друзей — не запрет хода, а условие на всё решение (у кота мышь рядом), поэтому
 * эталонов правил (`sudoku-rules-reference.json`) у варианта нет: натив сверяет ход с решением,
 * а единственность решения С правилом проверяет проба досок.
 */

const MEOW9_ASSET = 'sudoku-meow9-boards.json';

/** Строки `sudoku-variant-boards.json` для ступени [level] из выгрузки [meow]. */
function friendsRows(level, levelConfig, meow) {
  const c = levelConfig(level);
  if (c.variant !== 'friends') throw Error(`ступень ${level}: вариант ${c.variant}, а не friends`);
  if (!meow || !Array.isArray(meow.tracks) || !meow.tracks[0]) {
    throw Error(`ступень ${level} (friends): нет ${MEOW9_ASSET} — python3 flutter/tools/export_kids_boards.py --meow9`);
  }
  let first = level;
  while (first > 1 && levelConfig(first - 1).variant === 'friends') first--;
  const track = meow.tracks[0];
  const pos = level - first;
  const step = track.steps[pos];
  if (!step) {
    throw Error(`ступень ${level}: ${pos + 1}-я в блоке «Мяу — друзья», а в ${MEOW9_ASSET} ступеней ${track.steps.length}`
      + ' — добавь ступень в MEOW9 (export_kids_boards.py) или укороти блок в levelConfig');
  }
  if (c.N !== track.n || c.BR !== track.br || c.BC !== track.bc) {
    throw Error(`ступень ${level}: levelConfig даёт поле ${c.N}×${c.N} (${c.BR}×${c.BC}), а доски «Мяу» — ${track.n}×${track.n} (${track.br}×${track.bc})`);
  }
  const blanks = track.n * track.n - step.givens;
  if (c.blanks !== blanks) {
    throw Error(`ступень ${level}: в levelConfig пустых ${c.blanks}, а у ${pos + 1}-й ступени «Мяу» подсказок ${step.givens} — пустых ${blanks}`);
  }
  return step.boards.map((b) => ({
    level, variant: 'friends', n: track.n, br: track.br, bc: track.bc,
    puzzle: b.puzzle, solution: b.solution, tier: null, geometry: {},
  }));
}

module.exports = { MEOW9_ASSET, friendsRows };

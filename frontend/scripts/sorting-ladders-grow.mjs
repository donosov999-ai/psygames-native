#!/usr/bin/env node
/* psygames-sorting-ladders-grow · VER 1 · 16.09.2026 */
/**
 * 🔴 СВОЯ ЛЕСТНИЦА РАЗДЕЛА «СОРТИРОВКА» НЕ ПРОВАЛИВАЕТСЯ ВНИЗ — ГЕЙТ ИСПОЛНЕНИЕМ.
 *
 * ЗАЧЕМ. У «Заливки» и «Колышков» авторская лестница проваливалась: после решения
 * на 24 хода шло решение на 9, после доски на 44 колышка — доска на 14 (замер
 * 16.09.2026, записан в `sections/sorting.ts`). Свои лестницы переставляют те же
 * доски по ЗАМЕРЕННОЙ величине задачи. Этот гейт перемеряет её и ловит:
 *   · перестановку, от которой ступень стала меньше предыдущей;
 *   · выдуманные параметры — лестница обязана быть перестановкой досок автора.
 *
 * ⚠️ ПОЧЕМУ СКРИПТ, А НЕ ПРОБА JEST. Под jest `psy_generate` возвращает ноль
 * (записано в шапке `tatham-bridge-gate.mjs`), доска не раздаётся — проба была бы
 * зелёной вслепую. Здесь движок настоящий.
 *
 * ВЕЛИЧИНА ЗАДАЧИ:
 *   Flood — лимит ходов из строки состояния после отрисовки (при `m0` = длина решения,
 *           при запасе — длина решения плюс запас: запас вычитается);
 *   Pegs  — колышков в текстовом виде доски (`*`), ходов ровно на один меньше.
 * Среднее по трём зёрнам; допуск на ничью — 1 ход/колышек, иначе случайная
 * раздача соседних ступеней «Случайная 7×7» и «Крест 5×7» (25–26 против 26)
 * краснела бы по броску, а не по дефекту.
 *
 * Запуск: cd ~/dev/psygames-wt-sorting/frontend && node scripts/sorting-ladders-grow.mjs
 * Код выхода 1 — провал.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const M = await (require_(path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js')))();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
const ЗЁРНА = [11, 22, 33];
const ДОПУСК = 1;

const раздел = readFileSync(path.join(ЗДЕСЬ, '../src/games/tatham-bridge/sections/sorting.ts'), 'utf8');
function лестница(режим) {
  const начало = раздел.indexOf(`'${режим}': {`);
  if (начало < 0) return null;
  const конец = раздел.indexOf('\n  },', начало);
  const блок = раздел.slice(начало, конец);
  return [...блок.matchAll(/параметры: '([^']+)'/g)].map((m) => m[1]);
}

const индекс = {};
const n = M.ccall('psy_count', 'number');
for (let i = 0; i < n; i += 1) индекс[M.ccall('psy_name', 'string', ['number'], [i])] = i;

function авторские(i) {
  const k = M.ccall('psy_presets', 'number', ['number'], [i]);
  return Array.from({ length: k }, (_, s) => строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, s])));
}

const МЕРА = {
  Flood(i, пар) {
    const запас = Number((/m(\d+)/.exec(пар) || [])[1] ?? 0);
    const лимиты = ЗЁРНА.map((з) => {
      M.ccall('psy_open', 'number', ['number', 'string', 'number'], [i, пар, з]);
      строка(M.ccall('psy_draw', 'number', [], []));
      const т = M.ccall('psy_status_text', 'string', [], []) || '';
      const м = /\/\s*(\d+)/.exec(т);
      return м ? Number(м[1]) - запас : NaN;
    });
    return лимиты.reduce((a, b) => a + b, 0) / лимиты.length;
  },
  Pegs(i, пар) {
    const счёт = ЗЁРНА.map((з) => (строка(M.ccall('psy_board', 'number', ['number', 'string', 'number'], [i, пар, з])).match(/\*/g) || []).length);
    return счёт.reduce((a, b) => a + b, 0) / счёт.length;
  },
};

let провалов = 0;
for (const режим of ['Flood', 'Pegs']) {
  const i = индекс[режим];
  const своя = лестница(режим);
  console.log(`\n── ${режим} ──`);
  if (!своя || !своя.length) { console.log('🔴 своей лестницы нет'); провалов += 1; continue; }
  const автор = авторские(i);
  const лишние = своя.filter((p) => !автор.includes(p));
  const пропали = автор.filter((p) => !своя.includes(p));
  if (лишние.length || пропали.length || своя.length !== автор.length) {
    console.log(`🔴 не перестановка досок автора: лишние [${лишние}] · пропали [${пропали}]`);
    провалов += 1;
  }
  let прежняя = -Infinity;
  for (const [k, пар] of своя.entries()) {
    const в = МЕРА[режим](i, пар);
    const упала = Number.isNaN(в) || в + ДОПУСК < прежняя;
    console.log(`  ${String(k + 1).padStart(2)}. [${пар}] · величина ${Number.isNaN(в) ? '— НЕ ИЗМЕРЕНО' : в.toFixed(1)}${упала ? '  🔴 МЕНЬШЕ ПРЕДЫДУЩЕЙ' : ''}`);
    if (упала) провалов += 1;
    if (!Number.isNaN(в)) прежняя = Math.max(прежняя, в);
  }
}
console.log(провалов ? `\n🔴 провалов: ${провалов}` : '\n🟢 обе лестницы не проваливаются, и обе — доски автора');
process.exit(провалов ? 1 : 0);

#!/usr/bin/env node
/* psygames-capture-unruly-boards · VER 1 · 17.09.2026 */
/**
 * ДОСКИ «ЧЁТ-НЕЧЕТ» ДЛЯ ПРОБЫ РАЗБОРА ПО ШАГАМ — снимок с настоящего моста.
 *
 *   node scripts/capture-unruly-boards.mjs   → src/__tests__/unruly-teach-boards.generated.json
 *
 * 🔴 ПОЧЕМУ СНИМОК, А НЕ ГЕНЕРАЦИЯ В ПРОБЕ. Под jest мост доски не раздаёт (`psy_generate`
 * отдаёт 0, разбор в шапке `puzzle-move-counts-on-press`), а в Node работает. Поэтому доски
 * снимаются здесь: по каждой ступени лестницы движка две раздачи — начальная доска и решение
 * самого движка (`psy_solve`), обе сняты С РИСУНКА тем же разбором, что у экрана. Для двух
 * досок сохраняется и сам рисунок: проба сверяет по нему `доскаСРисунка`.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/unruly-teach-boards.generated.json');
const ЗЁРНА = [101, 202];

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
let движок = -1;
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) if (M.ccall('psy_name', 'string', ['number'], [i]) === 'Unruly') движок = i;
if (движок < 0) { console.error('🔴 в мосте нет Unruly'); process.exit(1); }

/** Доска с рисунка: последний прямоугольник цвета клетки (2 пусто, 3 белая, 6 чёрная) над центром. */
function доска(рисунок, ширина, w, h) {
  const плитка = ширина / (w + 1);
  const поле = Array.from({ length: h }, () => Array(w).fill(undefined));
  for (const линия of рисунок) {
    const ч = линия.split(' ');
    if (ч[0] !== 'R') continue;
    const [x, y, ш, в, цвет] = ч.slice(1, 6).map(Number);
    const знач = цвет === 2 ? null : цвет === 3 ? 0 : цвет === 6 ? 1 : undefined;
    if (знач === undefined) continue;
    for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
      const px = (cx + 1) * плитка, py = (cy + 1) * плитка;
      if (px >= x && px < x + ш && py >= y && py < y + в) поле[cy][cx] = знач;
    }
  }
  return поле;
}

const ступеней = M.ccall('psy_presets', 'number', ['number'], [движок]);
const доски = [];
const рисунки = [];
for (let k = 0; k < ступеней; k++) {
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [движок, k]));
  const [w, h] = /^(\d+)x(\d+)/.exec(параметры).slice(1).map(Number);
  for (const зерно of ЗЁРНА) {
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    const ширина = M.ccall('psy_width', 'number', [], []);
    const рисунок = строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean);
    const начало = доска(рисунок, ширина, w, h);
    if (M.ccall('psy_solve', 'number', [], []) !== 1 && M.ccall('psy_status', 'number', [], []) !== 1) {
      console.error(`🔴 ${параметры}#${зерно}: движок не решил доску`); process.exit(1);
    }
    const решение = доска(строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean), ширина, w, h);
    if ([начало, решение].some((g) => g.some((r) => r.some((c) => c === undefined)))) {
      console.error(`🔴 ${параметры}#${зерно}: с рисунка снялась не вся доска`); process.exit(1);
    }
    доски.push({ параметры, зерно, ширина, начало, решение });
    if (зерно === ЗЁРНА[0] && (k === 0 || k === ступеней - 1)) рисунки.push({ параметры, зерно, ширина, рисунок, начало });
  }
}
writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', движок: 'Unruly', доски, рисунки }));
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · досок ${доски.length}, рисунков ${рисунки.length}`);

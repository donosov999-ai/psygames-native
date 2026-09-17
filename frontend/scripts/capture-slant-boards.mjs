#!/usr/bin/env node
/* psygames-capture-slant-boards · VER 1 · 17.09.2026 */
/**
 * ДОСКИ «КОСЫХ ЧЕРТ» ДЛЯ ПРОБЫ РАЗБОРА ПО ШАГАМ — снимок с настоящего моста.
 *
 *   node scripts/capture-slant-boards.mjs   → src/__tests__/slant-teach-boards.generated.json
 *
 * Устройство как у `capture-unruly-boards.mjs`: под jest мост досок не раздаёт, в Node — раздаёт.
 * По каждой ступени движка две раздачи: числа в узлах и решение самого движка (`psy_solve`), обе
 * сняты С РИСУНКА своим разбором — не тем, что в `slant-teach.ts`, чтобы проба сверяла модуль с
 * независимым снятием. Для первой и последней ступени сохраняется и сам рисунок.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/slant-teach-boards.generated.json');
const ЗЁРНА = [101, 202];

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
let движок = -1;
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) if (M.ccall('psy_name', 'string', ['number'], [i]) === 'Slant') движок = i;
if (движок < 0) { console.error('🔴 в мосте нет Slant'); process.exit(1); }

/** Доска с рисунка: числа — текст «T» в узле, черты — линии «L» по середине и знаку dx·dy. */
function доска(рисунок, ширина, w, h) {
  const плитка = (ширина - 1) / (w + 2);
  const клетки = Array.from({ length: h }, () => Array(w).fill(0));
  const подсказки = Array.from({ length: h + 1 }, () => Array(w + 1).fill(null));
  for (const линия of рисунок) {
    const ч = линия.split(' ');
    if (ч[0] === 'T' && /^[0-4]$/.test(ч[6] ?? '')) {
      const px = Math.round(Number(ч[1]) / плитка) - 1, py = Math.round(Number(ч[2]) / плитка) - 1;
      подсказки[py][px] = Number(ч[6]);
    }
    if (ч[0] === 'L') {
      const [x1, y1, x2, y2] = ч.slice(1, 5).map(Number);
      const cx = Math.floor((x1 + x2) / 2 / плитка) - 1, cy = Math.floor((y1 + y2) / 2 / плитка) - 1;
      if (cx >= 0 && cy >= 0 && cx < w && cy < h) клетки[cy][cx] = (x2 - x1) * (y2 - y1) > 0 ? -1 : 1;
    }
  }
  return { клетки, подсказки };
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
    const решение = доска(строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean), ширина, w, h).клетки;
    if (решение.some((r) => r.some((c) => c === 0)) || начало.клетки.some((r) => r.some((c) => c !== 0))) {
      console.error(`🔴 ${параметры}#${зерно}: начало не пустое или решение снялось не целиком`); process.exit(1);
    }
    доски.push({ параметры, зерно, ширина, подсказки: начало.подсказки, решение });
    if (зерно === ЗЁРНА[0] && (k === 0 || k === ступеней - 1)) рисунки.push({ параметры, зерно, ширина, рисунок, подсказки: начало.подсказки });
  }
}
writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', движок: 'Slant', доски, рисунки }));
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · досок ${доски.length}, рисунков ${рисунки.length}`);

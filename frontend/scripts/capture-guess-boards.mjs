#!/usr/bin/env node
/* psygames-capture-guess-boards · VER 1 · 17.09.2026 */
/**
 * РАЗДАЧИ «УГАДАЙ КОД» ДЛЯ ПРОБЫ РАЗБОРА ПО ШАГАМ — снимок с настоящего моста.
 *
 *   node scripts/capture-guess-boards.mjs   → src/__tests__/guess-teach-boards.generated.json
 *
 * Устройство как у `capture-unruly-boards.mjs`: под jest мост раздач не даёт, в Node — даёт.
 * По каждой ступени движка три раздачи. Для каждой снимаются:
 *   · секрет — строка ответа после `psy_solve` (первая раздача — ещё и рисунок решённой доски);
 *   · ответы ДВИЖКА на несколько попыток: цвета ставятся протяжкой из палитры в лунку, попытка
 *     отправляется касанием меток — ровно так, как их сделает разбор; метки читаются с рисунка;
 *   · рисунок доски после этих попыток — на нём проба сверяет снятие «сыгранных» рядов.
 * Своим разбором рисунка, а не тем, что в `guess-teach.ts`, чтобы проба сверяла модуль с независимым
 * снятием.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/guess-teach-boards.generated.json');
const ЗЁРНА = [101, 202, 303];
const ПОПЫТОК_В_СНИМКЕ = 4;

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
let движок = -1;
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) if (M.ccall('psy_name', 'string', ['number'], [i]) === 'Guess') движок = i;
if (движок < 0) { console.error('🔴 в мосте нет Guess'); process.exit(1); }

const рисунок = () => строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean);
const указатель = (x, y, жест) => M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), жест]);

/** Круги рисунка, последний в точке: большие (r ≥ 10) и маленькие. */
function круги(р) {
  const out = new Map();
  for (const л of р) {
    const ч = л.split(' ');
    if (ч[0] !== 'C') continue;
    const [x, y, r, заливка] = ч.slice(1, 5).map(Number);
    out.set(`${x},${y},${r >= 10}`, { x, y, r, заливка });
  }
  return [...out.values()];
}

function раскладка(р, фишек, попыток) {
  const все = круги(р);
  const крупные = все.filter((к) => к.r >= 10), мелкие = все.filter((к) => к.r < 10);
  const левый = Math.min(...крупные.map((к) => к.x));
  const палитра = крупные.filter((к) => к.x === левый).sort((a, b) => a.y - b.y);
  const ys = [...new Set(крупные.filter((к) => к.x !== левый).map((к) => к.y))].sort((a, b) => a - b);
  const ряды = ys.map((y) => крупные.filter((к) => к.x !== левый && к.y === y).sort((a, b) => a.x - b.x));
  const метки = ряды.slice(0, попыток).map((ряд) => мелкие.filter((к) => Math.abs(к.y - ряд[0].y) < 17));
  return { палитра, ряды, метки, фишек };
}

const ступеней = M.ccall('psy_presets', 'number', ['number'], [движок]);
const раздачи = [];
for (let k = 0; k < ступеней; k++) {
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [движок, k]));
  const [цветов, фишек, попыток] = [/c(\d+)/, /p(\d+)/, /g(\d+)/].map((re) => Number(re.exec(параметры)[1]));
  for (const зерно of ЗЁРНА) {
    // Сперва секрет: решаем и читаем строку ответа (ряд под попытками).
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    if (M.ccall('psy_solve', 'number', [], []) !== 1) { console.error(`🔴 ${параметры}#${зерно}: движок не решил`); process.exit(1); }
    const решённый = рисунок();
    const р = раскладка(решённый, фишек, попыток);
    const строкаОтвета = р.ряды[попыток];
    if (!строкаОтвета || строкаОтвета.length !== фишек) { console.error(`🔴 ${параметры}#${зерно}: нет строки ответа`); process.exit(1); }
    const секрет = строкаОтвета.map((к) => к.заливка - 5);
    // Заново та же раздача: попытки протяжкой и касанием меток, ответ — с рисунка.
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    let seed = зерно;
    const случайный = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const ответы = [];
    for (let g = 0; g < ПОПЫТОК_В_СНИМКЕ; g++) {
      const д = раскладка(рисунок(), фишек, попыток);
      const попытка = Array.from({ length: фишек }, () => 1 + Math.floor(случайный() * цветов));
      попытка.forEach((цвет, i) => {
        const из = д.палитра[цвет - 1], в = д.ряды[g][i];
        указатель(из.x, из.y, 0); указатель(в.x, в.y, 1); указатель(в.x, в.y, 2);
      });
      const метки = д.метки[g];
      const cx = метки.reduce((s, к) => s + к.x, 0) / метки.length, cy = метки.reduce((s, к) => s + к.y, 0) / метки.length;
      указатель(cx, cy, 0); указатель(cx, cy, 2);
      const после = раскладка(рисунок(), фишек, попыток);
      const стоит = после.ряды[g].map((к) => к.заливка - 5);
      if (стоит.join() !== попытка.join()) { console.error(`🔴 ${параметры}#${зерно}: попытка ${g} легла как ${стоит}, а ставили ${попытка}`); process.exit(1); }
      ответы.push({ попытка, чёрных: после.метки[g].filter((к) => к.заливка === 16).length, белых: после.метки[g].filter((к) => к.заливка === 17).length });
    }
    раздачи.push({
      параметры, зерно, секрет, ответы,
      рисунокПопыток: рисунок(),
      ...(зерно === ЗЁРНА[0] ? { рисунокРешения: решённый } : {}),
    });
  }
}
writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', движок: 'Guess', раздачи }));
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · раздач ${раздачи.length}`);

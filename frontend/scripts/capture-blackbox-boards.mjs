#!/usr/bin/env node
/* psygames-capture-blackbox-boards · VER 1 · 17.09.2026 */
/**
 * РАЗДАЧИ «ЧЁРНОГО ЯЩИКА» ДЛЯ ПРОБЫ РАЗБОРА ПО ШАГАМ — снимок с настоящего моста.
 *
 *   node scripts/capture-blackbox-boards.mjs   → src/__tests__/blackbox-teach-boards.generated.json
 *
 * Устройство как у `capture-unruly-boards.mjs`: под jest мост раздач не даёт, в Node — даёт. По трём
 * первым ступеням движка (у разбора их три) по три раздачи. Для каждой снимаются:
 *   · шары — с рисунка после `psy_solve` (для первой раздачи — и сам рисунок);
 *   · ответы ДВИЖКА на все входы: выстрел касанием клетки рамки, подписи — с итогового рисунка
 *     (номер пары выходов стоит на обоих концах, поэтому читается в конце, а не после выстрела);
 *   · рисунок после трёх выстрелов и одной отметки шара человеком — для сверки снятия доски.
 * Своим разбором рисунка, а не тем, что в `blackbox-teach.ts`, чтобы проба сверяла модуль с независимым
 * снятием.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/blackbox-teach-boards.generated.json');
const ЗЁРНА = [101, 202, 303];
const СТУПЕНЕЙ = 3;

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
let движок = -1;
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) if (M.ccall('psy_name', 'string', ['number'], [i]) === 'Black Box') движок = i;
if (движок < 0) { console.error('🔴 в мосте нет Black Box'); process.exit(1); }
const рисунок = () => строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean);
const нажать = (x, y) => { M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), 0]); M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), 2]); };

function входы(w, h) {
  const out = [];
  for (let x = 1; x <= w; x++) out.push([x, 0]);
  for (let y = 1; y <= h; y++) out.push([w + 1, y]);
  for (let x = w; x >= 1; x--) out.push([x, h + 1]);
  for (let y = h; y >= 1; y--) out.push([0, y]);
  return out;
}

const раздачи = [];
for (let k = 0; k < СТУПЕНЕЙ; k++) {
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [движок, k]));
  const [w, h] = /w(\d+)h(\d+)/.exec(параметры).slice(1).map(Number);
  for (const зерно of ЗЁРНА) {
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    const ширина = M.ccall('psy_width', 'number', [], []);
    const плитка = ширина / (w + 3);
    const центр = (g) => плитка * g + плитка;
    if (M.ccall('psy_solve', 'number', [], []) !== 1) { console.error(`🔴 ${параметры}#${зерно}: движок не решил`); process.exit(1); }
    const решённый = рисунок();
    const шары = [];
    for (const л of решённый) {
      const ч = л.split(' ');
      if (ч[0] !== 'C' || Number(ч[3]) < плитка * 0.4 || ч[4] !== '9') continue;
      const gx = Math.round((Number(ч[1]) - плитка) / плитка), gy = Math.round((Number(ч[2]) - плитка) / плитка);
      if (gx >= 1 && gy >= 1 && gx <= w && gy <= h) шары.push((gy - 1) * w + (gx - 1));
    }
    const уникальные = [...new Set(шары)].sort((a, b) => a - b);
    // Ответы движка на все входы.
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    const вх = входы(w, h);
    for (const [gx, gy] of вх) нажать(центр(gx), центр(gy));
    const подписи = new Map();
    for (const л of рисунок()) { const ч = л.split(' '); if (ч[0] === 'T') подписи.set(`${ч[1]},${ч[2]}`, ч.slice(6).join(' ')); }
    const ответы = вх.map(([gx, gy]) => подписи.get(`${центр(gx)},${центр(gy)}`) ?? '—');
    // Рисунок человека: три выстрела и одна отметка (в клетку без шара, если такая есть).
    M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движок, параметры, зерно]);
    for (const [gx, gy] of [вх[0], вх[w + 1], вх[2 * w + h + 2]]) нажать(центр(gx), центр(gy));
    const пустая = Array.from({ length: w * h }, (_, i) => i).find((i) => !уникальные.includes(i));
    нажать(центр((пустая % w) + 1), центр(Math.floor(пустая / w) + 1));
    раздачи.push({
      параметры, зерно, ширина, шары: уникальные, ответы,
      рисунокЧеловека: рисунок(), отметка: пустая,
      ...(зерно === ЗЁРНА[0] ? { рисунокРешения: решённый } : {}),
    });
  }
}
writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', движок: 'Black Box', раздачи }));
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · раздач ${раздачи.length}`);

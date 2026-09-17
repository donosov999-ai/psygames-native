#!/usr/bin/env node
/* psygames-capture-error-colours · VER 1 · 17.09.2026 */
/**
 * ЦВЕТА ОШИБКИ ДВИЖКОВ ДЛЯ ПРОБЫ ПОДСКАЗКИ «КРАСНЫМ ОТМЕЧЕНО, ГДЕ НАРУШЕНО ПРАВИЛО» — снимок с моста.
 *
 *   node scripts/capture-error-colours.mjs   → src/__tests__/tatham-error-colours.generated.json
 *
 * Снимается:
 *   · палитра каждого из 42 режимов на первой ступени движка (строка «r,g,b r,g,b …»);
 *   · рисунки ДО и ПОСЛЕ заведомо неверного хода у трёх режимов (замер задачи 9022b6ff, 17.09.2026):
 *     Singles 5x5de — две соседние чёрные в первой строке; Towers 4de — одна цифра дважды в строке;
 *     Palisade 5x5n5 — лишние стены по всем внутренним границам.
 * Проба сверяет по нему таблицу `ЦВЕТ_ОШИБКИ` и функцию `естьОшибкаНаРисунке` на настоящих рисунках.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/tatham-error-colours.generated.json');

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
const рисунок = () => строка(M.ccall('psy_draw', 'number', [], [])).split('\n').filter(Boolean);
const тап = (x, y) => { M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), 0]); M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), 2]); };
const клавиша = (к) => M.ccall('psy_key', 'number', ['number'], [к]);
const движки = new Map();
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) движки.set(M.ccall('psy_name', 'string', ['number'], [i]), i);
const открыть = (имя, параметры, зерно) => M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движки.get(имя), параметры, зерно]);

const палитры = {};
for (const [имя, i] of движки) {
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, 0]));
  открыть(имя, параметры, 5);
  палитры[имя] = строка(M.ccall('psy_colours', 'number', [], [])).trim();
}

const нарушения = {};
// Singles: две соседние чёрные клетки в первой строке (текст числа — центр клетки).
открыть('Singles', '5x5de', 7);
{
  const до = рисунок();
  const тексты = до.filter((l) => l.startsWith('T ')).map((l) => l.split(' ').map(Number)).map((ч) => ({ x: ч[1], y: ч[2] }));
  const y0 = Math.min(...тексты.map((t) => t.y));
  const ряд = тексты.filter((t) => Math.abs(t.y - y0) < 2).sort((a, b) => a.x - b.x);
  тап(ряд[0].x, ряд[0].y);
  const одна = рисунок();
  тап(ряд[1].x, ряд[1].y);
  нарушения.Singles = { параметры: '5x5de', до, одна, после: рисунок(), статус: M.ccall('psy_status', 'number', [], []) };
}
// Towers: одна и та же цифра в двух соседних клетках строки (крайние ряд и столбец — подсказки).
открыть('Towers', '4de', 3);
{
  const до = рисунок();
  const R = до.filter((l) => l.startsWith('R ')).map((l) => l.split(' ').map(Number));
  const размер = new Map(); for (const r of R) { const k = `${r[3]}x${r[4]}`; размер.set(k, (размер.get(k) ?? 0) + 1); }
  const [ключ] = [...размер].sort((a, b) => b[1] - a[1])[0];
  const клетки = R.filter((r) => `${r[3]}x${r[4]}` === ключ);
  const ys = [...new Set(клетки.map((r) => r[2]))].sort((a, b) => a - b);
  const xs = [...new Set(клетки.map((r) => r[1]))].sort((a, b) => a - b);
  const найти = (x, y) => клетки.find((r) => r[1] === x && r[2] === y);
  const [c1, c2] = [найти(xs[1], ys[1]), найти(xs[2], ys[1])];
  тап(c1[1] + c1[3] / 2, c1[2] + c1[4] / 2); клавиша(49);
  const одна = рисунок();
  тап(c2[1] + c2[3] / 2, c2[2] + c2[4] / 2); клавиша(49);
  нарушения.Towers = { параметры: '4de', до, одна, после: рисунок(), статус: M.ccall('psy_status', 'number', [], []) };
}
// Palisade: стены по всем внутренним вертикальным границам.
открыть('Palisade', '5x5n5', 3);
{
  const до = рисунок();
  const s = M.ccall('psy_width', 'number', [], []) / 5.5;
  тап(s * 1.25, s * 0.75);
  const одна = рисунок();
  for (let i = 1; i < 5; i++) for (let j = 0; j < 5; j++) if (!(i === 1 && j === 0)) тап(s * (0.25 + i), s * (0.75 + j));
  нарушения.Palisade = { параметры: '5x5n5', до, одна, после: рисунок(), статус: M.ccall('psy_status', 'number', [], []) };
}

writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', палитры, нарушения }));
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · палитр ${Object.keys(палитры).length}, нарушений ${Object.keys(нарушения).length}`);

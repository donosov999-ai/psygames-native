#!/usr/bin/env node
/* psygames-capture-move-positions · VER 1 · 17.09.2026 */
/**
 * ХОД — ЭТО НОВАЯ ПОЗИЦИЯ В ИСТОРИИ ДВИЖКА, А СТАТУС «КЛОЦЕК» — 1 ТОЛЬКО НА РЕШЁННОЙ ДОСКЕ. Снимок с моста.
 *
 *   node scripts/capture-move-positions.mjs   → src/__tests__/tatham-move-positions.generated.json
 *
 * Задача f0ab1936 (отчёт 4dcf8928, замер psygames-spatial-claude-mac 17.09.2026): «Клоцки» засчитывались
 * при входе (статус 1 сразу после раздачи), а тычок в блок без протяжки считался ходом. Под jest мост
 * не играет (`psy_generate` там отдаёт 0 — см. шапку `tatham-bridge-gate.mjs`), поэтому поведение
 * снимается здесь, а проба `puzzle-move-is-new-position` сверяет снимок.
 *
 * Снимается:
 *   · md5 самого `tatham.js` — снимок привязан к сборке: пересобрали мост, не пересняв, — проба красная;
 *   · «Клоцки»: статус сразу после раздачи, 3 ступени × зёрна 1–20;
 *   · «Клоцки»: партия, доведённая ДО КОНЦА по подсказке движка (psy_solve кладёт путь решения, а не
 *     решённую доску; блок пути рисуется светлой заливкой 1/7, его тень — 2/14; тянем блок в тень, пока
 *     статус не станет 1), 3 ступени × 3 зерна: статусы на каждом шаге и число ходов против «min N»;
 *   · все 42 режима, зерно 7, первая ступень: 144 тычка левой по сетке 12×12, столько же правой,
 *     20 стрелок, 10 «выбрать», 9 цифр — сколько раз движок ответил PKR_SOME_EFFECT и сколько раз
 *     позиция в истории (`psy_statepos`) выросла.
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ЗДЕСЬ = path.dirname(fileURLToPath(import.meta.url));
const МОСТ = path.join(ЗДЕСЬ, '../src/games/tatham-bridge/tatham.js');
const ВЫХОД = path.join(ЗДЕСЬ, '../src/__tests__/tatham-move-positions.generated.json');

const M = await require_(МОСТ)();
const строка = (p) => { if (!p) return ''; const s = M.UTF8ToString(p); M.ccall('psy_free', null, ['number'], [p]); return s; };
const движки = new Map();
for (let i = 0; i < M.ccall('psy_count', 'number', [], []); i++) движки.set(M.ccall('psy_name', 'string', ['number'], [i]), i);
const открыть = (имя, параметры, зерно) => M.ccall('psy_open', 'number', ['number', 'string', 'number'], [движки.get(имя), параметры, зерно]);
const рисунок = () => строка(M.ccall('psy_draw', 'number', [], []));
const статус = () => M.ccall('psy_status', 'number', [], []);
const позиция = () => M.ccall('psy_statepos', 'number', [], []);
const указатель = (x, y, вид) => M.ccall('psy_pointer', 'number', ['number', 'number', 'number'], [Math.round(x), Math.round(y), вид]);
const пресеты = (имя) => {
  const i = движки.get(имя);
  return Array.from({ length: M.ccall('psy_presets', 'number', ['number'], [i]) }, (_, k) => строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, k])));
};

// ── «Клоцки» ──────────────────────────────────────────────────────────────────
const ступениКлоцек = пресеты('Slide');
const послеРаздачи = ступениКлоцек.map((параметры) => ({
  параметры,
  статусы: Array.from({ length: 20 }, (_, k) => { открыть('Slide', параметры, k + 1); рисунок(); return статус(); }),
}));

/** Клетки доски «Клоцек» по рисунку: плитка T = ширина / (w + 1), поле с отступом T/2 (`slide.c`, COORD). */
function клетки(параметры) {
  const [, w, h] = /^(\d+)x(\d+)/.exec(параметры).map(Number);
  const T = Math.floor(M.ccall('psy_width', 'number', [], []) / (w + 1)), B = Math.floor(T / 2);
  const площади = new Map();
  for (const л of рисунок().split('\n')) {
    if (!л.startsWith('R ')) continue;
    const [, x0, y0, ш, в, цвет] = л.split(' ').map(Number);
    // Фон клетки целиком и узкие полосы (кромки блоков, решётка силового поля) заливку блока не несут.
    if ((ш === T && в === T) || Math.min(ш, в) < T / 4) continue;
    const x = Math.floor((x0 + ш / 2 - B) / T), y = Math.floor((y0 + в / 2 - B) / T);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const к = y * w + x;
    if (!площади.has(к)) площади.set(к, new Map());
    площади.get(к).set(цвет, (площади.get(к).get(цвет) ?? 0) + ш * в);
  }
  const где = (цвета) => [...площади].filter(([, м]) => цвета.some((c) => (м.get(c) ?? 0) >= 0.4 * T * T)).map(([к]) => к).sort((a, b) => a - b);
  return { w, T, B, блок: где([1, 7]), тень: где([2, 14]) };
}

const доведения = [];
for (const параметры of ступениКлоцек) for (const зерно of [1, 2, 3]) {
  открыть('Slide', параметры, зерно); рисунок();
  const запись = { параметры, зерно, статусДо: статус(), статусыПоПути: [], ходов: 0, минимум: null, статусПосле: null };
  M.ccall('psy_solve', 'number', [], []);
  for (let шаг = 0; шаг < 400; шаг++) {
    const { w, T, B, блок, тень } = клетки(параметры);
    if (!блок.length || !тень.length) break;
    const центр = (к) => [(к % w) * T + B + T / 2, Math.floor(к / w) * T + B + T / 2];
    const было = позиция();
    указатель(...центр(блок[0]), 0);
    указатель(...центр(блок[0] + тень[0] - блок[0]), 1);
    указатель(...центр(блок[0] + тень[0] - блок[0]), 2);
    if (позиция() <= было) { запись.сбой = `шаг ${шаг}: ход не записан`; break; }
    запись.ходов++;
    рисунок();
    if (статус() === 1) break;
    запись.статусыПоПути.push(статус());
  }
  запись.статусыПоПути = [...new Set(запись.статусыПоПути)];
  запись.статусПосле = статус();
  запись.минимум = Number(/min (\d+)/.exec(M.ccall('psy_status_text', 'string', [], []) || '')?.[1] ?? NaN);
  доведения.push(запись);
}

// ── все 42: ответ движка против роста позиции ─────────────────────────────────
const режимы = [];
for (const [имя, i] of движки) {
  const параметры = строка(M.ccall('psy_preset_params', 'number', ['number', 'number'], [i, 0]));
  открыть(имя, параметры, 7); рисунок();
  const W = M.ccall('psy_width', 'number', [], []), H = M.ccall('psy_height', 'number', [], []);
  const запись = { имя, параметры };
  const мерить = (ключ, действия) => {
    let поОтвету = 0, поПозиции = 0;
    for (const д of действия) { const было = позиция(); if (д().some((r) => r === 1)) поОтвету++; if (позиция() > было) поПозиции++; рисунок(); }
    запись[ключ] = { раз: действия.length, поОтвету, поПозиции };
  };
  const точки = [];
  for (let y = H / 24; y < H; y += H / 12) for (let x = W / 24; x < W; x += W / 12) точки.push([x, y]);
  const тычок = (кнопка) => точки.map(([x, y]) => () => [указатель(x, y, кнопка), указатель(x, y, кнопка + 2)]);
  мерить('тычки', тычок(0));
  мерить('правой', тычок(3));
  мерить('стрелки', Array.from({ length: 20 }, (_, k) => () => [M.ccall('psy_cursor', 'number', ['number'], [k % 4])]));
  мерить('выбрать', Array.from({ length: 10 }, (_, k) => () => [M.ccall('psy_key', 'number', ['number'], [k % 2 ? 526 : 525])]));
  мерить('цифры', Array.from({ length: 9 }, (_, k) => () => [M.ccall('psy_key', 'number', ['number'], [49 + k])]));
  режимы.push(запись);
}

const мост = createHash('md5').update(readFileSync(МОСТ)).digest('hex');
writeFileSync(ВЫХОД, JSON.stringify({ снято: '17.09.2026', мост, клоцки: { послеРаздачи, доведения }, режимы }, null, 1) + '\n');
const лишних = режимы.reduce((s, р) => s + ['тычки', 'правой', 'стрелки', 'выбрать', 'цифры'].reduce((t, к) => t + р[к].поОтвету - р[к].поПозиции, 0), 0);
console.log(`✅ ${path.relative(process.cwd(), ВЫХОД)} · Клоцки: статус 1 после раздачи ${послеРаздачи.flatMap((п) => п.статусы).filter((c) => c === 1).length}/60, доведено до статуса 1 ${доведения.filter((д) => д.статусПосле === 1).length}/${доведения.length} · режимов ${режимы.length}, лишних «ходов» по ответу ${лишних}`);

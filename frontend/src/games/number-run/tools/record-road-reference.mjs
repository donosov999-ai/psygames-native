// VER 1 · 30.09.2026 · psygames-search-claude-mac
// ЭТАЛОН ДОРОГИ ДЛЯ FLUTTER. Пишет flutter/test/fixtures/road-reference.json прогоном ЖИВОГО
// runner-core.mjs: ряды-ответы (арки, `kind: 'answer'`), боковое движение к полосе, пересечение
// ряда, шаг кадра с догоном и паузой на долгом кадре.
//
// 🔴 ЗАЧЕМ. Раннер «Поиска» пишется на Dart (решение Дениса 30.09.2026), а его дорога — общее
// ядро со «Числовым забегом» (звено 3 цепочки раннеров): «Числовой забег» потом ляжет на то же
// ядро станциями «Счёта». Поэтому дорога на Dart — ПЕРЕНОС этого ядра, а не новая физика: та же
// скорость смены полосы, то же округление полосы на пересечении, тот же догон кадра. Dart
// сверяется с этим файлом (flutter/test/search_runner_road_test.dart).
//
// ⚠️ `correct` у ряда-ответа — С НУЛЯ (0..2): в ядре `ok = lane + 1 === row.correct`, полосы −1/0/1.
// Первая выгрузка 30.09 писала 1..3 — и сверка была бы сверкой брака.
//
// Что НЕ покрыто и почему: сборы (pickups), стенки, трамплины, ворота-правила, шкала — это
// механика «Числового забега»; их перенос — задача 41845727, вместе с его станциями.
//
// ПОСЛЕ ЛЮБОЙ ПРАВКИ runner-core.mjs — перезапустить и закоммитить:
//   node frontend/src/games/number-run/tools/record-road-reference.mjs
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initial, resume, pause, advanceFrame, changeLane, setTarget, FIXED_DT, CORE_VERSION} from '../runner-core.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../../../flutter/test/fixtures/road-reference.json');

// mulberry32 — зерно сценария; к ядру не относится, только к выбору трасс и нажатий.
function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCourse(n, seed, mode) {
  const r = rng32(seed * 7919 + 17);
  const rows = [];
  for (let i = 0; i < 12; i += 1) {
    const row = {id: i, kind: 'answer', z: 24 * (i + 1), correct: Math.floor(r() * 3), options: ['a', 'b', 'c'], reward: 1, penalty: 0};
    // Окно у части рядов: пересечение считается по z + window, событие пишет z ряда.
    if (r() < 0.3) row.window = [1.5, 3, 4.5][Math.floor(r() * 3)];
    rows.push(row);
  }
  return {levelId: 100 + n, seed, mode, start: 0, speed: [8, 8, 9.5, 11][n % 4], lateralSpeed: [4, 4, 3.5, 5][n % 4], rows, gates: 0};
}

// Нажатия: время → действие. Смена полосы, «тянуть» в произвольную точку, пауза/продолжение.
function makePlan(seed) {
  const r = rng32(seed * 104729 + 3);
  const plan = [];
  let t = 0.2;
  while (t < 50) {
    const u = r();
    if (u < 0.55) plan.push({t, op: 'lane', d: r() < 0.5 ? -1 : 1});
    else if (u < 0.85) plan.push({t, op: 'target', x: Math.round((r() * 2 - 1) * 1000) / 1000});
    else {
      // Пауза всегда с продолжением через 0,3–1,5 с: иначе забег стоит до конца кадров.
      plan.push({t, op: 'pause'});
      t += 0.3 + r() * 1.2;
      plan.push({t, op: 'resume'});
    }
    t += 0.05 + r() * 1.2;
  }
  return plan;
}

// Кадры: в основном 60 Гц, иногда 30 Гц, дрожание, догон 0,1–0,3 с и прерывание > 0,8 с.
function makeFrames(seed) {
  const r = rng32(seed * 1299709 + 11);
  const frames = [];
  let total = 0;
  while (total < 55) {
    const u = r();
    const raw = u < 0.7 ? 1 / 60 : u < 0.85 ? 1 / 30 : u < 0.93 ? 0.05 + r() * 0.05 : u < 0.98 ? 0.1 + r() * 0.3 : 0.85 + r();
    // До микросекунды — и именно округлённое идёт в ядро: записанное равно прожитому.
    const dt = Math.round(raw * 1e6) / 1e6;
    frames.push(dt);
    total += dt;
  }
  return frames;
}

// Прогон записывает, КАКОЕ нажатие перед КАКИМ кадром применено (`applied`), — Dart
// повторяет ровно эту ленту и не повторяет логику водителя.
function run(course, plan, frames) {
  let s = resume(initial(course));
  const trace = [];
  const applied = [];
  let p = 0;
  let clock = 0;
  let resumeAt = null;
  const apply = (i, a) => {
    applied.push({i, ...a});
    if (a.op === 'lane') s = changeLane(s, a.d);
    else if (a.op === 'target') s = setTarget(s, a.x);
    else if (a.op === 'pause') s = pause(s);
    else s = resume(s);
  };
  frames.forEach((dt, i) => {
    // Нажатия идут по НАСТОЯЩИМ часам (сумма кадров), а не по часам партии: на паузе
    // часы партии стоят, и «продолжить» по ним не наступило бы никогда.
    while (p < plan.length && plan[p].t <= clock) {
      const {t, ...a} = plan[p++];
      apply(i, a);
    }
    // Пауза от прерывания (кадр > 0,8 с в режиме тренировки) — человек жмёт «продолжить».
    if (resumeAt !== null && resumeAt <= clock) {
      resumeAt = null;
      apply(i, {op: 'resume'});
    }
    const before = s.pauses;
    s = advanceFrame(s, dt, course);
    clock += dt;
    if (s.pauses > before && s.events.at(-1)?.reason === 'interruption') resumeAt = clock + 0.5;
    // След: каждый 16-й кадр, каждый кадр с новым событием и последний.
    const fresh = s.events.length !== (trace.at(-1)?.events ?? 0);
    if (i % 16 !== 0 && !fresh && i !== frames.length - 1) return;
    trace.push({i, z: s.z, x: s.x, target: s.target, nextRow: s.nextRow, sum: s.sum, mistakes: s.mistakes,
      status: s.status, elapsed: s.elapsed, slowFrames: s.slowFrames, discardedTime: s.discardedTime, pauses: s.pauses, events: s.events.length});
  });
  return {trace, events: s.events, applied};
}

const scenarios = [];
for (let n = 0; n < 9; n += 1) {
  const mode = n % 3 === 2 ? 'training' : 'journey';
  const course = makeCourse(n, 1000 + n, mode);
  const plan = makePlan(2000 + n);
  const frames = makeFrames(3000 + n);
  const {trace, events, applied} = run(course, plan, frames);
  // Проверка до записи: эталон, где не пересечён ни один ряд или не было ни одного верного
  // и ни одного неверного ответа, сверял бы пустоту.
  const answers = events.filter((e) => e.type === 'answer');
  if (answers.length < 6) throw Error(`сценарий ${n}: пересечено рядов ${answers.length}`);
  scenarios.push({name: `сценарий ${n} (${mode})`, course, frames, applied, trace, events});
}

// По эталону целиком: верные и неверные ответы, прерывание кадра и пауза — все встречаются.
const all = scenarios.flatMap((x) => x.events);
if (!all.some((e) => e.type === 'answer' && e.ok) || !all.some((e) => e.type === 'answer' && !e.ok)) throw Error('ответы все одного знака');
if (!all.some((e) => e.reason === 'interruption')) throw Error('нет ни одного прерывания кадра');
if (!scenarios.some((x) => x.trace.at(-1).discardedTime > 0)) throw Error('нет ни одного отброшенного времени');
writeFileSync(OUT, JSON.stringify({source: 'frontend/src/games/number-run/runner-core.mjs', coreVersion: CORE_VERSION, fixedDt: FIXED_DT, scenarios}) + '\n');
console.log(`эталон дороги: ${scenarios.length} сценариев, событий ${scenarios.reduce((a, s) => a + s.events.length, 0)}, кадров ${scenarios.reduce((a, s) => a + s.frames.length, 0)} → ${OUT}`);

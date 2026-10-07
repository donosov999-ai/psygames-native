// VER 1 · 01.10.2026 · psygames-search-claude-mac
// ЭТАЛОН «ЧИСЛОВОГО ЗАБЕГА» ДЛЯ FLUTTER. Пишет два файла прогоном ЖИВЫХ runner-core.mjs,
// runner-shapes.mjs, runner-level.mjs, runner-campaign.mjs, runner-levels.mjs и настоящих
// генераторов станций (mathSprintCore, numberBondsLadder, patternSequences, math-slider core,
// ospanLadder):
//   flutter/test/fixtures/number-run-courses-reference.json — уровни и забег целиком: ряды,
//     путь решателя, «стоящий на месте», финал, правила; жребий mulberry32;
//   flutter/test/fixtures/number-run-runs-reference.json — прогоны кадров с нажатиями: след
//     состояния и все события ядра.
//
// 🔴 ЗАЧЕМ. «Числовой забег» переезжает на Flutter (задача 41845727) на общее ядро дороги
// раннеров (flutter/lib/games/runner/). Правила — ПЕРЕНОС, а не переписывание: Dart сверяется с
// этими файлами точным равенством чисел (flutter/test/number_run_core_test.dart). Расхождение
// в курсе уровня со станцией = расхождение генератора упражнения, перенесённого раньше.
//
// Кадры и зёрна водителя не пишутся в файл: обе стороны выводят их из mulberry32 раннера
// (`random` из runner-shapes.mjs) — сверка жребия стоит в том же эталоне первой. В файл идут
// только нажатия (кадр → цель/полоса/пауза) и след.
//
// ⚠️ Названия этапов («Уровень N», «Маршрут N») из эталона убраны: это подпись экрана, в Dart
// она идёт ключом словаря, а не строкой данных. Пример шкалы — в записи `ru` (запятая,
// без разрядов): так печатает её Dart-перенос «Мат. шкалы».
//
// ПОСЛЕ ЛЮБОЙ ПРАВКИ ядра, построений, уровней или генераторов станций — перезапустить и
// закоммитить (из корня репозитория):
//   node frontend/src/games/number-run/tools/record-number-run-reference.mjs
import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import {initial, resume, pause, advanceFrame, changeLane, setTarget, CORE_VERSION} from '../runner-core.mjs';
import {random} from '../runner-shapes.mjs';
import {makeLevel, levelPassed, stationPlan, LEVEL_VERSION} from '../runner-level.mjs';
import {makeCampaign, finaleLadder, wallsBroken, CAMPAIGN_VERSION} from '../runner-campaign.mjs';
import {solveCourse, stationaryWins, exactDelta, applyOperation} from '../runner-levels.mjs';

// Ядро «Мат. шкалы» импортирует соседей без расширения (./work) — так пишет Metro. Node такие
// пути не находит; крючок дописывает .ts только им (тот же, что в runner-level.test.mjs).
registerHooks({resolve(specifier, context, next) {
  try { return next(specifier, context); } catch (e) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) return next(specifier + '.ts', context);
    throw e;
  }
}});
const {generateSprintProblem} = await import('../../counting/mathSprintCore.ts');
const {levelParams, makePuzzle} = await import('../../counting/numberBondsLadder.ts');
const {makeSequence, makeOptions, tailLure} = await import('../../counting/patternSequences.ts');
const {levelParams: ospanLevel} = await import('../../counting/ospanLadder.ts');
const {generateMathSliderQuestions} = await import('../../math-slider/core/generator.ts');
const {formatExpression} = await import('../../math-slider/core/expression.ts');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_COURSES = join(HERE, '../../../../../flutter/test/fixtures/number-run-courses-reference.json');
const OUT_RUNS = join(HERE, '../../../../../flutter/test/fixtures/number-run-runs-reference.json');

// Задания станций — те же, что даёт экран (NumberRunGame.web.tsx), шкала — в записи ru.
const tasks = {
  blitz: (L, rnd) => generateSprintProblem(L, rnd),
  exact: (L, rnd) => makePuzzle(levelParams(L), rnd),
  pattern: (L, rnd) => { const s = makeSequence(L, rnd); return {...s, options: makeOptions(s.answer, 3, rnd, tailLure(s.items))}; },
  scale: (L, rnd) => {
    const q = generateMathSliderQuestions(`run-${Math.floor(rnd() * 1e9)}`, Math.min(52, L), 1)[0];
    return {prompt: formatExpression(q.expression, 'ru'), min: q.scale.min, max: q.scale.max, answer: q.answer, ticks: q.scale.ticks};
  },
  memory: L => ospanLevel(L),
};
const isBoss = L => L % 3 === 0; // constants/bosses.ts: BOSS_EVERY = 3
const level = (L, seed) => makeLevel(L, seed, tasks, {boss: isBoss(L)});

const plain = v => JSON.parse(JSON.stringify(v));
function courseJson(course) {
  const c = plain(course);
  for (const st of c.stages ?? []) delete st.title;
  return c;
}

// ── Жребий и правила ────────────────────────────────────────────────────────────────────────────
const randomTable = [0, 1, 7, 12345, 20260912, 0x9e3779b1, 0xffffffff].map(seed => {
  const r = random(seed);
  return {seed, values: Array.from({length: 6}, () => r())};
});

const exactCases = [];
for (const [target, bonus, unit] of [[10, 15, 3], [7, 20, 5], [1, 5, 2], [25, 60, 9], [0, 12, 4]]) {
  for (const got of [target, target - 1, target + 1, target - 5, target + 9, 0, 2 * target + 3]) {
    exactCases.push([target, bonus, unit, got, exactDelta({target, bonus, unit}, got)]);
  }
}
const finaleCases = [1, 9, 10, 57, 99.5, 100, 999, 1000, 1234, 5000, 9844, 10000, 12345, 123456, 1e6]
  .map(reference => [reference, finaleLadder(reference).walls]);
const operationCases = [];
for (const [sum, label, limit] of [[5, '+3', 9999], [5, '−8', 9999], [5, '×3', 9999], [5, '→', 9999], [9000, '×2', 9999],
  [9000, '×2', 1e6], [-4, '×3', 9999], [0, '−0', 9999], [700000, '×2', 1e6], [12, '÷2', 9999]]) {
  let result = null;
  try { result = applyOperation(sum, label, limit); } catch { result = null; }
  operationCases.push([sum, label, limit, result]);
}

// ── Курсы ───────────────────────────────────────────────────────────────────────────────────────
const LEVEL_SET = [
  ...Array.from({length: 24}, (_, i) => [i + 1, 7]),
  [27, 20260912], [30, 20260912], [36, 20260912], [45, 20260912], [4, 1], [7, 2], [16, 3],
];
const levels = LEVEL_SET.map(([L, seed]) => {
  const course = level(L, seed);
  const path = solveCourse(course);
  const ref = course.finale.reference;
  return {
    level: L, seed, boss: isBoss(L), plan: stationPlan(L, isBoss(L)),
    course: courseJson(course),
    path,
    stationary: [-1, 0, 1].map(lane => stationaryWins(course, lane)),
    passed: [0, Math.floor(ref / 2), ref, ref * 2].map(v => [v, levelPassed(course, v)]),
  };
});
const campaignSeed = 20260912;
const campaignCourse = makeCampaign(campaignSeed);
const campaign = {
  seed: campaignSeed,
  course: courseJson(campaignCourse),
  path: solveCourse(campaignCourse),
  walls: [0, 100, campaignCourse.finale.reference].map(v => [v, wallsBroken(campaignCourse.finale, v)]),
};

// ── Прогоны ─────────────────────────────────────────────────────────────────────────────────────
// Кадр от жребия: smooth — 60 Гц с дрожанием и изредка 30 Гц; rough — ещё догон до 0,32 с и
// прерывания > 0,8 с (в забеге они отбрасываются в журнал, паузой не становятся).
function frameAt(r, profile) {
  const u = r();
  if (u < .72) return 1 / 60;
  if (u < .82) return 1 / 30;
  if (u < .92) return 1 / 60 + (r() - .5) * .006;
  if (u < .96 || profile === 'smooth') return 1 / 120;
  if (u < .995) return .12 + r() * .2;
  return .85 + r() * .3;
}
// Автопилот по пути решателя (как run() в runner-level.test.mjs): полоса ряда или точка пути построения.
function aim(course, path, s) {
  const p = path[s.nextRow];
  if (!p) return s.target;
  if (!p.route) return p.lane;
  const row = course.rows[p.id], w = row.routes.find(r => r.id === p.route).waypoints.find(w => row.z + w.dz >= s.z - 1e-9);
  return w ? w.x : p.lane;
}
// Водитель с ошибками: с вероятностью noise за кадр уходит на 20–80 кадров в чужую полосу или точку.
// noiseMode 'answers' — ошибки только до рядов без препятствий (промахи арок, сборов, шкалы, «ровно N»),
// перед мостом и трамплином он снова ведёт по пути; 'all' — ошибается и там (падение с моста).
function record({name, course, profile, frameSeed, noise = 0, noiseSeed = 0, noiseMode = 'answers', maxFrames = 20000, stopAtStages = null, pauseAt = null, script = null}) {
  const path = script ? [] : solveCourse(course);
  const fr = random(frameSeed), nr = random(noiseSeed);
  let s = resume(initial(course));
  const applied = [], trace = [];
  let lastTarget = s.target, errorFrames = 0, errorX = 0, lastEvents = s.events.length;
  for (let i = 0; i < maxFrames && s.status !== 'won' && s.status !== 'failed'; i++) {
    if (pauseAt !== null && i === pauseAt) { s = pause(s); applied.push([i, 'pause']); }
    if (pauseAt !== null && i === pauseAt + 40) { s = resume(s); applied.push([i, 'resume']); }
    const safe = noiseMode === 'all' || course.rows[s.nextRow]?.kind !== 'obstacle';
    if (!safe) errorFrames = 0;
    if (noise > 0 && safe && errorFrames === 0 && nr() < noise) {
      errorFrames = 20 + Math.floor(nr() * 60);
      if (nr() < .5) { const d = nr() < .5 ? -1 : 1; s = changeLane(s, d); applied.push([i, 'lane', d]); lastTarget = s.target; errorX = s.target; }
      else { errorX = Math.round((nr() * 2 - 1) * 1000) / 1000; }
    }
    const want = script ? (script.find(([at]) => at === i)?.[1] ?? lastTarget) : errorFrames > 0 ? (errorFrames--, errorX) : aim(course, path, s);
    if (want !== lastTarget && s.status === 'running') { s = setTarget(s, want); applied.push([i, 'target', want]); lastTarget = want; }
    s = advanceFrame(s, frameAt(fr, profile), course);
    if (i % 48 === 0 || s.events.length !== lastEvents || s.status !== 'running') {
      trace.push([i, s.z, s.x, s.target, s.nextRow, s.sum, s.mistakes, s.status, s.elapsed, s.slowFrames, s.discardedTime,
        s.pauses, s.events.length, s.hits, s.gates, s.peak, s.clearedStages, s.stage, s.jump ? 1 : 0, s.collected.length]);
      lastEvents = s.events.length;
    }
    if (stopAtStages !== null && s.clearedStages >= stopAtStages) break;
  }
  const {events, ...state} = s;
  return {name, profile, frameSeed, noise, noiseSeed, noiseMode, maxFrames, stopAtStages, pauseAt,
    source: course.format === 'level' ? {level: course.levelId, seed: course.seed} : course.version === 'edge' ? {course: courseJson(course)} : {campaign: course.seed},
    applied, trace, events: plain(events), final: plain(state)};
}
const runs = [
  record({name: 'L1 автопилот — обучающий: строй, змейка, мост, трамплин', course: level(1, 7), profile: 'smooth', frameSeed: 101}),
  record({name: 'L4 автопилот — блиц-арки', course: level(4, 7), profile: 'smooth', frameSeed: 104}),
  record({name: 'L6 автопилот — страж', course: level(6, 7), profile: 'smooth', frameSeed: 106}),
  record({name: 'L7 автопилот — ворота «ровно N»', course: level(7, 7), profile: 'smooth', frameSeed: 107}),
  record({name: 'L10 автопилот — ряд на арках', course: level(10, 7), profile: 'smooth', frameSeed: 110}),
  record({name: 'L13 автопилот — шкала', course: level(13, 7), profile: 'smooth', frameSeed: 113}),
  record({name: 'L16 автопилот — память в пути', course: level(16, 7), profile: 'smooth', frameSeed: 116}),
  record({name: 'L19 автопилот с ошибками — смесь, неровные кадры', course: level(19, 7), profile: 'rough', frameSeed: 119, noise: .02, noiseSeed: 919}),
  record({name: 'L8 автопилот с ошибками — промахи и падения', course: level(8, 7), profile: 'rough', frameSeed: 108, noise: .04, noiseSeed: 808, noiseMode: 'all'}),
  record({name: 'L14 автопилот с ошибками — шкала мимо, пауза', course: level(14, 7), profile: 'rough', frameSeed: 114, noise: .03, noiseSeed: 414, pauseAt: 600}),
  record({name: 'L17 автопилот с ошибками — вспомнить не то', course: level(17, 7), profile: 'smooth', frameSeed: 117, noise: .05, noiseSeed: 717}),
  record({name: 'Забег «Свободно» — три этапа автопилотом', course: campaignCourse, profile: 'rough', frameSeed: 200, stopAtStages: 3, maxFrames: 12000}),
];

// Ручные дорожки на границах, которых автопилот не касается: он всегда въезжает точно в полосу.
// Взлёт — при |x − полоса трамплина| < 0,48 на черте взлёта: 0,5 и 0,52 от полосы — падение, 0,47 — полёт.
const edgeCourse = (id, rows) => ({version: 'edge', mode: 'journey', levelId: 900 + id, seed: id, start: 10, speed: 8, lateralSpeed: 4, gates: 1,
  length: 24 * rows.length, rows: rows.map((r, i) => ({...r, id: i, stage: 1, z: 24 * (i + 1)}))});
const JUMP_ROW = {kind: 'obstacle', terrain: 'jump', span: 12, penalties: [1, 1, 1], jump: {lane: 1, launchOffset: 14, landingOffset: 1, height: 2.8}};
const LINE_ROW = {kind: 'gate', checkpoint: true, rules: [{min: null, max: null}], stageEnd: true};
for (const [n, x] of [[1, .5], [2, .52], [3, .53]]) {
  runs.push(record({name: `трамплин: цель ${x} при полосе 1 — порог взлёта 0,48`, course: edgeCourse(n, [JUMP_ROW, LINE_ROW]), profile: 'smooth', frameSeed: 300 + n, script: [[0, x]]}));
}
// Шкала 0…100, ответ 50, допуск 0,1: точка 0,1 → 55 (в допуске, +), 0,3 → 65 («близко», 0), 0,6 → 80 (мимо, −).
const SCALE_ROW = {kind: 'scale', station: 'scale', prompt: '25 + 25', min: 0, max: 100, answer: 50, ticks: [0, 25, 50, 75, 100], tolerance: .1, reward: 9, penalty: 9,
  routes: [{id: 'scale', entry: {dz: -8, x: 0}, exit: 0, gain: 9, waypoints: [{dz: 0, x: 0}]}]};
runs.push(record({name: 'шкала: в допуске, «близко» и мимо', course: edgeCourse(4, [SCALE_ROW, SCALE_ROW, SCALE_ROW, LINE_ROW]), profile: 'smooth', frameSeed: 304,
  script: [[0, .1], [250, .3], [430, .6]]}));

// «Стоящий на месте» за столбом: широкое красное слева (half 1) дотягивается до точки 0,25 средней полосы,
// но столб держит её справа — красное не взять. Построения таких чисел не делают, ветку держит эта дорожка.
const COLUMN_ROW = {kind: 'pickups', shape: 'columns', window: 1, divider: {fromDz: -17, toDz: 0, gap: .25},
  items: [{x: -.5, dz: -10, half: 1, window: .6, value: -100}, {x: .5, dz: -10, half: .5, window: .6, value: 5}]};
const stationaryEdges = [edgeCourse(5, [COLUMN_ROW, {...LINE_ROW, rules: [{min: 5, max: null}]}])]
  .map(course => ({course: courseJson(course), stationary: [-1, 0, 1].map(lane => stationaryWins({...course, start: 0}, lane)), start: 0}));

writeFileSync(OUT_COURSES, JSON.stringify({
  coreVersion: CORE_VERSION, levelVersion: LEVEL_VERSION, campaignVersion: CAMPAIGN_VERSION,
  random: randomTable, exactDelta: exactCases, finale: finaleCases, applyOperation: operationCases,
  levels, campaign, stationaryEdges,
}));
writeFileSync(OUT_RUNS, JSON.stringify({coreVersion: CORE_VERSION, runs}));
const kb = f => Math.round(JSON.stringify(f).length / 1024);
console.log(`курсы: ${levels.length} уровней + забег; прогоны: ${runs.length}`);
for (const r of runs) console.log(`  ${r.name}: кадров ${r.trace.at(-1)?.[0] ?? 0}, событий ${r.events.length}, итог ${r.final.status}, число ${r.final.sum}`);
console.log(`размер: курсы ${kb({levels, campaign})} КБ, прогоны ${kb({runs})} КБ`);

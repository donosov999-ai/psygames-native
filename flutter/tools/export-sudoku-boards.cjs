#!/usr/bin/env node
/* psygames-export-sudoku-boards · VER 1 · 01.10.2026 · psygames-sudoku-claude-mac */
/**
 * ДОСКИ «СУДОКУ» ДЛЯ НАТИВНОГО ЭКРАНА — ПРОГОНОМ ЖИВОГО ГЕНЕРАТОРА НА TS.
 *
 * 🔴 ЗАЧЕМ ФАЙЛ (задача 6e9cedbc). Нативный экран играет доски ДАННЫМИ
 * (`flutter/lib/games/sudoku/levels.dart`, `modes.dart`), а генератор живёт в вебе
 * (`frontend/src/services/sudoku-grade.ts`). 23.09.2026 доски выгрузили боевым путём, но
 * сам скрипт выгрузки в репозиторий не попал: замер 30.09 и 01.10 — ни одного упоминания
 * четырёх файлов вне загрузчиков Dart. Без него новое правило не доезжает до экрана, а
 * поле, дописанное в JSON руками, стирает первая же пересборка.
 *
 * Пишет четыре файла в `flutter/assets/levels/`:
 *   · sudoku-ladder.json         — `levelConfig` 1…SUDOKU_LAST_LEVEL и `RATING_LADDER` банка;
 *   · sudoku-bank.json           — байт в байт `frontend/src/services/sudoku-bank/boards.json`;
 *   · sudoku-variant-boards.json — по --per-level досок на каждую НЕбанковскую ступень тем же
 *     путём, что экран (`app/games/sudoku.tsx`, buildBoard): `logicalBuilder(ступень, blanks, …,
 *     {budgetMs: 2200, tier: roadTier(ступень, дорога по умолчанию), look:
 *     selectionLookForLevel(ступень)})` и цикл шагов `runSteps` — без кадров экрана;
 *   · sudoku-road-boards.json    — доски дорог «полегче» и «пожёстче»: по --per-road на каждую
 *     вариантную ступень, полоса `roadTier`, пустые `roadLevelConfig` (как веб-экран на дороге);
 *   · sudoku-modes.json          — небоскрёбы и неравенства: `sideBoardForStep`, по --per-step
 *     досок на ступень мини-лестницы.
 * И эталоны правил для пробы `flutter/test/sudoku_rules_test.dart` —
 * `flutter/test/fixtures/sudoku-rules-reference.json`: по доске на КАЖДЫЙ вариант лестницы и
 * режимов, 40 ходов «цифра в клетку» с ответом живого ядра (`isValid` И `overlayOk` — натив
 * держит оба в одной `isValid`). 🔴 Эталоны 23.09 выгружались без скрипта и без вариантов с
 * показанными подсказками (чётность, Кропки, сэндвич) — поэтому их выброс из разбора натива
 * прошёл пробу и уехал в Play 2.56.2 (задача 450c0211).
 *
 * НОВОЕ ПРАВИЛО ДОЕЗЖАЕТ САМО. Список ступеней — это `levelConfig`: поставил вариант на
 * ступень там — следующий прогон выгрузит его доски. Геометрия переносится полями результата
 * генератора как есть (GEOMETRY_FIELDS ниже). Генератор вернул поле, которого в списке нет, —
 * скрипт ПАДАЕТ, а не теряет его молча: новое поле — строка в GEOMETRY_FIELDS и чтение в
 * `BoardGeometry.fromJson` (`flutter/lib/games/sudoku/rules.dart`).
 *
 * КАЖДАЯ ДОСКА ПРОВЕРЯЕТСЯ ДО ЗАПИСИ тем же ядром:
 *   · подсказки совпадают с решением, решение законно по правилам своего варианта;
 *   · решение единственно — `countSolutions(…, limit 2)`; исчерпанный бюджет перебора
 *     считается «не единственно» — ошибка в безопасную сторону;
 *   · мера сходится — повторный `gradePuzzle` закрывает доску той же ступенью, что записана;
 *   · на ступени нет двух одинаковых досок.
 * Не прошла — пересборка с другим зерном; не вышло за 6 попыток — скрипт падает с причиной.
 *
 * ЗЕРНО. `Math.random` всего ядра подменён сеяным генератором; зерно — (база, ступень, номер
 * доски, попытка). Но сборка зависит ещё и от бюджета по НАСТЕННЫМ часам (2200 мс, как у
 * экрана): на нагруженной машине копание успевает меньше. Поэтому пересборку сравнивать
 * СМЫСЛОМ — число досок, ступени техник, варианты, — а не байтами; сводку скрипт печатает сам.
 *
 * Запуск (из корня репозитория):
 *   node flutter/tools/export-sudoku-boards.cjs                       — всё (десятки минут)
 *   node flutter/tools/export-sudoku-boards.cjs --levels=42-45,50     — только эти ступени,
 *                                                                       остальные из файла
 *   node flutter/tools/export-sudoku-boards.cjs --no-boards --no-modes — лестница, банк, эталоны
 *                                                                       правил (секунды)
 *   флаги: --per-level=12 --per-step=6 --per-road=6 --seed=1 --modes=towers,unequal,killer,free --no-roads --no-rules --dry
 *          (собрать и проверить, ничего не записывая)
 * После выгрузки: cd flutter && flutter test test/sudoku_levels_test.dart
 * Сторож расхождения веба и натива: frontend/src/__tests__/sudoku-native-boards-drift.test.ts.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'frontend/src');
const outDir = path.join(root, 'flutter/assets/levels');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
const meow9 = require('./meow9-ladder.cjs');

// ── Флаги ───────────────────────────────────────────────────────────────────────────
const KNOWN = new Set(['levels', 'per-level', 'per-step', 'per-road', 'seed', 'modes', 'dry', 'no-boards', 'no-roads', 'no-modes', 'no-rules']);
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
  if (!m || !KNOWN.has(m[1])) throw Error(`непонятный аргумент «${a}»; есть: ${[...KNOWN].map((k) => '--' + k).join(' ')}`);
  args[m[1]] = m[2] ?? true;
}
const PER_LEVEL = Number(args['per-level'] ?? 12);
const PER_STEP = Number(args['per-step'] ?? 6);
const BASE_SEED = Number(args.seed ?? 1);
const DRY = Boolean(args.dry);
const ATTEMPTS = 6;

// ── Ядро на TS — в ОДНОЙ песочнице: у всех модулей общий Math, значит и сеяный random ──
let rngState = 1;
function rng() {   // mulberry32
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function seedFor(...parts) {   // FNV-1a по строке частей
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193);
  return h | 0;
}
const ctx = vm.createContext({ console, __rng: rng });
vm.runInContext('Math.random = __rng;', ctx);

// Подписи вариантов ядро берёт из словаря (React-контекст) — выгрузке они не нужны.
const STUBS = { [path.join(src, 'contexts/LanguageContext')]: { translateFor: (_lang, key) => key } };

const seen = new Map();
function resolve(from, dep) {
  let p;
  if (dep.startsWith('@/')) p = path.join(root, 'frontend', dep.slice(2));
  else if (dep.startsWith('.')) p = path.resolve(path.dirname(from), dep);
  else throw Error(`ядро судоку обязано быть чистым, а ${path.relative(root, from)} зовёт «${dep}»`);
  const bare = p.replace(/\.(ts|tsx|js)$/, '');
  if (STUBS[bare]) return { stub: bare };
  for (const c of [p, `${bare}.ts`, `${bare}.tsx`, path.join(bare, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return { file: c };
  }
  throw Error(`не найден модуль «${dep}» из ${path.relative(root, from)}`);
}
function load(file) {
  if (seen.has(file)) return seen.get(file).exports;
  const module = { exports: {} };
  seen.set(file, module);
  if (file.endsWith('.json')) {
    module.exports = JSON.parse(fs.readFileSync(file, 'utf8'));
    return module.exports;
  }
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const run = vm.runInContext(`(function (module, exports, require) {${js}\n})`, ctx, { filename: file });
  run(module, module.exports, (dep) => {
    const r = resolve(file, dep);
    return r.stub ? STUBS[r.stub] : load(r.file);
  });
  return module.exports;
}
const core = load(path.join(src, 'services/sudoku-core.ts'));
const grade = load(path.join(src, 'services/sudoku-grade.ts'));
const roads = load(path.join(src, 'services/sudoku-roads.ts'));
const sideModes = load(path.join(src, 'services/sudoku-modes.ts'));
const bank = load(path.join(src, 'services/sudoku-bank/index.ts'));

// Конец лестницы — константа экрана; экран целиком в песочницу не грузится (React Native).
const screenSrc = fs.readFileSync(path.join(root, 'frontend/app/games/sudoku.tsx'), 'utf8');
const lastMatch = /const SUDOKU_LAST_LEVEL = (\d+);/.exec(screenSrc);
if (!lastMatch) throw Error('в frontend/app/games/sudoku.tsx не найдена «const SUDOKU_LAST_LEVEL = N;» — где теперь конец лестницы?');
const LAST = Number(lastMatch[1]);

const today = new Date();
const STAMP = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`;
const write = (name, obj) => {
  if (DRY) return;
  fs.writeFileSync(path.join(outDir, name), `${JSON.stringify(obj)}\n`);
};
const readOld = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(outDir, name), 'utf8')); } catch { return null; }
};

// ── 1. Лестница и банк — быстро и без случайности ─────────────────────────────────────
const isBankLevel = (cfg) => cfg.variant === 'none' && cfg.N === bank.BANK_N;
const ladder = [];
for (let lv = 1; lv <= LAST; lv++) {
  const c = core.levelConfig(lv);
  ladder.push({ level: lv, n: c.N, br: c.BR, bc: c.BC, blanks: c.blanks, variant: c.variant, hintMax: c.hintMax, lives: c.lives });
}
write('sudoku-ladder.json', {
  выгружено: STAMP,
  источник: 'frontend/src/services/sudoku-core.ts levelConfig + sudoku-bank RATING_LADDER',
  ladder,
  // Последняя полоса в TS открыта (`upTo: Infinity`), а JSON пишет Infinity как null —
  // и Dart (`(r['upTo'] as num)`) упал бы на загрузке. Выгрузка 23.09 писала 1e9: держим её.
  ratingRows: bank.RATING_LADDER.map((r) => ({ upTo: Number.isFinite(r.upTo) ? r.upTo : 1000000000, rating: r.rating })),
});
if (!DRY) fs.copyFileSync(path.join(src, 'services/sudoku-bank/boards.json'), path.join(outDir, 'sudoku-bank.json'));
console.error(`лестница: ${LAST} ступеней, полос банка ${bank.RATING_LADDER.length}; банк скопирован${DRY ? ' (--dry: не записано)' : ''}`);

// ── 2. Проверка доски тем же ядром ────────────────────────────────────────────────────
const GEOMETRY_FIELDS = ['regions', 'parity', 'kropki', 'sandwich', 'thermo', 'arrow', 'cages', 'whisper', 'renban', 'regionsum', 'palindrome', 'between', 'lockout', 'xv'];
const MODE_FIELDS = ['towers', 'unequal'];
/** Поля, которые ядро проверяет как ПОКАЗАННЫЕ подсказки (`overlayOk`): единственность и мера
 *  обязаны их видеть. Пропустить поле — доска «не единственна» (01.10: так выгрузка сама
 *  поймала линии шёпота, не попавшие в прежний явный список). */
const OVERLAY_FIELDS = ['parity', 'kropki', 'sandwich', 'unequal', 'towers', 'whisper', 'renban', 'regionsum', 'palindrome', 'between', 'lockout', 'xv'];
const toStr = (g) => g.map((row) => row.join('')).join('');

/** Причина брака или null. `gen` — результат генератора, `tier` — что пойдёт в файл. */
function defect(gen, N, BR, BC, variant, tier) {
  const unknown = Object.keys(gen).filter((k) => !['puzzle', 'solution', ...GEOMETRY_FIELDS, ...MODE_FIELDS].includes(k) && gen[k] != null);
  if (unknown.length) {
    throw Error(`генератор вернул поле(я) ${unknown.join(', ')} (вариант ${variant}), а выгрузка их не переносит — `
      + 'добавь в GEOMETRY_FIELDS и в BoardGeometry.fromJson, иначе доска уедет без правила');
  }
  const P = gen.puzzle, S = gen.solution;
  const ov = Object.fromEntries(OVERLAY_FIELDS.map((f) => [f, gen[f]]));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const v = S[r][c];
      if (!(v >= 1 && v <= N)) return `решение неполное в ${r},${c}`;
      if (P[r][c] !== 0 && P[r][c] !== v) return `подсказка ${r},${c} не совпадает с решением`;
      const g = S.map((row) => row.slice());
      g[r][c] = 0;
      if (!core.isValid(g, r, c, v, N, BR, BC, variant, gen.regions, gen.thermo, gen.arrow, gen.cages, gen.unequal, gen.towers)
        || !core.overlayOk(g, r, c, v, N, ov)) return `решение нарушает правило «${variant}» в ${r},${c}`;
    }
  }
  // Исчерпанный бюджет countSolutions возвращает как «limit решений» — различаем по остатку.
  // Замер 01.10.2026: из 876 досок бюджет кончился у двух (L36 kropki, L44 thermo), обе на
  // деле единственны (582 747 и 445 371 шаг); пересборка такой доски дешевле лишних 30 с.
  const budget = { steps: 400000 };
  const solutions = core.countSolutions(P.map((row) => row.slice()), N, BR, BC, variant, gen.regions, 2,
    budget, gen.thermo, gen.arrow, gen.cages, ov);
  if (budget.steps < 0) return 'перебор не уложился в 400 000 шагов — единственность не доказана';
  if (solutions !== 1) return solutions === 0 ? 'решений нет' : 'решение НЕ единственно';
  const again = grade.gradePuzzle(P, { N, BR, BC, variant, regions: gen.regions, thermo: gen.thermo, arrow: gen.arrow,
    cages: gen.cages, ...ov });
  if (!again.solved) return 'мера не закрывает доску';
  if (again.tier !== tier) return `мера не сходится: записано ${tier}, повторный замер ${again.tier}`;
  return null;
}

/** Собрать доску, пока не пройдёт проверку; на ступени без повторов. */
function buildChecked(label, taken, make) {
  const why = [];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const started = Date.now();
    const { gen, tier, N, BR, BC, variant } = make(attempt);
    let d = tier === null ? 'мера не закрыла доску при сборке' : null;
    if (!d) d = defect(gen, N, BR, BC, variant, tier);
    const key = toStr(gen.puzzle);
    if (!d && taken.has(key)) d = 'повтор доски на ступени';
    if (!d) { taken.add(key); return { gen, tier, ms: Date.now() - started, attempts: attempt + 1 }; }
    // Брак печатается сразу: «не единственно» здесь значит, что ВЕБ выдаёт такую доску людям.
    console.error(`  ↻ ${label}, попытка ${attempt + 1}: ${d}`);
    why.push(d);
  }
  throw Error(`${label}: ни одна из ${ATTEMPTS} попыток не прошла проверку — ${why.join(' · ')}`);
}

const histogram = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => (a[0] ?? -1) - (b[0] ?? -1)).map(([k, v]) => `${k ?? '—'}×${v}`).join(' ');
};

// ── 3. Доски вариантных ступеней ──────────────────────────────────────────────────────
function parseLevels(spec) {
  const set = new Set();
  for (const part of String(spec).split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw Error(`--levels: непонятно «${part}»`);
    for (let lv = Number(m[1]); lv <= Number(m[2] ?? m[1]); lv++) set.add(lv);
  }
  return set;
}

if (!args['no-boards']) {
  const boardLevels = ladder.filter((row) => !isBankLevel(core.levelConfig(row.level))).map((row) => row.level);
  const only = args.levels ? parseLevels(args.levels) : null;
  if (only) {
    for (const lv of only) {
      if (!boardLevels.includes(lv)) throw Error(`--levels: ступень ${lv} не вариантная (банк или за концом лестницы ${LAST})`);
    }
  }
  const old = readOld('sudoku-variant-boards.json');
  const oldByLevel = new Map();
  for (const b of old?.boards ?? []) (oldByLevel.get(b.level) ?? oldByLevel.set(b.level, []).get(b.level)).push(b);

  const road = roads.DEFAULT_SUDOKU_ROAD;
  const boards = [];
  const report = [];
  const t0 = Date.now();
  for (const lv of boardLevels) {
    const c = core.levelConfig(lv);
    if (only && !only.has(lv)) {
      const kept = oldByLevel.get(lv) ?? [];
      const stale = kept.filter((b) => b.variant !== c.variant || b.n !== c.N || b.br !== c.BR || b.bc !== c.BC);
      if (!kept.length || stale.length) {
        throw Error(`ступень ${lv}: в файле ${kept.length ? `вариант ${kept[0].variant}` : 'досок нет'}, а levelConfig даёт ${c.variant} `
          + `${c.N}×${c.N} — пересобери её: --levels=${lv}`);
      }
      boards.push(...kept);
      continue;
    }
    if (c.variant === 'friends') {
      // «Мяу — друзья» 9×9: генератора на TS нет — доски из выгрузки MindLab (meow9-ladder.cjs).
      const rows = meow9.friendsRows(lv, core.levelConfig, readOld(meow9.MEOW9_ASSET));
      const line = `L${String(lv).padStart(2)} ${c.variant.padEnd(12)} ${rows.length} досок из ${meow9.MEOW9_ASSET}`;
      console.error(line);
      report.push(line);
      boards.push(...rows);
      continue;
    }
    const taken = new Set();
    const made = [];
    for (let i = 0; i < PER_LEVEL; i++) {
      const r = buildChecked(`ступень ${lv} (${c.variant}), доска ${i + 1}`, taken, (attempt) => {
        rngState = seedFor(BASE_SEED, 'level', lv, i, attempt);
        const b = grade.logicalBuilder(lv, c.blanks, c.N, c.BR, c.BC, c.variant, {
          budgetMs: 2200, tier: roads.roadTier(lv, road), look: grade.selectionLookForLevel(lv),
        });
        let best;
        for (let n = 1; n <= Math.max(1, b.steps); n++) {
          best = b.step(n);
          if (b.enough(best)) break;
        }
        return { gen: best.gen, tier: best.grade.solved ? best.grade.tier : null, N: c.N, BR: c.BR, BC: c.BC, variant: c.variant };
      });
      const geometry = {};
      for (const f of GEOMETRY_FIELDS) if (r.gen[f] != null) geometry[f] = r.gen[f];
      made.push({ level: lv, variant: c.variant, n: c.N, br: c.BR, bc: c.BC,
        puzzle: toStr(r.gen.puzzle), solution: toStr(r.gen.solution), tier: r.tier, geometry, _ms: r.ms, _attempts: r.attempts });
    }
    const before = oldByLevel.get(lv) ?? [];
    const line = `L${String(lv).padStart(2)} ${c.variant.padEnd(12)} было ${String(before.length).padStart(2)} [${histogram(before.map((b) => b.tier))}]`
      + ` → стало ${made.length} [${histogram(made.map((b) => b.tier))}]`
      + `  ${Math.round(made.reduce((s, b) => s + b._ms, 0) / 1000)} с, попыток сверх одной: ${made.reduce((s, b) => s + b._attempts - 1, 0)}`;
    console.error(line);
    report.push(line);
    for (const b of made) { delete b._ms; delete b._attempts; boards.push(b); }
  }
  write('sudoku-variant-boards.json', { выгружено: STAMP, boards });
  console.error(`вариантные доски: ${boards.length} на ${boardLevels.length} ступенях за ${Math.round((Date.now() - t0) / 1000)} с`
    + `${only ? ` (пересобраны: ${[...only].join(', ')})` : ''}`);
}

// ── 3б. Доски дорог «полегче» и «пожёстче» ─────────────────────────────────────────────
/*
 * 🔴 ДОРОГА — ЭТО ДРУГАЯ ДОСКА, А НЕ ДРУГАЯ ЦИФРА (задача b5df5096, сверка 138f7818). Веб на
 * дороге строит доску со сдвинутой полосой техник (`roadTier`) и своим числом пустых
 * (`roadLevelConfig`) — это и есть «полегче / пожёстче» (services/sudoku-roads.ts, шапка
 * «ЧЕМ ДОРОГИ ОТЛИЧАЮТСЯ НА САМОМ ДЕЛЕ»). Нативный экран играет доски данными, поэтому для
 * каждой вариантной ступени здесь по --per-road досок на каждую НЕобычную дорогу тем же путём,
 * что веб-экран на этой дороге. Обычная дорога — sudoku-variant-boards.json выше. Банковские
 * ступени дорога сдвигает полосой банка (bankRating со сдвигом), досок им не нужно.
 */
if (!args['no-roads']) {
  const PER_ROAD = Number(args['per-road'] ?? 6);
  const extra = roads.SUDOKU_ROADS.filter((r) => r !== roads.DEFAULT_SUDOKU_ROAD);
  const levels = ladder.filter((row) => !isBankLevel(core.levelConfig(row.level))).map((row) => row.level);
  const only = args.levels ? parseLevels(args.levels) : null;
  const old = readOld('sudoku-road-boards.json');
  const keep = (lv, road) => (old?.boards ?? []).filter((b) => b.level === lv && b.road === road);
  const wasRefused = (lv, road) => (old?.отказ ?? []).some((x) => x.level === lv && x.road === road);
  /*
   * ⚠️ ДОРОГА НЕ ИМЕЕТ ПРАВА ИДТИ НЕ В ТУ СТОРОНУ. Замер первой выгрузки (02.10.2026): XV на
   * «пожёстче» дал доски ступени 1 при 4 у обычной — с отрицательным условием знаки на лишних
   * пустых клетках решают всё одиночками. Если средняя ступень досок дороги уходит от обычной
   * НЕ туда на полступени и больше (меньше — шум шести досок против двенадцати), доски дороги
   * на этой ступени не пишутся: дорога играет обычные, а жизни и подсказки у неё свои.
   */
  const normalMean = new Map();
  for (const b of readOld('sudoku-variant-boards.json')?.boards ?? []) {
    const m = normalMean.get(b.level) ?? { sum: 0, n: 0 };
    m.sum += b.tier ?? 0; m.n += 1; normalMean.set(b.level, m);
  }
  const mean = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0) / Math.max(1, xs.length);
  const refused = [];
  const boards = [];
  const t0 = Date.now();
  for (const road of extra) {
    for (const lv of levels) {
      const c = roads.roadLevelConfig(lv, road);
      if (only && !only.has(lv)) {
        const kept = keep(lv, road);
        if (!kept.length && wasRefused(lv, road)) {
          refused.push(...(old?.отказ ?? []).filter((x) => x.level === lv && x.road === road));
          continue;
        }
        if (!kept.length || kept.some((b) => b.variant !== c.variant || b.n !== c.N)) {
          throw Error(`дорога ${road}, ступень ${lv}: в файле ${kept.length ? `вариант ${kept[0].variant}` : 'досок нет'}, `
            + `а levelConfig даёт ${c.variant} ${c.N}×${c.N} — пересобери её: --levels=${lv}`);
        }
        boards.push(...kept);
        continue;
      }
      const taken = new Set();
      const made = [];
      for (let i = 0; i < PER_ROAD; i++) {
        const r = buildChecked(`дорога ${road}, ступень ${lv} (${c.variant}), доска ${i + 1}`, taken, (attempt) => {
          rngState = seedFor(BASE_SEED, 'road', road, lv, i, attempt);
          const b = grade.logicalBuilder(lv, c.blanks, c.N, c.BR, c.BC, c.variant, {
            budgetMs: 2200, tier: roads.roadTier(lv, road), look: grade.selectionLookForLevel(lv),
          });
          let best;
          for (let n = 1; n <= Math.max(1, b.steps); n++) {
            best = b.step(n);
            if (b.enough(best)) break;
          }
          return { gen: best.gen, tier: best.grade.solved ? best.grade.tier : null, N: c.N, BR: c.BR, BC: c.BC, variant: c.variant };
        });
        const geometry = {};
        for (const f of GEOMETRY_FIELDS) if (r.gen[f] != null) geometry[f] = r.gen[f];
        made.push({ level: lv, road, variant: c.variant, n: c.N, br: c.BR, bc: c.BC,
          puzzle: toStr(r.gen.puzzle), solution: toStr(r.gen.solution), tier: r.tier, geometry });
      }
      const band = roads.roadTier(lv, road);
      const nm = normalMean.get(lv);
      const own = mean(made.map((b) => b.tier));
      const base = nm ? nm.sum / nm.n : null;
      const wrongWay = base != null && (road === 'hard' ? own <= base - 0.5 : own >= base + 0.5);
      console.error(`${road.padEnd(4)} L${String(lv).padStart(3)} ${c.variant.padEnd(12)} полоса ${band.min}–${band.max}: [${histogram(made.map((b) => b.tier))}]`
        + (wrongWay ? `  ✗ средняя ${own.toFixed(1)} против ${base.toFixed(1)} у обычной — не пишу, дорога играет обычные` : ''));
      if (wrongWay) {
        refused.push({ level: lv, road, variant: c.variant, причина: `средняя ступень ${own.toFixed(1)} против ${base.toFixed(1)} у обычной` });
        continue;
      }
      boards.push(...made);
    }
  }
  write('sudoku-road-boards.json', { выгружено: STAMP, отказ: refused, boards });
  console.error(`доски дорог: ${boards.length} (${extra.join(', ')} × ${levels.length} ступеней) за ${Math.round((Date.now() - t0) / 1000)} с`);
}

// ── 4. Мини-лестницы режимов ──────────────────────────────────────────────────────────
if (!args['no-modes']) {
  const wanted = args.modes ? String(args.modes).split(',') : ['towers', 'unequal', 'killer', 'free'];
  const old = readOld('sudoku-modes.json');
  const modesOut = { ...(old?.modes ?? {}) };
  /*
   * 🔴 «КИЛЛЕР» И «СВОБОДНО» (задача 55b97845, 01.10.2026). На веб-экране это два из пяти
   * режимов переключателя; нативный экран перехватил /games/sudoku, и до них в приложении
   * стало не дойти. Доски — тем же путём, что веб-экран (app/games/sudoku.tsx, startGame):
   *   · killer — классическая единственная доска generatePuzzle(killerBlanksForStep(ступень))
   *     и суммы generateCages поверх неё; 6 ступеней KILLER_LADDER;
   *   · free — классика generatePuzzle(blanksFor(размер, сложность)); «ступень» здесь —
   *     пресет выбора: 1–3 → 6×6 лёгкая/средняя/сложная, 4–6 → 9×9.
   */
  const FREE_PRESETS = [[6, 'easy'], [6, 'medium'], [6, 'hard'], [9, 'easy'], [9, 'medium'], [9, 'hard']];
  for (const mode of ['killer', 'free'].filter((m) => wanted.includes(m))) {
    const rows = [];
    const t0 = Date.now();
    const steps = mode === 'killer' ? core.killerStepCount() : FREE_PRESETS.length;
    for (let step = 1; step <= steps; step++) {
      const [size, difficulty] = mode === 'killer' ? [9, null] : FREE_PRESETS[step - 1];
      const { N, BR, BC } = core.dimsForSize(size);
      const blanks = mode === 'killer' ? core.killerBlanksForStep(step) : core.blanksFor(size, difficulty);
      const taken = new Set();
      for (let i = 0; i < PER_STEP; i++) {
        const r = buildChecked(`${mode} ступень ${step}, доска ${i + 1}`, taken, (attempt) => {
          rngState = seedFor(BASE_SEED, mode, step, i, attempt);
          const g = core.generatePuzzle(blanks, N, BR, BC, 'none');
          const gen = { puzzle: g.puzzle, solution: g.solution };
          if (mode === 'killer') gen.cages = core.generateCages(g.solution, N);
          const m = grade.gradePuzzle(g.puzzle, { N, BR, BC, variant: 'none', cages: gen.cages });
          return { gen, tier: m.solved ? m.tier : null, N, BR, BC, variant: 'none' };
        });
        rows.push({ step, blanks, ...(mode === 'free' ? { size, difficulty } : {}),
          puzzle: toStr(r.gen.puzzle), solution: toStr(r.gen.solution), tier: r.tier,
          ...(mode === 'killer' ? { cages: r.gen.cages } : {}) });
      }
    }
    const before = old?.modes?.[mode] ?? [];
    console.error(`${mode}: было ${before.length} [${histogram(before.map((b) => b.tier))}] → стало ${rows.length} [${histogram(rows.map((b) => b.tier))}]`
      + ` за ${Math.round((Date.now() - t0) / 1000)} с`);
    modesOut[mode] = rows;
  }
  for (const mode of wanted.filter((m) => m !== 'killer' && m !== 'free')) {
    if (mode !== 'towers' && mode !== 'unequal') throw Error(`--modes: нет режима «${mode}»`);
    const { N, BR, BC } = core.dimsForSize(mode === 'towers' ? 6 : 9);
    const rows = [];
    const t0 = Date.now();
    for (let step = 1; step <= sideModes.sideStepCount(mode); step++) {
      const cfg = sideModes.sideStepCfg(mode, step);
      const taken = new Set();
      for (let i = 0; i < PER_STEP; i++) {
        const r = buildChecked(`${mode} ступень ${step}, доска ${i + 1}`, taken, (attempt) => {
          rngState = seedFor(BASE_SEED, mode, step, i, attempt);
          const b = sideModes.sideBoardForStep(mode, step);
          // signsNeeded=false — доска закрывается без знаков, режим теряет смысл: в брак.
          const gen = { puzzle: b.puzzle, solution: b.solution, towers: b.towers, unequal: b.unequal };
          return { gen, tier: b.signsNeeded ? b.tier : null, N, BR, BC, variant: mode };
        });
        rows.push({ step, blanks: cfg.blanks, band: { min: cfg.band.min, max: cfg.band.max },
          puzzle: toStr(r.gen.puzzle), solution: toStr(r.gen.solution), tier: r.tier,
          towers: r.gen.towers ?? null, unequal: r.gen.unequal ?? null, signsNeeded: true });
      }
    }
    const before = old?.modes?.[mode] ?? [];
    console.error(`${mode}: было ${before.length} [${histogram(before.map((b) => b.tier))}] → стало ${rows.length} [${histogram(rows.map((b) => b.tier))}]`
      + ` за ${Math.round((Date.now() - t0) / 1000)} с`);
    modesOut[mode] = rows;
  }
  write('sudoku-modes.json', { выгружено: STAMP, modes: modesOut });
}
// ── 5. Эталоны правил для пробы натива ────────────────────────────────────────────────
// Варианты берутся из лестницы — новое правило попадает в эталоны само, — плюс режимы вне
// лестницы. Доска — полное решение с 27 пустыми клетками; ходы — 20 цифр решения и 20
// соседних (заведомо спорных), в любую клетку: проба сама освобождает клетку перед ходом.
if (!args['no-rules']) {
  // 'friends' — условие на всё решение, а не запрет хода: эталона ходов у него нет (meow9-ladder.cjs).
  const variants = [...new Set(ladder.map((l) => l.variant).filter((v) => v !== 'friends')), 'killer', 'unequal', 'towers'];
  const out = [];
  const perRule = [];
  for (const variant of variants) {
    // ⚠️ ДОСКА ОБЯЗАНА БУДИТЬ ПРАВИЛО (01.10.2026, lockout): на первой доске пустые клетки линий
    // ни разу не попали в связывающее положение (у обоих концов пусто) — правило не решило ни
    // одного хода, и сторож разборчивости покраснел. Пробуем до 10 досок; первая сеется как
    // прежде, поэтому у вариантов, где правило уже работало, эталоны не меняются.
    let best = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      rngState = attempt === 0 ? seedFor(BASE_SEED, 'rules', variant) : seedFor(BASE_SEED, 'rules', variant, attempt);
      const { N, BR, BC } = core.dimsForSize(variant === 'towers' ? 6 : 9);
      const killer = variant === 'killer';
      const gen = core.generatePuzzle(0, N, BR, BC, killer ? 'none' : variant);
      const sol = gen.solution;
      // Подсказки — ВСЕ, без прореживания и без снятия меток с заполненных клеток: ход ставится
      // в освобождённую клетку, и метка на ней обязана работать.
      const ov = killer ? {} : core.overlaysFromSolution(sol, N, variant);
      const extras = {};
      if (gen.regions) extras.regions = gen.regions;
      if (gen.thermo) extras.thermo = gen.thermo;
      if (gen.arrow) extras.arrow = gen.arrow;
      const cages = killer ? core.generateCages(sol, N, rng) : gen.cages;
      if (cages) extras.cages = cages;
      for (const f of OVERLAY_FIELDS) if (ov[f] != null) extras[f] = ov[f];
      const grid = sol.map((row) => row.slice());
      const cells = Array.from({ length: N * N }, (_, i) => i).sort(() => rng() - 0.5);
      const blanks = Math.round(N * N / 3);
      for (const i of cells.slice(0, blanks)) grid[Math.floor(i / N)][i % N] = 0;
      // ⚠️ Неверная цифра — из тех, что ДОПУСКАЕТ КЛАССИКА (строка, столбец, блок): иначе её
      // отсекает строка раньше правила варианта, и проба зеленеет при выключенном правиле.
      // Так и было 01.10: мутация «шёпот не проверяется» прошла эталоны, где неверная цифра
      // бралась соседней (+1). Счёт «решило правило варианта» печатается ниже.
      const plain = (g, r, c, v) => core.isValid(g, r, c, v, N, BR, BC, variant === 'jigsaw' ? 'jigsaw' : 'none', extras.regions);
      const judge = (g, r, c, v) => core.isValid(g, r, c, v, N, BR, BC, killer ? 'none' : variant, extras.regions, extras.thermo,
        extras.arrow, extras.cages, extras.unequal, extras.towers) && core.overlayOk(g, r, c, v, N, ov);
      const cases = [];
      let byRule = 0;
      for (let k = 0; k < 40; k++) {
        // Из неверных половина ищется там, где «нельзя» говорит само правило варианта (если такие
        // ходы на доске есть), остальные — любые допустимые классикой: проба видит и запрет, и
        // разрешение правила.
        const wantRule = k % 4 === 1;
        let r = 0, c = 0, val = 0;
        for (let tries = 0; tries < 200; tries++) {
          const i = Math.floor(rng() * N * N);
          r = Math.floor(i / N); c = i % N;
          const right = sol[r][c];
          if (k % 2 === 0) { val = right; break; }
          const g = grid.map((row) => row.slice());
          g[r][c] = 0;
          const alt = [];
          for (let v = 1; v <= N; v++) if (v !== right && plain(g, r, c, v)) alt.push(v);
          const ruled = alt.filter((v) => !judge(g, r, c, v));
          const pool = wantRule && ruled.length ? ruled : alt;
          val = pool.length ? pool[Math.floor(rng() * pool.length)] : (right % N) + 1;
          if (wantRule ? ruled.length > 0 : alt.length > 0) break;
        }
        const g = grid.map((row) => row.slice());
        g[r][c] = 0;
        const ok = judge(g, r, c, val);
        if (!ok && plain(g, r, c, val)) byRule++;
        cases.push({ r, c, val, ok });
      }
      const entry = { variant, n: N, br: BR, bc: BC, solution: sol, grid, extras, cases };
      if (!best || byRule > best.byRule) best = { entry, byRule };
      if (byRule >= 5 || variant === 'none' || variant === 'jigsaw') break;
    }
    out.push(best.entry);
    perRule.push(`${variant} ${best.byRule}`);
  }
  const okCount = out.reduce((s, b) => s + b.cases.filter((x) => x.ok).length, 0);
  console.error(`  ходов, где «нельзя» сказало правило варианта, а не классика: ${perRule.join(', ')}`);
  if (!DRY) {
    fs.writeFileSync(path.join(root, 'flutter/test/fixtures/sudoku-rules-reference.json'),
      `${JSON.stringify({ выгружено: STAMP, источник: 'flutter/tools/export-sudoku-boards.cjs', ladder, boards: out })}\n`);
  }
  console.error(`эталоны правил: ${out.length} вариантов (${variants.join(', ')}), ходов ${out.length * 40}, законных ${okCount}`);
}

console.error(DRY ? '--dry: собрано и проверено, файлы не тронуты' : `записано в ${path.relative(root, outDir)}/`);

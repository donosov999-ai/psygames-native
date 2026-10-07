#!/usr/bin/env node
/* psygames-export-pause · VER 2 · 02.10.2026 · psygames-warmup-claude-mac */
/**
 * «ПАУЗА» НА FLUTTER: КАТАЛОГ И ЭТАЛОНЫ — ПРОГОНОМ ЖИВОГО ЯДРА НА TS.
 *
 * 🔴 ОТКУДА. Ядро практик одно — `frontend/src/games/pause/core/engine.ts`. Его же
 * исполняет веб-экран `/games/pause`, и оно же лежит под «Умным будильником».
 * Dart-перенос ядра (`lib/games/pause/practices.dart`) взят у будильника, где он
 * уже сверен с этим ядром, — но сверку для PsyGames делаем заново, с ТЕКУЩЕГО
 * исходника этого репозитория: эталон замораживает перенос, а не источник.
 *
 * Пишет:
 *   · `packages/practice_kit/assets/practices.json` — каталог (ядро + надстройка
 *     пакета), предупреждения, строки — общий с «Умным будильником»;
 *   · `flutter/test/fixtures/pause-reference.json.gz` — планы, кадры и сессии
 *     на каждую программу и на смешанные режимы (parallel, charge), плюс отказы.
 *
 * Правка ядра на TS → перезапустить этот файл и `flutter test test/pause_core_test.dart`.
 * Расхождение обязано покраснеть: это сигнал, а не помеха.
 *
 * Запуск (из корня репозитория): node flutter/tools/export-pause.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'frontend/node_modules/typescript'));
const core = path.join(root, 'frontend/src/games/pause/core');

const seen = new Map();
function load(file) {
  file = path.resolve(file);
  if (seen.has(file)) return seen.get(file).exports;
  const module = { exports: {} };
  seen.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (dep) => {
      if (!dep.startsWith('.')) throw Error('ядро обязано быть чистым, а зовёт ' + dep);
      let next = path.resolve(path.dirname(file), dep).replace(/\.js$/, '');
      if (!next.endsWith('.ts')) next += '.ts';
      return load(next);
    },
  }, { filename: file, timeout: 10000 });
  return module.exports;
}

const e = load(path.join(core, 'engine.ts'));

// 🔴 Каталог практик — ОДИН на PsyGames и «Умный будильник»: пакет practice_kit
// (решение Дениса 02.10.2026, «чиню один раз — и там, и там»). Поверх ядра —
// надстройка пакета (массаж лица, три режима глаз), как раньше у будильника;
// попала в ядро — выгрузка падает, и надстройку пора сократить.
const kit = path.join(root, 'packages/practice_kit');
const overlay = JSON.parse(fs.readFileSync(path.join(kit, 'tool/catalog_overlay.json'), 'utf8'));
const catalog = JSON.parse(JSON.stringify(e.PRACTICE_CATALOG));
for (const { after, set } of overlay.sets) {
  if (catalog.some((s) => s.id === set.id)) throw Error(`набор ${set.id} уже есть в ядре — надстройку пора сократить`);
  catalog.splice(catalog.findIndex((s) => s.id === after) + 1, 0, set);
}
for (const { set, before, programs } of overlay.programs) {
  const target = catalog.find((s) => s.id === set);
  for (const program of programs) {
    if (target.programs.some((p) => p.id === program.id)) throw Error(`программа ${set}/${program.id} уже есть в ядре`);
  }
  target.programs.splice(target.programs.findIndex((p) => p.id === before), 0, ...programs);
}
for (const id of Object.keys(overlay.warnings)) {
  if (id in e.WARNING_TEXT) throw Error(`предупреждение ${id} уже есть в ядре — надстройку пора сократить`);
}
const assetFile = path.join(kit, 'assets/practices.json');
fs.mkdirSync(path.dirname(assetFile), { recursive: true });
fs.writeFileSync(
  assetFile,
  JSON.stringify({
    catalog,
    warnings: { ...overlay.warnings, ...e.WARNING_TEXT },
    strings: e.PAUSE_STRINGS,
    // Подписи занятых ресурсов (задача f5dfd582): «занимает: глаза» на 12 языках.
    resources: { labels: e.RESOURCE_TEXT, uses: e.RESOURCE_USES_TEXT },
  }, null, 2) + '\n',
);

const all = e.PRACTICE_CATALOG.flatMap((s) => s.programs.map((p) => ({ setId: s.id, programId: p.id })));
const request = (selections) => ({
  mode: 'solo',
  selections,
  durationMs: 60000,
  locale: 'ru',
  guideMode: 'visual',
  context: 'home',
  acknowledgedWarnings: e.getRequiredWarnings(selections),
  confirmedPriorExperience: e.getRequiredPriorExperience(selections),
  allowExperimental: true,
  soloCompletions: Object.fromEntries(e.PRACTICE_CATALOG.map((s) => [s.id, 3])),
});

const requests = [];
for (const sel of all) {
  requests.push(request([sel]));
  requests.push({ ...request([sel]), locale: 'en', guideMode: 'both' });
  requests.push({ ...request([sel]), acknowledgedWarnings: [], confirmedPriorExperience: [], allowExperimental: false });
}
// Длительность, не кратная шагам, — по первой программе каждого набора.
for (const set of e.PRACTICE_CATALOG) {
  const sel = { setId: set.id, programId: set.programs[0].id };
  for (const durationMs of [30000, 123457]) requests.push({ ...request([sel]), durationMs });
}
for (const mode of ['parallel', 'charge']) {
  for (let i = 1; i < e.PRACTICE_CATALOG.length; i++) {
    const selections = e.PRACTICE_CATALOG.slice(0, i + 1).map((s) => ({ setId: s.id }));
    for (const guideMode of ['visual', 'both']) requests.push({ ...request(selections), mode, guideMode, durationMs: 300000 });
    requests.push({ ...request(selections), mode, soloCompletions: {}, durationMs: 30000 });
  }
}
// Занятый ресурс (задача f5dfd582): пятёрка Дениса, «внимание целиком», общий кор —
// в параллели и в маршруте.
const five = [
  { setId: 'breathing', programId: 'box' },
  { setId: 'eye-gym', programId: 'desk' },
  { setId: 'postures', programId: 'horse-shallow' },
  { setId: 'abdomen', programId: 'level-4' },
  { setId: 'pelvic-floor', programId: 'balanced' },
];
const sharedCore = [{ setId: 'isometrics', programId: 'general-gentle' }, { setId: 'abdomen', programId: 'level-1' }];
const attention = [{ setId: 'relaxation' }, { setId: 'feldenkrais' }];
for (const mode of ['parallel', 'charge']) {
  for (const selections of [five, sharedCore, attention, [...sharedCore, { setId: 'mobility', programId: 'wrists-desk' }]]) {
    requests.push({ ...request(selections), mode, guideMode: 'both', durationMs: 300000 });
  }
}
requests.push({ ...request([]) }, { ...request([{ setId: 'missing' }]) }, { ...request([all[0], all[0]]) });
for (const durationMs of [0, 29999, 3600001]) requests.push({ ...request([all[0]]), durationMs });

const cases = requests.map((req) => {
  try {
    const plan = e.createPracticePlan(req);
    let s = e.createPracticeSession(plan);
    const sessions = [s];
    for (const [fn, t, arg] of [
      ['startPracticeSession', 1000],
      ['tickPracticeSession', 2234],
      ['pausePracticeSession', 3200],
      ['resumePracticeSession', 7000],
      ['extendCurrentStep', 8500, 30000],
      ['skipToNextStepBoundary', 9000],
      ['tickPracticeSession', 999999],
    ]) {
      s = e[fn](s, t, arg);
      sessions.push(s);
    }
    return {
      request: req,
      plan,
      sessions,
      frames: [0, 1000, 5000, req.durationMs - 1, req.durationMs].map((t) => e.getActiveFrame(plan, t)),
    };
  } catch (err) {
    if (!err.issues) throw err;
    return { request: req, issues: err.issues.map((i) => i.code) };
  }
});

/*
 * 🔴 КАРТИНКИ ШАГОВ — ТЕМИ ЖЕ РИСОВАЛКАМИ, ЧТО У ВЕБ-ЭКРАНА.
 *
 * Веб-экран `/games/pause` показывает страницу зарядки (`frontend/public/warmup`),
 * а её рисовалки лежат в `public/warmup/app/app.mjs`. Здесь они исполняются как
 * есть, и SVG каждого шага пишется файлом: Flutter рисует SVG сам, ни браузера,
 * ни движка JS в приложение не кладётся. Так же сделан перенос у «Умного
 * будильника»; разница одна — источник здесь свой, из этого репозитория.
 * Цвета из CSS-переменных подставляются числами: у SVG-файла своих стилей нет.
 */
const warmup = path.join(root, 'frontend/public/warmup');
const parser = require(path.join(root, 'frontend/node_modules/@babel/parser'));
const { JSDOM } = require(path.join(root, 'frontend/node_modules/jsdom'));
const pageSource = fs.readFileSync(path.join(warmup, 'app/app.mjs'), 'utf8');
const ast = parser.parse(pageSource, { sourceType: 'module' });
const drawers = ['activeVisualClass', 'renderCosmicEnergyCenters', 'renderCosmicBodyVisual', 'renderFaceVisual',
  'renderRelaxationVisual', 'renderPelvicVisual', 'renderMobilityVisual', 'renderIsometricVisual', 'renderAbdomenVisual',
  'renderFeldenkraisVisual'];
const pageContext = vm.createContext({ cosmicAssetRoot: 'assets/cosmic-body', escapeHtml: (s) => s });
const found = ast.program.body.filter((n) => n.type === 'FunctionDeclaration' && drawers.includes(n.id.name));
if (found.length !== drawers.length) {
  throw Error(`рисовалок найдено ${found.length} из ${drawers.length}: страница зарядки поменялась`);
}
vm.runInContext(found.map((n) => pageSource.slice(n.start, n.end)).join('\n'), pageContext);
const renderers = { 'face-speech': 'renderFaceVisual', relaxation: 'renderRelaxationVisual', 'pelvic-floor': 'renderPelvicVisual',
  mobility: 'renderMobilityVisual', isometrics: 'renderIsometricVisual', abdomen: 'renderAbdomenVisual',
  feldenkrais: 'renderFeldenkraisVisual' };
let css = fs.readFileSync(path.join(warmup, 'styles.css'), 'utf8');
const cssVars = Object.fromEntries(
  [...css.slice(0, css.indexOf(':root[data-theme')).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
);
cssVars['--visual-accent'] = '#8d7bff';
css = css.replace(/var\((--[\w-]+)\)/g, (_, v) => cssVars[v] || '0');
css = css.replace(/color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)/gi, (_, hex, percent) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Number(percent) / 100})`;
});
const guides = path.join(root, 'packages/practice_kit/assets/guides');
fs.rmSync(guides, { recursive: true, force: true });
fs.mkdirSync(guides, { recursive: true });
let guideCount = 0;
for (const set of e.PRACTICE_CATALOG) {
  if (!renderers[set.id]) continue;
  for (const program of set.programs) {
    for (const step of program.steps) {
      const html = pageContext[renderers[set.id]]({ setId: set.id, programId: program.id, stepId: step.id, progress: 0.5 });
      const dom = new JSDOM(`<style>${css}</style>${html}`);
      const svg = dom.window.document.querySelector('svg');
      if (!svg) throw Error(`нет SVG у шага ${set.id}/${program.id}/${step.id}`);
      for (const node of [svg, ...svg.querySelectorAll('*')]) {
        const st = dom.window.getComputedStyle(node);
        for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'stroke-dasharray']) {
          const v = st.getPropertyValue(prop);
          if (v && !v.includes('var(')) node.setAttribute(prop, v.replace(/px$/, ''));
        }
      }
      for (const node of [svg, ...svg.querySelectorAll('*')]) {
        node.removeAttribute('class');
        node.removeAttribute('aria-hidden');
      }
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      fs.writeFileSync(path.join(guides, `${set.id}__${program.id}__${step.id}.svg`), svg.outerHTML + '\n');
      dom.window.close();
      guideCount++;
    }
  }
}
// Подписи планировщика — словарь САМОЙ страницы (`copy`, 12 языков): человек видит в
// нативной «Паузе» те же слова, что в веб-версии, и второй словарь не заводится.
const copyDecl = ast.program.body
  .flatMap((n) => n.declarations || (n.declaration && n.declaration.declarations) || [])
  .find((d) => d.id && d.id.name === 'copy');
if (!copyDecl) throw Error('в странице зарядки нет словаря copy');
const pageCopy = vm.runInNewContext('(' + pageSource.slice(copyDecl.init.start, copyDecl.init.end) + ')', {}, { timeout: 1000 });
fs.writeFileSync(path.join(root, 'flutter/assets/pause/copy.json'), JSON.stringify(pageCopy, null, 1) + '\n');
console.log(`подписи страницы: ${Object.keys(pageCopy).length} языков, ${Object.keys(pageCopy.ru).length} строк → flutter/assets/pause/copy.json`);

// Фигуры тела и позы — те же webp, что у веб-страницы (652 КБ, а не 9,3 МБ PNG настольной версии).
const bodies = path.join(root, 'packages/practice_kit/assets/cosmic-body');
fs.rmSync(bodies, { recursive: true, force: true });
fs.mkdirSync(bodies, { recursive: true });
const webp = fs.readdirSync(path.join(warmup, 'assets/cosmic-body')).filter((f) => f.endsWith('.webp'));
for (const f of webp) fs.copyFileSync(path.join(warmup, 'assets/cosmic-body', f), path.join(bodies, f));
console.log(`картинки: ${guideCount} SVG шагов → packages/practice_kit/assets/guides, ${webp.length} webp → packages/practice_kit/assets/cosmic-body`);

/*
 * 🔴 «ГИМНАСТИКА ДЛЯ ГЛАЗ» — ЭТАЛОН С ЖИВОГО ЭКРАНА `frontend/app/games/eye-gym.tsx`.
 *
 * Её правила живут не в ядре «Паузы», а в самом экране: последовательность из 11
 * шагов, узоры траектории (`dotFor`, спираль, волна и пульс — по отчётам тестировщицы
 * 05.09), режимы свободной игры и множитель коротких режимов. Экран на React Native
 * целиком в node не исполнить — поэтому нужные объявления вырезаются из исходника
 * разбором и исполняются как есть. Уровни и геометрия — чистые модули сервисов.
 */
const eyeSource = fs.readFileSync(path.join(root, 'frontend/app/games/eye-gym.tsx'), 'utf8');
const eyeAst = parser.parse(eyeSource, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
const eyePieces = [];
const eyeWalk = (node) => {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'VariableDeclarator' && node.id && ['SEQUENCE', 'DIRECTIONS', 'MODE_PHASES', 'modeMul'].includes(node.id.name)) {
    eyePieces.push([node.id.name, eyeSource.slice(node.init.start, node.init.end)]);
  }
  if (node.type === 'FunctionDeclaration' && node.id && node.id.name === 'dotFor') {
    eyePieces.push(['dotFor', eyeSource.slice(node.start, node.end)]);
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach(eyeWalk);
    else if (v && typeof v.type === 'string') eyeWalk(v);
  }
};
eyeWalk(eyeAst.program);
const eyeGot = Object.fromEntries(eyePieces);
for (const need of ['SEQUENCE', 'DIRECTIONS', 'MODE_PHASES', 'modeMul', 'dotFor']) {
  if (!eyeGot[need]) throw Error(`в eye-gym.tsx не найдено ${need}: экран поменялся`);
}
const eyeJs = ts.transpileModule(
  `const SEQUENCE = ${eyeGot.SEQUENCE};\nconst DIRECTIONS = ${eyeGot.DIRECTIONS};\n` +
    `const MODE_PHASES = ${eyeGot.MODE_PHASES};\nconst modeMulOf = (effMode) => (${eyeGot.modeMul});\n${eyeGot.dotFor}\n` +
    'module.exports = { SEQUENCE, DIRECTIONS, MODE_PHASES, modeMulOf, dotFor };',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;
const eyeModule = { exports: {} };
vm.runInNewContext(eyeJs, { module: eyeModule, exports: eyeModule.exports, Math }, { timeout: 5000 });
const eye = eyeModule.exports;
const eyeLevels = load(path.join(root, 'frontend/src/services/eyeGymLevels.ts'));
const eyeGeometry = load(path.join(root, 'frontend/src/services/eyeGymGeometry.ts'));
const BASE_TOTAL_SEC = eye.SEQUENCE.reduce((a, s) => a + s.dur, 0);
// Шаги так, как их строит экран: подмножество режима, длительность × масштаб × множитель, не короче 8 с.
const eyeSteps = (mode, scale) => {
  const sel = eye.MODE_PHASES[mode];
  const mul = eye.modeMulOf(mode);
  return (sel ? eye.SEQUENCE.filter((s) => sel.includes(s.key)) : eye.SEQUENCE)
    .map((s) => ({ key: s.key, dur: Math.max(8, Math.round(s.dur * scale * mul)) }));
};
const eyeFixture = {
  sequence: eye.SEQUENCE,
  directions: eye.DIRECTIONS,
  modePhases: eye.MODE_PHASES,
  modeMul: Object.fromEntries(Object.keys(eye.MODE_PHASES).map((m) => [m, eye.modeMulOf(m)])),
  maxLevel: eyeLevels.EYE_GYM_MAX_LEVEL,
  baseTotalSec: BASE_TOTAL_SEC,
  levels: Array.from({ length: eyeLevels.EYE_GYM_MAX_LEVEL + 2 }, (_, i) => i).map((n) => ({
    level: n,
    cfg: eyeLevels.eyeGymLevel(n),
    minutes: eyeLevels.eyeGymLevelMinutes(n, BASE_TOTAL_SEC),
  })),
  steps: [],
  dots: [],
  geometry: [],
};
for (const mode of Object.keys(eye.MODE_PHASES)) {
  for (const scale of [0.4, 0.7, 1, 1.21, 1.4, 1.7]) eyeFixture.steps.push({ mode, scale, steps: eyeSteps(mode, scale) });
}
for (let n = 1; n <= eyeLevels.EYE_GYM_MAX_LEVEL; n++) {
  eyeFixture.steps.push({ mode: 'full', scale: eyeLevels.eyeGymLevel(n).scale, steps: eyeSteps('full', eyeLevels.eyeGymLevel(n).scale) });
}
const patterns = [...new Set(eye.SEQUENCE.map((s) => s.pattern))];
for (const pattern of patterns) {
  for (const speed of [0.7, 1, 1.4]) {
    for (const [local, localSec] of [[0, 0], [0.13, 2.6], [0.5, 11], [0.77, 16.9], [0.999, 21.98], [1, 30]]) {
      eyeFixture.dots.push({ pattern, local, localSec, speed, out: eye.dotFor(pattern, local, localSec, 150, 212, 179, 246, speed) });
    }
  }
}
for (const [vw, vh, field] of [[360, 640, null], [390, 844, null], [390, 844, { width: 358, height: 520 }], [1024, 768, { width: 700, height: 500 }], [320, 480, null]]) {
  eyeFixture.geometry.push({ viewport: { width: vw, height: vh }, field, out: eyeGeometry.eyeGymGeometry({ width: vw, height: vh }, field) });
}
fs.writeFileSync(path.join(root, 'flutter/test/fixtures/eye-gym-reference.json'), JSON.stringify(eyeFixture) + '\n');
console.log(`глаза: ${eye.SEQUENCE.length} шагов, ${patterns.length} узоров, ${eyeFixture.dots.length} точек траектории, ${eyeFixture.levels.length} уровней → flutter/test/fixtures/eye-gym-reference.json`);

const fixtureFile = path.join(root, 'flutter/test/fixtures/pause-reference.json.gz');
fs.writeFileSync(fixtureFile, gzipSync(JSON.stringify(cases), { level: 9 }));
const failed = cases.filter((c) => c.issues).length;
console.log(`каталог: ${catalog.length} наборов, ${catalog.reduce((n, s) => n + s.programs.length, 0)} программ (ядро ${all.length}) → ${path.relative(root, assetFile)}`);
console.log(`эталон: ${cases.length} случаев (${failed} отказов) → ${path.relative(root, fixtureFile)}, ${fs.statSync(fixtureFile).size} байт`);

#!/usr/bin/env node
/* psygames-export-pause · VER 1 · 30.09.2026 · psygames-warmup-claude-mac */
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
 *   · `flutter/assets/pause/practices.json` — каталог, предупреждения, строки;
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

const assetFile = path.join(root, 'flutter/assets/pause/practices.json');
fs.mkdirSync(path.dirname(assetFile), { recursive: true });
fs.writeFileSync(
  assetFile,
  JSON.stringify({ catalog: e.PRACTICE_CATALOG, warnings: e.WARNING_TEXT, strings: e.PAUSE_STRINGS }, null, 2) + '\n',
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
const guides = path.join(root, 'flutter/assets/pause/guides');
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
// Фигуры тела и позы — те же webp, что у веб-страницы (652 КБ, а не 9,3 МБ PNG настольной версии).
const bodies = path.join(root, 'flutter/assets/pause/cosmic-body');
fs.rmSync(bodies, { recursive: true, force: true });
fs.mkdirSync(bodies, { recursive: true });
const webp = fs.readdirSync(path.join(warmup, 'assets/cosmic-body')).filter((f) => f.endsWith('.webp'));
for (const f of webp) fs.copyFileSync(path.join(warmup, 'assets/cosmic-body', f), path.join(bodies, f));
console.log(`картинки: ${guideCount} SVG шагов → flutter/assets/pause/guides, ${webp.length} webp → flutter/assets/pause/cosmic-body`);

const fixtureFile = path.join(root, 'flutter/test/fixtures/pause-reference.json.gz');
fs.writeFileSync(fixtureFile, gzipSync(JSON.stringify(cases), { level: 9 }));
const failed = cases.filter((c) => c.issues).length;
console.log(`каталог: ${e.PRACTICE_CATALOG.length} наборов, ${all.length} программ → ${path.relative(root, assetFile)}`);
console.log(`эталон: ${cases.length} случаев (${failed} отказов) → ${path.relative(root, fixtureFile)}, ${fs.statSync(fixtureFile).size} байт`);

/* psygames-ts-load · VER 1 · 02.10.2026 · psygames-sudoku-claude-mac */
/**
 * ЖИВОЙ TS ВЕБА В ОДНОЙ ПЕСОЧНИЦЕ — ДЛЯ ВЫГРУЗОК ЭТАЛОНОВ НАТИВУ.
 *
 * Тот же приём, что у `export-sudoku-boards.cjs` (там он вшит, 01.10): модули
 * `frontend/src` транспилируются компилятором `typescript` из `frontend/node_modules` и
 * исполняются в общем контексте `vm` — у всех модулей один `Math`, поэтому сеяный
 * `Math.random` действует на всё ядро разом. Внешних пакетов ядро звать не должно: зов
 * вне `@/` и относительных путей — ошибка, а не тихая заглушка.
 *
 * Словарь (`contexts/LanguageContext`) — React-контекст; выгрузке подписи не нужны,
 * поэтому он подменён заглушкой, отдающей ключ.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const src = path.join(root, 'frontend/src');

/** mulberry32 от 32-битного зерна — сеяный `Math.random` песочницы. */
function mulberry(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Загрузчик модулей `frontend/src`. `randomSeed` — зерно `Math.random` песочницы (ядро
 * местами зовёт его напрямую; выгрузка обязана быть воспроизводимой).
 */
function createLoader({ randomSeed = 1 } = {}) {
  const ts = require(path.join(root, 'frontend/node_modules/typescript'));
  const ctx = vm.createContext({ console, __rng: mulberry(randomSeed) });
  vm.runInContext('Math.random = __rng;', ctx);
  const STUBS = { [path.join(src, 'contexts/LanguageContext')]: { translateFor: (_lang, key) => key } };
  const seen = new Map();

  function resolve(from, dep) {
    let p;
    if (dep.startsWith('@/')) p = path.join(root, 'frontend', dep.slice(2));
    else if (dep.startsWith('.')) p = path.resolve(path.dirname(from), dep);
    else throw Error(`ядро обязано быть чистым, а ${path.relative(root, from)} зовёт «${dep}»`);
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

  /** Модуль по пути от `frontend/src`: `load('services/fractal-deep.ts')`. */
  return (rel) => load(path.join(src, rel));
}

module.exports = { createLoader, root };

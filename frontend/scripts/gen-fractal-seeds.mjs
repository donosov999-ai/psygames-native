/**
 * ГЕНЕРАТОР ЗАГОТОВОК ДЛЯ ФРАКТАЛЬНОЙ СУДОКУ (ступени 5 «скрытая пара» и 6 «X-wing»).
 *
 * ЗАЧЕМ. Эти две ступени вслепую не выкапываются — замер в fractal-sudoku.ts: пол
 * пятой ступени выпадает в 0.5% досок. Поэтому они лежат готовыми в SEED_PUZZLES и
 * раздаются через автоморфизмы. Пока библиотека была на 28 досок ступень, отрезок
 * уровней 26–30 (45 дочерних сеток) показывал в среднем 30 разных досок из 45 —
 * треть партий человек видел уже виденное, просто повёрнутое.
 *
 * ЧТО ДЕЛАЕТ СКРИПТ. Ищет новые доски тем же перебором, каким они были найдены в
 * первый раз, но проверяет их ФУНКЦИЯМИ САМОЙ ИГРЫ и чужими реализациями:
 *
 *   • logicSolve(доска, ступень)      — своя ли техника нужна (движок игры)
 *   • logicSolve(доска, ступень − 1)  — 🔴 ПОЛ: без верхней техники доска НЕ берётся
 *   • countSolutionsFast              — решение единственно (движок игры)
 *   • gradePuzzle из sudoku-grade     — то же самое ЧУЖИМ решателем
 *   • countSolutions из sudoku-core   — единственность ЧУЖИМ перебором
 *
 * ⚠️ И ГЛАВНОЕ — ДЕДУП ПО ГРУППЕ ПРЕОБРАЗОВАНИЙ. Новая доска отвергается, если её узор
 * дырок совпадает с уже лежащим в библиотеке ХОТЯ БЫ ПОСЛЕ ОДНОГО из 41472
 * преобразований transformSeed (перекладка полос, строк внутри полос, транспонирование).
 * Без этого «новые» заготовки оказались бы поворотами старых — ровно та поломка, от
 * которой лечим. Цифры в канон не входят: перекраска их всё равно меняет.
 *
 * ВОСПРОИЗВОДИМОСТЬ. Кандидат номер k собирается генератором с сидом `<сид>#t<ступень>#k`,
 * то есть поток кандидатов не зависит ни от машины, ни от состояния библиотеки. Повтор
 * запуска с тем же --target ничего не меняет (цель уже набрана), запуск с бо́льшим
 * добирает ровно следующие доски того же потока: уже добавленные встречаются на тех же
 * k и отсеиваются дедупом.
 *
 * ЗАПУСК:
 *   node scripts/gen-fractal-seeds.mjs --measure          # только замер разнообразия
 *   node scripts/gen-fractal-seeds.mjs --audit            # ревизия: нет ли в библиотеке поворотов друг друга
 *   node scripts/gen-fractal-seeds.mjs --target 64        # добрать до 64 заготовок на ступень
 *   node scripts/gen-fractal-seeds.mjs --target 64 --dry  # то же, но без записи в файл
 */
import { registerHooks, createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SERVICE = join(ROOT, 'src/services/fractal-sudoku.ts');

// ── Загрузчик TS для голой ноды ────────────────────────────────────────────────
// Скрипт обязан звать ЖИВОЙ код игры, а не свою копию решателя: копия зеленела бы сама
// по себе. Нода .ts-модули с алиасами '@/…' не разрешает, поэтому здесь два крючка:
// resolve (алиас + расширение) и load (транспиляция тем же tsc, что стоит в проекте).
// Заглушка на LanguageContext — он тянет React и AsyncStorage, а нужен только за
// переводом текста ошибок, которого здесь нет.
const require = createRequire(join(ROOT, 'package.json'));
const ts = require('typescript');
const STUB = 'export const translateFor = () => (k) => k; export default {};';
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.includes('LanguageContext') || spec.includes('async-storage') || spec === 'react') {
      return { url: 'stub:' + spec, shortCircuit: true, format: 'module' };
    }
    let p = null;
    if (spec.startsWith('@/')) p = join(ROOT, spec.slice(2));
    else if (spec.startsWith('.') && ctx.parentURL?.startsWith('file:')) p = resolve(dirname(fileURLToPath(ctx.parentURL)), spec);
    if (p) {
      for (const ext of ['.ts', '.tsx', '']) {
        if (existsSync(p + ext) && /\.(ts|tsx|js|mjs)$/.test(p + ext)) {
          return { url: pathToFileURL(p + ext).href, shortCircuit: true, format: 'module' };
        }
      }
    }
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url.startsWith('stub:')) return { format: 'module', source: STUB, shortCircuit: true };
    if (/\.tsx?$/.test(url)) {
      const src = readFileSync(fileURLToPath(url), 'utf8');
      const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.Preserve },
      }).outputText;
      return { format: 'module', source: js, shortCircuit: true };
    }
    return next(url, ctx);
  },
});

const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const F = await load('src/services/fractal-sudoku.ts');
const G = await load('src/services/sudoku-grade.ts');
const C = await load('src/services/sudoku-core.ts');
const S = await load('src/services/seed.ts');

const { SEED_PUZZLES, FRACTAL_TIERS, FEED_CELL, logicSolve, countSolutionsFast, solvedWithCenter, transformSeed } = F;
const CTX = { N: 9, BR: 3, BC: 3, variant: 'none' };
const FEED = FEED_CELL[0] * 9 + FEED_CELL[1];
const TIERS = [FRACTAL_TIERS.hiddenSubset, FRACTAL_TIERS.xWing];

// ── аргументы ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  return i < 0 ? def : (argv[i + 1] ?? true);
};
const TARGET = Number(flag('--target', 0));
const SEED = String(flag('--seed', 'фрактал-заготовки-2026'));
const DRY = argv.includes('--dry');
const MEASURE = argv.includes('--measure');
const AUDIT = argv.includes('--audit');
const RUNS = Number(flag('--runs', 40));
const PASSES = Number(flag('--passes', 1));   // сколько раз подряд человек проходит отрезок 26–30
const MAX_CANDIDATES = Number(flag('--max', 200000));

// ── группа преобразований transformSeed (41472 штуки) и канон узора ───────────
/**
 * Те же перекладки, что в transformSeed: полосы местами, строки внутри крайних полос
 * как угодно, в средней меняются 3 и 5 (строка 4 стоит — она кормит корень). 144 на
 * строки, 144 на столбцы, плюс транспонирование = 41472. Повороты и отражения доски
 * входят сюда целиком: разворот строк и разворот столбцов оба выразимы этими картами.
 */
function lineMaps() {
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const out = [];
  for (const swapBands of [false, true]) for (const a of perms) for (const b of perms) for (const swapMid of [false, true]) {
    const m = new Int8Array(9);
    for (let k = 0; k < 3; k++) { m[k] = (swapBands ? 6 : 0) + a[k]; m[6 + k] = (swapBands ? 0 : 6) + b[k]; }
    m[3] = swapMid ? 5 : 3; m[4] = 4; m[5] = swapMid ? 3 : 5;
    out.push(m);
  }
  return out;
}
const MAPS = lineMaps();

const bitsOfStr = (s) => Uint8Array.from(Array.from(s, (ch) => (ch === '.' ? 0 : 1)));
const bitsOfFlat = (f) => Uint8Array.from(f, (v) => (v ? 1 : 0));

/** Канонический вид узора: минимальная из 41472 перекладок. Одинаков у всей орбиты. */
function canonPattern(bits) {
  const best = new Uint8Array(81).fill(2);
  const buf = new Uint8Array(81);
  for (const rm of MAPS) for (const cm of MAPS) for (let flip = 0; flip < 2; flip++) {
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const rr = flip ? cm[c] : rm[r], cc = flip ? rm[r] : cm[c];
      buf[rr * 9 + cc] = bits[r * 9 + c];
    }
    for (let i = 0; i < 81; i++) {
      if (buf[i] === best[i]) continue;
      if (buf[i] < best[i]) best.set(buf);
      break;
    }
  }
  return best.join('');
}

/**
 * Дешёвый инвариант узора: подсказок всего + отсортированные счётчики по строкам,
 * столбцам и блокам. Вся группа его сохраняет (транспонирование меняет строки со
 * столбцами местами — поэтому две сортированные строки сами сортируются парой).
 * Служит СИТОМ: разные инварианты — точно разные орбиты, канон считать не надо.
 */
function invariant(bits) {
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), box = new Array(9).fill(0);
  let tot = 0;
  for (let i = 0; i < 81; i++) if (bits[i]) {
    const r = (i / 9) | 0, c = i % 9;
    rows[r]++; cols[c]++; box[((r / 3) | 0) * 3 + ((c / 3) | 0)]++; tot++;
  }
  return `${tot}|${[rows.sort().join(''), cols.sort().join('')].sort().join('/')}|${box.sort().join('')}`;
}

// ── проверка одной доски: ровно то, что требует гейт ──────────────────────────
const flatOfStr = (s) => Int8Array.from(Array.from(s, (ch) => (ch === '.' ? 0 : Number(ch))));
const strOfFlat = (f) => Array.from(f, (v) => (v ? String(v) : '.')).join('');
const boardOfFlat = (f) => Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => f[r * 9 + c]));

/** Все причины, по которым доска не годится в заготовки. Пустой массив = годится. */
function reject(flat, tier) {
  const bad = [];
  if (flat[FEED] !== 0) bad.push('кормящая клетка не выколота');
  if (countSolutionsFast(flat, 2) !== 1) bad.push('решений не одно');
  const mine = logicSolve(flat, tier);
  if (!mine.solved) bad.push('своим решателем не добивается');
  else if (mine.tier !== tier) bad.push(`своя техника ${mine.tier}, а нужна ${tier}`);
  if (logicSolve(flat, tier - 1).solved) bad.push('берётся и БЕЗ верхней техники');
  if (bad.length) return bad;   // чужие решатели дороги — зовём только уцелевших
  const board = boardOfFlat(flat);
  const g = G.gradePuzzle(board, CTX, tier);
  if (!g.solved || g.tier !== tier) bad.push(`градатор: solved=${g.solved} tier=${g.tier}`);
  if (G.gradePuzzle(board, CTX, tier - 1).solved) bad.push('градатор взял БЕЗ верхней техники');
  if (C.countSolutions(board.map((r) => [...r]), 9, 3, 3, 'none', undefined, 2, { steps: 500000 }) !== 1) {
    bad.push('ядро насчитало не одно решение');
  }
  return bad;
}

// ── поиск ─────────────────────────────────────────────────────────────────────
/**
 * Кандидат номер k: случайное решение → выкалываем клетки в случайном порядке, пока
 * доска берётся техниками не выше ступени. Ровно digByLogic движка, только решение и
 * порядок здесь свои — сам вердикт на каждом шаге даёт logicSolve игры.
 */
function candidate(tier, k) {
  const rnd = S.makeRng(`${SEED}#t${tier}#${k}`);
  const sol = solvedWithCenter(1 + Math.floor(rnd() * 9), rnd);
  const p = Int8Array.from(sol.flat());
  p[FEED] = 0;                                  // центр гасим безусловно: он кормит корень
  for (const i of S.seededShuffle(Array.from({ length: 81 }, (_, n) => n), rnd)) {
    if (!p[i]) continue;
    const keep = p[i];
    p[i] = 0;
    if (!logicSolve(p, tier).solved) p[i] = keep;
  }
  return p;
}

function grow(tier, target) {
  const have = [...(SEED_PUZZLES[tier] ?? [])];
  const sieve = new Map();          // инвариант → канон (канон считаем лениво)
  const seen = new Set();
  for (const s of have) {
    const bits = bitsOfStr(s);
    const inv = invariant(bits);
    if (!sieve.has(inv)) sieve.set(inv, new Set());
    const key = canonPattern(bits);
    sieve.get(inv).add(key);
    seen.add(key);
  }
  const added = [];
  let k = 0, tried = 0, hits = 0, dups = 0;
  const t0 = Date.now();
  while (have.length + added.length < target && k < MAX_CANDIDATES) {
    const flat = candidate(tier, k++);
    tried++;
    if (reject(flat, tier).length) continue;
    hits++;
    const bits = bitsOfFlat(flat);
    const inv = invariant(bits);
    if (sieve.has(inv)) {
      const key = canonPattern(bits);
      if (seen.has(key)) { dups++; continue; }
      sieve.get(inv).add(key);
      seen.add(key);
    } else {
      sieve.set(inv, new Set([canonPattern(bits)]));
      seen.add(canonPattern(bits));
    }
    added.push(strOfFlat(flat));
    if (added.length % 5 === 0) process.stdout.write(`   ступень ${tier}: +${added.length}, кандидатов ${tried}, ${((Date.now() - t0) / 1000) | 0} с\n`);
  }
  return { added, tried, hits, dups, ms: Date.now() - t0, nextK: k };
}

// ── запись в fractal-sudoku.ts ────────────────────────────────────────────────
const TIER_KEY = {
  [FRACTAL_TIERS.hiddenSubset]: 'TECHNIQUE_TIER.hidden_subset',
  [FRACTAL_TIERS.xWing]: 'TECHNIQUE_TIER.x_wing',
};
function writeSeeds(byTier) {
  let src = readFileSync(SERVICE, 'utf8');
  for (const tier of TIERS) {
    const list = byTier[tier];
    if (!list) continue;
    const head = `  [${TIER_KEY[tier]}]: [\n`;
    const at = src.indexOf(head);
    if (at < 0) throw new Error(`не нашёл блок ${TIER_KEY[tier]} в ${SERVICE}`);
    const end = src.indexOf('\n  ],\n', at);
    if (end < 0) throw new Error(`не нашёл конец блока ${TIER_KEY[tier]}`);
    const body = list.map((s) => `  '${s}',`).join('\n');
    src = src.slice(0, at + head.length) + body + src.slice(end);
  }
  writeFileSync(SERVICE, src);
}

// ── замер разнообразия на уровнях 26–30 ───────────────────────────────────────
/**
 * Метрика, ради которой всё: сколько РАЗНЫХ досок человек видит на отрезке 26–30.
 * Уровни 26–30 — это 45 дочерних сеток, все из библиотеки (ступени 5 и 6). Каждую
 * сгенерированную сетку опознаём по инварианту узора: он переживает и перекладку, и
 * перекраску, поэтому «та же доска, только повёрнутая» считается повтором.
 */
function measure(runs, passes) {
  // Опознание доски: сначала дешёвый инвариант, а если на нём сидят несколько заготовок
  // (бывает: 128 досок — 128 узоров, счётчики по строкам иногда совпадают) — канон.
  // Считать «две разные доски одной» нельзя: замер тогда придумает повтор на ровном месте.
  const byInv = new Map();
  for (const tier of TIERS) SEED_PUZZLES[tier].forEach((s, i) => {
    const bits = bitsOfStr(s);
    const inv = invariant(bits);
    if (!byInv.has(inv)) byInv.set(inv, new Map());
    byInv.get(inv).set(canonPattern(bits), `t${tier}#${i}`);
  });
  const idOf = (bits) => {
    const bucket = byInv.get(invariant(bits));
    if (!bucket) return null;
    if (bucket.size === 1) return bucket.values().next().value;
    return bucket.get(canonPattern(bits)) ?? null;
  };
  const total = 45 * passes;
  let sumAll = 0, sumLevel = 0, unknown = 0, worst = Infinity;
  for (let run = 0; run < runs; run++) {
    F.resetSeedRecall?.();   // каждый прогон — свежая сессия: человек садится и играет 26→30
    const all = [];
    for (let pass = 0; pass < passes; pass++) {
      for (let lvl = 26; lvl <= 30; lvl++) {
        const lv = F.generateFractal(lvl).children.map((ch) => {
          const id = idOf(bitsOfFlat(ch.puzzle.flat()));
          if (!id) unknown++;
          return id ?? `чужая-${Math.random()}`;
        });
        all.push(...lv);
        sumLevel += new Set(lv).size;
      }
    }
    const d = new Set(all).size;
    sumAll += d;
    worst = Math.min(worst, d);
    process.stdout.write(`   прогон ${run + 1}/${runs}: разных ${d}/${total}\r`);
  }
  return { runs, total, mean: sumAll / runs, worst, perLevel: sumLevel / (runs * 5 * passes), unknown };
}

/**
 * Ревизия библиотеки: нет ли в ней двух досок, которые на самом деле одна и та же,
 * повёрнутая. Дедуп это ловит при добавлении, но 28 исходных заготовок пришли не из
 * скрипта — их надо было проверить хотя бы раз.
 */
function audit() {
  const byCanon = new Map();
  const byInv = new Map();
  for (const tier of TIERS) SEED_PUZZLES[tier].forEach((s, i) => {
    const bits = bitsOfStr(s);
    const key = canonPattern(bits);
    const name = `t${tier}#${i}`;
    if (byCanon.has(key)) console.log(`   🔴 ОДНА И ТА ЖЕ ДОСКА: ${byCanon.get(key)} и ${name}`);
    else byCanon.set(key, name);
    const inv = invariant(bits);
    byInv.set(inv, (byInv.get(inv) ?? 0) + 1);
  });
  const collided = [...byInv.values()].filter((n) => n > 1).reduce((a, n) => a + n, 0);
  const all = TIERS.reduce((a, t) => a + SEED_PUZZLES[t].length, 0);
  console.log(`РЕВИЗИЯ: заготовок ${all}, разных по группе преобразований ${byCanon.size}`);
  console.log(`   дешёвый инвариант различает ${byInv.size} из ${all} (на общих сидит ${collided} досок — там канон обязателен)`);
}

// ── ход дела ──────────────────────────────────────────────────────────────────
console.log(`библиотека сейчас: ${TIERS.map((t) => `ступень ${t} — ${SEED_PUZZLES[t].length}`).join(', ')}`);

if (AUDIT) audit();

if (MEASURE || (!TARGET && !AUDIT)) {
  const m = measure(RUNS, PASSES);
  const проходы = PASSES === 1 ? 'уровней 26–30' : `уровней 26–30, ${PASSES} прохода подряд`;
  console.log(`\nЗАМЕР по ${m.runs} прогонам ${проходы} (${m.total} дочерних сеток в прогоне):`);
  console.log(`   разных досок: в среднем ${m.mean.toFixed(1)} из ${m.total}, худший прогон ${m.worst}`);
  console.log(`   повторов: ${(m.total - m.mean).toFixed(1)} (${(100 * (m.total - m.mean) / m.total).toFixed(0)}%)`);
  console.log(`   на одном уровне (9 сеток): разных ${m.perLevel.toFixed(2)}`);
  if (m.unknown) console.log(`   ⚠️ сеток не из библиотеки: ${m.unknown}`);
}

if (TARGET) {
  const byTier = {};
  let total = 0;
  for (const tier of TIERS) {
    const have = SEED_PUZZLES[tier].length;
    if (have >= TARGET) { console.log(`ступень ${tier}: уже ${have} ≥ ${TARGET}, добирать нечего`); continue; }
    console.log(`ступень ${tier}: ищу ${TARGET - have} досок…`);
    const r = grow(tier, TARGET);
    console.log(`ступень ${tier}: +${r.added.length} за ${(r.ms / 1000).toFixed(0)} с; кандидатов ${r.tried}, попаданий ${r.hits} (${(100 * r.hits / Math.max(1, r.tried)).toFixed(1)}%), отсеяно дедупом ${r.dups}, поток дошёл до k=${r.nextK}`);
    byTier[tier] = [...SEED_PUZZLES[tier], ...r.added];
    total += r.added.length;
  }
  if (!total) console.log('нового ничего — библиотека уже набрана');
  else if (DRY) console.log(`--dry: в файл не пишу, добавилось бы ${total} досок (${(total * 82 / 1024).toFixed(1)} КБ)`);
  else {
    writeSeeds(byTier);
    console.log(`записано в ${SERVICE}: +${total} досок (+${(total * 82 / 1024).toFixed(1)} КБ исходника)`);
  }
}

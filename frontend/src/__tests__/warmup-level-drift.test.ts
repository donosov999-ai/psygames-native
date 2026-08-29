/* psygames-warmup-level-drift · VER 2 · 20.08.2026 */
/**
 * ШАГ ЗАРЯДКИ НЕ ДВИГАЕТ ПЕРСОНАЛЬНЫЙ УРОВЕНЬ.
 *
 * 🔴 ЧТО НАШЛОСЬ В ПЕРВОЙ ВЕРСИИ. В «Спан по клеткам» потерялся `!isPreset`: партия из
 * плейлиста зарядки поднимала уровень через `lvl.reach` и роняла через `lvl.fail`.
 * Уровень менялся не от результата человека, а от того, попалась ли ему эта игра в
 * наборе. Список `DEMOTES_IN_WARMUP` тогда набрали построчным поиском и записали в долг
 * 22 экрана.
 *
 * 🔴 ЧТО НАШЛОСЬ ПОТОМ — И ПОЧЕМУ ГЕЙТ ПЕРЕПИСАН. Долг оказался почти целиком мнимым.
 * Построчная проверка знала ровно одну форму защиты — `!isPreset` в той же строке, что и
 * `lvl.fail()`. А двадцать экранов из двадцати двух написаны иначе:
 *
 *     if (isPreset) { setPhase('result'); }        // зарядка: уровень не трогаем
 *     else          { …; lvl.fail(); }             // ← «незащищённая» строка
 *
 * Ветка `else` защищена ничуть не хуже, просто условие стоит на четыре строки выше.
 * Такой же промах давали `useLevels = !isPreset && !classicRef.current` (шарик),
 * `classic = isPreset || runMode === 'classic'` (PRL, WCST), `isLevelRun`, `useLevelRef`.
 * Гейт, ошибающийся в двадцати случаях из двадцати двух, не граница, а шум: список
 * долга нельзя ни опустошить, ни поверить ему.
 *
 * Поэтому проверка теперь не ищет строку, а СЧИТАЕТ ДОСТИЖИМОСТЬ: собирает все `if`/`else`
 * над вызовом, подставляет `isPreset = true` и перебирает остальные имена. Правило-помощник
 * при этом ЗОВЁТСЯ НАСТОЯЩЕЕ (`levelOutcome` импортирован сюда) — экран, доверивший решение
 * ему, проверяется вместе с ним.
 *
 * Реально роняли уровень в зарядке два экрана: CPT и OSPAN. Оба починены через
 * `levelOutcome`, список долга пуст.
 *
 * ⚠️ ПРАВИЛО НЕ УНИВЕРСАЛЬНО, И ЭТО НАРОЧНО. Маджонг и сортировка играют в зарядке РОВНО
 * ТУ ЖЕ доску, что и в личной партии (`loadLevel(lvl.level)`), и сохраняют прогресс
 * намеренно — на это есть свой гейт (`warmup-persistent-level.test.ts`). Поэтому здесь
 * проверяется ПОНИЖЕНИЕ: подъём потолка бывает честным, а вот отнятая ступень — нет.
 *
 * ⚠️ ОБЕ СТОРОНЫ. Выключить уровень совсем — тоже поломка, только тихая. Поэтому рядом
 * стоит обратная проверка: в личной партии уровень обязан двигаться и вверх, и вниз.
 *
 * ⚠️ ПРО КОММЕНТАРИИ. Исходник просматривается со срезанными комментариями И строковыми
 * литералами: упоминание `lvl.fail()` в пояснении рядом — не механизм.
 */
import { levelOutcome } from '@/src/services/levelOutcome';

declare const __dirname: string;
declare function require(id: string): any;
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '../../app/games');
const FILES: string[] = fs.readdirSync(DIR).filter((f: string) => f.endsWith('.tsx'));
const read = (f: string): string => fs.readFileSync(path.join(DIR, f), 'utf8') as string;

/**
 * ДОЛГ: экраны, где провал партии роняет уровень и в шаге зарядки тоже.
 * Список закрыт — он может только уменьшаться. Каждый переезд отсюда должен быть
 * осознанной правкой, а не побочным эффектом.
 */
const DEMOTES_IN_WARMUP: string[] = [];

// ────────────────────────────────────────────────────────────────────────────────────
// РАЗБОР: до какой ветки доходит вызов
// ────────────────────────────────────────────────────────────────────────────────────

/**
 * Комментарии и содержимое строк/шаблонов → пробелы. Длина сохраняется, чтобы индексы
 * скобок и слов оставались верными.
 */
function mask(src: string): string {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
  const a = s.split('');
  let i = 0;
  while (i < a.length) {
    const q = a[i];
    if (q === '"' || q === "'" || q === '`') {
      let j = i + 1;
      while (j < a.length) {
        if (a[j] === '\\') { a[j] = ' '; if (j + 1 < a.length && a[j + 1] !== '\n') a[j + 1] = ' '; j += 2; continue; }
        if (a[j] === q) break;
        if (a[j] !== '\n') a[j] = ' ';
        j++;
      }
      i = j + 1;
      continue;
    }
    i++;
  }
  return a.join('');
}

const PAIR: Record<string, string> = { ')': '(', ']': '[' };
const skipWs = (s: string, i: number): number => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
function backBalanced(s: string, i: number): number {
  const o = PAIR[s[i]];
  let d = 0;
  for (let j = i; j >= 0; j--) { if (s[j] === s[i]) d++; else if (s[j] === o) { d--; if (!d) return j; } }
  return -1;
}
function wordBefore(s: string, i: number): { w: string; start: number } {
  let e = i; while (e > 0 && /\s/.test(s[e - 1])) e--;
  let b = e; while (b > 0 && /[\w$]/.test(s[b - 1])) b--;
  return { w: s.slice(b, e), start: b };
}
function braceMap(s: string): Map<number, number> {
  const openOf = new Map<number, number>(); const st: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') st.push(i);
    else if (s[i] === '}') { const p = st.pop(); if (p != null) openOf.set(i, p); }
  }
  return openOf;
}
function enclosingOpen(s: string, p: number): number {
  const st: number[] = [];
  for (let i = 0; i < p; i++) { if (s[i] === '{') st.push(i); else if (s[i] === '}') st.pop(); }
  return st.length ? st[st.length - 1] : -1;
}

/**
 * Начало инструкции, содержащей `p`. Заголовок `if (…)` — граница: сразу за ним
 * начинается then-ветка, в том числе БЕЗ фигурных скобок (`if (x) lvl.fail();` —
 * самая частая форма в играх, и как раз её построчный поиск считал беззащитной).
 */
function stmtStart(s: string, p: number): number {
  let i = p - 1;
  while (i >= 0) {
    const c = s[i];
    if (c === ';' || c === '{' || c === '}') return skipWs(s, i + 1);
    if (c === ')' || c === ']') {
      const o = backBalanced(s, i);
      if (o < 0) return skipWs(s, i + 1);
      if (c === ')' && wordBefore(s, o).w === 'if') return skipWs(s, i + 1);
      i = o - 1;
      continue;
    }
    i--;
  }
  return 0;
}

interface IfHead { cond: string; ifStart: number; isElseIf: boolean; elseStart: number }
/** `if (…)` (или `else if (…)`) непосредственно перед позицией `p`. */
function ifHeadBefore(s: string, p: number): IfHead | null {
  let i = p - 1;
  while (i >= 0 && /\s/.test(s[i])) i--;
  if (i < 0 || s[i] !== ')') return null;
  const o = backBalanced(s, i);
  if (o < 0) return null;
  const w = wordBefore(s, o);
  if (w.w !== 'if') return null;
  const prev = wordBefore(s, w.start);
  return { cond: s.slice(o + 1, i), ifStart: w.start, isElseIf: prev.w === 'else', elseStart: prev.start };
}
/** Какому `if` принадлежит `else`, начинающийся на `ePos`. */
function ifForElse(s: string, ePos: number, openOf: Map<number, number>): IfHead | null {
  let j = ePos - 1;
  while (j >= 0 && /\s/.test(s[j])) j--;
  if (j < 0) return null;
  if (s[j] === '}') { const o = openOf.get(j); return o == null ? null : ifHeadBefore(s, o); }
  return ifHeadBefore(s, stmtStart(s, j));   // then-ветка без скобок
}

interface Guard { cond: string; neg: boolean }
/** Все условия, при которых исполняется точка `p`, — от неё вверх до тела функции. */
function guardsFrom(s: string, p: number, openOf: Map<number, number>, depth = 0): Guard[] {
  if (depth > 60) return [];
  const anchor = s[p] === '{' ? p : stmtStart(s, p);
  const before = s.slice(0, anchor).replace(/\s+$/, '');
  if (/(^|[^\w$])else$/.test(before)) return elseGuards(s, before.length - 4, openOf, depth + 1);
  const h = ifHeadBefore(s, anchor);
  if (h) {
    return [{ cond: h.cond, neg: false }].concat(
      h.isElseIf ? elseGuards(s, h.elseStart, openOf, depth + 1) : guardsFrom(s, h.ifStart, openOf, depth + 1));
  }
  const op = enclosingOpen(s, anchor);
  return op < 0 ? [] : guardsFrom(s, op, openOf, depth + 1);
}
function elseGuards(s: string, ePos: number, openOf: Map<number, number>, depth: number): Guard[] {
  if (depth > 60) return [];
  const info = ifForElse(s, ePos, openOf);
  if (!info) return [];
  return [{ cond: info.cond, neg: true }].concat(
    info.isElseIf ? elseGuards(s, info.elseStart, openOf, depth + 1) : guardsFrom(s, info.ifStart, openOf, depth + 1));
}

// ────────────────────────────────────────────────────────────────────────────────────
// РАЗБОР: чему равны имена в условии
// ────────────────────────────────────────────────────────────────────────────────────

type Defs = Record<string, string[]>;
/** Правая часть от позиции `i` до `;` на нулевой глубине скобок (тела функций отсекаются). */
function rhsFrom(s: string, i: number): string | null {
  let d = 0;
  for (let j = i; j < s.length && j - i < 400; j++) {
    const c = s[j];
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') { d--; if (d < 0) return null; }
    else if (c === ';' && d === 0) return s.slice(i, j).trim();
  }
  return null;
}
function collectDefs(s: string): Defs {
  const defs: Defs = {};
  const put = (n: string, v: string | null) => { if (v) (defs[n] = defs[n] || []).push(v); };
  let m: RegExpExecArray | null;
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  while ((m = re.exec(s))) { put(m[1], rhsFrom(s, m.index + m[0].length)); re.lastIndex = m.index + m[0].length; }
  const re2 = /([A-Za-z_$][\w$]*\.current)\s*=\s*/g;
  while ((m = re2.exec(s))) { put(m[1], rhsFrom(s, m.index + m[0].length)); re2.lastIndex = m.index + m[0].length; }
  return defs;
}

const KW = new Set(['true', 'false', 'null', 'undefined', 'new', 'typeof', 'void', 'in', 'of', 'await', 'return',
  'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Set', 'Map']);
/** Имена и пути в выражении. Ключи объектных литералов, вызовы и параметры стрелок — не имена. */
function atomsOf(expr: string): string[] {
  const out = new Set<string>();
  const re = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) {
    const a = m[0];
    if (KW.has(a.split('.')[0])) continue;
    const after = expr.slice(m.index + a.length);
    if (/^\s*\(/.test(after)) continue;
    if (/^\s*=>/.test(after)) continue;
    const prev = expr.slice(0, m.index).replace(/\s+$/, '').slice(-1);
    if (/^\s*:/.test(after) && (prev === '{' || prev === ',' || prev === '')) continue;
    out.add(a);
  }
  return Array.from(out);
}
const baseName = (a: string, defs: Defs): string => (defs[a] ? a : (a.indexOf('.') >= 0 ? a.slice(0, a.indexOf('.')) : a));
/** Определение имени — то, что ведёт к `isPreset`; при споре двух таких не раскрываем. */
function defOf(name: string, defs: Defs): string | null {
  const list = defs[name];
  if (!list || !list.length) return null;
  const wp = list.filter((d) => /\bisPreset\b/.test(d));
  if (wp.length === 1) return wp[0];
  if (wp.length > 1) return null;
  return list.length === 1 ? list[0] : null;
}
/** Ведёт ли имя — через свои определения — к `isPreset`? */
function leadsToPreset(name: string, defs: Defs, seen = new Set<string>(), depth = 0): boolean {
  if (depth > 8 || seen.has(name)) return false;
  seen.add(name);
  const rhs = defOf(name, defs);
  if (rhs == null) return false;
  if (/\bisPreset\b/.test(rhs)) return true;
  return atomsOf(rhs).some((a) => leadsToPreset(baseName(a, defs), defs, seen, depth + 1));
}
/**
 * Раскрываем ТОЛЬКО имена, ведущие к `isPreset`; остальные остаются свободными. Нас
 * интересует связь ветки с зарядкой, а не арифметика точности: без этого ограничения
 * условие CPT разворачивалось в полсотни имён и разбору уже не поддавалось.
 */
function expand(expr: string, defs: Defs, seen = new Set<string>(), depth = 0): string {
  if (depth > 8) return expr;
  let changed = false;
  for (const a of atomsOf(expr)) {
    if (a === 'isPreset' || seen.has(a)) continue;
    const name = baseName(a, defs);
    if (!leadsToPreset(name, defs)) { seen.add(a); continue; }
    const rhs = defOf(name, defs);
    if (rhs == null) continue;
    const re = new RegExp('(?<![\\w$.])' + name.replace(/\./g, '\\.') + '(?![\\w$])', 'g');
    const nx = expr.replace(re, '(' + rhs + ')');
    if (nx !== expr) { expr = nx; changed = true; }
    seen.add(a); seen.add(name);
  }
  return changed ? expand(expr, defs, seen, depth + 1) : expr;
}

// ────────────────────────────────────────────────────────────────────────────────────
// РАЗБОР: выполнимо ли условие
// ────────────────────────────────────────────────────────────────────────────────────

function matchParen(s: string, i: number): number {
  let d = 0;
  for (let j = i; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (!d) return j; } }
  return -1;
}
/** Вызовы → свободные имена. `levelOutcome(…)` не трогаем: его зовём по-настоящему. */
function decall(expr: string): string {
  let n = 0;
  for (let g = 0; g < 80; g++) {
    let hit: RegExpExecArray | null = null;
    const re = /(?<![\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g;
    let x: RegExpExecArray | null;
    while ((x = re.exec(expr))) { if (x[1] !== 'levelOutcome') { hit = x; break; } }
    if (!hit) break;
    const end = matchParen(expr, hit.index + hit[0].length - 1);
    if (end < 0) break;
    expr = expr.slice(0, hit.index) + '__c' + (n++) + expr.slice(end + 1);
  }
  return expr;
}
const CAND: any[] = [false, true, 0, 1, 2, 5];
/**
 * ∃ ли значения свободных имён, при которых условие истинно?
 * Неразобранное считаем истинным — то есть в КРАСНУЮ сторону: непонятый экран должен
 * попадать под подозрение, а не тихо зеленеть.
 */
function satisfiable(cond: string, isPreset: boolean): boolean {
  let e = decall(cond.replace(/\bawait\b/g, ' '));
  const free = atomsOf(e).filter((a) => a !== 'isPreset');
  if (free.length > 7) return true;
  const names = free.map((_, i) => '__a' + i);
  free.forEach((a, i) => {
    e = e.replace(new RegExp('(?<![\\w$.])' + a.replace(/\./g, '\\.') + '(?![\\w$])', 'g'), names[i]);
  });
  let fn: any;
  try { fn = new Function('isPreset', 'levelOutcome', ...names, 'return !!(' + e + ');'); } catch { return true; }
  const total = Math.pow(CAND.length, free.length);
  for (let k = 0; k < total; k++) {
    const args: any[] = [];
    let n = k;
    for (let j = 0; j < free.length; j++) { args.push(CAND[n % CAND.length]); n = Math.floor(n / CAND.length); }
    let v: boolean;
    try { v = fn(isPreset, levelOutcome, ...args); } catch { return true; }
    if (v) return true;
  }
  return false;
}

interface Site { guards: string[]; warm: boolean; solo: boolean }
/** Все вызовы `needle` в исходнике: доходит ли до них шаг зарядки и личная партия. */
function callSites(src: string, needle: string): Site[] {
  const s = mask(src);
  if (s.indexOf(needle) < 0) return [];
  const openOf = braceMap(s);
  const defs = collectDefs(s);
  const out: Site[] = [];
  let idx = -1;
  while ((idx = s.indexOf(needle, idx + 1)) !== -1) {
    const exp = guardsFrom(s, idx, openOf)
      .map((g) => (g.neg ? '!(' + g.cond.trim() + ')' : '(' + g.cond.trim() + ')'))
      .map((g) => expand(g, defs));
    out.push({
      guards: exp,
      // Условия соединены «И»: если хоть одно невыполнимо — ветка недостижима.
      warm: exp.every((g) => satisfiable(g, true)),
      solo: exp.every((g) => satisfiable(g, false)),
    });
  }
  return out;
}
/**
 * 🔴 ЭКРАН, КОТОРЫЙ ЗАРЯДКОЙ НЕ ЗАПУСКАЕТСЯ, ПРОВЕРЯТЬ НЕ НА ЧЕМ.
 *
 * Шагом зарядки игра становится, только если ЧИТАЕТ пресет: зарядка передаёт его
 * параметром маршрута, и экран обязан этот параметр разобрать. Экран, в котором
 * слова `isPreset` нет вовсе, в набор попасть не может — для него разбор
 * достижимости «при isPreset = true» подставляет условие, которого в коде нет, и
 * получает ложное «роняет».
 *
 * Замер 29.08.2026, на котором это вскрылось: в `sudoku-fractal.tsx` появился
 * честный `lvl.fail()` (симметрия лестницы, задача e53f4958) — гейт назвал экран
 * новым долгом. Проверка носителей: `isPreset` в файле 0 упоминаний, маршрут
 * `/games/sudoku-fractal` не встречается ни в одном плейлисте профилей, в
 * `warmup.ts` его нет. То есть шага зарядки у фрактала не бывает, и падение
 * было чистой ложью разбора.
 *
 * ⚠️ Признак берётся ИЗ КОДА обоих носителей, а не из списка-исключения: появится
 * у фрактала пресет — гейт снова начнёт его проверять сам.
 */
const PLAYLIST_SOURCES = ['src/constants/profiles.ts', 'src/services/warmup.ts']
  .map((rel) => fs.readFileSync(path.join(DIR, '..', '..', rel), 'utf8') as string)
  .join('\n');

const reachableFromWarmup = (file: string, src: string): boolean => {
  if (src.includes('isPreset')) return true;
  const route = `/games/${file.replace(/\.tsx$/, '')}`;
  return PLAYLIST_SOURCES.includes(`'${route}'`);
};

/** Роняет ли экран уровень в шаге зарядки. */
const demotesInWarmup = (src: string, file = ''): boolean =>
  (file === '' || reachableFromWarmup(file, src))
  && callSites(src, 'lvl.fail()').some((c) => c.warm);

// ────────────────────────────────────────────────────────────────────────────────────

describe('правило исхода уровня — поведением', () => {
  it('шаг зарядки не двигает уровень ни вверх, ни вниз', () => {
    for (const cleared of [true, false]) {
      const out = levelOutcome({ isPreset: true, cleared });
      expect(`cleared=${cleared}: ${out.raiseLevel}/${out.lowerLevel}`).toBe(`cleared=${cleared}: false/false`);
    }
  });

  it('личная партия: взял планку → вверх, не взял → вниз', () => {
    expect(levelOutcome({ isPreset: false, cleared: true })).toEqual(
      { passed: true, raiseLevel: true, lowerLevel: false, phase: 'cleared' });
    expect(levelOutcome({ isPreset: false, cleared: false })).toEqual(
      { passed: false, raiseLevel: false, lowerLevel: true, phase: 'cleared' });
  });

  /**
   * 🔴 СЦЕПКА, РАДИ КОТОРОЙ ПРАВИЛО ЖИВЁТ ОДНИМ КУСКОМ. Выключить прохождение в
   * зарядке и оставить баннер уровня — значит показать «почти, ещё раз» человеку,
   * который ничего не провалил. Такое расхождение читается как поломка игры.
   */
  it('🔴 нигде не бывает «не прошёл» вместе с баннером уровня в зарядке', () => {
    const bad: string[] = [];
    for (const isPreset of [true, false]) {
      for (const cleared of [true, false]) {
        const o = levelOutcome({ isPreset, cleared });
        if (isPreset && o.phase === 'cleared') bad.push(`isPreset+${cleared}: баннер уровня в зарядке`);
        if (!o.passed && o.raiseLevel) bad.push(`${isPreset}/${cleared}: не прошёл, но уровень вверх`);
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * 🔴 САМА ПРОВЕРКА ТОЖЕ ПРОВЕРЯЕТСЯ. Разбор достижимости — не поиск подстроки: ошибись
 * он в сторону «недостижимо», и весь гейт зазеленеет вслепую на любом исходнике.
 * Поэтому ниже — заведомо сломанные и заведомо целые заготовки с известным ответом.
 * Каждая форма защиты взята из живых экранов, каждая поломка — из тех, что уже случались.
 */
describe('разбор достижимости — на заготовках с известным ответом', () => {
  const wrap = (body: string) => `export default function G() {\n  const lvl = usePersistentLevel('g');\n  const { isPreset } = useGamePreset();\n  const finish = () => {\n${body}\n  };\n}`;

  const РОНЯЕТ: Array<[string, string]> = [
    ['без защиты вовсе', '    if (passed) lvl.reach(n + 1);\n    else lvl.fail();'],
    ['условие перевёрнуто', '    if (isPreset) { lvl.fail(); } else { setPhase("result"); }'],
    ['защита ушла в соседнюю ветку', '    if (!isPreset) { lvl.reach(n + 1); }\n    lvl.fail();'],
    // ⚠️ Комментарий и строка ПОХОЖИ на защиту — ровно на этом гейты и зеленели вслепую.
    ['защита осталась закомментированной', '    if (isPreset) { setPhase("result"); }\n    // if (!isPreset) {\n    lvl.fail();'],
    ['защита есть только внутри строки', '    log("if (!isPreset) {");\n    lvl.fail();'],
    ['защита по чужому флагу', '    const classic = mode === "classic";\n    if (!classic) lvl.fail();'],
  ];
  it.each(РОНЯЕТ)('🔴 ловит поломку: %s', (_name, body) => {
    expect(demotesInWarmup(wrap(body))).toBe(true);
  });

  const ЦЕЛО: Array<[string, string]> = [
    ['`!isPreset` в той же строке', '    if (passed) lvl.reach(n + 1);\n    else if (!isPreset) lvl.fail();'],
    ['ветка else блоком', '    if (isPreset) {\n      setPhase("result");\n    } else {\n      if (passed) lvl.reach(n + 1);\n      else lvl.fail();\n    }'],
    ['через производную переменную', '    const useLevels = !isPreset && !classicRef.current;\n    if (useLevels) {\n      if (passed) lvl.reach(n + 1);\n      else lvl.fail();\n    }'],
    ['через переменную с ИЛИ', '    const classic = isPreset || mode === "classic";\n    if (!classic) {\n      lvl.fail();\n    }'],
    ['через ref, заполненный из isPreset', '    const useLevel = !isPreset;\n    useLevelRef.current = useLevel;\n    if (!isPreset && useLevelRef.current) lvl.fail();'],
    ['через правило-помощник', '    const out = levelOutcome({ isPreset, cleared: acc >= 0.8 });\n    if (out.raiseLevel) lvl.reach(n + 1);\n    if (out.lowerLevel) lvl.fail();'],
    ['через помощник в глубине веток', '    const out = levelOutcome({ isPreset, cleared: acc >= 0.8 });\n    if (out.raiseLevel) {\n      setPhase("boss");\n    } else if (out.lowerLevel) {\n      lvl.fail();\n    }'],
    // ⚠️ И встречно: упоминание вызова в пояснении — не вызов, оговаривать за него нельзя.
    ['вызов упомянут в комментарии', '    if (isPreset) { setPhase("result"); }\n    else { lvl.fail(); }\n    // раньше тут стоял голый lvl.fail();'],
  ];
  it.each(ЦЕЛО)('✅ не оговаривает целое: %s', (_name, body) => {
    expect(demotesInWarmup(wrap(body))).toBe(false);
  });

  /**
   * ⚠️ Самая опасная ошибка разбора — молча признать недостижимым то, что достижимо.
   * Ловим её встречно: если правило-помощник сломать, заготовка «через правило» обязана
   * покраснеть. Ломаем не файл, а подстановку — чтобы проверка жила без правки исходника.
   */
  it('🔴 сломанное правило тянет за собой и экраны, доверившие ему решение', () => {
    const целое = '    const out = levelOutcome({ isPreset, cleared: acc >= 0.8 });\n    if (out.lowerLevel) lvl.fail();';
    expect(demotesInWarmup(wrap(целое))).toBe(false);
    // то же место, но решение принимает правило, которое зарядку не различает
    const сломанное = '    const out = { lowerLevel: !(acc >= 0.8), raiseLevel: acc >= 0.8 };\n    if (out.lowerLevel) lvl.fail();';
    expect(demotesInWarmup(wrap(сломанное))).toBe(true);
  });

  it('🔴 видит и обратную сторону: где уровень в личной партии не двигается', () => {
    const живой = wrap('    const out = levelOutcome({ isPreset, cleared: acc >= 0.8 });\n    if (out.lowerLevel) lvl.fail();');
    expect(callSites(живой, 'lvl.fail()').every((c) => c.solo)).toBe(true);
    const мёртвый = wrap('    if (false) lvl.fail();');
    expect(callSites(мёртвый, 'lvl.fail()').every((c) => c.solo)).toBe(false);
  });
});

describe('кто ещё роняет уровень в зарядке', () => {
  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.length).toBeGreaterThan(50);
    // и разбор действительно доходит до вызовов, а не молчит на пустом месте
    const сВызовом = FILES.filter((f) => callSites(read(f), 'lvl.fail()').length > 0);
    expect(сВызовом.length).toBeGreaterThan(30);
  });

  it('🔴 «Спан по клеткам» больше не двигает уровень из зарядки', () => {
    const sites = callSites(read('spatial-span.tsx'), 'lvl.fail()');
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.every((c) => !c.warm)).toBe(true);
    // и вверх тоже: подъём идёт через решение помощника, а не напрямую
    expect(callSites(read('spatial-span.tsx'), 'lvl.reach(').every((c) => !c.warm)).toBe(true);
  });

  it('🔴 круг таких экранов не растёт', () => {
    const now = FILES.filter((f) => demotesInWarmup(read(f), f)).sort();
    const added = now.filter((f) => DEMOTES_IN_WARMUP.indexOf(f) < 0);
    expect(added).toEqual([]);
  });

  it('в списке долга нет записей про экраны, которые уже починили', () => {
    const now = FILES.filter((f) => demotesInWarmup(read(f), f));
    const stale = DEMOTES_IN_WARMUP.filter((f) => now.indexOf(f) < 0)
      .map((f) => `${f}: уровень в зарядке уже не роняется — убрать из списка`);
    expect(stale).toEqual([]);
  });
});

/**
 * ⚠️ ОБРАТНАЯ СТОРОНА. Самый дешёвый способ «починить» снос уровня — выключить уровень
 * совсем. Здесь перечислены экраны, которые правило исхода уже ведёт: в личной партии
 * они обязаны двигать уровень В ОБЕ стороны, иначе тропинка встанет намертво.
 */
const ПО_ПРАВИЛУ = ['spatial-span.tsx', 'cpt.tsx', 'ospan.tsx'];
describe.each(ПО_ПРАВИЛУ)('%s — личная партия уровень двигает', (file) => {
  const src = read(file);

  it('решение принимает правило-помощник, а не экран сам по себе', () => {
    const code = mask(src);
    expect(code).toContain('levelOutcome({ isPreset');
    expect(code).toContain('out.raiseLevel');
    expect(code).toContain('out.lowerLevel');
  });

  it('🔴 вверх — доходит', () => {
    const sites = callSites(src, 'lvl.reach(');
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.some((c) => c.solo)).toBe(true);
  });

  it('🔴 вниз — доходит', () => {
    const sites = callSites(src, 'lvl.fail()');
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.some((c) => c.solo)).toBe(true);
  });

  it('🔴 а шаг зарядки — ни вверх, ни вниз', () => {
    expect(callSites(src, 'lvl.reach(').every((c) => !c.warm)).toBe(true);
    expect(callSites(src, 'lvl.fail()').every((c) => !c.warm)).toBe(true);
  });
});

/**
 * ⬆️ ОБРАТНАЯ СТОРОНА: КОМУ ПОДЪЁМ УРОВНЯ В ЗАРЯДКЕ РАЗРЕШЁН.
 *
 * 🔴 ЗАЧЕМ ОТДЕЛЬНЫЙ СПИСОК. Понижение уровня от шага зарядки — беда всегда, и
 * на неё есть закрытый список выше. Подъём бедой быть не обязан: есть игры, где
 * шаг зарядки играет РОВНО ТУ ЖЕ доску, что личная партия (параметры берутся из
 * `lvl.level`, а не из плейлиста), и тогда прохождение — честный прогресс.
 *
 * Но пока списка нет, отличить решение от пропуска нечем: и там и там просто
 * вызов без оговорки. 20.08.2026 таких экранов оказалось пять, и по коду было не
 * видно, у скольких из них это осознано.
 *
 * ⚠️ ПРИЧИНА ПРОВЕРЯЕТСЯ, А НЕ ЧИТАЕТСЯ. Записать «играет ту же доску» мало —
 * проверка требует, чтобы экран и правда брал уровень из `lvl.level`. Экран,
 * получающий параметры из плейлиста, в этот список попасть не может.
 */
const RAISES_IN_WARMUP: Record<string, string> = {
  'mahjong.tsx': 'шаг зарядки собирает пирамиду по lvl.level — та же доска, что в личной партии; сохранение прогресса намеренное, на него есть warmup-persistent-level',
  'goods-sort.tsx': 'шаг зарядки поднимает склад того же уровня через loadLevel(lvl.level); прогресс сохраняется намеренно, там же свой гейт',
  'eye-gym.tsx': 'упражнение для глаз строится из eyeGymLevel(lvl.level), плейлист параметров не передаёт — доска шага и личной партии одна',
  'story-recall.tsx': 'длина текста и отвлечения считаются от lvl.level, плейлист их не задаёт — прохождение в зарядке значит то же, что в личной партии',
  'sudoku-fractal.tsx': 'доска генерируется из fractalLevel(lvl.level); в наборах зарядки игры сегодня нет вовсе, но правило то же — параметры из лестницы',
};

describe('подъём уровня в зарядке — разрешён поимённо', () => {
  const raisesInWarmup = (f: string) => callSites(read(f), 'lvl.reach(').some((s) => s.warm);

  it('есть что проверять — иначе тест зелен вслепую', () => {
    expect(FILES.filter(raisesInWarmup).length).toBeGreaterThan(0);
  });

  it('🔴 каждый поднимающий экран записан с причиной', () => {
    const silent = FILES.filter(raisesInWarmup)
      .filter((f) => !RAISES_IN_WARMUP[f])
      .map((f) => `${f}: поднимает уровень в зарядке и нигде не объяснён`);
    expect(silent).toEqual([]);
  });

  it('в списке нет экранов, которые уже не поднимают', () => {
    const stale = Object.keys(RAISES_IN_WARMUP)
      .filter((f) => FILES.includes(f) && !raisesInWarmup(f))
      .map((f) => `${f}: подъёма в зарядке больше нет — убрать из списка`);
    expect(stale).toEqual([]);
  });

  /**
   * 🔴 ПРИЧИНА ОБЯЗАНА БЫТЬ ПРАВДОЙ. «Играет ту же доску» значит, что уровень
   * берётся из лестницы. Экран, читающий уровень из плейлиста, оправдания не
   * получает — там «прошёл» означает не то же самое.
   */
  it('🔴 у каждого разрешённого уровень и правда берётся из лестницы', () => {
    const lying: string[] = [];
    for (const f of Object.keys(RAISES_IN_WARMUP)) {
      if (!FILES.includes(f)) continue;
      // ⚠️ `mask` затирает СОДЕРЖИМОЕ строк — искать в нём `num('level')` бесполезно,
      // совпадения не будет никогда. Проверено поломкой: подменил источник уровня на
      // плейлистовый, и проверка осталась зелёной. Для чтения параметра берём
      // исходник без комментариев, но со строками.
      const masked = mask(read(f));
      const withStrings = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      if (!/lvl\.level/.test(masked)) lying.push(`${f}: не читает lvl.level — доска не из лестницы`);
      if (/\b(num|str)\(\s*['"`]level['"`]/.test(withStrings)) {
        lying.push(`${f}: берёт уровень из плейлиста — «та же доска» неправда`);
      }
    }
    expect(lying).toEqual([]);
  });

  it('каждое объяснение написано, а не отписано', () => {
    for (const [f, why] of Object.entries(RAISES_IN_WARMUP)) {
      expect(`${f}: ${why.length > 60}`).toBe(`${f}: true`);
    }
  });
});

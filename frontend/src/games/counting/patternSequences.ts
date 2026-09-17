/* psygames-counting-pattern-sequences · VER 3 · 17.09.2026 */
/**
 * РЯДЫ «ПАТТЕРНОВ» — генератор вынесен из экрана `app/games/pattern.tsx` без изменения правил, чтобы
 * им пользовался и «Числовой забег» (станция «ряд на арках», схема counting-chat/SPEC_RUNNER_HUB_STATIONS.md).
 * Случайность — параметром: экран зовёт с `Math.random`, как было; раннер — с генератором своего зерна,
 * иначе уровень раннера не повторить по зерну. Порядок бросков в генераторах L1–14 прежний.
 * Лестницу сторожит `pattern-ladder.test.ts` (экран реэкспортирует pickSequence/makeSequence).
 *
 * VER 3 · 17.09.2026 — варианты ответа больше не выдают ответ своими числами: «ближе к среднему» угадывал
 *   73–85 % при случайных 25 %, теперь 22–27 % (`makeOptions`, проба в pattern-ladder.test.ts).
 *
 * VER 2 · 17.09.2026 — снят потолок L13 (правило Дениса «потолков нет нигде», задача e9c750f5):
 * · L15–22 — четыре новых класса, по полосе на каждый: умножь и прибавь · два действия по очереди ·
 *   два разных ряда через один · знак меняется каждый шаг;
 * · L23+ — смесь шести трудных классов: вид ряда уровень больше не называет, а числа растут с уровнем
 *   без предела (`mixScale`). Внутри смеси величина — мера трудности: класс уже не меняется, растёт счёт;
 * · заслон неоднозначности — разбор, а не список: ряд уходит игроку, только если самые проверенные его
 *   прочтения сходятся на ответе (`readings`, `fair`). Прежний список двух рядов оставлен.
 */
export type Rnd = () => number;

export interface Sequence { items: number[]; answer: number; classKey: string; ruleKey: string; ruleParams?: Record<string, string | number>; }

function shuffle<T>(arr: T[], rng: Rnd): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
const rnd = (rng: Rnd, n: number) => Math.floor(rng() * n);
// Действие для подсказки: «+ 3», «− 2», «× 2», «× (−3)» — знак в тексте, чтобы словарю хватило одного шаблона.
// Пробел неразрывный: на 360 подсказка переносилась между «×» и «3» (кадр 17.09.2026).
const plus = (v: number) => (v < 0 ? `−\u00A0${-v}` : `+\u00A0${v}`);
const times = (v: number) => (v < 0 ? `×\u00A0(−${-v})` : `×\u00A0${v}`);

// Масштаб s раздвигает диапазоны только в смеси (L23+); при s = 1 диапазоны и порядок бросков прежние.
function genArithmetic(rng: Rnd): Sequence {
  const start = 1 + rnd(rng, 9), step = 2 + rnd(rng, 6);
  return { items: [start, start+step, start+2*step, start+3*step], answer: start+4*step,
    classKey: 'patternClassArithmetic', ruleKey: 'patternRuleArithmetic', ruleParams: { n: step } };
}
function genGeometric(rng: Rnd): Sequence {
  const start = 2 + rnd(rng, 3), r = 2 + rnd(rng, 2);   // ×2..×3
  return { items: [start, start*r, start*r*r, start*r*r*r], answer: start*r*r*r*r,
    classKey: 'patternClassGeometric', ruleKey: 'patternRuleGeometric', ruleParams: { n: r } };
}
function genSquares(rng: Rnd): Sequence {
  const s = 1 + rnd(rng, 4);
  return { items: [s*s, (s+1)*(s+1), (s+2)*(s+2), (s+3)*(s+3)], answer: (s+4)*(s+4),
    classKey: 'patternClassSquares', ruleKey: 'patternRuleSquares', ruleParams: { a: s, b: s+1, c: s+2 } };
}
function genCubes(rng: Rnd): Sequence {
  const s = 1 + rnd(rng, 2);
  return { items: [s*s*s, (s+1)*(s+1)*(s+1), (s+2)*(s+2)*(s+2)], answer: (s+3)*(s+3)*(s+3),
    classKey: 'patternClassCubes', ruleKey: 'patternRuleCubes', ruleParams: { a: s, b: s+1 } };
}
function genFibonacci(rng: Rnd, s = 1): Sequence {
  let a = 1 + rnd(rng, 3 * s), b = a + 1 + rnd(rng, 2 * s);
  const all = [a, b]; for (let i=0;i<3;i++){ const c=a+b; all.push(c); a=b; b=c; }
  return { items: all.slice(0,4), answer: all[4],
    classKey: 'patternClassFibonacci', ruleKey: 'patternRuleFibonacci' };
}
function genGrowingDiff(rng: Rnd, s = 1): Sequence {
  const start = 1 + rnd(rng, 5 * s), baseStep = 1 + rnd(rng, 3 * s);
  const items = [start]; let d = baseStep;
  for (let i=0;i<3;i++){ items.push(items[items.length-1] + d); d++; }
  return { items, answer: items[3] + d,
    classKey: 'patternClassGrowingDiff', ruleKey: 'patternRuleGrowingDiff', ruleParams: { a: baseStep, b: baseStep+1 } };
}
function genLookAndSay(rng: Rnd): Sequence {
  const seqs = [1, 11, 21, 1211, 111221, 312211];   // однозначный ряд «посмотри и скажи»
  const i = rnd(rng, 2);
  return { items: seqs.slice(i, i+4), answer: seqs[i+4],
    classKey: 'patternClassLookSay', ruleKey: 'patternRuleLookSay' };
}
function genInterleaved(rng: Rnd): Sequence {
  const startO = 1 + rnd(rng, 4), a = 1 + rnd(rng, 3);     // нечётные позиции: +a
  const startE = 5 + rnd(rng, 5),  b = 5 + rnd(rng, 6);     // чётные позиции: +b
  // показываем O1,E1,O2,E2; ответ = O3 (следующая нечётная позиция)
  return { items: [startO, startE, startO+a, startE+b], answer: startO + 2*a,
    classKey: 'patternClassInterleaved', ruleKey: 'patternRuleInterleaved', ruleParams: { a, b } };
}
// L15: каждое число — предыдущее × k и ± b. Разности растут в k раз — по ним правило и находят.
function genLinear(rng: Rnd, s = 1): Sequence {
  const k = 2 + rnd(rng, 2), a0 = 1 + rnd(rng, 5 * s);
  const lo = Math.max(-3 * s, 1 - (k - 1) * a0), hi = 5 * s;   // (k−1)·a0 + b > 0: ряд растёт с первого шага
  let b = lo + rnd(rng, hi - lo + 1); if (b === 0) b = hi;
  const all = [a0]; for (let i = 0; i < 4; i++) all.push(k * all[i] + b);
  return { items: all.slice(0, 4), answer: all[4],
    classKey: 'patternClassLinear', ruleKey: 'patternRuleLinear', ruleParams: { a: k, b: plus(b) } };
}
// L17: «+ c» и «× m» по очереди. Пять чисел, а не четыре: по четырём 1, 4, 8, 11 правило «+3, ×2» (ответ 22)
// неотличимо от «+3, +4 по очереди» (ответ 15), и такой ряд заслон отбросил бы почти всегда.
function genTwoOps(rng: Rnd, s = 1): Sequence {
  const a0 = 1 + rnd(rng, 4 * s), c = 1 + rnd(rng, 8 * s), m = 2 + rnd(rng, 2), mulFirst = rnd(rng, 2) === 1;
  const all = [a0]; for (let i = 0; i < 5; i++) all.push((i % 2 === 0) !== mulFirst ? all[i] + c : all[i] * m);
  const add = plus(c), mul = times(m);
  return { items: all.slice(0, 5), answer: all[5], classKey: 'patternClassTwoOps', ruleKey: 'patternRuleTwoOps',
    ruleParams: mulFirst ? { a: mul, b: add } : { a: add, b: mul } };
}
// L19: места 1,3,5… — один ряд, места 2,4,6… — другой, и правила у них разные. По три числа на половину:
// двух мало, чтобы отличить «+ 3» от «× 2» (3, 6 → 9 или 12).
type Half = { kind: 'add' | 'mul'; start: number; step: number };
function half(rng: Rnd, kind: Half['kind'], s: number): Half {
  return kind === 'add' ? { kind, start: 1 + rnd(rng, 9 * s), step: 2 + rnd(rng, 8 * s) }
    : { kind, start: 1 + rnd(rng, 4 * s), step: 2 + rnd(rng, 2) };
}
const term = (h: Half, i: number) => (h.kind === 'add' ? h.start + i * h.step : h.start * h.step ** i);
function genInterMixed(rng: Rnd, kinds: [Half['kind'], Half['kind']], s = 1): Sequence {
  const odd = half(rng, kinds[0], s), even = half(rng, kinds[1], s);
  const items = [0, 1, 2].flatMap((i) => [term(odd, i), term(even, i)]), answer = term(odd, 3);
  if (odd.kind === 'add' && even.kind === 'add') return { items, answer,
    classKey: 'patternClassInterleaved', ruleKey: 'patternRuleInterleaved', ruleParams: { a: odd.step, b: even.step } };
  const op = (h: Half) => (h.kind === 'add' ? plus(h.step) : times(h.step));
  return { items, answer, classKey: 'patternClassInterMixed', ruleKey: 'patternRuleInterMixed', ruleParams: { a: op(odd), b: op(even) } };
}
// L21: предыдущее × (−k) ± b. При |b| < (k−1)·a0 знак меняется на каждом шаге, а модуль растёт — ряд не вырождается.
function genSignFlip(rng: Rnd, s = 1): Sequence {
  const k = 2 + rnd(rng, 2), a0 = 2 + rnd(rng, 6 * s), room = Math.min(4 * s, (k - 1) * a0 - 1);
  let b = -room + rnd(rng, 2 * room + 1); if (b === 0) b = room;
  const all = [a0]; for (let i = 0; i < 4; i++) all.push(-k * all[i] + b);
  return { items: all.slice(0, 4), answer: all[4],
    classKey: 'patternClassSignFlip', ruleKey: 'patternRuleLinear', ruleParams: { a: `(−${k})`, b: plus(b) } };
}

/**
 * ПРОЧТЕНИЯ РЯДА — какие правила объясняют показанные числа и какой ответ даёт каждое.
 *
 * Запас прочтения (`surplus`) — сколько показанных чисел сверх его свободных: столько чисел правило ПРОВЕРЯЮТ.
 * Запас 0 — правило ничего не доказывает: четыре числа объясняет ЛЮБАЯ пара переплетённых арифметических рядов
 * (четыре свободных числа), такие прочтения в список не попадают. Отсюда же длина рядов новых классов.
 * Список правил шире классов игры: человек видит в ряду и «шаги +3, +4 по очереди», и простые числа,
 * которых генератор не выдаёт, — ряд, который так читается с другим ответом, игроку несправедлив.
 */
export interface Reading { rule: string; surplus: number; answer: number }
type Reader = { rule: string; free: number; read: (x: number[]) => number | null };

const whole = (v: number) => Number.isSafeInteger(v);
const all = (n: number, ok: (i: number) => boolean) => { for (let i = 0; i < n; i++) if (!ok(i)) return false; return true; };
const steps = (x: number[]) => x.slice(1).map((v, i) => v - x[i]);

function arith(x: number[]): number | null {
  const d = x[1] - x[0];
  return all(x.length - 1, (i) => x[i + 1] - x[i] === d) ? x[x.length - 1] + d : null;
}
function geom(x: number[]): number | null {
  if (x[0] === 0 || x[1] === 0 || !all(x.length - 1, (i) => x[i + 1] * x[0] === x[i] * x[1])) return null;
  const next = (x[x.length - 1] * x[1]) / x[0];
  return whole(next) ? next : null;
}
function power(x: number[], e: number): number | null {
  if (e === 2 && x[0] < 0) return null;
  const s = Math.round(e === 2 ? Math.sqrt(x[0]) : Math.cbrt(x[0]));
  return all(x.length, (i) => (s + i) ** e === x[i]) ? (s + x.length) ** e : null;
}
function sayAloud(v: number): number | null {
  if (!whole(v) || v <= 0) return null;
  const s = String(v); let out = '';
  for (let i = 0; i < s.length;) { let j = i; while (j < s.length && s[j] === s[i]) j++; out += String(j - i) + s[i]; i = j; }
  return out.length > 15 ? null : Number(out);
}
const PRIMES = (() => { const p: number[] = []; for (let v = 2; p.length < 300; v++) if (p.every((q) => v % q !== 0)) p.push(v); return p; })();
function interleavedReadings(x: number[]): number[] {
  const halves = [x.filter((_, i) => i % 2 === 0), x.filter((_, i) => i % 2 === 1)];
  if (!halves.every((h) => h.length >= 3)) return [];               // у половины из двух чисел правило не проверить
  const own = halves[x.length % 2], other = halves[1 - (x.length % 2)];
  if (arith(other) === null && geom(other) === null) return [];
  return [arith(own), geom(own)].filter((v): v is number => v !== null);
}
function twoOps(x: number[], mulFirst: boolean): number | null {
  const addAt = mulFirst ? 1 : 0, mulAt = 1 - addAt;
  if (x[mulAt] === 0) return null;
  const c = x[addAt + 1] - x[addAt], m = x[mulAt + 1] / x[mulAt];
  if (!whole(m)) return null;
  const step = (v: number, i: number) => (i % 2 === addAt ? v + c : v * m);
  return all(x.length - 1, (i) => x[i + 1] === step(x[i], i)) ? step(x[x.length - 1], x.length - 1) : null;
}
const READERS: Reader[] = [
  { rule: 'arithmetic', free: 2, read: arith },
  { rule: 'geometric', free: 2, read: geom },
  { rule: 'squares', free: 1, read: (x) => power(x, 2) },
  { rule: 'cubes', free: 1, read: (x) => power(x, 3) },
  { rule: 'primes', free: 1, read: (x) => {
    const i = PRIMES.indexOf(x[0]);
    return i >= 0 && i + x.length < PRIMES.length && all(x.length, (j) => PRIMES[i + j] === x[j]) ? PRIMES[i + x.length] : null;
  } },
  { rule: 'look-say', free: 1, read: (x) => (all(x.length - 1, (i) => sayAloud(x[i]) === x[i + 1]) ? sayAloud(x[x.length - 1]) : null) },
  { rule: 'fibonacci', free: 2, read: (x) => (all(x.length - 2, (i) => x[i + 2] === x[i + 1] + x[i]) ? x[x.length - 1] + x[x.length - 2] : null) },
  { rule: 'growing-mul', free: 2, read: (x) => {
    if (x[0] === 0 || !whole(x[1] / x[0])) return null;
    const m = x[1] / x[0];
    return all(x.length - 1, (i) => x[i + 1] === x[i] * (m + i)) ? x[x.length - 1] * (m + x.length - 1) : null;
  } },
  { rule: 'growing-by-one', free: 2, read: (x) => { const d = steps(x); return all(d.length - 1, (i) => d[i + 1] - d[i] === 1) ? x[x.length - 1] + d[d.length - 1] + 1 : null; } },
  { rule: 'second-difference', free: 3, read: (x) => { const d = steps(x); return arith(d) === null ? null : x[x.length - 1] + (arith(d) as number); } },
  { rule: 'linear', free: 3, read: (x) => {
    if (x[1] === x[0]) return null;
    const k = (x[2] - x[1]) / (x[1] - x[0]), b = x[1] - k * x[0];
    return whole(k) && all(x.length - 1, (i) => x[i + 1] === k * x[i] + b) ? k * x[x.length - 1] + b : null;
  } },
  { rule: 'alternating-steps', free: 3, read: (x) => { const d = steps(x); return all(d.length, (i) => d[i] === d[i % 2]) ? x[x.length - 1] + d[(x.length - 1) % 2] : null; } },
  { rule: 'alternating-ratios', free: 3, read: (x) => {
    if (x[0] === 0 || x[1] === 0) return null;
    const r = [x[1] / x[0], x[2] / x[1]];
    return r.every(whole) && all(x.length - 1, (i) => x[i + 1] === x[i] * r[i % 2]) ? x[x.length - 1] * r[(x.length - 1) % 2] : null;
  } },
  { rule: 'add-then-mul', free: 3, read: (x) => twoOps(x, false) },
  { rule: 'mul-then-add', free: 3, read: (x) => twoOps(x, true) },
];

export function readings(items: number[]): Reading[] {
  const out: Reading[] = [];
  for (const r of READERS) {
    if (items.length <= r.free || items.length < 3) continue;
    const answer = r.read(items);
    if (answer !== null && whole(answer)) out.push({ rule: r.rule, surplus: items.length - r.free, answer });
  }
  for (const answer of interleavedReadings(items)) out.push({ rule: 'interleaved', surplus: items.length - 4, answer });
  return out;
}

/**
 * ЧЕСТЕН ЛИ РЯД. Самые проверенные прочтения (наибольший запас) обязаны сходиться на ответе ряда: 2, 4, 8, 16
 * читается и как «× 2» (запас 2, ответ 32), и как «× 2, + 4 по очереди» (запас 1, ответ 20) — второе слабее,
 * ряд честный. 2, 3, 5, 8 — «сумма двух» и «разность растёт на 1», у обоих запас 2 и ответы 13 и 12 — нечестный.
 * `proof: false` — полоса, чей ряд числами не подтверждается (L13–14): там нечестно любое прочтение с другим ответом.
 */
export function fair(seq: Sequence, proof = true): boolean {
  const r = readings(seq.items);
  if (!proof) return r.every((x) => x.answer === seq.answer);
  const best = Math.max(...r.map((x) => x.surplus));
  const top = r.filter((x) => x.surplus === best);
  return top.length > 0 && top.every((x) => x.answer === seq.answer);
}

/**
 * Уровень → класс прогрессии (труднота растёт; БЕЗ лимита времени).
 *
 * ⚠️ ЭКСПОРТИРОВАНО ДЛЯ ГЕЙТА `pattern-ladder` (16.09.2026). Лестница у этой игры
 * задаётся КЛАССОМ ряда, а не числом, поэтому проверять её можно только прогоном
 * генератора — чтение полос глазами не скажет, что на самом деле выпадает игроку.
 * Тот же приём у соседей: `levelParams` у счётчика, `generateScene` у отличий.
 *
 * `label` — строка под уровнем на экране настройки; `proof: false` — у полосы, чей ряд показанными числами
 * не подтверждается (четыре числа двух переплетённых рядов, см. `readings`): там класс называет сам уровень.
 */
const BANDS: { upTo: number; label: string; proof: boolean; gen: (rng: Rnd) => Sequence }[] = [
  { upTo: 2, label: 'patternClassArithmetic', proof: true, gen: genArithmetic },
  { upTo: 4, label: 'patternClassGeometric', proof: true, gen: genGeometric },
  { upTo: 6, label: 'patternClassSquaresCubes', proof: true, gen: (rng) => (rnd(rng, 2) ? genSquares(rng) : genCubes(rng)) },
  { upTo: 8, label: 'patternClassFibonacci', proof: true, gen: (rng) => genFibonacci(rng) },
  { upTo: 10, label: 'patternClassGrowingDiff', proof: true, gen: (rng) => genGrowingDiff(rng) },
  { upTo: 12, label: 'patternClassLookSayHint', proof: true, gen: genLookAndSay },
  { upTo: 14, label: 'patternClassInterleaved', proof: false, gen: genInterleaved },
  { upTo: 16, label: 'patternClassLinear', proof: true, gen: (rng) => genLinear(rng) },
  { upTo: 18, label: 'patternClassTwoOps', proof: true, gen: (rng) => genTwoOps(rng) },
  { upTo: 20, label: 'patternClassInterMixed', proof: true, gen: (rng) => genInterMixed(rng, rnd(rng, 2) ? ['add', 'mul'] : ['mul', 'add']) },
  { upTo: 22, label: 'patternClassSignFlip', proof: true, gen: (rng) => genSignFlip(rng) },
];
/** С этого уровня — смесь трудных классов: какой выпадет, уровень не говорит. */
export const MIX_FROM = BANDS[BANDS.length - 1].upTo + 1;
const MIX: ((rng: Rnd, s: number) => Sequence)[] = [
  genFibonacci, genGrowingDiff, genLinear, genTwoOps, genSignFlip,
  (rng, s) => genInterMixed(rng, [rnd(rng, 2) ? 'add' : 'mul', rnd(rng, 2) ? 'add' : 'mul'], s),
];
/** Масштаб чисел смеси: растёт на единицу каждые два уровня и не упирается ни во что. */
export const mixScale = (level: number) => (level < MIX_FROM ? 1 : 1 + Math.floor((level - MIX_FROM) / 2));

export function pickSequence(level: number, rng: Rnd = Math.random): Sequence {
  const band = BANDS.find((b) => level <= b.upTo);
  return band ? band.gen(rng) : MIX[rnd(rng, MIX.length)](rng, mixScale(level));
}
export const levelLabelKey = (level: number) => BANDS.find((b) => level <= b.upTo)?.label ?? 'patternClassMixed';

// v1.112.0: полный перебор пространств ВСЕХ генераторов (449 рядов) нашёл ровно 2
// неоднозначных префикса — валидны два правила с РАЗНЫМИ ответами:
// [2,3,5,8] → Фибоначчи 13 vs растущая разность 12; [4,5,7,10] → 14 vs 10.
// VER 2: общий заслон — `fair`: первый ряд он ловит сам, второй — нет (там второе правило — четыре
// свободных числа переплетённых рядов, числами не подтверждено), поэтому список оставлен как был.
const AMBIGUOUS_ITEMS = new Set(['2,3,5,8', '4,5,7,10']);
export function makeSequence(level: number, rng: Rnd = Math.random): Sequence {
  const proof = BANDS.find((b) => level <= b.upTo)?.proof ?? true;
  for (let guard = 0; guard < 50; guard++) {
    const s = pickSequence(level, rng);
    if (!AMBIGUOUS_ITEMS.has(s.items.join(',')) && fair(s, proof)) return s;
  }
  return genArithmetic(rng);   // практически недостижимо
}

/**
 * ВАРИАНТЫ ОТВЕТА (VER 3). 🔴 По одним числам вариантов, не глядя на ряд, ответ не угадать: места равноправны.
 * До VER 3 неверные ставились вокруг ответа, выше или ниже с равной вероятностью, и ответ почти всегда
 * оказывался посередине. Замер 17.09.2026 по 3000 рядов на уровень, L1–43: «бери вариант, ближайший к
 * среднему» угадывал 73–85 % при случайных 25 %.
 * ⚠️ Мало сделать место ответа по величине равновероятным. Когда промежутки считались от ответа, на внутреннем
 * месте он оставался ближе всех к середине размаха (83–100 %). Отбраковка таких наборов переносила ответ на
 * край, и тогда крайние угадывали 33–39 %.
 * Как теперь: промежутки между соседними вариантами берутся независимо и одинаково (1 или 2 шага `unit`;
 * шаг чётный, поэтому чётность вариантов ничего не отсекает), ответ ставится на случайное место, и лесенка
 * сдвигается к нему.
 * ⚠️ Прикидки, которые смотрят на ряд, этим не лечатся. «Последний + последний шаг» на смеси L23+ угадывает
 * 42–44 % (на VER 2 было 26–31 %). Лечит приманка у значения хвоста — следующий шаг. Приманки, подставленные
 * на место неверного в пределах полушага, пробовались: 0–3 пункта, а ближняя давала с ответом тесную пару.
 * Было ещё `candidate > -1000`: при ответе ниже −1176 оно отбрасывало ВСЕ кандидаты, и цикл не кончался.
 */
export function makeOptions(answer: number, count = 4, rng: Rnd = Math.random): number[] {
  const unit = 2 * Math.max(1, Math.round(Math.abs(answer) * 0.075));
  const place = rnd(rng, count);
  const at = [0];
  for (let i = 1; i < count; i++) at.push(at[i - 1] + unit * (1 + rnd(rng, 2)));
  return shuffle(at.map((x) => answer + x - at[place]), rng);
}

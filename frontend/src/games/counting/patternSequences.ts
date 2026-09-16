/* psygames-pattern-sequences · VER 1 · 16.09.2026 */
/**
 * РЯДЫ «ПАТТЕРНОВ» — генератор вынесен из экрана `app/games/pattern.tsx` без изменения правил, чтобы
 * им пользовался и «Числовой забег» (станция «ряд на арках», схема counting-chat/SPEC_RUNNER_HUB_STATIONS.md).
 * Случайность — параметром: экран зовёт с `Math.random`, как было; раннер — с генератором своего зерна,
 * иначе уровень раннера не повторить по зерну. Порядок бросков в каждом генераторе прежний.
 * Лестницу по-прежнему сторожит `pattern-ladder.test.ts` (экран реэкспортирует pickSequence/makeSequence).
 */
export type Rnd = () => number;

export interface Sequence { items: number[]; answer: number; classKey: string; ruleKey: string; ruleParams?: Record<string, string | number>; }

function shuffle<T>(arr: T[], rng: Rnd): T[] { const a=[...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
const rnd = (rng: Rnd, n: number) => Math.floor(rng() * n);

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
function genFibonacci(rng: Rnd): Sequence {
  let a = 1 + rnd(rng, 3), b = a + 1 + rnd(rng, 2);
  const all = [a, b]; for (let i=0;i<3;i++){ const c=a+b; all.push(c); a=b; b=c; }
  return { items: all.slice(0,4), answer: all[4],
    classKey: 'patternClassFibonacci', ruleKey: 'patternRuleFibonacci' };
}
function genGrowingDiff(rng: Rnd): Sequence {
  const start = 1 + rnd(rng, 5), baseStep = 1 + rnd(rng, 3);
  const items = [start]; let s = baseStep;
  for (let i=0;i<3;i++){ items.push(items[items.length-1] + s); s++; }
  return { items, answer: items[3] + s,
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

/**
 * Уровень → класс прогрессии (труднота растёт; БЕЗ лимита времени).
 *
 * ⚠️ ЭКСПОРТИРОВАНО ДЛЯ ГЕЙТА `pattern-ladder` (16.09.2026). Лестница у этой игры
 * задаётся КЛАССОМ ряда, а не числом, поэтому проверять её можно только прогоном
 * генератора — чтение полос глазами не скажет, что на самом деле выпадает игроку.
 * Тот же приём у соседей: `levelParams` у счётчика, `generateScene` у отличий.
 */
export function pickSequence(level: number, rng: Rnd = Math.random): Sequence {
  if (level <= 2)  return genArithmetic(rng);
  if (level <= 4)  return genGeometric(rng);
  if (level <= 6)  return rnd(rng, 2) ? genSquares(rng) : genCubes(rng);
  if (level <= 8)  return genFibonacci(rng);
  if (level <= 10) return genGrowingDiff(rng);
  if (level <= 12) return genLookAndSay(rng);
  return genInterleaved(rng);
}

// v1.112.0: полный перебор пространств ВСЕХ генераторов (449 рядов) нашёл ровно 2
// неоднозначных префикса — валидны два правила с РАЗНЫМИ ответами:
// [2,3,5,8] → Фибоначчи 13 vs растущая разность 12; [4,5,7,10] → 14 vs 10.
// Такие ряды перегенерируем (иначе честный игрок получает несправедливую ошибку).
// При изменении диапазонов генераторов пересчитать блэклист (скрипт в notes задачи БД).
const AMBIGUOUS_ITEMS = new Set(['2,3,5,8', '4,5,7,10']);
export function makeSequence(level: number, rng: Rnd = Math.random): Sequence {
  for (let guard = 0; guard < 10; guard++) {
    const s = pickSequence(level, rng);
    if (!AMBIGUOUS_ITEMS.has(s.items.join(','))) return s;
  }
  return genArithmetic(rng);   // практически недостижимо
}

export function makeOptions(answer: number, count = 4, rng: Rnd = Math.random): number[] {
  const opts = new Set<number>([answer]);
  while (opts.size < count) {
    const delta = Math.max(1, Math.round(Math.abs(answer) * 0.15)) + Math.floor(rng() * 5) + 1;
    const sign = rng() < 0.5 ? -1 : 1;
    const candidate = answer + sign * delta;
    if (candidate !== answer && candidate > -1000) opts.add(candidate);
  }
  return shuffle(Array.from(opts), rng);
}

/* psygames-counting-math-sprint-core · VER 1 · 07.09.2026 */
/**
 * Ядро «Спринта» — лестница v2 по ШКОЛЬНОЙ ОСИ (задана Денисом 07.09.2026,
 * counting-chat/PROJECT_REF §R; образец — слайдер v2). Вынесено из экрана
 * app/games/math-sprint.tsx, чтобы замер (counting-chat/sim-sprint.mjs) и
 * гейты читали ТОТ ЖЕ код, а не порт.
 *
 * ЧЕМ БЫЛА ПЛОХА v1 (замер 07.09, sim-sprint VER 1, N=4000/уровень): операции
 * замирали на L5, дальше рос только «range» чисел — фактическая трудность
 * кончалась на L8, L9–L30 — сплошные клоны (работа 2,5→2,7, +8% за 22 уровня).
 *
 * v2: 8 полос по 4 уровня, тема чистая на полосу (ввод ответа — ЦЕЛЫМ числом):
 *   B1 L1–4   сложение/вычитание (размер и переносы растут с t)
 *   B2 L5–8   умножение: таблица → двузначное × однозначное
 *   B3 L9–12  деление нацело
 *   B4 L13–16 цепочки a×b±c (двухшаговые)
 *   B5 L17–20 квадраты n²
 *   B6 L21–24 целые корни √(k²)
 *   B7 L25–28 уравнения ax+b=c → ввести x
 *   B8 L29+   микс высших тем (цепочки/квадраты/корни/уравнения), рост дальше
 * Внутри полосы позиция t = 0…1 масштабирует числа. Приёмка симом: клонов
 * (|Δработы|<5%) нет, обрывов >×1,5 нет в зоне L1–28.
 */

export type SprintKind =
  | 'plus-minus'
  | 'mult'
  | 'div'
  | 'chain'
  | 'square'
  | 'root'
  | 'equation'
  | 'mix';

export interface SprintProblem {
  display: string;    // полный текст вопроса, включая «= ?»
  answer: number;     // ответ вводится целым числом
  kind: SprintKind;
}

/** Последний уровень, который лестница ОБЕЩАЕТ (карте — maxLevel). Выше — открытый хвост микса. */
export const SPRINT_MAX_LEVEL = 32;

const BAND_SIZE = 4;

/** Тема уровня (детерминированно — для гейта level-rule-threshold и карточек правил). */
export function sprintBandFor(level: number): SprintKind {
  const L = Math.max(1, Math.floor(level));
  const band = Math.floor((L - 1) / BAND_SIZE);
  return (['plus-minus', 'mult', 'div', 'chain', 'square', 'root', 'equation'] as const)[band] ?? 'mix';
}

/** Позиция уровня в полосе 0…1; в хвосте B8 t растёт БЕЗ КЛАМПА (§R, 07.09:
 * min(1,…) делал все уровни за L36 клонами — числа бесконечны, семейства
 * линейны по t, ось открыта). */
function bandT(level: number): number {
  const L = Math.max(1, Math.floor(level));
  if (L > 7 * BAND_SIZE) return (L - 7 * BAND_SIZE) / (2 * BAND_SIZE);
  return ((L - 1) % BAND_SIZE) / (BAND_SIZE - 1);
}

type Rnd = () => number;
const int = (rnd: Rnd, min: number, max: number) => min + Math.floor(rnd() * Math.max(1, max - min + 1));

function plusMinus(rnd: Rnd, t: number): SprintProblem {
  const range = Math.round(12 + t * 90);
  let a = int(rnd, 5, range);
  let b = int(rnd, Math.round(1 + t * range * 0.6), range);   // с ростом t операнды ближе — переносы чаще
  const op = rnd() < 0.5 ? '+' : '-';
  if (op === '-' && b > a) { [a, b] = [b, a]; }
  // Школьная вторая ступень полосы: ТРИ слагаемых, доля растёт с t
  if (rnd() < t * 0.8) {
    const c = int(rnd, 4, Math.round(9 + t * 30));
    if (op === '+') return { display: `${a} + ${b} + ${c} = ?`, answer: a + b + c, kind: 'plus-minus' };
    return { display: `${a} − ${b} + ${c} = ?`, answer: a - b + c, kind: 'plus-minus' };
  }
  return { display: `${a} ${op} ${b} = ?`, answer: op === '+' ? a + b : a - b, kind: 'plus-minus' };
}

function mult(rnd: Rnd, t: number): SprintProblem {
  const a = int(rnd, Math.round(3 + t * 4), Math.round(7 + t * 12));   // 7 → 19: таблица → двузначное
  const b = int(rnd, 2, Math.round(5 + t * 5));
  return { display: `${a} × ${b} = ?`, answer: a * b, kind: 'mult' };
}

function div(rnd: Rnd, t: number): SprintProblem {
  const b = int(rnd, 2, Math.round(4 + t * 7));
  const q = int(rnd, Math.round(3 + t * 3), Math.round(6 + t * 14));
  return { display: `${b * q} ÷ ${b} = ?`, answer: q, kind: 'div' };
}

function chain(rnd: Rnd, t: number): SprintProblem {
  const a = int(rnd, Math.round(3 + t * 3), Math.round(6 + t * 10));
  const b = int(rnd, 2, Math.round(4 + t * 8));
  const c = int(rnd, Math.round(3 + t * 25), Math.round(10 + t * 70));
  const plus = rnd() < 0.5;
  const answer = plus ? a * b + c : a * b - c;
  // Вычитание не должно уводить в минус: спринт вводится цифрами, минус — лишний символ на скорости
  if (!plus && answer < 0) return { display: `${a} × ${b} + ${c} = ?`, answer: a * b + c, kind: 'chain' };
  return { display: `${a} × ${b} ${plus ? '+' : '−'} ${c} = ?`, answer, kind: 'chain' };
}

function square(rnd: Rnd, t: number): SprintProblem {
  const n = int(rnd, Math.round(4 + t * 8), Math.round(10 + t * 9));   // 4..10 → 12..19: нетабличные входят плавно
  return { display: `${n}² = ?`, answer: n * n, kind: 'square' };
}

function root(rnd: Rnd, t: number): SprintProblem {
  const k = int(rnd, Math.round(3 + t * 4), Math.round(9 + t * 11));   // √9..√81 → √49..√400
  return { display: `√${k * k} = ?`, answer: k, kind: 'root' };
}

function equation(rnd: Rnd, t: number): SprintProblem {
  const x = int(rnd, Math.round(3 + t * 4), Math.round(9 + t * 20));
  const a = int(rnd, 2, Math.round(3 + t * 6));
  const b = int(rnd, 1, Math.round(9 + t * 55));
  const plus = rnd() < 0.5;
  const c = plus ? a * x + b : a * x - b;
  // c < 0 на скорости путает — пересобираем со знаком «+»
  if (c < 0) return { display: `${a}x + ${b} = ${a * x + b},  x = ?`, answer: x, kind: 'equation' };
  return { display: `${a}x ${plus ? '+' : '−'} ${b} = ${c},  x = ?`, answer: x, kind: 'equation' };
}

const MIX: readonly ((rnd: Rnd, t: number) => SprintProblem)[] = [chain, square, root, equation];

/**
 * Задача уровня. rnd — инъекция для детерминированных замеров/проб
 * (экран зовёт без аргумента — Math.random, как раньше).
 */
export function generateSprintProblem(level: number, rnd: Rnd = Math.random): SprintProblem {
  const kind = sprintBandFor(level);
  const t = bandT(level);
  switch (kind) {
    case 'plus-minus': return plusMinus(rnd, t);
    case 'mult': return mult(rnd, t);
    case 'div': return div(rnd, t);
    case 'chain': return chain(rnd, t);
    case 'square': return square(rnd, t);
    case 'root': return root(rnd, t);
    case 'equation': return equation(rnd, t);
    default: return MIX[Math.floor(rnd() * MIX.length)](rnd, t);
  }
}

/**
 * МИГРАЦИЯ прогресса лестницы v1 (операции замирали на L5, «рост числами») в v2 —
 * по семейству, на котором игрок реально стоял: v1 L1–2 (+−) → B1; L3–4 (+−×) →
 * умножение; L5–8 (появилось ÷) → деление; L9+ (замеренные клоны) → старт цепочек:
 * для них это первый настоящий рост с L8.
 */
export function migrateSprintLevelV1toV2(oldLevel: number): number {
  const L = Math.max(1, Math.floor(oldLevel));
  if (L <= 2) return L;              // сложение/вычитание
  if (L <= 4) return 2 + L;          // 3→5, 4→6 — умножение
  if (L <= 8) return 4 + L;          // 5→9 … 8→12 — деление
  return 13;                         // клоны v1 → цепочки
}

/* psygames-math-slider-work · VER 1 · 07.09.2026 */
/**
 * МОДЕЛЬ РАБОТЫ вопроса шкалы — сколько умственного труда стоит ОЦЕНИТЬ ответ.
 * Единый источник: её читают генератор (поле difficulty → окно времени в
 * scoring.ts), гейты (__tests__/math-slider-bands) и замер
 * (counting-chat/sim-slider.mjs). Перенесена из sim-slider VER 2 1:1 —
 * калибровка лестницы v2 (13 полос, 0 клонов) сделана этой же моделью.
 *
 * Слагаемые (абсолюты не обещает — только отношения между вопросами):
 *  1) Стоимость выражения по дереву: ± 1+0,5·переносы (+0,6 переворот знака) ·
 *     × разряды×разряды (квадраты ≤12 и кубы ≤5 — табличные факты) ·
 *     десятичные +0,5 за точку · проценты по карте удобности · пропорция —
 *     кратность+умножение · уравнение — вычитание+деление · корень — оценка разрядов.
 *  2) Скидка за просторный допуск (зачёт = 10% ширины шкалы, scoring.outsideTarget):
 *     чем шире допуск относительно ответа, тем грубее можно прикидывать.
 *  3) Шкала: интерполяция между делениями (ответ не на риске — дороже).
 */
import type { MathExpression, MathSliderQuestion } from './types';

const digits = (v: number): number => Math.max(1, String(Math.abs(Math.round(v))).length);

const carries = (a: number, b: number): number => {
  let c = 0;
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (x > 0 || y > 0) {
    if ((x % 10) + (y % 10) >= 10) c++;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }
  return c;
};

/** Карта удобности процентов: 50% дешевле 12,5% независимо от величины базы. */
const PCT: Record<string, number> = {
  '50': 1, '25': 2, '10': 1, '5': 2, '20': 2, '30': 2.5, '40': 2.5, '75': 3, '15': 3, '12.5': 4,
};

interface CostVal { cost: number; val: number }

function exprCost(e: MathExpression): CostVal {
  switch (e.type) {
    case 'literal':
      return { cost: 0, val: e.value };
    case 'binary': {
      const L = exprCost(e.left);
      const R = exprCost(e.right);
      const dec = (Number.isInteger(L.val) ? 0 : 0.5) + (Number.isInteger(R.val) ? 0 : 0.5);
      if (e.operator === '+' || e.operator === '-') {
        const val = e.operator === '+' ? L.val + R.val : L.val - R.val;
        const signFlip = e.operator === '-' && val < 0 ? 0.6 : 0;
        return { cost: L.cost + R.cost + 1 + 0.5 * carries(L.val, R.val) + dec + signFlip, val };
      }
      if (e.operator === '*') {
        return { cost: L.cost + R.cost + digits(L.val) * digits(R.val) + dec, val: L.val * R.val };
      }
      return { cost: L.cost + R.cost + 1.5 * digits(L.val) * digits(R.val) + dec, val: L.val / R.val };
    }
    case 'power': {
      const B = exprCost(e.base);
      if (e.exponent === 2 && Number.isInteger(B.val) && Math.abs(B.val) <= 12) {
        return { cost: B.cost + 1.2, val: B.val * B.val };
      }
      if (e.exponent === 3 && Number.isInteger(B.val) && Math.abs(B.val) <= 5) {
        return { cost: B.cost + 1.6, val: B.val ** 3 };
      }
      let cost = B.cost;
      let cur = B.val;
      for (let i = 1; i < e.exponent; i++) {
        cost += digits(cur) * digits(B.val);
        cur *= B.val;
      }
      return { cost, val: cur };
    }
    case 'linear-equation': {
      const diff = e.c - e.b;
      return { cost: 1 + 0.5 * carries(e.c, -e.b) + 1.5 * digits(diff) * digits(e.a), val: diff / e.a };
    }
    case 'quad-equation': {
      // Линейная часть (перенести b, поделить на a) + оценка корня из результата
      const s = (e.c - e.b) / e.a;
      const r = Math.sqrt(s);
      return {
        cost: 1 + 0.5 * carries(e.c, -e.b) + 1.5 * digits(s) * digits(e.a) + 2 + 1.5 * digits(Math.round(r)),
        val: r,
      };
    }
    case 'root-estimation': {
      const r = Math.sqrt(e.value);
      return { cost: 2 + 1.5 * digits(Math.round(r)), val: r };
    }
    case 'percent-of':
      return { cost: PCT[String(e.percent)] ?? 3, val: (e.base * e.percent) / 100 };
    case 'discount': {
      const part = (e.price * e.percent) / 100;
      return { cost: (PCT[String(e.percent)] ?? 3) + 1 + 0.5 * carries(e.price, part), val: e.price - part };
    }
    case 'proportion': {
      const mult = e.rightDenominator / e.leftDenominator;
      return { cost: 2 + digits(e.leftNumerator) * digits(mult), val: e.leftNumerator * mult };
    }
    default:
      return { cost: 3, val: 0 };
  }
}

/** Чистая стоимость выражения (без шкалы и допуска). */
export function expressionWork(expression: MathExpression): number {
  return exprCost(expression).cost;
}

interface ScaleShape { min: number; width: number; majorStep: number }

/**
 * Работа вопроса из частей — зовёт генератор в момент сборки вопроса
 * (полного объекта ещё нет).
 */
export function questionWorkParts(expression: MathExpression, answer: number, scale: ScaleShape): number {
  const cost = expressionWork(expression);
  const tol = (0.1 * scale.width) / Math.max(Math.abs(answer), 1);
  const precisionFactor = Math.min(1, Math.max(0.4, 0.35 / tol));
  const pos = (answer - scale.min) / scale.majorStep;
  const interp = Math.abs(pos - Math.round(pos));
  return cost * precisionFactor + 0.5 + 2 * interp;
}

/** Работа готового вопроса — для сима и гейтов. */
export function questionWork(q: MathSliderQuestion): number {
  return questionWorkParts(q.expression, q.answer, q.scale);
}

/**
 * Норма для difficulty 0..1: работа, за которой вопрос считается «максимально
 * трудным» (окно времени в scoring перестаёт расти). Калибровка 07.09.2026
 * по ХВОСТУ v3 (B13 — квадратные уравнения, sim-slider: медиана работы
 * L52 ≈ 11,8): норма 12 — верх обещанной лестницы упирается в d≈0,95–1,0,
 * а НИЖЕ клампа уровни различимы (при норме 8 весь хвост слипался в d=1).
 */
export const WORK_NORM = 12;

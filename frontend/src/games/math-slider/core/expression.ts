/* psygames-math-slider-expression · VER 4 · 07.09.2026 */
import type { MathExpression, MathSliderLocale } from './types';

const EPSILON = 1e-9;

export function roundNumber(value: number, digits = 8): number {
  const factor = 10 ** digits;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return Math.abs(rounded) < EPSILON ? 0 : rounded;
}

export function evaluateExpression(expression: MathExpression): number {
  switch (expression.type) {
    case 'literal':
      return expression.value;
    case 'binary': {
      const left = evaluateExpression(expression.left);
      const right = evaluateExpression(expression.right);
      switch (expression.operator) {
        case '+': return roundNumber(left + right);
        case '-': return roundNumber(left - right);
        case '*': return roundNumber(left * right);
        case '/':
          if (Math.abs(right) < EPSILON) throw new RangeError('Division by zero');
          return roundNumber(left / right);
      }
    }
    case 'power': {
      const base = evaluateExpression(expression.base);
      return roundNumber(base ** expression.exponent);
    }
    case 'linear-equation':
      return roundNumber((expression.c - expression.b) / expression.a);
    case 'quad-equation':
      return roundNumber(Math.sqrt((expression.c - expression.b) / expression.a));
    case 'root-estimation':
      return roundNumber(Math.sqrt(expression.value));
    case 'integral-area':
      return roundNumber(integralAreaValue(expression));
    case 'percent-of':
      return roundNumber(expression.base * expression.percent / 100);
    case 'discount':
      return roundNumber(expression.price * (1 - expression.percent / 100));
    case 'proportion':
      if (Math.abs(expression.leftDenominator) < EPSILON) {
        throw new RangeError('Division by zero in proportion');
      }
      return roundNumber(
        expression.leftNumerator
        * expression.rightDenominator
        / expression.leftDenominator,
      );
  }
}

export function formatNumber(value: number, locale: MathSliderLocale): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(roundNumber(value, 2));
}

function formatNode(expression: MathExpression, locale: MathSliderLocale): string {
  switch (expression.type) {
    case 'literal':
      return formatNumber(expression.value, locale);
    case 'binary': {
      const operator = expression.operator === '*' ? '×' : expression.operator === '/' ? '÷' : expression.operator;
      return `(${formatNode(expression.left, locale)} ${operator} ${formatNode(expression.right, locale)})`;
    }
    case 'power': {
      const inner = expression.base.type === 'literal'
        ? formatNumber(expression.base.value, locale)
        : `(${formatNode(expression.base, locale)})`;
      return `${inner}${SUPERSCRIPT[expression.exponent] ?? `^${expression.exponent}`}`;
    }
    case 'linear-equation': {
      const b = expression.b;
      const sign = b >= 0 ? '+' : '\u2212';
      return `${formatNumber(expression.a, locale)}x ${sign} ${formatNumber(Math.abs(b), locale)} = ${formatNumber(expression.c, locale)},  x = ?`;
    }
    case 'quad-equation': {
      const b = expression.b;
      const sign = b >= 0 ? '+' : '\u2212';
      return `${formatNumber(expression.a, locale)}x\u00b2 ${sign} ${formatNumber(Math.abs(b), locale)} = ${formatNumber(expression.c, locale)},  x = ?`;
    }
    case 'root-estimation':
      return `\u221a${formatNumber(expression.value, locale)}`;
    case 'integral-area':
      return locale === 'ru' ? 'S \u2248 ?' : 'S \u2248 ?';
    case 'percent-of':
      return `${formatNumber(expression.percent, locale)}% × ${formatNumber(expression.base, locale)}`;
    case 'discount':
      return `${formatNumber(expression.price, locale)} × (1 − ${formatNumber(expression.percent, locale)}%)`;
    case 'proportion':
      return `${formatNumber(expression.leftNumerator, locale)} : ${formatNumber(expression.leftDenominator, locale)} = x : ${formatNumber(expression.rightDenominator, locale)}`;
  }
}

const SUPERSCRIPT: Record<number, string> = { 2: '\u00b2', 3: '\u00b3', 4: '\u2074' };

/** Every mixed operation is parenthesized; no precedence guess is required. */
export function formatExpression(expression: MathExpression, locale: MathSliderLocale): string {
  const formatted = formatNode(expression, locale);
  if (expression.type !== 'binary') return formatted;
  return formatted.slice(1, -1);
}


/**
 * Площадь фигуры «интеграл-оценка». Единый источник с рендером: экран рисует
 * срезы через sampleAreaHeights, а площадь считается той же кривой —
 * «что видишь, то и считается».
 *  steps    — сумма прямоугольников h_i × dx;
 *  polyline — трапеции по узлам;
 *  curve    — Catmull-Rom через узлы, интеграл сегмента АНАЛИТИЧЕСКИ
 *             (кубический полином: ∫₀¹ = a/4 + b/3 + c/2 + d, домноженный на dx).
 */
export function integralAreaValue(e: Extract<MathExpression, { type: 'integral-area' }>): number {
  const { form, dx, heights } = e;
  if (form === 'steps') return heights.reduce((s, h) => s + h * dx, 0);
  if (form === 'polyline') {
    let s = 0;
    for (let i = 0; i + 1 < heights.length; i++) s += ((heights[i] + heights[i + 1]) / 2) * dx;
    return s;
  }
  let s = 0;
  for (let i = 0; i + 1 < heights.length; i++) {
    const p0 = heights[Math.max(0, i - 1)];
    const p1 = heights[i];
    const p2 = heights[i + 1];
    const p3 = heights[Math.min(heights.length - 1, i + 2)];
    const c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c1 = -0.5 * p0 + 0.5 * p2;
    const c0 = p1;
    s += (c3 / 4 + c2 / 3 + c1 / 2 + c0) * dx;
  }
  return s;
}

/** Высоты k срезов для отрисовки — та же кривая, что в integralAreaValue. */
export function sampleAreaHeights(e: Extract<MathExpression, { type: 'integral-area' }>, k: number): number[] {
  const { form, heights } = e;
  if (form === 'steps') {
    return Array.from({ length: k }, (_, j) => heights[Math.min(heights.length - 1, Math.floor((j * heights.length) / k))]);
  }
  const segs = heights.length - 1;
  return Array.from({ length: k }, (_, j) => {
    const x = (j + 0.5) / k * segs;
    const i = Math.min(segs - 1, Math.floor(x));
    const t = x - i;
    if (form === 'polyline') return heights[i] + (heights[i + 1] - heights[i]) * t;
    const p0 = heights[Math.max(0, i - 1)];
    const p1 = heights[i];
    const p2 = heights[i + 1];
    const p3 = heights[Math.min(heights.length - 1, i + 2)];
    const c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    const c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    const c1 = -0.5 * p0 + 0.5 * p2;
    const v = ((c3 * t + c2) * t + c1) * t + p1;
    // Кламп нуля — только для ИЗОЗНАКОВЫХ фигур (гасит overshoot Катмулла);
    // у знаковых (есть узлы <0) отрицательные срезы — суть вопроса
    return heights.every((h) => h >= 0) ? Math.max(0, v) : v;
  });
}

export function literal(value: number): MathExpression {
  return { type: 'literal', value };
}

export function binary(
  operator: '+' | '-' | '*' | '/',
  left: MathExpression,
  right: MathExpression,
): MathExpression {
  return { type: 'binary', operator, left, right };
}

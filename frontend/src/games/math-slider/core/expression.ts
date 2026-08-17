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
    case 'percent-of':
      return `${formatNumber(expression.percent, locale)}% × ${formatNumber(expression.base, locale)}`;
    case 'discount':
      return `${formatNumber(expression.price, locale)} × (1 − ${formatNumber(expression.percent, locale)}%)`;
    case 'proportion':
      return `${formatNumber(expression.leftNumerator, locale)} : ${formatNumber(expression.leftDenominator, locale)} = x : ${formatNumber(expression.rightDenominator, locale)}`;
  }
}

/** Every mixed operation is parenthesized; no precedence guess is required. */
export function formatExpression(expression: MathExpression, locale: MathSliderLocale): string {
  const formatted = formatNode(expression, locale);
  if (expression.type !== 'binary') return formatted;
  return formatted.slice(1, -1);
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

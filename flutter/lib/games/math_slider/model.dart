/// ПРАВИЛА «МАТЕМАТИЧЕСКОЙ ШКАЛЫ» — перенос ядра frontend/src/games/math-slider/core.
///
/// Игра тренирует не счёт, а ЧУВСТВО ВЕЛИЧИНЫ: человек прикидывает, куда попадёт
/// результат выражения, и ставит маркер на числовой прямой. Лестница v2 — школьная
/// ось: сложение → вычитание → умножение → деление → десятичные → квадраты →
/// проценты → скидки → пропорции → кубы → уравнения → корень → квадратные
/// уравнения → интеграл-оценка (открытый хвост).
///
/// 🔴 ПОЧЕМУ ЗДЕСЬ СВОЯ АРИФМЕТИКА. Вопросы раздаются по ЗЕРНУ: одно и то же зерно
/// обязано дать ту же партию в вебе и здесь, иначе прогресс игрока разъедется.
/// Зерно крутит mulberry32 поверх FNV-1a, а они определены через 32-битные
/// операции JS (`Math.imul`, `>>>`, ToInt32) и через `Math.round`, который делит
/// ровную половину ВВЕРХ, а не «от нуля», как `round()` в Dart. Поэтому ниже
/// написаны `_imul`, `_jsRound`, `_toInt32` — без них расходятся не последние
/// знаки, а сами вопросы.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' hide normalizeSeed;
import '../../shell/js_compat.dart' as jsc;
export '../../shell/js_compat.dart'
    show Rng, createRng, hashSeed, jsNum, jsRound, pick, randomInt, roundNumber, shuffle;

// Общая JS-совместимая арифметика и случайность живут в `shell/js_compat.dart`:
// та же нужда возникла у «Трекера объектов», и два списка 32-битных операций в
// двух играх разъехались бы молча.

/// Разрядов в числе — как `String(Math.abs(Math.round(v))).length`.
int _digits(num v) {
  final r = jsRound(v.toDouble()).abs();
  return math.max(1, r.toInt().toString().length);
}

String _jsKey(double v) => jsNum(v).toString();

/// Зерно причёсывается с запасным именем этой игры.
String normalizeSeed(String seed) => jsc.normalizeSeed(seed, 'math-slider');

double _clamp(double v, double lo, double hi) => math.min(hi, math.max(lo, v));

// ───────────────────────────────── Выражения ─────────────────────────────────

sealed class MathExpression {
  const MathExpression();
  Map<String, dynamic> toJson();
}

class Literal extends MathExpression {
  const Literal(this.value);
  final double value;
  @override
  Map<String, dynamic> toJson() => {'type': 'literal', 'value': jsNum(value)};
}

class Binary extends MathExpression {
  const Binary(this.operator, this.left, this.right);
  final String operator;
  final MathExpression left;
  final MathExpression right;
  @override
  Map<String, dynamic> toJson() =>
      {'type': 'binary', 'operator': operator, 'left': left.toJson(), 'right': right.toJson()};
}

class Power extends MathExpression {
  const Power(this.base, this.exponent);
  final MathExpression base;
  final int exponent;
  @override
  Map<String, dynamic> toJson() => {'type': 'power', 'base': base.toJson(), 'exponent': exponent};
}

class LinearEquation extends MathExpression {
  const LinearEquation(this.a, this.b, this.c);
  final double a, b, c;
  @override
  Map<String, dynamic> toJson() =>
      {'type': 'linear-equation', 'a': jsNum(a), 'b': jsNum(b), 'c': jsNum(c)};
}

class QuadEquation extends MathExpression {
  const QuadEquation(this.a, this.b, this.c);
  final double a, b, c;
  @override
  Map<String, dynamic> toJson() =>
      {'type': 'quad-equation', 'a': jsNum(a), 'b': jsNum(b), 'c': jsNum(c)};
}

class RootEstimation extends MathExpression {
  const RootEstimation(this.value);
  final double value;
  @override
  Map<String, dynamic> toJson() => {'type': 'root-estimation', 'value': jsNum(value)};
}

class IntegralArea extends MathExpression {
  const IntegralArea(this.form, this.dx, this.heights);
  final String form; // steps | polyline | curve
  final double dx;
  final List<double> heights;
  @override
  Map<String, dynamic> toJson() => {
        'type': 'integral-area',
        'form': form,
        'dx': jsNum(dx),
        'heights': heights.map(jsNum).toList(),
      };
}

class PercentOf extends MathExpression {
  const PercentOf(this.percent, this.base);
  final double percent, base;
  @override
  Map<String, dynamic> toJson() =>
      {'type': 'percent-of', 'percent': jsNum(percent), 'base': jsNum(base)};
}

class DiscountOf extends MathExpression {
  const DiscountOf(this.price, this.percent);
  final double price, percent;
  @override
  Map<String, dynamic> toJson() =>
      {'type': 'discount', 'price': jsNum(price), 'percent': jsNum(percent)};
}

class ProportionOf extends MathExpression {
  const ProportionOf(this.leftNumerator, this.leftDenominator, this.rightDenominator);
  final double leftNumerator, leftDenominator, rightDenominator;
  @override
  Map<String, dynamic> toJson() => {
        'type': 'proportion',
        'leftNumerator': jsNum(leftNumerator),
        'leftDenominator': jsNum(leftDenominator),
        'rightDenominator': jsNum(rightDenominator),
      };
}

const double _epsilon = 1e-9;

double evaluateExpression(MathExpression e) {
  switch (e) {
    case Literal():
      return e.value;
    case Binary():
      final l = evaluateExpression(e.left);
      final r = evaluateExpression(e.right);
      switch (e.operator) {
        case '+':
          return roundNumber(l + r);
        case '-':
          return roundNumber(l - r);
        case '*':
          return roundNumber(l * r);
        default:
          if (r.abs() < _epsilon) throw RangeError('Деление на ноль');
          return roundNumber(l / r);
      }
    case Power():
      return roundNumber(math.pow(evaluateExpression(e.base), e.exponent).toDouble());
    case LinearEquation():
      return roundNumber((e.c - e.b) / e.a);
    case QuadEquation():
      return roundNumber(math.sqrt((e.c - e.b) / e.a));
    case RootEstimation():
      return roundNumber(math.sqrt(e.value));
    case IntegralArea():
      return roundNumber(integralAreaValue(e));
    case PercentOf():
      return roundNumber(e.base * e.percent / 100);
    case DiscountOf():
      return roundNumber(e.price * (1 - e.percent / 100));
    case ProportionOf():
      if (e.leftDenominator.abs() < _epsilon) throw RangeError('Деление на ноль в пропорции');
      return roundNumber(e.leftNumerator * e.rightDenominator / e.leftDenominator);
  }
}

/// Число в подписи: до двух знаков после запятой, запятая — как в ru-RU.
String formatNumber(double value) {
  final v = roundNumber(value, 2);
  var s = v.toStringAsFixed(2);
  if (s.contains('.')) {
    s = s.replaceFirst(RegExp(r'0+$'), '');
    s = s.replaceFirst(RegExp(r'\.$'), '');
  }
  return s.replaceAll('.', ',');
}

const Map<int, String> _superscript = {2: '²', 3: '³', 4: '⁴'};

String _formatNode(MathExpression e) {
  switch (e) {
    case Literal():
      return formatNumber(e.value);
    case Binary():
      final op = e.operator == '*' ? '×' : (e.operator == '/' ? '÷' : e.operator);
      return '(${_formatNode(e.left)} $op ${_formatNode(e.right)})';
    case Power():
      final inner = e.base is Literal
          ? formatNumber((e.base as Literal).value)
          : '(${_formatNode(e.base)})';
      return '$inner${_superscript[e.exponent] ?? '^${e.exponent}'}';
    case LinearEquation():
      final sign = e.b >= 0 ? '+' : '−';
      return '${formatNumber(e.a)}x $sign ${formatNumber(e.b.abs())} = ${formatNumber(e.c)},  x = ?';
    case QuadEquation():
      final sign = e.b >= 0 ? '+' : '−';
      return '${formatNumber(e.a)}x² $sign ${formatNumber(e.b.abs())} = ${formatNumber(e.c)},  x = ?';
    case RootEstimation():
      return '√${formatNumber(e.value)}';
    case IntegralArea():
      return 'S ≈ ?';
    case PercentOf():
      return '${formatNumber(e.percent)}% × ${formatNumber(e.base)}';
    case DiscountOf():
      return '${formatNumber(e.price)} × (1 − ${formatNumber(e.percent)}%)';
    case ProportionOf():
      return '${formatNumber(e.leftNumerator)} : ${formatNumber(e.leftDenominator)} = x : ${formatNumber(e.rightDenominator)}';
  }
}

/// Скобки расставлены при сборке: угадывать старшинство операций не нужно.
String formatExpression(MathExpression e) {
  final formatted = _formatNode(e);
  if (e is! Binary) return formatted;
  return formatted.substring(1, formatted.length - 1);
}

/// Площадь фигуры «интеграл-оценка» — тот же источник, что и рисунок на экране.
double integralAreaValue(IntegralArea e) {
  final h = e.heights;
  if (e.form == 'steps') {
    var s = 0.0;
    for (final v in h) {
      s += v * e.dx;
    }
    return s;
  }
  if (e.form == 'polyline') {
    var s = 0.0;
    for (var i = 0; i + 1 < h.length; i += 1) {
      s += ((h[i] + h[i + 1]) / 2) * e.dx;
    }
    return s;
  }
  var s = 0.0;
  for (var i = 0; i + 1 < h.length; i += 1) {
    final p0 = h[math.max(0, i - 1)];
    final p1 = h[i];
    final p2 = h[i + 1];
    final p3 = h[math.min(h.length - 1, i + 2)];
    final c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    final c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    final c1 = -0.5 * p0 + 0.5 * p2;
    final c0 = p1;
    s += (c3 / 4 + c2 / 3 + c1 / 2 + c0) * e.dx;
  }
  return s;
}

/// Высоты k срезов для рисунка — ТА ЖЕ кривая, что считает площадь.
List<double> sampleAreaHeights(IntegralArea e, int k) {
  final h = e.heights;
  if (e.form == 'steps') {
    return List<double>.generate(
        k, (j) => h[math.min(h.length - 1, ((j * h.length) / k).floor())]);
  }
  final segs = h.length - 1;
  final allPositive = h.every((v) => v >= 0);
  return List<double>.generate(k, (j) {
    final x = (j + 0.5) / k * segs;
    final i = math.min(segs - 1, x.floor());
    final t = x - i;
    if (e.form == 'polyline') return h[i] + (h[i + 1] - h[i]) * t;
    final p0 = h[math.max(0, i - 1)];
    final p1 = h[i];
    final p2 = h[i + 1];
    final p3 = h[math.min(h.length - 1, i + 2)];
    final c3 = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    final c2 = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    final c1 = -0.5 * p0 + 0.5 * p2;
    final v = ((c3 * t + c2) * t + c1) * t + p1;
    // Кламп нуля — только у изознаковых фигур: у знаковых отрицательный срез и есть вопрос.
    return allPositive ? math.max(0.0, v) : v;
  });
}

// ───────────────────────────── Модель работы вопроса ─────────────────────────
//
// Сколько умственного труда стоит ОЦЕНИТЬ ответ. Её читают генератор (difficulty
// → окно времени в подсчёте очков) и гейты. Перенесена 1:1 из core/work.ts:
// калибровка лестницы v2 (13 полос, 0 клонов) сделана именно этой моделью.

int _carries(double a, double b) {
  var c = 0;
  var x = jsRound(a).abs().toInt();
  var y = jsRound(b).abs().toInt();
  while (x > 0 || y > 0) {
    if ((x % 10) + (y % 10) >= 10) c += 1;
    x = x ~/ 10;
    y = y ~/ 10;
  }
  return c;
}

/// Карта удобности процентов: 50 % дешевле 12,5 % при любой базе.
const Map<String, double> _pct = {
  '50': 1, '25': 2, '10': 1, '5': 2, '20': 2, '30': 2.5, '40': 2.5, '75': 3, '15': 3, '12.5': 4,
};

bool _isInt(double v) => v.isFinite && v == v.roundToDouble();

class _CostVal {
  const _CostVal(this.cost, this.val);
  final double cost;
  final double val;
}

_CostVal _exprCost(MathExpression e) {
  switch (e) {
    case Literal():
      return _CostVal(0, e.value);
    case Binary():
      final l = _exprCost(e.left);
      final r = _exprCost(e.right);
      final dec = (_isInt(l.val) ? 0.0 : 0.5) + (_isInt(r.val) ? 0.0 : 0.5);
      if (e.operator == '+' || e.operator == '-') {
        final val = e.operator == '+' ? l.val + r.val : l.val - r.val;
        final signFlip = e.operator == '-' && val < 0 ? 0.6 : 0.0;
        return _CostVal(l.cost + r.cost + 1 + 0.5 * _carries(l.val, r.val) + dec + signFlip, val);
      }
      if (e.operator == '*') {
        return _CostVal(l.cost + r.cost + _digits(l.val) * _digits(r.val) + dec, l.val * r.val);
      }
      return _CostVal(l.cost + r.cost + 1.5 * _digits(l.val) * _digits(r.val) + dec, l.val / r.val);
    case Power():
      final b = _exprCost(e.base);
      if (e.exponent == 2 && _isInt(b.val) && b.val.abs() <= 12) {
        return _CostVal(b.cost + 1.2, b.val * b.val);
      }
      if (e.exponent == 3 && _isInt(b.val) && b.val.abs() <= 5) {
        return _CostVal(b.cost + 1.6, math.pow(b.val, 3).toDouble());
      }
      var cost = b.cost;
      var cur = b.val;
      for (var i = 1; i < e.exponent; i += 1) {
        cost += _digits(cur) * _digits(b.val);
        cur *= b.val;
      }
      return _CostVal(cost, cur);
    case LinearEquation():
      final diff = e.c - e.b;
      return _CostVal(1 + 0.5 * _carries(e.c, -e.b) + 1.5 * _digits(diff) * _digits(e.a), diff / e.a);
    case QuadEquation():
      final s = (e.c - e.b) / e.a;
      final r = math.sqrt(s);
      return _CostVal(
        1 + 0.5 * _carries(e.c, -e.b) + 1.5 * _digits(s) * _digits(e.a) + 2 + 1.5 * _digits(jsRound(r)),
        r,
      );
    case RootEstimation():
      final r = math.sqrt(e.value);
      return _CostVal(2 + 1.5 * _digits(jsRound(r)), r);
    case IntegralArea():
      return _integralCost(e);
    case PercentOf():
      return _CostVal(_pct[_jsKey(e.percent)] ?? 3, e.base * e.percent / 100);
    case DiscountOf():
      final part = e.price * e.percent / 100;
      return _CostVal((_pct[_jsKey(e.percent)] ?? 3) + 1 + 0.5 * _carries(e.price, part), e.price - part);
    case ProportionOf():
      final mult = e.rightDenominator / e.leftDenominator;
      return _CostVal((2 + _digits(e.leftNumerator) * _digits(mult)).toDouble(), e.leftNumerator * mult);
  }
}

_CostVal _integralCost(IntegralArea e) {
  final h = e.heights;
  var signFlips = 0;
  for (var i = 0; i + 1 < h.length; i += 1) {
    if (h[i] * h[i + 1] < 0) signFlips += 1;
  }
  final signedExtra = h.any((v) => v < 0) ? 2.0 + 0.6 * signFlips : 0.0;
  double mul(double v) {
    final a2 = v.abs();
    return a2 <= 12 && e.dx <= 12 ? 0.8 + 0.05 * (a2 + e.dx) : _digits(a2) * _digits(e.dx).toDouble();
  }

  final val = integralAreaValue(e);
  if (e.form == 'steps') {
    var cost = 0.0;
    for (final v in h) {
      cost += mul(v);
    }
    return _CostVal(cost + (h.length - 1) * 1.2 + signedExtra, val);
  }
  if (e.form == 'polyline') {
    var cost = (h.length - 1) * 0.6;
    for (var i = 0; i + 1 < h.length; i += 1) {
      cost += mul(jsRound((h[i] + h[i + 1]) / 2));
    }
    cost += (h.length - 2) * 1.2 + signedExtra;
    return _CostVal(cost, val);
  }
  final n = h.length - 1;
  var maxH = 1.0;
  for (final v in h) {
    if (v.abs() > maxH) maxH = v.abs();
  }
  var rough = 0.0;
  for (var i = 0; i + 1 < h.length; i += 1) {
    rough += (h[i + 1] - h[i]).abs();
  }
  // Мысленные куски = 2 + суммарная негладкость: извилистее кривая — больше кусков.
  final pieces = 2 + (rough / maxH) * 3.2;
  var gross = 0.0;
  for (var i = 0; i + 1 < h.length; i += 1) {
    gross += ((h[i] + h[i + 1]) / 2).abs() * e.dx;
  }
  final avg = jsRound(gross / (n * e.dx));
  return _CostVal(1.2 * pieces + _digits(avg) * _digits(n * e.dx) + signedExtra, val);
}

double expressionWork(MathExpression e) => _exprCost(e).cost;

double questionWorkParts(MathExpression e, double answer, MathSliderScale scale) {
  final cost = expressionWork(e);
  final tol = (0.1 * scale.width) / math.max(answer.abs(), 1);
  final precisionFactor = math.min(1.0, math.max(0.4, 0.35 / tol));
  final pos = (answer - scale.min) / scale.majorStep;
  final interp = (pos - jsRound(pos)).abs();
  return cost * precisionFactor + 0.5 + 2 * interp;
}

double questionWork(MathSliderQuestion q) => questionWorkParts(q.expression, q.answer, q.scale);

/// Работа, за которой вопрос считается максимально трудным (окно времени перестаёт расти).
const double workNorm = 12;

// ──────────────────────────────────── Шкала ──────────────────────────────────

class MathSliderScale {
  const MathSliderScale({
    required this.min,
    required this.max,
    required this.width,
    required this.majorStep,
    required this.keyboardStep,
    required this.tickCount,
    required this.ticks,
    required this.precision,
  });

  final double min, max, width, majorStep, keyboardStep;
  final int tickCount;
  final List<double> ticks;
  final int precision;

  Map<String, dynamic> toJson() => {
        'min': jsNum(min),
        'max': jsNum(max),
        'width': jsNum(width),
        'majorStep': jsNum(majorStep),
        'keyboardStep': jsNum(keyboardStep),
        'tickCount': tickCount,
        'ticks': ticks.map(jsNum).toList(),
        'precision': precision,
      };
}

const List<int> _scaleDensities = [4, 5, 8, 10];

/// Последний уровень, который лестница ОБЕЩАЕТ. Выше — открытый хвост.
const int sliderMaxLevel = 52;

/// 10 в степени floor(log10(v)) — с поправкой на ulp: у Dart нет своего log10,
/// а `log(1000)/ln10` даёт 2,9999…, и порядок уехал бы на единицу.
double _pow10Floor(double value) {
  var e = (math.log(value) / math.ln10).floor();
  if (math.pow(10, e + 1) <= value) e += 1;
  if (math.pow(10, e) > value) e -= 1;
  return math.pow(10, e).toDouble();
}

double niceCeiling(double value) {
  if (!value.isFinite || value <= 0) return 1;
  final magnitude = _pow10Floor(value);
  final fraction = value / magnitude;
  final nice = fraction <= 1
      ? 1.0
      : fraction <= 2
          ? 2.0
          : fraction <= 2.5
              ? 2.5
              : fraction <= 5
                  ? 5.0
                  : 10.0;
  return nice * magnitude;
}

double _snap(double value, double step) => roundNumber(jsRound(value / step) * step, 6);

int _precisionFor(double step) {
  if (step >= 1 && _isInt(step)) return 0;
  if (step >= 0.1) return 1;
  return 2;
}

MathSliderScale makeScale(double answer, int level, Rng rng) {
  final tickCount = pick(rng, _scaleDensities);
  double min;
  double max;

  // Полосы шкалы привязаны к школьным полосам: B1 — только положительная,
  // B2 — со знаком, дальше ширина пляшет от величины ответа.
  if (level <= 4 && answer >= 0 && answer <= 100) {
    final width = pick(rng, [50.0, 75.0, 100.0]);
    final desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = _clamp(_snap(desiredMin, 5), 0, 100 - width);
    max = min + width;
  } else if (level <= 8 && answer.abs() <= 95) {
    final sampledWidth = pick(rng, [100.0, 150.0, 200.0]);
    final width = answer >= 0 && sampledWidth < answer + 5
        ? (answer + 5 <= 150 ? 150.0 : 200.0)
        : sampledWidth;
    final desiredMin = answer - width * (0.3 + rng() * 0.4);
    min = _clamp(_snap(desiredMin, 5), -100, 100 - width);
    if (min >= 0) min = -5;
    max = min + width;
  } else {
    final factor = pick(rng, [1.4, 1.9, 2.6]);
    final width = niceCeiling(math.max(20, answer.abs() * factor + 10));
    final position = 0.3 + rng() * 0.4;
    final snapStep = niceCeiling(width / 20);
    min = _snap(answer - width * position, snapStep);
    max = min + width;
    if (answer < min) {
      min = _snap(answer - width * 0.2, snapStep);
      max = min + width;
    } else if (answer > max) {
      max = _snap(answer + width * 0.2, snapStep);
      min = max - width;
    }
  }

  min = roundNumber(min, 6);
  max = roundNumber(max, 6);
  final width = roundNumber(max - min, 6);
  final majorStep = roundNumber(width / tickCount, 6);
  final rawKeyboardStep = majorStep / 5;
  final keyboardStep = roundNumber(
    rawKeyboardStep >= 1
        ? math.max(1, niceCeiling(rawKeyboardStep) / 2)
        : math.max(0.01, niceCeiling(rawKeyboardStep) / 2),
    4,
  );
  final ticks = List<double>.generate(tickCount + 1, (i) => roundNumber(min + majorStep * i, 4));

  return MathSliderScale(
    min: min,
    max: max,
    width: width,
    majorStep: majorStep,
    keyboardStep: keyboardStep,
    tickCount: tickCount,
    ticks: ticks,
    precision: _precisionFor(math.min(majorStep, keyboardStep)),
  );
}

// ─────────────────────────── Семейства выражений по полосам ──────────────────
//
// 12 полос по 4 уровня + B13 (квадратные уравнения, L49–52) + открытый хвост
// B14+ (интеграл-оценка). Внутри полосы позиция t масштабирует числа, поэтому
// соседние уровни различимы: лестница растёт не таймером, а содержанием.

class _Fam {
  const _Fam(this.kind, this.expression);
  final String kind;
  final MathExpression expression;
}

/// B1: сложение; числа растут с t.
_Fam _addition(Rng rng, double t) {
  final top = jsRound(30 + t * 65).toInt();
  final answer = randomInt(rng, jsRound(5 + t * 55).toInt(), top);
  // ≥1 и запас снизу: при t=0 нижняя граница давала слагаемое 0, при t=1 — краш диапазона.
  final lo = math.max(
    1,
    math.min((answer * 0.5 * math.min(0.96, t * 1.1)).floor(), ((answer - 1) / 2).floor()),
  );
  final left = randomInt(rng, lo, answer - lo);
  final pair = Binary('+', Literal(left.toDouble()), Literal((answer - left).toDouble()));
  if (rng() >= t * 0.75) return _Fam('integer-addition', pair);
  final c = randomInt(rng, 5, 25);
  return _Fam('integer-addition', Binary('+', pair, Literal(c.toDouble())));
}

/// B2: вычитание со знаком; размах растёт с t.
_Fam _subtraction(Rng rng, double t) {
  final top = jsRound(50 + t * 45).toInt();
  final negative = rng() < 0.45 + t * 0.4;
  final small = randomInt(rng, jsRound(t * top * 0.4).toInt(), jsRound(top / 2).toInt());
  final big = randomInt(rng, small + 5, top);
  return _Fam(
    'signed-subtraction',
    negative
        ? Binary('-', Literal(small.toDouble()), Literal(big.toDouble()))
        : Binary('-', Literal(big.toDouble()), Literal(small.toDouble())),
  );
}

/// B3: умножение — от таблицы к двузначным, с добавкой ±c к концу полосы.
_Fam _multiplication(Rng rng, double t) {
  final a = randomInt(rng, 3, jsRound(6 + t * 10).toInt());
  final b = randomInt(rng, 2, jsRound(4 + t * 8).toInt());
  final product = Binary('*', Literal(a.toDouble()), Literal(b.toDouble()));
  if (rng() >= t * 0.9) return _Fam('mixed-small-multiplication', product);
  final c = Literal(randomInt(rng, 5, 60).toDouble());
  return _Fam(
    'mixed-small-multiplication',
    rng() < 0.5 ? Binary('+', product, c) : Binary('-', product, c),
  );
}

/// B4: деление нацело.
_Fam _division(Rng rng, double t) {
  final b = randomInt(rng, 3, jsRound(4 + t * 8).toInt());
  final q = randomInt(rng, jsRound(3 + t * 5).toInt(), jsRound(6 + t * 12).toInt());
  return _Fam('integer-division',
      Binary('/', Literal((b * q).toDouble()), Literal(b.toDouble())));
}

/// B5: десятичные.
_Fam _decimalArithmetic(Rng rng, double t) {
  final left = randomInt(rng, 20, jsRound(400 + t * 600).toInt()) / 10;
  final right = randomInt(rng, 10, jsRound(200 + t * 300).toInt()) / 10;
  final operator = rng() < 0.55 ? '+' : '-';
  final pair = Binary(operator, Literal(left), Literal(right));
  if (rng() >= t * 0.6) return _Fam('decimal-arithmetic', pair);
  final third = randomInt(rng, 10, jsRound(100 + t * 200).toInt()) / 10;
  return _Fam('decimal-arithmetic', Binary(rng() < 0.5 ? '+' : '-', pair, Literal(third)));
}

/// B6: квадраты.
_Fam _square(Rng rng, double t) {
  final base = randomInt(rng, jsRound(4 + t * 4).toInt(), jsRound(9 + t * 12).toInt());
  return _Fam('square-power', Power(Literal(base.toDouble()), 2));
}

/// B7: проценты; к концу полосы базы некруглые.
_Fam _percentage(Rng rng, double t) {
  const easy = [5.0, 10.0, 20.0, 25.0, 30.0, 40.0, 50.0];
  const hard = [12.5, 15.0, 35.0, 65.0, 75.0];
  final percent = rng() < t * 0.8 ? pick(rng, hard) : pick(rng, easy);
  final base = rng() >= t
      ? randomInt(rng, 2, jsRound(20 + t * 20).toInt()) * 10
      : randomInt(rng, 24, jsRound(200 + t * 300).toInt());
  return _Fam('percentage', PercentOf(percent, base.toDouble()));
}

/// B8: скидки.
_Fam _discount(Rng rng, double t) {
  final percent = rng() < 0.15 + t * 0.7
      ? pick(rng, [12.5, 15.0, 35.0, 45.0, 65.0])
      : pick(rng, [5.0, 10.0, 20.0, 25.0, 30.0, 40.0, 50.0]);
  final price = rng() >= t
      ? randomInt(rng, 4, jsRound(30 + t * 20).toInt()) * 10
      : randomInt(rng, 45, jsRound(280 + t * 400).toInt());
  return _Fam('discount', DiscountOf(price.toDouble(), percent));
}

/// B9: пропорции.
_Fam _proportion(Rng rng, double t) {
  final leftNumerator = randomInt(rng, 2, jsRound(9 + t * 6).toInt());
  final leftDenominator = randomInt(rng, 2, 12);
  final multiplier = randomInt(rng, 3, jsRound(8 + t * 15).toInt());
  return _Fam(
    'proportion',
    ProportionOf(leftNumerator.toDouble(), leftDenominator.toDouble(),
        (leftDenominator * multiplier).toDouble()),
  );
}

/// B10: кубы и вложенные степени.
_Fam _cubeNested(Rng rng, double t) {
  if (rng() >= t * 0.8) {
    final base = randomInt(rng, 3, jsRound(6 + t * 4).toInt());
    return _Fam('cube-nested-power', Power(Literal(base.toDouble()), 3));
  }
  final base = randomInt(rng, 2, 4);
  final nested = Power(Power(Literal(base.toDouble()), 2), 2);
  if (rng() >= (t - 0.5) * 1.6) return _Fam('cube-nested-power', nested);
  return _Fam(
    'cube-nested-power',
    Binary(rng() < 0.5 ? '+' : '-', nested, Literal(randomInt(rng, 10, 90).toDouble())),
  );
}

/// B11: уравнение ax+b=c — посчитал в голове, тянешь маркер к x.
_Fam _linearEquation(Rng rng, double t) {
  final x = randomInt(rng, 4, jsRound(12 + t * 24).toInt());
  final a = randomInt(rng, 2, jsRound(4 + t * 6).toInt());
  final b = randomInt(rng, jsRound(-(10 + t * 40)).toInt(), jsRound(10 + t * 40).toInt());
  return _Fam('linear-equation',
      LinearEquation(a.toDouble(), b.toDouble(), (a * x + b).toDouble()));
}

/// B12: оценка корня √N — ответ почти всегда нецелый, чистая прикидка.
_Fam _rootEstimation(Rng rng, double t) {
  final value = randomInt(rng, jsRound(160 + t * 340).toInt(), jsRound(400 + t * 1100).toInt());
  final root = RootEstimation(value.toDouble());
  if (rng() >= 0.65 + t * 0.28) return _Fam('root-estimation', root);
  final k = Literal(randomInt(rng, 5, jsRound(40 + t * 120).toInt()).toDouble());
  final shifted = Binary(rng() < 0.5 ? '+' : '-', root, k);
  if (rng() >= (t - 0.25) * 0.9) return _Fam('root-estimation', shifted);
  return _Fam('root-estimation',
      Binary(rng() < 0.5 ? '+' : '-', shifted, Literal(randomInt(rng, 10, 60).toDouble())));
}

/// B13+: квадратные уравнения ax²+b=c — хвост растёт МЕТОДОМ, а не пересдачей пройденного.
_Fam _quadEquation(Rng rng, double t) {
  final g = math.max(0.0, t - 1);
  final s = randomInt(rng, jsRound(35 + g * 150).toInt(), jsRound(160 + g * 400).toInt());
  final a = randomInt(rng, 2, jsRound(3 + g * 25).toInt());
  final b = randomInt(rng, jsRound(-(20 + g * 80)).toInt(), jsRound(20 + g * 80).toInt());
  return _Fam('quad-equation', QuadEquation(a.toDouble(), b.toDouble(), (a * s + b).toDouble()));
}

/// B14+: интеграл-оценка — форма растёт внутри полосы: ступени → ломаная → кривая.
_Fam _integralArea(Rng rng, double g) {
  final pPoly = _clamp((g - 0.3) * 1.4, 0, 1);
  // Кривая входит, но не вытесняет ломаную: при её доминировании хвост падал.
  final pCurve = _clamp((g - 0.9) * 0.5, 0, 0.55);
  final r = rng();
  final form = r < pCurve
      ? 'curve'
      : r < pCurve + pPoly * (1 - pCurve)
          ? 'polyline'
          : 'steps';
  final n = 5 + (g * 1.5 + rng() * 2).floor();
  final dx = 1 + (g * 0.9 + rng() * 1.4).floor();
  final base = 6 + g * 8 + rng() * 6;
  final amp = base * (0.45 + 0.25 * rng()) * (form == 'curve' ? 1.25 : 1);
  final nodes = form == 'steps' ? n : n + 1;
  final phase = rng() * math.pi * 2;
  final freq = 0.9 + rng() * 1.1 + math.max(0.0, g - 0.8) * 0.9;
  // Знаковая фигура: часть срезов ныряет ниже нуля, ответ — разность площадей.
  final signed = rng() < _clamp((g - 1) * 0.5, 0, 0.6);
  final shift = signed ? base * (0.8 + rng() * 0.4) : 0.0;
  final scale = signed ? 1.5 : 1.0;
  final floor = signed ? double.negativeInfinity : 1.0;
  final heights = List<double>.generate(
    nodes,
    (i) => math.max(
      floor,
      jsRound(scale *
          (base -
              shift +
              amp * math.sin(phase + (i * freq * math.pi) / math.max(1, nodes - 1)) +
              (rng() - 0.5) * amp * 0.5)),
    ),
  );
  return _Fam('integral-area', IntegralArea(form, dx.toDouble(), heights));
}

const List<_Fam Function(Rng, double)> _bands = [
  _addition,          // B1  L1–4
  _subtraction,       // B2  L5–8
  _multiplication,    // B3  L9–12
  _division,          // B4  L13–16
  _decimalArithmetic, // B5  L17–20
  _square,            // B6  L21–24
  _percentage,        // B7  L25–28
  _discount,          // B8  L29–32
  _proportion,        // B9  L33–36
  _cubeNested,        // B10 L37–40
  _linearEquation,    // B11 L41–44
  _rootEstimation,    // B12 L45–48
];

const int _bandSize = 4;

double _bandT(int level) => ((level - 1) % _bandSize) / (_bandSize - 1);

_Fam _expressionForLevel(int level, Rng rng) {
  final bandIndex = ((level - 1) / _bandSize).floor();
  if (bandIndex < _bands.length) return _bands[bandIndex](rng, _bandT(level));
  if (level <= sliderMaxLevel) {
    return _quadEquation(rng, 1 + (level - _bands.length * _bandSize) / 10);
  }
  return _integralArea(rng, (level - 53) / 8);
}

// ──────────────────────────────────── Вопрос ─────────────────────────────────

const String generatorVersion = 'math-slider-generator-v2';

class MathSliderQuestion {
  const MathSliderQuestion({
    required this.id,
    required this.index,
    required this.level,
    required this.kind,
    required this.expression,
    required this.answer,
    required this.scale,
    required this.difficulty,
    required this.expressionDifficulty,
    required this.scaleDifficulty,
    required this.seed,
  });

  final String id;
  final int index;
  final int level;
  final String kind;
  final MathExpression expression;
  final double answer;
  final MathSliderScale scale;
  final double difficulty, expressionDifficulty, scaleDifficulty;
  final String seed;

  /// Подпись вопроса на экране — та же строка, что в вебе.
  String get text => formatExpression(expression);

  /// Середина шкалы: отсюда маркер стартует, чтобы стартовая точка не подсказывала.
  double get midpoint => (scale.min + scale.max) / 2;
}

List<MathSliderQuestion> generateMathSliderQuestions(String seed, int level, [int count = 8]) {
  final normalizedSeed = normalizeSeed(seed);
  final safeLevel = math.max(1, level.floor());
  final safeCount = _clamp(count.floorToDouble(), 1, 20).toInt();
  final rng = createRng('$normalizedSeed|$safeLevel|$generatorVersion');

  return List<MathSliderQuestion>.generate(safeCount, (index) {
    final fam = _expressionForLevel(safeLevel, rng);
    final answer = evaluateExpression(fam.expression);
    final scale = makeScale(answer, safeLevel, rng);
    final scaleDifficulty = (scale.tickCount - 4) / 6;
    // difficulty — от РАБОТЫ вопроса, не от номера уровня: номерное было слепо
    // к содержимому внутри уровня, а от него живёт окно времени в подсчёте очков.
    final expressionDifficulty = _clamp(expressionWork(fam.expression) / workNorm, 0, 1);
    final difficulty = _clamp(questionWorkParts(fam.expression, answer, scale) / workNorm, 0, 1);
    return MathSliderQuestion(
      id: '$normalizedSeed:$safeLevel:$index',
      index: index,
      level: safeLevel,
      kind: fam.kind,
      expression: fam.expression,
      answer: answer,
      scale: scale,
      difficulty: roundNumber(difficulty, 6),
      expressionDifficulty: roundNumber(expressionDifficulty, 6),
      scaleDifficulty: roundNumber(scaleDifficulty, 6),
      seed: normalizedSeed,
    );
  });
}

MathSliderQuestion generateTrainingQuestion(String seed) =>
    generateMathSliderQuestions('${normalizeSeed(seed)}-training', 1, 1).first;

/// Перенос прогресса лестницы v1 в v2 — по СЕМЕЙСТВУ, на котором стоял игрок.
int migrateSliderLevelV1toV2(int oldLevel) {
  final l = math.max(1, oldLevel.floor());
  if (l <= 5) return math.min(4, l);
  if (l <= 10) return 5 + math.min(3, l - 6);
  if (l <= 20) return 9 + math.min(3, ((l - 11) / 3).floor());
  if (l <= 24) return 17 + (l - 21);
  if (l <= 28) return 25 + (l - 25);
  if (l <= 32) return 29 + (l - 29);
  if (l <= 36) return 33 + (l - 33);
  return 37;
}

// ───────────────────────────────── Очки попытки ──────────────────────────────

class TrialScore {
  const TrialScore({
    required this.questionId,
    required this.answer,
    required this.estimate,
    required this.elapsedMs,
    required this.absoluteError,
    required this.signedError,
    required this.normalizedError,
    required this.normalizedSignedError,
    required this.accuracy,
    required this.speedFactor,
    required this.speedTieBreak,
    required this.score,
    required this.outsideTarget,
  });

  final String questionId;
  final double answer, estimate;
  final int elapsedMs;
  final double absoluteError, signedError, normalizedError, normalizedSignedError;
  final double accuracy, speedFactor;
  final int speedTieBreak, score;
  final bool outsideTarget;
}

/// Очки лексикографичны: десятая доля процента точности всегда бьёт всю скорость.
TrialScore scoreEstimate(MathSliderQuestion question, double estimate, int elapsedMs) {
  if (!estimate.isFinite) throw ArgumentError('Оценка обязана быть конечной');
  if (!(question.scale.width > 0)) throw RangeError('Ширина шкалы обязана быть больше нуля');

  final safeElapsedMs = math.max(0, elapsedMs);
  final signedError = roundNumber(estimate - question.answer, 8);
  final absoluteError = signedError.abs();
  final normalizedError = absoluteError / question.scale.width;
  final normalizedSignedError = signedError / question.scale.width;
  final accuracy = _clamp(1 - normalizedError, 0, 1);
  final targetMs = 14000 + question.difficulty * 8000;
  final speedFactor = _clamp((targetMs - safeElapsedMs) / targetMs, 0, 1);
  final accuracyUnits = jsRound(accuracy * 1000).toInt();
  final speedTieBreak = jsRound(speedFactor * 9).toInt();

  return TrialScore(
    questionId: question.id,
    answer: question.answer,
    estimate: roundNumber(estimate, 8),
    elapsedMs: safeElapsedMs,
    absoluteError: roundNumber(absoluteError, 8),
    signedError: signedError,
    normalizedError: roundNumber(normalizedError, 8),
    normalizedSignedError: roundNumber(normalizedSignedError, 8),
    accuracy: roundNumber(accuracy, 8),
    speedFactor: roundNumber(speedFactor, 8),
    speedTieBreak: speedTieBreak,
    score: accuracyUnits * 10 + speedTieBreak,
    outsideTarget: normalizedError > 0.1,
  );
}

/// Порог прохождения уровня — решение стыковки, в модуле его нет.
const double passAccuracy = 0.9;

// ─────────────────────────────── Управление ползунком ───────────────────────
//
// Перенос из веб-компонента (MathSliderGame.tsx:108–117): куда бы ни попал палец,
// значение ПРИЛИПАЕТ к шагу шкалы. Иначе оценка отличалась бы от показанной
// цифры в третьем знаке, и обратная связь врала бы игроку.

int decimalPlaces(double value) {
  final text = jsNum(value).toString();
  final dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

double snapValue(double value, MathSliderScale scale) {
  final snapped = scale.min + jsRound((value - scale.min) / scale.keyboardStep) * scale.keyboardStep;
  final digits = math.min(4, math.max(0, decimalPlaces(scale.keyboardStep)));
  return math.min(scale.max, math.max(scale.min, double.parse(snapped.toStringAsFixed(digits))));
}

/// Секунды после отпускания, через которые оценка засчитывается сама.
/// Отсчёт НЕ идёт, пока человек не тронул шкалу: иначе игра засчитала бы
/// значение по умолчанию, к которому никто не прикасался.
const Duration autoConfirmDelay = Duration(milliseconds: 3000);

/// Сколько держится разбор ответа перед следующим вопросом.
const Duration feedbackDelay = Duration(milliseconds: 1800);

/// Вопросов в партии — как в вебе по умолчанию.
const int trialsPerRound = 8;

/// ПРАВИЛА ДОРОГИ — арифметика ворот, стен и станций раннера.
///
/// Перенос `runner-levels.mjs` (VER 6) «Числового забега»: `applyOperation`, `meets`,
/// `ruleDifference`, `exactDelta`, `scaleDelta`, `scaleValue`. Двенадцать тренировок
/// (`LEVELS`/`makeCourse`) не перенесены: в приложение они не выведены (схема
/// `~/dev/psygames/counting-chat/SPEC_RUNNER_HUB_STATIONS.md`, §0).
///
/// Сверка — `test/fixtures/number-run-reference.json`
/// (`frontend/src/games/number-run/tools/record-number-run-reference.mjs`).
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show jsRound;

/// Правило ворот: `min`/`max`, `null` — без границы.
class RoadRule {
  const RoadRule(this.min, this.max);

  final double? min, max;

  /// Черта этапа: порога нет.
  static const RoadRule any = RoadRule(null, null);

  Map<String, Object?> toJson() => {'min': min, 'max': max};
}

/// Ворота «ровно N»: цель, прибавка за точное попадание, наименьшая единица штрафа.
class RoadExact {
  const RoadExact({required this.target, required this.bonus, required this.unit});

  final double target, bonus, unit;

  Map<String, Object?> toJson() => {'target': target, 'bonus': bonus, 'unit': unit};
}

bool roadMeets(double sum, RoadRule r) => (r.min == null || sum >= r.min!) && (r.max == null || sum <= r.max!);

/// Недобор / перебор / прошёл — как `ruleDifference` в вебе.
Map<String, Object?> ruleDifference(double sum, RoadRule r) {
  if (r.min != null && sum < r.min!) return {'kind': 'short', 'amount': r.min! - sum};
  if (r.max != null && sum > r.max!) return {'kind': 'over', 'amount': sum - r.max!};
  return {'kind': 'pass', 'amount': 0};
}

const double _maxSafeInteger = 9007199254740991;

/// Стена-операция: «+N», «−N» (типографский минус), «×N», «→» — пропуск.
/// Результат вне безопасного целого или больше предела — ошибка правил, как в вебе.
double applyOperation(double sum, String label, [double limit = 9999]) {
  var value = sum;
  if (label == '→') return value;
  if (label.startsWith('+')) {
    value += double.parse(label.substring(1));
  } else if (label.startsWith('−')) {
    value -= double.parse(label.substring(1));
  } else if (label.startsWith('×')) {
    value *= double.parse(label.substring(1));
  } else {
    throw ArgumentError('Unknown operation $label');
  }
  final safe = value.isFinite && value == value.truncateToDouble() && value.abs() <= _maxSafeInteger;
  if (!safe || value.abs() > limit) throw StateError('Arithmetic out of range');
  return value;
}

/// Цена шкалы: ошибка — доля ширины шкалы. В допуске — прибавка; до двух допусков — ноль
/// («близко»); дальше — минус.
double scaleDelta(double err, {required double tolerance, required double reward, required double penalty}) =>
    err <= tolerance
        ? reward
        : err <= 2 * tolerance
            ? 0
            : -penalty;

/// Точка дороги −1…1 → число на прямой [min, max] без округления до полосы.
double scaleValue(double min, double max, double x) => min + (math.max(-1.0, math.min(1.0, x)) + 1) / 2 * (max - min);

/// Цена ворот «ровно N» при собранной сумме [got]: ровно — прибавка; мимо — минус, растущий
/// с промахом, не больше прибавки.
double exactDelta(RoadExact exact, double got) {
  if (got == exact.target) return exact.bonus;
  final scaled =
      math.max(5.0, jsRound(exact.bonus * (got - exact.target).abs() / math.max(1.0, exact.target) / 5) * 5);
  return -math.min(exact.bonus, math.max(exact.unit, scaled));
}

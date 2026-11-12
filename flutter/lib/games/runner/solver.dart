/// РЕШАТЕЛЬ ДОРОГИ И «СТОЯЩИЙ НА МЕСТЕ» — перенос `solveCourse` / `stationaryWins` из
/// `runner-levels.mjs` (VER 6) «Числового забега».
///
/// Решатель идёт по рядам полными состояниями (сумма + полоса), а не жадной суммой: у ряда
/// с путями построения варианты — пути (вход, выход, прибавка), трамплин обязателен только
/// у препятствия. В забеге (`journey`) после каждого ряда остаются три лучших по сумме.
///
/// ⚠️ СОРТИРОВКА УСТОЙЧИВАЯ, как в JS: при равных суммах порядок кандидатов прежний. Dart-овая
/// `sort` не устойчива, и на равных суммах решатель выбрал бы другой путь того же числа.
library;

import '../../shell/js_compat.dart' show jsNum;
import 'road.dart';
import 'rules.dart';

/// Шаг эталонного пути: ряд, полоса (или выход пути построения), сумма после ряда.
class SolverStep {
  const SolverStep({required this.id, required this.lane, required this.sum, this.route});
  final int id;
  final double lane, sum;
  final String? route;

  Map<String, Object?> toJson() => {'id': id, 'lane': lane, 'sum': sum, if (route != null) 'route': route};
}

class _Candidate {
  const _Candidate(this.sum, this.lane, this.z, this.path, [this.reserve]);
  final double sum, lane, z;
  final List<SolverStep> path;

  /// Операция в запасе, которую путь ещё держит («×2»), или `null`.
  final String? reserve;
}

/// Сумма, если применить запас прямо сейчас: по ней путь ранжируется, чтобы «держу ×2» не
/// проигрывал «уже удвоил» до того, как удвоение станет выгоднее.
double _potential(_Candidate c, double limit) {
  final op = c.reserve;
  if (op == null) return c.sum;
  try {
    return applyOperation(c.sum, op, limit);
  } catch (_) {
    return c.sum;
  }
}

String _key(double sum, double lane, [String? reserve]) => '${jsNum(sum)}:${jsNum(lane)}:${reserve ?? ''}';

/// Сколько возьмёт стоящий в полосе [lane] на ряду чисел: столб прижимает к своей стороне,
/// трамплин в его полосе уносит над числами.
double _stationaryGain(RoadRow r, double lane) {
  final d = r.divider;
  final side = d == null ? 0.0 : (lane.sign == 0 ? 1.0 : lane.sign);
  final x = d == null ? lane : (side < 0 ? (lane < -d.gap ? lane : -d.gap) : (lane > d.gap ? lane : d.gap));
  final flying = r.jump != null && r.jump!.lane == lane;
  final touched = r.items.where((i) {
    final dz = i.dz ?? 0;
    if (flying && dz > -r.jump!.launchOffset && dz < r.jump!.landingOffset) return false;
    if (d != null && dz >= d.fromDz && dz <= d.toDz && i.x.sign != side) return false;
    return (i.x - x).abs() <= (i.half ?? .18);
  }).toList();
  final plain = touched.where((i) => !i.part).fold(0.0, (a, i) => a + i.value);
  final exact = r.exact;
  if (exact == null) return plain;
  return plain + exactDelta(exact, touched.where((i) => i.part).fold(0.0, (a, i) => a + i.value));
}

/// Выигрывает ли тот, кто всю дорогу стоит в одной полосе. Такую раздачу уровень перебрасывает.
bool stationaryWins(RoadCourse course, double lane) {
  var sum = course.start;
  String? held;
  final limit = course.mode == 'journey' ? 1e6 : 9999.0;
  for (final r in course.rows) {
    if (r.kind == 'pickups') {
      held ??= r.items.where((i) => i.reserve != null && i.x == lane).firstOrNull?.reserve;
      sum += _stationaryGain(r, lane);
    } else if (r.kind == 'answer') {
      sum += lane + 1 == r.correct ? r.reward : -r.penalty;
    } else if (r.kind == 'scale') {
      sum += scaleDelta((scaleValue(r.min, r.max, lane) - r.answer).abs() / (r.max - r.min),
          tolerance: r.tolerance, reward: r.reward, penalty: r.penalty);
    } else if (r.kind == 'operation') {
      sum = applyOperation(sum, r.options[(lane + 1).toInt()] as String, limit);
    } else if (r.kind == 'obstacle') {
      if (r.jump != null) {
        if (lane != r.jump!.lane) return false;
      } else {
        if (r.span != 0 && r.penalties[(lane + 1).toInt()] != 0) return false;
        sum -= r.penalties[(lane + 1).toInt()];
      }
    } else if (!roadMeets(sum, r.rules.length == 1 ? r.rules[0] : r.rules[(lane + 1).toInt()])) {
      return false;
    }
  }
  return true;
}


/// Эталонный путь: полные накопленные состояния и промежуточные ворота. `null` — пути нет.
List<SolverStep>? solveCourse(RoadCourse course) {
  var candidates = [_Candidate(course.start, 0, 0, const [])];
  final limit = course.mode == 'journey' ? 1e6 : 9999.0;
  for (final row in course.rows) {
    final next = <String, _Candidate>{};
    final List<Object> options = row.routes ??
        (row.kind == 'pickups' && row.items.isNotEmpty
            ? [for (final i in row.items) i.x]
            : const [-1.0, 0.0, 1.0]);
    for (final c in candidates) {
      for (final option in options) {
        final route = option is RoadRoute ? option : null;
        final lane = route != null ? route.exit : option as double;
        final entryX = route != null ? route.entry.x : lane;
        final reachZ = route != null ? row.z + route.entry.dz : row.z - (row.jump?.launchOffset ?? row.span);
        if ((entryX - c.lane).abs() / course.lateralSpeed > (reachZ - c.z) / course.speed + 1e-9) continue;
        if (row.kind == 'obstacle' &&
            (row.jump != null ? lane != row.jump!.lane : (row.span != 0 && _penaltyAt(row, lane) != 0))) {
          continue;
        }
        double sum;
        String? picked;
        try {
          if (route != null) {
            sum = c.sum + route.gain;
          } else if (row.kind == 'answer') {
            sum = c.sum + (lane + 1 == row.correct ? row.reward : -row.penalty);
          } else if (row.kind == 'pickups') {
            final hit = row.items.where((i) => i.x == lane);
            sum = c.sum + (hit.isEmpty ? 0 : hit.first.value);
            final op = hit.isEmpty ? null : hit.first.reserve;
            if (op != null && c.reserve == null) picked = op;
          } else if (row.kind == 'operation') {
            final label = _optionAt(row, lane);
            if (label == null) throw StateError('no option');
            sum = applyOperation(c.sum, label, limit);
          } else if (row.kind == 'obstacle' && row.jump == null) {
            sum = c.sum - _penaltyAt(row, lane)!;
          } else {
            sum = c.sum;
          }
        } catch (_) {
          continue;
        }
        if (row.kind == 'gate' &&
            !roadMeets(sum, row.rules.length == 1 ? row.rules[0] : row.rules[(lane + 1).toInt()])) {
          continue;
        }
        final held = c.reserve ?? picked;
        final z = row.z + (row.window ?? 0);
        final path = [...c.path, SolverStep(id: row.id, lane: lane, sum: sum, route: route?.id)];
        next.putIfAbsent(_key(sum, lane, held), () => _Candidate(sum, lane, z, path, held));
        // Применить запас сразу после этого ряда — отдельная ветка пути.
        if (held != null) {
          try {
            final applied = applyOperation(sum, held, limit);
            next.putIfAbsent(
                _key(applied, lane),
                () => _Candidate(applied, lane, z, [
                      ...c.path,
                      SolverStep(id: row.id, lane: lane, sum: applied, route: route?.id),
                    ]));
          } catch (_) {}
        }
      }
    }
    candidates = next.values.toList();
    if (candidates.isEmpty) return null;
    // В забеге черта этапа порога не ставит: берём наибольшие суммы, потом место на дороге.
    if (course.mode == 'journey') {
      final indexed = [for (var i = 0; i < candidates.length; i++) (i, candidates[i])]
        ..sort((a, b) {
          final d = _potential(b.$2, limit) - _potential(a.$2, limit);
          if (d != 0) return d.sign.toInt();
          // При равенстве — тот, кто ещё держит запас: удвоение позже не хуже удвоения сейчас.
          final r = (b.$2.reserve != null ? 1 : 0) - (a.$2.reserve != null ? 1 : 0);
          return r != 0 ? r : a.$1 - b.$1;
        });
      candidates = [for (final e in indexed.take(3)) e.$2];
    }
  }
  if (candidates.isEmpty) return null;
  // Непотраченный запас эталон применяет перед финишем: финал меряется по лучшему числу.
  // Без запаса — прежний выбор (первый кандидат), чтобы эталоны прежних уровней не сдвинулись.
  if (candidates.every((c) => c.reserve == null)) return candidates.first.path;
  final best = candidates.reduce((a, b) => _potential(b, limit) > _potential(a, limit) ? b : a);
  if (best.reserve == null || best.path.isEmpty) return best.path;
  final last = best.path.last;
  return [
    ...best.path.sublist(0, best.path.length - 1),
    SolverStep(id: last.id, lane: last.lane, sum: _potential(best, limit), route: last.route),
  ];
}

/// `row.penalties[lane + 1]`: у полосы-половинки в JS это `undefined`.
double? _penaltyAt(RoadRow row, double lane) {
  final i = lane + 1;
  if (i != i.truncateToDouble() || i < 0 || i >= row.penalties.length) return null;
  return row.penalties[i.toInt()];
}

String? _optionAt(RoadRow row, double lane) {
  final i = lane + 1;
  if (i != i.truncateToDouble() || i < 0 || i >= row.options.length) return null;
  return row.options[i.toInt()] as String;
}

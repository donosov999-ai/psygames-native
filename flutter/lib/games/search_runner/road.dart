/// ДОРОГА РАННЕРА — общее ядро раннеров, перенос `runner-core.mjs` «Числового забега» (VER 8).
///
/// 🔴 ПОЧЕМУ ПЕРЕНОС, А НЕ СВОЯ ФИЗИКА. Раннер «Поиска» — второй раннер после «Числового
/// забега», и по цепочке (звено 3) у обоих будет ОДНО ядро: забег потом ляжет на эту дорогу
/// станциями «Счёта» (задача 41845727). Поэтому скорость смены полосы, округление полосы на
/// пересечении ряда и догон кадра — те же строки, что в вебе, и сверяются с эталоном прогона
/// живого ядра: `test/fixtures/road-reference.json`
/// (`frontend/src/games/number-run/tools/record-road-reference.mjs`).
///
/// Что есть: ряд-ответ (`answer` — три арки, полоса = ответ), боковое движение к цели, пауза,
/// шаг 1/120 с, догон не больше 0,25 с, долгий кадр > 0,8 с. Чего нет: сборы, стенки,
/// трамплины, ворота-правила, шкала — механика «Числового забега», переносится с его станциями.
///
/// ⚠️ `correct` у ряда — С НУЛЯ: полосы −1/0/1, верно при `lane + 1 == correct`.
/// ⚠️ Полоса округляется как `Math.round` в JS (половина — вверх), а не как `round()` в Dart.
library;

import 'dart:math' as math;

import '../../shell/js_compat.dart' show jsRound;

/// Шаг интегрирования — как `FIXED_DT` ядра.
const double roadFixedDt = 1 / 120;

enum RoadStatus { ready, running, paused }

/// Ряд дороги. Ядру важны место, верная полоса и цена; что нарисовано в арках — [payload].
class RoadRow {
  const RoadRow({
    required this.id,
    required this.z,
    required this.correct,
    this.window,
    this.reward = 1,
    this.penalty = 0,
    this.options = const ['a', 'b', 'c'],
    this.payload,
  });

  final int id;
  final double z;

  /// Верная полоса С НУЛЯ: 0 — левая, 1 — средняя, 2 — правая.
  final int correct;

  /// Ряд засчитывается на `z + window`, а событие пишет `z` ряда.
  final double? window;
  final double reward;
  final double penalty;
  final List<Object?> options;

  /// Станция, которую рисует экран: ядро её не читает.
  final Object? payload;

  double get eventZ => z + (window ?? 0);

  factory RoadRow.fromJson(Map<String, dynamic> j) => RoadRow(
        id: j['id'] as int,
        z: (j['z'] as num).toDouble(),
        correct: j['correct'] as int,
        window: (j['window'] as num?)?.toDouble(),
        reward: (j['reward'] as num? ?? 1).toDouble(),
        penalty: (j['penalty'] as num? ?? 0).toDouble(),
        options: (j['options'] as List?)?.cast<Object?>() ?? const ['a', 'b', 'c'],
      );
}

class RoadCourse {
  const RoadCourse({
    required this.levelId,
    required this.seed,
    required this.rows,
    this.mode = 'journey',
    this.speed = 8,
    this.lateralSpeed = 4,
    this.start = 0,
  });

  final int levelId;
  final int seed;
  final List<RoadRow> rows;

  /// `journey` — долгий кадр не ставит на паузу, а отбрасывается (время пишется в журнал);
  /// иначе долгий кадр — пауза «прерывание», как у тренировок «Числового забега».
  final String mode;
  final double speed; // единиц дороги в секунду
  final double lateralSpeed; // полос в секунду
  final double start;

  double get length => rows.isEmpty ? 0 : rows.last.eventZ;

  factory RoadCourse.fromJson(Map<String, dynamic> j) => RoadCourse(
        levelId: j['levelId'] as int,
        seed: j['seed'] as int,
        mode: j['mode'] as String? ?? 'training',
        speed: (j['speed'] as num).toDouble(),
        lateralSpeed: (j['lateralSpeed'] as num).toDouble(),
        start: (j['start'] as num? ?? 0).toDouble(),
        rows: [for (final r in j['rows'] as List) RoadRow.fromJson(r as Map<String, dynamic>)],
      );
}

/// Событие дороги: ответ на ряду, пауза, продолжение. Та же форма, что в вебе.
class RoadEvent {
  const RoadEvent.answer({
    required int this.id,
    required int this.lane,
    required this.value,
    required bool this.ok,
    required double this.before,
    required double this.after,
    required this.t,
    required this.z,
  })  : type = 'answer',
        reason = null;

  const RoadEvent.pause({required String this.reason, required this.t, required this.z})
      : type = 'pause',
        id = null,
        lane = null,
        value = null,
        ok = null,
        before = null,
        after = null;

  const RoadEvent.resume({required this.t, required this.z})
      : type = 'resume',
        reason = null,
        id = null,
        lane = null,
        value = null,
        ok = null,
        before = null,
        after = null;

  final String type;
  final int? id;
  final int? lane; // −1 / 0 / 1
  final Object? value;
  final bool? ok;
  final double? before, after;
  final double t, z;
  final String? reason;

  Map<String, Object?> toJson() => switch (type) {
        'answer' => {
            'type': type,
            'id': id,
            'lane': lane,
            'value': value,
            'ok': ok,
            'before': before,
            'after': after,
            't': t,
            'z': z,
          },
        'pause' => {'type': type, 'reason': reason, 't': t, 'z': z},
        _ => {'type': type, 't': t, 'z': z},
      };
}

/// Состояние забега. Шаг не меняет прежнее состояние — возвращает новое, как в вебе.
class RoadState {
  RoadState._({
    required this.levelId,
    required this.seed,
    required this.status,
    required this.z,
    required this.x,
    required this.target,
    required this.sum,
    required this.peak,
    required this.nextRow,
    required this.elapsed,
    required this.events,
    required this.slowFrames,
    required this.discardedTime,
    required this.pauses,
    required this.mistakes,
  });

  final int levelId, seed;
  RoadStatus status;
  double z, x, target, sum, peak, elapsed, discardedTime;
  int nextRow, slowFrames, pauses, mistakes;
  List<RoadEvent> events;

  /// Ответы по порядку рядов — то, что экран считает находками и промахами.
  Iterable<RoadEvent> get answers => events.where((e) => e.type == 'answer');

  RoadState copy() => RoadState._(
        levelId: levelId,
        seed: seed,
        status: status,
        z: z,
        x: x,
        target: target,
        sum: sum,
        peak: peak,
        nextRow: nextRow,
        elapsed: elapsed,
        events: events,
        slowFrames: slowFrames,
        discardedTime: discardedTime,
        pauses: pauses,
        mistakes: mistakes,
      );
}

RoadState roadInitial(RoadCourse c) => RoadState._(
      levelId: c.levelId,
      seed: c.seed,
      status: RoadStatus.ready,
      z: 0,
      x: 0,
      target: 0,
      sum: c.start,
      peak: c.start,
      nextRow: 0,
      elapsed: 0,
      events: const [],
      slowFrames: 0,
      discardedTime: 0,
      pauses: 0,
      mistakes: 0,
    );

/// Тянуть к точке дороги (−1…1). Не в забеге — ничего.
RoadState roadSetTarget(RoadState s, double x) {
  if (!x.isFinite) throw ArgumentError('Invalid target');
  if (s.status != RoadStatus.running) return s;
  return s.copy()..target = math.max(-1.0, math.min(1.0, x));
}

/// Соседняя полоса. Цель округляется как `Math.round` в вебе.
RoadState roadChangeLane(RoadState s, int delta) => roadSetTarget(s, jsRound(s.target) + delta);

RoadState roadPause(RoadState s, [String reason = 'manual']) {
  if (s.status != RoadStatus.running) return s;
  return s.copy()
    ..status = RoadStatus.paused
    ..pauses = s.pauses + 1
    ..events = [...s.events, RoadEvent.pause(reason: reason, t: s.elapsed, z: s.z)];
}

RoadState roadResume(RoadState s) {
  if (s.status != RoadStatus.ready && s.status != RoadStatus.paused) return s;
  return s.copy()
    ..status = RoadStatus.running
    ..events = [...s.events, RoadEvent.resume(t: s.elapsed, z: s.z)];
}

/// Один шаг интегрирования (не длиннее 0,1 с): движение вперёд и вбок, ряды на пути.
RoadState roadStep(RoadState s, double dt, RoadCourse c) {
  if (!dt.isFinite || dt < 0 || dt > .1 + 1e-10) throw ArgumentError('dt outside simulation contract');
  if (s.status != RoadStatus.running || dt == 0) return s;
  if (c.levelId != s.levelId || c.seed != s.seed) throw ArgumentError('Wrong course');
  final endZ = s.z + dt * c.speed, lat = c.lateralSpeed;
  double move(double x0, double t) =>
      x0 + (s.target - x0).sign * math.min((s.target - x0).abs(), t * lat);
  double xAt(double t) => move(s.x, t);
  final next = s.copy()
    ..z = endZ
    ..x = xAt(dt)
    ..elapsed = s.elapsed + dt
    ..events = [...s.events];
  while (next.nextRow < c.rows.length && c.rows[next.nextRow].eventZ <= endZ + 1e-9) {
    final row = c.rows[next.nextRow];
    final t = math.max(0.0, (row.eventZ - s.z) / c.speed);
    final x = xAt(t);
    final lane = math.max(-1, math.min(1, jsRound(x).toInt()));
    final before = next.sum;
    // Каждая полоса — вариант; верна одна. Пустых зазоров нет.
    final ok = lane + 1 == row.correct;
    next.sum += ok ? row.reward : -row.penalty;
    if (!ok) next.mistakes += 1;
    next.events.add(RoadEvent.answer(
      id: row.id,
      lane: lane,
      value: row.options[lane + 1],
      ok: ok,
      before: before,
      after: next.sum,
      t: s.elapsed + t,
      z: row.z,
    ));
    next.nextRow += 1;
    next.peak = math.max(next.peak, next.sum);
  }
  return next;
}

/// Кадр любой длины: догон не больше 0,25 с шагами 1/120 с; кадр длиннее 0,8 с — пауза
/// «прерывание» (или, в режиме `journey`, отброшенное время в журнале). Не прячем — пишем.
RoadState roadAdvanceFrame(RoadState s, double dt, RoadCourse c) {
  if (!dt.isFinite || dt < 0) throw ArgumentError('Invalid frame interval');
  if (s.status != RoadStatus.running) return s;
  if (dt > .8) {
    if (c.mode != 'journey') return roadPause(s, 'interruption');
    return s.copy()
      ..slowFrames = s.slowFrames + 1
      ..discardedTime = s.discardedTime + dt;
  }
  var next = s.copy()
    ..slowFrames = s.slowFrames + (dt > .1 ? 1 : 0)
    ..discardedTime = s.discardedTime + math.max(0.0, dt - .25);
  var remaining = math.min(dt, .25);
  while (remaining > 1e-10 && next.status == RoadStatus.running) {
    final part = math.min(remaining, roadFixedDt);
    next = roadStep(next, part, c);
    remaining -= part;
  }
  return next;
}

import '../../shell/js_compat.dart' show jsNum;
import 'road.dart';

/// A scoring event the renderer can show without gating the simulation.
class RunnerAnswerCue {
  const RunnerAnswerCue(this.right, {this.delta = 0});

  final bool right;
  final double delta;

  static const lifetime = .55;

  String get label {
    final mark = right ? '✓' : '✗';
    if (delta == 0) return mark;
    return '$mark ${delta > 0 ? '+' : '−'}${jsNum(delta.abs())}';
  }

  static RunnerAnswerCue? fromEvent(RoadEvent event) {
    double difference() => (event.after ?? 0) - (event.before ?? 0);
    RunnerAnswerCue? signed(Object? amount) {
      if (amount is! num || amount == 0) return null;
      return RunnerAnswerCue(amount > 0, delta: amount.toDouble());
    }

    return switch (event.type) {
      'answer' => RunnerAnswerCue(event.ok == true, delta: difference()),
      'scale' => signed(event.data['delta']),
      'pickups' => switch (event.data['exact']) {
        {'delta': final value} => signed(value),
        _ => null,
      },
      'gate' => RunnerAnswerCue(event.ok == true),
      'obstacle' => signed(-((event.data['damage'] as num?) ?? 0)),
      _ => null,
    };
  }

  static ({RunnerAnswerCue cue, double age})? recent(RoadState state) {
    if (state.status != RoadStatus.running) return null;
    for (final event in state.events.reversed) {
      final age = state.elapsed - event.t;
      if (age >= lifetime) break;
      final cue = fromEvent(event);
      if (cue != null) return (cue: cue, age: age.clamp(0.0, lifetime));
    }
    return null;
  }
}

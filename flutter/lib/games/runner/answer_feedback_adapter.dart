import 'dart:async';

import '../../shell/answer_feedback.dart';
import 'answer_cue.dart';
import 'road.dart';

const runnerAnswerFeedback = RunnerAnswerFeedbackAdapter();

/// The shared signal still drives haptics. The renderer owns the visual
/// clock and reads the same scoring cue, so neither road nor input waits
/// on the shell overlay.
class RunnerAnswerFeedbackAdapter implements AnswerFeedbackAdapter {
  const RunnerAnswerFeedbackAdapter();

  @override
  AnswerFeedbackDelivery adapt(AnswerMarkState signal) =>
      const AnswerFeedbackDelivery(haptic: true);

  RunnerAnswerCue? cueFor(RoadEvent event) => RunnerAnswerCue.fromEvent(event);

  ({RunnerAnswerCue cue, double age})? recent(RoadState state) =>
      RunnerAnswerCue.recent(state);

  void emit(AnswerFeedback feedback, RoadEvent event) {
    final cue = cueFor(event);
    if (cue != null) {
      unawaited(feedback.show(cue, cue.right ? cue : null, right: cue.right));
    }
  }
}

/// Issued by the playlist provider, never inferred from the current route at completion.
class WarmupOwner {
  const WarmupOwner(this.runId, this.stepIdx, this.attemptId);
  final String runId;
  final int stepIdx;
  final String attemptId;

  static WarmupOwner? fromJson(Object? value) {
    if (value is! Map) return null;
    final run = value['run_id'];
    final step = value['step_idx'];
    final attempt = value['attempt_id'];
    if (run is! String || run.isEmpty || step is! int || step < 0 ||
        attempt is! String || attempt.isEmpty) { return null; }
    return WarmupOwner(run, step, attempt);
  }

  static WarmupOwner? fromQuery(Map<String, String> query) => fromJson({
    'run_id': query['wuRun'],
    'step_idx': int.tryParse(query['wuStep'] ?? ''),
    'attempt_id': query['wuAttempt'],
  });

  Map<String, Object> toJson() => {'run_id': runId, 'step_idx': stepIdx, 'attempt_id': attemptId};

  @override
  bool operator ==(Object other) => other is WarmupOwner &&
      runId == other.runId && stepIdx == other.stepIdx && attemptId == other.attemptId;
  @override
  int get hashCode => Object.hash(runId, stepIdx, attemptId);
}

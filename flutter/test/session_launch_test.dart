import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/synapse/synapse_feed.dart';

void main() {
  const attemptA = 'b7b05fc4-3a21-4e8a-9b78-baaedba20001';
  const attemptB = 'b7b05fc4-3a21-4e8a-9b78-baaedba20002';
  final uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );
  late List<Map<String, dynamic>> reports;

  Map<String, String> query(String attempt, {String run = 'run-a', int step = 4}) => {
    'wu': '1', 'wuRun': run, 'wuStep': '$step', 'wuAttempt': attempt,
  };

  Future<void> send({SessionLaunch? launch, String? id, Map<String, Object?>? details}) =>
      SessionReport.send(
        launch: launch, id: id, gameType: 'sudoku', score: 17,
        timeSeconds: 23, mode: 'towers-1', errors: 2, details: details,
      );

  setUp(() {
    GamePreset.clear();
    SynapseFeed.resetForTest();
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });
  tearDown(() {
    SessionReport.sink = null;
    GamePreset.clear();
    SynapseFeed.resetForTest();
  });

  test('capture copies params and exposes an immutable snapshot', () {
    final params = query(attemptA);
    GamePreset.set(params);
    final launch = SessionLaunch.capture();
    params['wuRun'] = 'mutated';
    GamePreset.set(query(attemptB));
    expect(launch.params['wuAttempt'], attemptA);
    expect(launch.warmupOwner!.runId, 'run-a');
    expect(() => launch.params['wuRun'] = 'changed', throwsUnsupportedError);
  });

  test('old launch finishes after route replacement with its owner and transit', () async {
    GamePreset.set({...query(attemptA), 'ladderGame': 'old-host', 'ladderLevel': '12'});
    final old = SessionLaunch.capture();
    GamePreset.set({...query(attemptB, run: 'new-run', step: 9),
      'ladderGame': 'new-host', 'ladderLevel': '99'});
    final details = <String, Object?>{'completed': true, 'level': 3};
    await send(launch: old, details: details);
    expect(reports.single['id'], attemptA);
    expect(reports.single['details'], {
      'completed': true, 'level': 3, 'ladderGame': 'old-host', 'ladderLevel': 12,
      'warmup_owner': {'run_id': 'run-a', 'step_idx': 4, 'attempt_id': attemptA},
    });
    expect(details, {'completed': true, 'level': 3});
  });

  test('cleared global route does not remove captured owner', () async {
    GamePreset.set(query(attemptA));
    final launch = SessionLaunch.capture();
    GamePreset.clear();
    await send(launch: launch);
    expect(reports.single['details']['warmup_owner']['attempt_id'], attemptA);
  });

  for (final incomplete in <Map<String, String>>[
    {'wu': '1'},
    {'wu': '1', 'wuRun': 'run-a', 'wuStep': '4'},
    {'wu': '1', 'wuRun': '', 'wuStep': '4', 'wuAttempt': attemptA},
    {'wu': '1', 'wuRun': 'run-a', 'wuStep': '-1', 'wuAttempt': attemptA},
    {'wu': '1', 'wuRun': 'run-a', 'wuStep': 'bad', 'wuAttempt': attemptA},
  ]) {
    test('incomplete owner stays missing: $incomplete', () async {
      GamePreset.set(incomplete);
      final old = SessionLaunch.capture();
      GamePreset.set(query(attemptB));
      await send(launch: old, details: {
        'completed': true, 'warmup_owner': {'run_id': 'unrelated'},
      });
      expect(old.warmupOwner, isNull);
      expect(old.reportId, isNull);
      expect(reports.single.containsKey('id'), isFalse);
      expect(reports.single['details'], {'completed': true});
    });
  }

  test('implicit send never borrows global warmup owner or id', () async {
    GamePreset.set(query(attemptA));
    await send();
    expect(reports.single.containsKey('details'), isFalse);
    expect(reports.single.containsKey('id'), isFalse);
  });

  test('valid issued UUID is stable across captures and terminal retransmits', () async {
    GamePreset.set(query(attemptA));
    final first = SessionLaunch.capture();
    final second = SessionLaunch.capture();
    await send(launch: first);
    await send(launch: first);
    await send(launch: second);
    expect(reports.map((r) => r['id']), everyElement(attemptA));
  });

  test('provider retry on same step gets a distinct issued report UUID', () async {
    GamePreset.set(query(attemptA));
    final first = SessionLaunch.capture();
    GamePreset.set(query(attemptB));
    final retry = SessionLaunch.capture();
    await send(launch: retry);
    await send(launch: first);
    expect(reports.map((r) => r['id']), [attemptB, attemptA]);
  });

  test('legacy fake attempt gets one retained UUID without rewriting owner', () async {
    GamePreset.set(query('attempt-a'));
    final launch = SessionLaunch.capture();
    expect(launch.reportId, matches(uuid));
    expect(launch.reportId![14], '4');
    expect(launch.reportId![19], matches(RegExp('[89ab]')));
    await send(launch: launch);
    await send(launch: launch);
    expect(reports.map((r) => r['id']), everyElement(launch.reportId));
    expect(reports.first['details']['warmup_owner']['attempt_id'], 'attempt-a');
  });

  test('explicit retransmit id is preserved', () async {
    GamePreset.set(query(attemptA));
    await send(launch: SessionLaunch.capture(), id: attemptB);
    expect(reports.single['id'], attemptB);
    expect(reports.single['details']['warmup_owner']['attempt_id'], attemptA);
  });

  test('ordinary launch preserves payload and per-report bridge identity', () async {
    final launch = SessionLaunch.capture();
    GamePreset.set({...query(attemptA), 'ladderGame': 'late', 'ladderLevel': '99'});
    await send(launch: launch, details: {'completed': true});
    await send(launch: launch, details: {'completed': true});
    expect(launch.reportId, isNull);
    expect(reports, everyElement({
      'game_type': 'sudoku', 'score': 17, 'time_seconds': 23,
      'mode': 'towers-1', 'errors': 2, 'details': {'completed': true},
    }));
  });

  test('owner query without warmup flag is ordinary', () async {
    GamePreset.set({...query(attemptA), 'wu': '0'});
    final launch = SessionLaunch.capture();
    await send(launch: launch);
    expect(launch.warmupOwner, isNull);
    expect(reports.single.containsKey('id'), isFalse);
    expect(reports.single.containsKey('details'), isFalse);
  });

  test('legacy transit send retains existing send-time metadata', () async {
    GamePreset.set({'ladderGame': 'sudoku', 'ladderLevel': 'bad'});
    await send(details: {'completed': false});
    expect(reports.single['details'], {
      'completed': false, 'ladderGame': 'sudoku', 'ladderLevel': 0,
    });
    expect(reports.single.containsKey('id'), isFalse);
  });

  test('awaiting sink and retry cannot acquire a newer launch', () async {
    GamePreset.set(query(attemptA));
    final old = SessionLaunch.capture();
    final pending = Completer<void>();
    SessionReport.sink = (json) {
      reports.add(jsonDecode(json) as Map<String, dynamic>);
      return pending.future;
    };
    final sending = send(launch: old);
    GamePreset.set(query(attemptB));
    pending.completeError(StateError('transport failed'));
    await expectLater(sending, throwsStateError);
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
    await send(launch: old);
    expect(reports.map((r) => r['id']), [attemptA, attemptA]);
    expect(reports.map((r) => r['details']['warmup_owner']['attempt_id']),
      [attemptA, attemptA]);
  });
}

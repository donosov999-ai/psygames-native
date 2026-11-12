// Партия зарядки без приёмника не пропадает молча (задача 4191419c, шаг «страховка»).
//
// Приёмник партий сегодня — JS веб-половины. Без него (`SessionReport.sink == null`) отчёт зарядки
// раньше исчезал без следа, и серия переставала копиться. Теперь потеря громкая; обычная партия
// без приёмника по-прежнему тиха (на этом держатся десятки проб).
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/session_report.dart';

void main() {
  late List<String> dropped;

  setUp(() {
    dropped = [];
    GamePreset.clear();
    SessionReport.sink = null;
    SessionReport.onDropped = dropped.add;
  });

  tearDown(() {
    GamePreset.clear();
    SessionReport.sink = null;
    SessionReport.onDropped = null;
  });

  Future<void> send() =>
      SessionReport.send(gameType: 'breathing', score: 96, timeSeconds: 96, launch: SessionLaunch.capture());

  test('зарядка без приёмника: потеря слышна', () async {
    GamePreset.set({'wu': '1'});
    await send();
    expect(dropped, ['breathing']);
  });

  test('обычная партия без приёмника: тихо', () async {
    await send();
    expect(dropped, isEmpty);
  });

  test('зарядка с приёмником: ничего не теряется, владелец шага на месте', () async {
    final sent = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => sent.add(jsonDecode(json) as Map<String, dynamic>);
    GamePreset.set({'wu': '1', 'wuRun': 'run-1', 'wuStep': '2', 'wuAttempt': '11111111-2222-4333-8444-555555555555'});
    await send();
    expect(dropped, isEmpty);
    expect(sent, hasLength(1));
    expect(sent.single['game_type'], 'breathing');
    expect(sent.single['details']['warmup_owner'], {'run_id': 'run-1', 'step_idx': 2, 'attempt_id': '11111111-2222-4333-8444-555555555555'});
  });
}

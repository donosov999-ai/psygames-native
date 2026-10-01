import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';

/// 🔴 ПАРТИЯ С РАЗБОРОМ НЕСЁТ `lesson: true` В ОТЧЁТЕ (задача 9660186d, 30.09.2026).
///
/// Монеты и серию «чисто» считает веб (`api.ts` → `earn.ts`), и без флага он платил ×2
/// за партию, про которую экран пишет «не засчитывается». Флаг ставит сама лестница —
/// одним местом для всех нативных экранов; проба держит обе ветки: победу и провал.
void main() {
  late List<Map<String, dynamic>> reports;

  setUp(() {
    reports = [];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
  });
  tearDown(() {
    SessionReport.sink = null;
    LessonUsed.reset();
  });

  LevelLadder ladder() => LevelLadder(gameId: 'probe', store: MemoryLevelStore());

  test('победа после разбора: флаг есть, свои подробности игры не потеряны', () async {
    final l = ladder();
    await l.load();
    LessonUsed.mark();
    await l.win(details: {'moves': 7});
    final d = reports.single['details'] as Map<String, dynamic>;
    expect(d['lesson'], true);
    expect(d['moves'], 7);
    expect(l.level, 1, reason: 'партия с разбором уровень не двигает');
  });

  test('провал после разбора — тоже с флагом', () async {
    final l = ladder();
    await l.load();
    LessonUsed.mark();
    await l.fail();
    expect((reports.single['details'] as Map<String, dynamic>)['lesson'], true);
  });

  test('обычная партия флага не несёт — начисление у неё прежнее', () async {
    final l = ladder();
    await l.load();
    await l.win(details: {'moves': 3});
    expect((reports.single['details'] as Map<String, dynamic>).containsKey('lesson'), isFalse);
    expect(l.level, 2);
  });
}

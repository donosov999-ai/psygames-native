// 🔴 КЕГЕЛЬ В ПАРЕ С ДЫХАНИЕМ: сжатие на выдохе и на задержке после него.
//
// 08.10.2026, отчёт «Умного будильника» b81fcf7d (Денис, сборка 1.0 (39)): «удержания
// совсем короткие, три цикла расслабление и один только удержание». С 03.10 задержку
// после выдоха отдавали расслаблению, и в «Квадрате» 4–4–4–4 на 4 с сжатия
// приходилось 12 с расслабления. Журнал вибрации из отчёта: гул 4 с раз в 16 с.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

void main() {
  final engine = Practices(jsonDecode(File('assets/practices.json').readAsStringSync()));

  Json plan(String breathing) => engine.plan({
        'mode': 'parallel',
        'durationMs': 64000,
        'locale': 'ru',
        'selections': [
          {'setId': 'breathing', 'programId': breathing},
          {'setId': 'pelvic-floor', 'programId': 'balanced'},
        ],
        'guideMode': 'visual',
        'context': 'home',
        'advisory': true,
        'soloCompletions': {'breathing': 99, 'pelvic-floor': 99},
      });

  test('«Квадрат»: задержка после выдоха — сжатие, сжатие и расслабление поровну', () {
    final p = plan('box');
    final timeline = objects(p['timeline']);
    final pelvic = timeline.where((s) => s['setId'] == 'pelvic-floor').toList();
    String pelvicAt(int ms) => pelvic.firstWhere((s) => s['startMs'] == ms)['stepId'];
    final breath = timeline.where((s) => s['setId'] == 'breathing');
    expect(breath.where((s) => s['stepId'] == 'hold-out'), isNotEmpty);
    for (final b in breath) {
      final id = '${b['stepId']}';
      final squeeze = id.contains('exhale') || id.endsWith('-out');
      expect(pelvicAt(b['startMs'] as int), squeeze ? 'long-squeeze' : 'long-release', reason: id);
    }
    int ms(String id) => pelvic
        .where((s) => s['stepId'] == id)
        .fold(0, (n, s) => n + (s['endMs'] as int) - (s['startMs'] as int));
    expect(ms('long-squeeze') / ms('long-release'), closeTo(1, 0.2));
  });
}

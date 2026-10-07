// «Пауза»: Dart-перенос ядра практик против ЖИВОГО ядра на TS.
//
// Ядро одно — `frontend/src/games/pause/core/engine.ts`; веб-экран `/games/pause`
// исполняет его напрямую. Dart-перенос (пакет practice_kit, `lib/src/practices.dart`) взят у
// «Умного будильника», где уже сверен с этим же ядром, — но эталон здесь снят
// заново с исходника ЭТОГО репозитория (`node flutter/tools/export-pause.cjs`):
// эталон замораживает перенос, а не источник.
//
// Сверяется всё, что ядро отдаёт экрану: план (шаги, длительности, слоты
// параллельного режима), отказы плана с кодами, кадры в пяти точках времени и
// сессия через старт → тик → паузу → продолжение → продление → пропуск → конец.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:practice_kit/practice_kit.dart';

List _fixture() => jsonDecode(
      utf8.decode(gzip.decode(File('test/fixtures/pause-reference.json.gz').readAsBytesSync())),
    ) as List;

void main() {
  final engine = Practices(jsonDecode(File('../packages/practice_kit/assets/practices.json').readAsStringSync()));
  final cases = _fixture();

  // Каталог общий с «Умным будильником» (пакет practice_kit): ядро на TS плюс
  // надстройка пакета — массаж лица и три режима глаз. Ядерная часть обязана
  // совпадать с веб-экраном, а сверх неё — ровно надстройка, и ничего больше.
  test('каталог: ядро — то же, что у веб-экрана (10 наборов, 42 программы), сверх — только надстройка', () {
    final overlay = jsonDecode(File('../packages/practice_kit/tool/catalog_overlay.json').readAsStringSync()) as Json;
    final extraSets = {for (final s in objects(overlay['sets'])) (s['set'] as Json)['id']};
    final extraPrograms = {
      for (final p in objects(overlay['programs']))
        for (final program in objects(p['programs'])) '${p['set']}/${program['id']}',
    };
    expect(extraSets, {'face-massage'});
    expect(extraPrograms, {'eye-gym/geometry-paths', 'eye-gym/catch-overlap', 'eye-gym/two-dots'});
    final core = engine.catalog.where((s) => !extraSets.contains(s['id'])).toList();
    expect(core.length, 10);
    final programs = core.fold<int>(
      0,
      (n, s) => n + objects(s['programs']).where((p) => !extraPrograms.contains('${s['id']}/${p['id']}')).length,
    );
    expect(programs, 42);
    expect(engine.catalog.length, 11);
  });

  test('эталон не пустой и содержит отказы: иначе сверка отказов слепа', () {
    expect(cases.length, greaterThan(150));
    expect(cases.where((c) => c['issues'] != null), isNotEmpty);
    expect(cases.where((c) => c['request']['mode'] == 'parallel'), isNotEmpty);
    expect(cases.where((c) => c['request']['mode'] == 'charge'), isNotEmpty);
  });

  for (var i = 0; i < cases.length; i++) {
    test('TS против Dart: план, отказы, кадры, сессия — случай $i', () {
      final c = cases[i];
      if (c['issues'] != null) {
        expect(
          () => engine.plan(c['request']),
          throwsA(isA<PlanFailure>().having((e) => e.codes, 'codes', c['issues'])),
        );
        return;
      }
      final plan = engine.plan(c['request']);
      expect(plan, c['plan']);
      final duration = plan['durationMs'] as int;
      expect(
        [0, 1000, 5000, duration - 1, duration].map((t) => engine.frame(plan, t)).toList(),
        c['frames'],
      );
      var s = newSession(plan);
      final sessions = [s];
      for (final a in [
        ('start', 1000),
        ('tick', 2234),
        ('pause', 3200),
        ('resume', 7000),
        ('extend', 8500),
        ('skip', 9000),
        ('tick', 999999),
      ]) {
        s = sessionAction(s, a.$1, a.$2);
        sessions.add(s);
      }
      expect(sessions, c['sessions']);
    });
  }
}

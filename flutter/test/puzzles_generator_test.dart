import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/generator/contract.dart';
import 'package:psygames_flutter/shell/generator/engine.dart';
import 'package:psygames_flutter/shell/generator/ladder_pool.dart';
import 'package:psygames_flutter/shell/generator/store.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ГЕНЕРАТОР УРОВНЕЙ НА ВСЕХ 42 РЕЖИМАХ ГОЛОВОЛОМОК — ЗВЕНО 2 ЦЕПОЧКИ (задача 543d853c).
///
/// Эталон «Судоку» вынесен в общий модуль (`lib/shell/generator/`), и головоломки Тэтхэма
/// подключены к нему одним путём — через общий экран. Проба держит три вещи:
///   1. ЗАМЕР ЗВЕНА: у каждого из 42 режимов пул собирается, выбор завершается, рейтинги
///      ступеней растут вместе с лестницей — число режимов и особых случаев печатается;
///   2. ИСХОД ПАРТИИ доходит до генератора правильным: «Показать решение» — разбор
///      (`assisted`), ступень не двигается, партия всё равно записана;
///   3. ИЗОЛЯЦИЯ: тень генератора пишет только свои ключи, прописанный уровень не тронут.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    await PuzzleModes.load();
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  test('🔴 замер звена 2: генератор подключён ко всем 42 режимам одним путём', () {
    final engine = TathamEngine.open(libPath);
    var own = 0, fromEngine = 0;
    final single = <String>[];
    final problems = <String>[];
    for (final e in PuzzleModes.all.entries) {
      final index = engine.indexOf(e.value.engineName);
      if (index < 0) {
        problems.add('${e.key}: движок не знает игру');
        continue;
      }
      final steps = resolveSteps(e.value, engine, index);
      e.value.steps.isNotEmpty ? own++ : fromEngine++;
      final pool = ladderPool(gameId: e.value.levelKey, stepKeys: [for (final s in steps) s.params]);
      if (pool.length != steps.length) problems.add('${e.key}: шаблонов ${pool.length}, ступеней ${steps.length}');
      if (pool.map((t) => t.id).toSet().length != pool.length) problems.add('${e.key}: две ступени с одними параметрами');
      for (var i = 1; i < pool.length; i++) {
        if (!(pool[i].rating > pool[i - 1].rating)) problems.add('${e.key}: рейтинг ступени ${i + 1} не выше $i');
      }
      if (pool.length == 1) single.add(e.key);
      // Выбор обязан завершаться и на вырожденном пуле из одной ступени (§8.5 эталона).
      if (pickNext(AdaptiveState(), pool, Leniency.normal) == null) problems.add('${e.key}: выбор вернул пусто');
    }
    // ignore: avoid_print
    print('ГЕНЕРАТОР · ГОЛОВОЛОМКИ: подключено ${own + fromEngine} из ${PuzzleModes.all.length} '
        '(своя лестница $own, меню движка $fromEngine); одна ступень: ${single.join(', ')}');
    expect(problems, isEmpty);
    expect(own + fromEngine, 42);
  });

  testWidgets('🔴 «Показать решение» — разбор: партия записана, ступень стоит, генератор учит «с подсказкой»',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_puzzles_solo_level_nzt48': '1',
    });
    final state = await SharedState.open();
    final reports = <Map<String, dynamic>>[];
    SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);

    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: PuzzlesScreen(state: state, mode: 'Solo', libraryPath: libPath)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();

    final store = GeneratorStore(state, gameId: 'puzzles_solo');
    expect(store.shadowLog().length, 1, reason: 'раздача не попала в тень генератора');
    final row = store.shadowLog().single;
    expect((row['given'] as Map)['id'], startsWith('puzzles_solo:'), reason: 'шаблон — ступень режима');

    await tester.tap(find.byTooltip('Показать решение'));
    await tester.pump();
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 50)));
    await tester.pump();

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'ответ показан — дальше идти можно');
    expect(state.get('psygames_puzzles_solo_level_nzt48'), '1',
        reason: 'ступень за просмотр ответа не растёт — как в вебе (puzzles.tsx, разбор)');
    expect(reports.length, 1, reason: 'партия с разбором — тоже партия, запись одна');
    final r = reports.single;
    expect(r['game_type'], 'puzzles');
    expect(r['mode'], 'Solo');
    expect(r['difficulty'], 'Solo-1', reason: 'трудность пишется как в вебе: <режим>-<ступень>');
    expect((r['details'] as Map)['solver_used'], true);

    final s = store.load();
    expect(s.recentOutcomes, [Outcome.assisted.name], reason: 'решатель = «с подсказкой», не победа');
    expect(s.adaptiveWins, 0, reason: 'счётчик побед генератора за разбор не растёт');
    expect(s.skillRating, 1200, reason: 'с подсказкой рейтинг не двигается (§8.4 эталона)');
    // Изоляция: у генератора свои ключи, прописанный уровень только тот, что выше.
    final touched = state.snapshot().keys.where((k) => k.contains('puzzles_solo')).toSet();
    expect(touched.difference({
      'psygames_puzzles_solo_level_nzt48',
      'psygames_puzzles_solo_best_nzt48',
      store.stateKey,
      store.shadowKey,
    }), isEmpty, reason: 'генератор тронул чужие ключи');
  });
}

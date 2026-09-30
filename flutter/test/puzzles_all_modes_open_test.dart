import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ОТКРЫВАЕТСЯ ЛИ КАЖДЫЙ ИЗ 42 РЕЖИМОВ — ИЛИ ПЕРЕХВАТ ВКЛЮЧАТЬ НЕЛЬЗЯ.
///
/// Повод — замер 23.09.2026. Своя лестница в `modes.json` есть у 14 режимов, у
/// остальных 28 список ступеней ПУСТ. Экран лез в него индексом, и
/// `steps[(level-1).clamp(0, -1)]` — это не «ступеней нет», это падение на
/// открытии. То есть 28 режимов из 42 нельзя было открыть вовсе, и включённый
/// перехват `/games/puzzles` отдал бы игроку ошибку вместо двух третей раздела.
///
/// Проба отвечает числом на один вопрос: сколько режимов ОТКРЫВАЕТСЯ и РИСУЕТ.
/// Ступени она берёт той же функцией, что и экран ([resolveSteps]), — иначе
/// проверялось бы не то, что показывают человеку.
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

  test('🔴 все 42 режима открываются и рисуют доску', () {
    final engine = TathamEngine.open(libPath);
    final broken = <String>[];
    var own = 0;
    var fromEngine = 0;
    for (final entry in PuzzleModes.all.entries) {
      final mode = entry.value;
      final index = engine.indexOf(mode.engineName);
      if (index < 0) {
        broken.add('${entry.key}: движок не знает игру «${mode.engineName}»');
        continue;
      }
      final steps = resolveSteps(mode, engine, index);
      if (steps.isEmpty) {
        broken.add('${entry.key}: ступеней нет ни своих, ни от движка');
        continue;
      }
      mode.steps.isNotEmpty ? own++ : fromEngine++;
      // Первая ступень — то, что увидит человек, открывший режим впервые.
      if (!engine.start(index, steps.first.params, 20260923)) {
        broken.add('${entry.key}: партия не собралась на «${steps.first.params}»');
        continue;
      }
      if (engine.draw().isEmpty) broken.add('${entry.key}: доска пустая, кадр без примитивов');
    }
    expect(broken, isEmpty);
    // Доли на виду: рост своих лестниц заметен, а падение — тем более.
    // 📍 14+28 → 15+27 (25.09.2026): «Снос групп» получил свою лестницу —
    // перевёрнутую относительно авторской, чтобы доска стояла, а не лежала
    // (решение Дениса). Число здесь не порог, а ПЕРЕПИСЬ: растёт вместе с
    // работой разделов, и падение его тоже обязано быть заметным.
    expect('$own+$fromEngine', '15+27', reason: 'своих лестниц $own, от движка $fromEngine');
  });

  test('🔴 последняя ступень тоже собирается — лестница не обрывается на середине', () {
    final engine = TathamEngine.open(libPath);
    final broken = <String>[];
    for (final entry in PuzzleModes.all.entries) {
      final index = engine.indexOf(entry.value.engineName);
      if (index < 0) continue;
      final steps = resolveSteps(entry.value, engine, index);
      if (!engine.start(index, steps.last.params, 20260924)) {
        broken.add('${entry.key}: верхняя ступень «${steps.last.params}» не собралась');
      }
    }
    expect(broken, isEmpty);
  });

  testWidgets('🔴 режим без своей лестницы поднимается экраном, а не падает', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    // «Мозаика» — из тех 28: в `modes.json` у неё `steps: []`.
    expect(PuzzleModes.all['Mosaic']!.steps, isEmpty, reason: 'взял не тот образец');
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: 'Mosaic', libraryPath: libPath),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byKey(const Key('board')), findsOneWidget);
    // И ступени на месте: знаменатель в шапке — настоящий, а не выдуманные 999.
    expect(find.textContaining('/999'), findsNothing);
  });
}

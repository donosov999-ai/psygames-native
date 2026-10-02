import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 СТРЕЛКИ КУРСОРА И «ВЗЯТЬ» ДОХОДЯТ ДО ДВИЖКА — КАК В ВЕБЕ.
///
/// 📍 ЗАМЕР 01.10.2026: в `assets/puzzles/modes.json` признаки лежали (arrows — 16 режимов,
/// eightWays — «Инерция», pick — 12, pickSecond — 6), а нативный экран их не читал, и в
/// Dart не было привязки `psy_cursor`. У «Куба» и «Инерции» автор принимает ТОЛЬКО стрелки —
/// на Flutter эти два режима не играли вовсе. Ход проба видит по КАДРУ движка.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final flutterDir = Directory.current.path;
  final libPath = '$flutterDir/build/tatham/${TathamEngine.libraryName}';

  setUpAll(() async {
    await L.load('ru');
    if (File(libPath).existsSync()) return;
    final res = Process.runSync('bash', ['tool/build_tatham.sh'], workingDirectory: flutterDir);
    if (!File(libPath).existsSync()) {
      fail('движок не собран: bash tool/build_tatham.sh\n${res.stdout}\n${res.stderr}');
    }
  });

  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester, String mode) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: PuzzlesScreen(state: state, mode: mode, libraryPath: libPath),
      ));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  String digest(WidgetTester tester) {
    final paint = tester.widget<CustomPaint>(
      find.descendant(of: find.byKey(const Key('board')), matching: find.byType(CustomPaint)).first,
    );
    return (paint.painter! as PuzzlePainter).frame.ops.map((o) => switch (o) {
          OpRect r => 'R${r.x},${r.y},${r.w},${r.h}:${r.colour}',
          OpCircle c => 'C${c.cx},${c.cy}:${c.fill}',
          OpPoly p => 'P${p.points.join(',')}:${p.fill}',
          OpText t => 'T${t.x},${t.y}:${t.text}',
          OpLine l => 'L${l.x1},${l.y1},${l.x2},${l.y2}:${l.colour}',
          _ => '',
        }).join('|');
  }

  /// Нажимать стрелки по кругу, пока движок не запишет ХОД: у стены одна сторона может не сдвинуть.
  /// Ход — по позиции в истории движка, а не по кадру: кадр меняется и без ввода.
  Future<bool> anyArrowMoves(WidgetTester tester, List<String> keys) async {
    final e = PuzzlesScreen.debugEngine!;
    for (final k in keys) {
      final before = e.statePos;
      await tester.tap(find.byKey(Key(k)));
      await tester.pump();
      if (e.statePos > before) return true;
    }
    return false;
  }

  /// Диагональ «Инерции» на СЛУЧАЙНОМ поле: шар может стоять так, что все четыре диагонали
  /// упираются в стену, — тогда хода нет, хотя цифровой блок работает. 02.10.2026 так покраснела
  /// сборка TestFlight 2.56.5 на macOS (локально 5/5 зелёных). Проба про то, что диагональ доходит
  /// до движка, а не про то, какое поле выпало: сдвинуть шар прямым ходом и попробовать снова.
  Future<bool> anyDiagonalMoves(WidgetTester tester) async {
    const diagonals = ['cursor-up-left', 'cursor-up-right', 'cursor-down-left', 'cursor-down-right'];
    const straight = ['cursor-right', 'cursor-down', 'cursor-left', 'cursor-up'];
    for (var round = 0; round < 4; round++) {
      if (await anyArrowMoves(tester, diagonals)) return true;
      await anyArrowMoves(tester, [...straight.skip(round), ...straight.take(round)]);
    }
    return false;
  }

  testWidgets('🔴 «Куб»: стрелки катят куб — режим, где касание не делает ничего', (tester) async {
    await boot(tester, 'Cube');
    expect(PuzzleModes.all['Cube']!.arrows, isTrue, reason: 'премиса: у «Куба» в вебе крестовина');
    expect(find.byKey(const Key('cursor-up')), findsOneWidget);
    expect(await anyArrowMoves(tester, ['cursor-right', 'cursor-down', 'cursor-left', 'cursor-up']), isTrue,
        reason: 'ни одна стрелка не сделала ход — psy_cursor до движка не доходит');
  });

  testWidgets('🔴 «Инерция»: восемь направлений, диагональ двигает шар', (tester) async {
    await boot(tester, 'Inertia');
    expect(find.byKey(const Key('cursor-up-left')), findsOneWidget, reason: 'у «Инерции» диагонали');
    expect(await anyDiagonalMoves(tester), isTrue,
        reason: 'ни одна диагональ не сделала ход — цифровой блок не доходит до движка');
  });

  testWidgets('🔴 «Сеть»: «Взять» под курсором поворачивает плитку — CURSOR_SELECT доходит', (tester) async {
    await boot(tester, 'Net');
    expect(find.byKey(const Key('cursor-select')), findsOneWidget);
    // Курсор у автора появляется после первой стрелки; «Взять» крутит плитку под ним.
    await tester.tap(find.byKey(const Key('cursor-right')));
    await tester.pump();
    final before = digest(tester);
    await tester.tap(find.byKey(const Key('cursor-select')));
    await tester.pump();
    expect(digest(tester), isNot(before), reason: '«Взять» не изменило кадр — CURSOR_SELECT не дошёл');
  });

  testWidgets('«Раскраска карты»: есть и «Взять», и второй выбор с подписью режима', (tester) async {
    await boot(tester, 'Map');
    expect(find.byKey(const Key('cursor-select')), findsOneWidget);
    expect(find.byKey(const Key('cursor-select-second')), findsOneWidget);
    expect(find.text(L.t(PuzzleModes.all['Map']!.secondKey!)), findsWidgets,
        reason: 'второй выбор подписан тем, что делает в этой игре (карандаш)');
  });

  testWidgets('режим без стрелок и выбора — панели нет («Судоку» Solo)', (tester) async {
    await boot(tester, 'Solo');
    expect(find.byKey(const Key('cursor-up')), findsNothing);
    expect(find.byKey(const Key('cursor-select')), findsNothing);
  });
}

import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 UNRULY: ВТОРОЕ ДЕЙСТВИЕ НАЗВАНО ТЕМ, ЧТО ОНО ДЕЛАЕТ, — «БЕЛАЯ».
///
/// 📍 ПОВОД, 07.10.2026 (журнал 7f5df141, раздел «Поиск»): у режимов с `второе: true` кнопка
/// показывала сырой ключ «puzzleSecondAction» — общий запасной ключ не попадал в словарь натива.
/// У Unruly общая подпись и по смыслу пустая: правая кнопка автора ведёт пустую клетку в БЕЛУЮ,
/// левая — в чёрную (unruly.c, interpret_move: RIGHT_BUTTON → '0', LEFT_BUTTON → '1').
/// Проба гоняет настоящий движок и видит цвет по КАДРУ: COL_0 (белая, 0,95) = 3, COL_1 (чёрная,
/// 0,2) = 6 в перечислении цветов unruly.c.
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
    SharedPreferences.setMockInitialValues({
      'psygames_puzzles_unruly_level_nzt48': '1',
    });
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

  PuzzlePainter painterOf(WidgetTester tester) {
    final paint = tester.widget<CustomPaint>(
      find.descendant(of: find.byKey(const Key('board')), matching: find.byType(CustomPaint)).first,
    );
    return paint.painter! as PuzzlePainter;
  }

  /// Точка холста движка → точка экрана (обратное к `toEngine`).
  Offset Function(int x, int y) screenOf(WidgetTester tester) {
    final eng = painterOf(tester).engineSize;
    final box = tester.getRect(find.byKey(const Key('board')));
    final k = math.min(box.width / eng.w, box.height / eng.h);
    final ox = box.left + (box.width - eng.w * k) / 2;
    final oy = box.top + (box.height - eng.h * k) / 2;
    return (x, y) => Offset(ox + x * k, oy + y * k);
  }

  const white = 3, black = 6;   // COL_0 и COL_1 в перечислении unruly.c

  int count(WidgetTester tester, int colour) =>
      painterOf(tester).frame.ops.whereType<OpRect>().where((r) => r.colour == colour).length;

  testWidgets('🔴 подпись — «Белая», не сырой ключ', (tester) async {
    await boot(tester, 'Unruly');
    final second = find.byKey(const Key('puzzle-second-action'));
    expect(second, findsOneWidget);
    final label = tester.widget<AuxAction>(second).label;
    expect(label, L.t('puzzleSecondWhite'));
    expect(label, isNot('puzzleSecondWhite'), reason: 'ключ есть в словаре');
    expect(label, isNot(contains('puzzleSecond')), reason: 'не сырой ключ');
  });

  testWidgets('🔴 обычное касание ставит чёрную, вторым действием — белую', (tester) async {
    await boot(tester, 'Unruly');
    final eng = painterOf(tester).engineSize;
    final toScreen = screenOf(tester);
    var doneBlack = false, doneWhite = false;
    for (var r = 0; r < 8 && !(doneBlack && doneWhite); r++) {
      for (var c = 0; c < 8 && !(doneBlack && doneWhite); c++) {
        final p = toScreen(eng.w * (2 * c + 1) ~/ 16, eng.h * (2 * r + 1) ~/ 16);
        final b0 = count(tester, black), w0 = count(tester, white);
        final useSecond = doneBlack;   // сперва обычное касание, потом второе действие
        if (useSecond) {
          await tester.tap(find.byKey(const Key('puzzle-second-action')));
          await tester.pump();
        }
        await tester.tapAt(p);
        await tester.pump();
        if (useSecond) {
          await tester.tap(find.byKey(const Key('puzzle-second-action')));   // выключить
          await tester.pump();
        }
        final b1 = count(tester, black), w1 = count(tester, white);
        if (b1 == b0 && w1 == w0) continue;   // клетка данная — касание её не меняет
        if (!useSecond) {
          expect(b1, greaterThan(b0), reason: 'обычное касание пустой клетки — чёрная');
          expect(w1, w0);
          doneBlack = true;
        } else {
          expect(w1, greaterThan(w0), reason: 'второе действие на пустой клетке — белая');
          expect(b1, b0);
          doneWhite = true;
        }
      }
    }
    expect(doneBlack && doneWhite, isTrue, reason: 'не нашлось пустых клеток для обоих касаний');
  });
}

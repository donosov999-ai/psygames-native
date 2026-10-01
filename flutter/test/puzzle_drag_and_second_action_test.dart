import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ДОСКА ПРИНИМАЕТ ЖЕСТ ЦЕЛИКОМ И ВТОРОЕ ДЕЙСТВИЕ — КАК В ВЕБЕ.
///
/// 📍 ПОВОД, 01.10.2026, релиз 2.56.1 на эмуляторе: в «Колышках» не проходил ни один ход —
/// ни протяжкой, ни двумя касаниями. Экран слал движку только «нажал и отпустил в одной
/// точке», а ход «Колышек», «Указателей», «Раскраски карты» и «Распутай» — только
/// протяжка. Второго действия (флажок «Сапёра», крестик японского кроссворда, карандаш
/// судоку — 30 режимов из 42) на нативном экране не было вовсе, хотя веб его давал.
/// Проба гоняет настоящий движок, а ход видит по КАДРУ, а не по ответу движка.
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
      'psygames_puzzles_pegs_level_nzt48': '1',
      'psygames_puzzles_mines_level_nzt48': '1',
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

  testWidgets('🔴 «Колышки»: протяжка колышка через соседа в пустую лунку — это ход', (tester) async {
    await boot(tester, 'Pegs');
    expect(PuzzleModes.all['Pegs']!.dragOnly, isTrue, reason: 'премиса: в вебе «Колышки» — только протяжка');
    expect(find.text(L.t('puzzleDragHint')), findsOneWidget,
        reason: 'под доской подсказка «тяни», а не «тычок отмечает клетку»');
    expect(find.byKey(const Key('puzzle-second-action')), findsNothing,
        reason: 'у «Колышек» второго действия нет — кнопка-пустышка хуже отсутствующей');

    String digest() => painterOf(tester)
        .frame
        .ops
        .whereType<OpCircle>()
        .map((c) => '${c.cx},${c.cy}:${c.fill}')
        .join('|');

    final circles = painterOf(tester).frame.ops.whereType<OpCircle>().toList();
    expect(circles.length, greaterThan(4), reason: 'на доске есть колышки и лунки');
    final xs = circles.map((c) => c.cx).toSet().toList()..sort();
    var step = 1 << 30;
    for (var i = 1; i < xs.length; i++) {
      step = math.min(step, xs[i] - xs[i - 1]);
    }
    final at = {for (final c in circles) '${c.cx},${c.cy}'};
    final toScreen = screenOf(tester);
    final before = digest();

    var moved = false;
    for (final a in circles) {
      for (final (dx, dy) in const [(1, 0), (-1, 0), (0, 1), (0, -1)]) {
        final tx = a.cx + 2 * step * dx, ty = a.cy + 2 * step * dy;
        if (!at.contains('$tx,$ty')) continue;
        final from = toScreen(a.cx, a.cy);
        await tester.dragFrom(from, toScreen(tx, ty) - from);
        await tester.pump();
        if (digest() != before) {
          moved = true;
          break;
        }
      }
      if (moved) break;
    }
    expect(moved, isTrue, reason: 'ни одна протяжка через соседа не дала хода — жест до движка не доходит');
  });

  testWidgets('🔴 «Сапёр»: второе действие ставит флажок и снимает его, клетку не открывает', (tester) async {
    await boot(tester, 'Mines');
    final second = find.byKey(const Key('puzzle-second-action'));
    expect(second, findsOneWidget, reason: 'у «Сапёра» второе действие — флажок');
    expect(tester.widget<AuxAction>(second).label, L.t('puzzleSecondFlag'),
        reason: 'подпись называет, что кнопка делает здесь');

    String digest() => painterOf(tester).frame.ops.map((o) => switch (o) {
          OpRect r => 'R${r.x},${r.y},${r.w},${r.h}:${r.colour}',
          OpCircle c => 'C${c.cx},${c.cy}:${c.fill}',
          OpPoly p => 'P${p.points.join(',')}:${p.fill}',
          OpText t => 'T${t.x},${t.y}:${t.text}',
          _ => '',
        }).join('|');

    final eng = painterOf(tester).engineSize;
    final toScreen = screenOf(tester);
    // Первый ход — обычным касанием в угол: у «Сапёра» поле раскладывается по первому ходу.
    await tester.tapAt(toScreen(eng.w ~/ 12, eng.h ~/ 12));
    await tester.pump();

    await tester.tap(second);
    await tester.pump();

    var flagged = false;
    for (var r = 1; r < 8 && !flagged; r++) {
      for (var c = 1; c < 8 && !flagged; c++) {
        final p = toScreen(eng.w * (2 * c + 1) ~/ 16, eng.h * (2 * r + 1) ~/ 16);
        final before = digest();
        await tester.tapAt(p);
        await tester.pump();
        final once = digest();
        if (once == before) continue; // клетка уже открыта — флажок на неё не ставится
        await tester.tapAt(p);
        await tester.pump();
        expect(digest(), before,
            reason: 'второе касание вторым действием обязано снять флажок; '
                'если доска не вернулась — касание ушло левой кнопкой и ОТКРЫЛО клетку');
        flagged = true;
      }
    }
    expect(flagged, isTrue, reason: 'второе действие не поставило флажок ни на одну закрытую клетку');
  });
}

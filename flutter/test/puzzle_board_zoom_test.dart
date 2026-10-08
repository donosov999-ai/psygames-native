import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/frame.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/games/puzzles/zoom.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 МАСШТАБ ДОСКИ ГОЛОВОЛОМОК (задача a504c68b, решение Дениса 08.10.2026: «Б, на Flutter»).
///
/// 📍 Замер 17.09.2026 на окне 390 pt: «Заполнение областей» 15×11 — клетка 22 pt, палец ≈ 44.
/// Пробы держат три обещания, каждое — нажатиями на настоящем экране с движком автора:
///   · на мелком поле под доской есть «Крупнее», на крупном — нет;
///   · щипок двумя пальцами увеличивает доску и НЕ делает хода;
///   · на увеличенной доске касание попадает в ту клетку, что под пальцем, а не в ту,
///     что была бы там без масштаба.
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

  group('BoardZoom', () {
    const box = Size(400, 300);

    test('вдвое вокруг середины: середина остаётся под пальцем, края уходят за коробку', () {
      final z = BoardZoom()..zoomAt(box.center(Offset.zero), 2, box);
      expect(z.scale, 2);
      expect(z.toBoard(box.center(Offset.zero)), box.center(Offset.zero));
      expect(z.toBoard(Offset.zero), const Offset(100, 75));
    });

    test('щипок: масштаб по расстоянию пальцев, не больше предела и не меньше целой доски', () {
      final z = BoardZoom()..pinchStart(const Offset(150, 150), const Offset(250, 150));
      z.pinchUpdate(const Offset(100, 150), const Offset(300, 150), box);
      expect(z.scale, 2);
      z.pinchUpdate(const Offset(0, 150), const Offset(4000, 150), box);
      expect(z.scale, BoardZoom.maxScale);
      z.pinchUpdate(const Offset(199, 150), const Offset(201, 150), box);
      expect(z.scale, 1);
      expect(z.offset, Offset.zero, reason: 'целая доска стоит на месте, без сдвига');
    });

    test('сдвиг не открывает пустых полос: доска всегда накрывает коробку', () {
      final z = BoardZoom()..zoomAt(Offset.zero, 3, box);
      expect(z.offset, Offset.zero);
      z.zoomAt(const Offset(400, 300), 1, box);
      expect(z.toBoard(Offset.zero).dx, greaterThanOrEqualTo(0));
      expect(z.toBoard(const Offset(400, 300)).dx, lessThanOrEqualTo(400.0001));
    });

    test('столбцы ступени: «9x7» → 9, у Solo «3x3» → 9, «6dh» → 6, без числа — неизвестно', () {
      expect(puzzleColumns('Filling', '15x11'), 15);
      expect(puzzleColumns('Solo', '3x3'), 9);
      expect(puzzleColumns('Keen', '6dh'), 6);
      expect(puzzleColumns('Net', 'w'), isNull);
    });
  });

  group('экран', () {
    late SharedState state;

    Future<void> boot(WidgetTester tester, int level) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      SharedPreferences.setMockInitialValues({'psygames_puzzles_filling_level_nzt48': '$level'});
      // Пустой кадр между загрузками: иначе тот же экран сохранит состояние прошлой ступени.
      await tester.pumpWidget(const SizedBox());
      await tester.runAsync(() async {
        state = await SharedState.open();
        await tester.pumpWidget(MaterialApp(
          home: PuzzlesScreen(state: state, mode: 'Filling', libraryPath: libPath),
        ));
        for (var i = 0; i < 40; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          if (find.byKey(const Key('board')).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
      await tester.pump();
    }

    PuzzlePainter painterOf(WidgetTester tester) => tester
        .widget<CustomPaint>(find.descendant(of: find.byKey(const Key('board')), matching: find.byType(CustomPaint)).first)
        .painter! as PuzzlePainter;

    double scaleOf(WidgetTester tester) =>
        tester.widget<Transform>(find.byKey(const Key('board-zoom'))).transform.getMaxScaleOnAxis();

    testWidgets('🔴 15×11 на 390 pt: «Крупнее» под полем; 9×7 — кнопки нет', (tester) async {
      await boot(tester, 4);
      expect(find.byKey(const Key('puzzle-zoom')), findsOneWidget, reason: 'клетка 15×11 ≈ 25 pt — мельче пальца');
      await boot(tester, 1);
      expect(find.byKey(const Key('puzzle-zoom')), findsNothing, reason: 'клетка 9×7 ≈ 42 pt — увеличивать незачем');
    });

    testWidgets('🔴 щипок двумя пальцами увеличивает доску и хода не делает', (tester) async {
      await boot(tester, 4);
      final engine = PuzzlesScreen.debugEngine!;
      final pos = engine.statePos;
      final c = tester.getCenter(find.byKey(const Key('board')));
      final a = await tester.startGesture(c - const Offset(30, 0), pointer: 1);
      final b = await tester.startGesture(c + const Offset(30, 0), pointer: 2);
      for (var i = 1; i <= 6; i++) {
        await a.moveTo(c - Offset(30.0 + i * 10, 0));
        await b.moveTo(c + Offset(30.0 + i * 10, 0));
        await tester.pump();
      }
      await a.up();
      await b.up();
      await tester.pump(const Duration(milliseconds: 300));
      expect(scaleOf(tester), closeTo(3, 0.05), reason: 'пальцы разошлись с 60 до 180 pt — ×3');
      expect(engine.statePos, pos, reason: 'щипок — не ход: движок жеста не видел');
      expect(tester.widget<AuxAction>(find.byKey(const Key('puzzle-zoom'))).active, isTrue);
    });

    testWidgets('🔴 на увеличенной доске цифра встаёт в клетку под пальцем', (tester) async {
      await boot(tester, 4);
      await tester.tap(find.byKey(const Key('puzzle-zoom')));
      await tester.pump();
      expect(scaleOf(tester), 2);

      final eng = painterOf(tester).engineSize;
      final box = tester.getRect(find.byKey(const Key('board')));
      final k = box.width / eng.w < box.height / eng.h ? box.width / eng.w : box.height / eng.h;
      final ox = (box.width - eng.w * k) / 2, oy = (box.height - eng.h * k) / 2;
      final cell = eng.w / 15;
      Set<String> texts() => {
            for (final t in painterOf(tester).frame.ops.whereType<OpText>()) '${t.x},${t.y},${t.text}',
          };

      // Клетки в видимой части увеличенной доски (её середина, 25–75 %). Доска случайная, и
      // клетка бывает заполнена заранее — тогда цифра не встаёт, берём следующую.
      var checked = 0;
      for (final (fx, fy) in const [(0.3, 0.3), (0.4, 0.35), (0.35, 0.6), (0.62, 0.4), (0.55, 0.66), (0.68, 0.7)]) {
        final target = Offset(box.width * fx, box.height * fy);
        // ×2 вокруг середины: точка доски b видна в 2b − середина коробки.
        final view = target * 2 - box.size.center(Offset.zero);
        final before = texts();
        await tester.tapAt(box.topLeft + view);
        await tester.pump(const Duration(milliseconds: 200));
        await tester.tap(find.byKey(const Key('digit1')));
        await tester.pump();
        final typed = texts().difference(before).where((t) => t.endsWith(',1'));
        if (typed.isEmpty) continue;
        final want = Offset((target.dx - ox) / k, (target.dy - oy) / k);
        final p = typed.first.split(',');
        final got = Offset(double.parse(p[0]), double.parse(p[1]));
        expect((got - want).distance, lessThan(cell * 1.2),
            reason: 'цифра встала в $got, а клетка под пальцем — $want (клетка $cell): касание мимо масштаба');
        checked++;
      }
      expect(checked, greaterThan(0), reason: 'ни одно касание по увеличенной доске не поставило цифру');
    });
  });
}

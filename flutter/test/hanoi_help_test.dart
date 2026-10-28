import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/model.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОМОЩЬ ЗАСТРЯВШЕМУ В «ХАНОЙСКОЙ БАШНЕ».
///
/// 📍 Отзывы 45039889 и 166ae4aa (27.10.2026, fr): «j'arrive pas», «aide moi». Новичок
/// прошёл L1 за 6,5 мин и встал на L2: ввод работал, ошибок 0, разбор в шапке не нашёл.
/// Теперь помощь приходит сама — после простоя или трёх ошибок подряд, — и подсказка
/// даёт ОДИН ход того же решения, что у разбора.
Future<void> _boot(WidgetTester tester) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  // Таймер простоя идёт по часам партии (game_clock): в пробе — по часам пробы.
  gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
  addTearDown(() => gameWallMs = () => DateTime.now().millisecondsSinceEpoch);
  SharedPreferences.setMockInitialValues({});
  final state = await SharedState.open();
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: HanoiScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(HanoiBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
  // Партия заново — уже в часах пробы: таймер простоя заводится здесь, и его можно
  // промотать `pump`, а не ждать 45 настоящих секунд.
  await tester.tap(find.byIcon(Icons.refresh));
  await tester.pump();
}

HanoiState _board(WidgetTester tester) => tester.widget<HanoiBoard>(find.byType(HanoiBoard)).state;

Future<void> _tapMove(WidgetTester tester, int from, int to) async {
  await tester.tap(find.byKey(ValueKey('peg-$from')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('peg-$to')));
  await tester.pump();
}

void main() {
  setUpAll(() async => L.load('en'));
  setUp(LessonUsed.reset);

  testWidgets('правило про диски видно на поле с первого кадра', (tester) async {
    await _boot(tester);
    final rule = find.byKey(const ValueKey('hanoi-rule'));
    expect(rule, findsOneWidget);
    expect(tester.widget<Text>(rule).data, 'A larger disc may never sit on a smaller one.');
  });

  testWidgets('🔴 без простоя помощи нет, после 45 с — есть', (tester) async {
    await _boot(tester);
    expect(find.byKey(const ValueKey('hanoi-help')), findsNothing, reason: 'помощь не лезет сразу');
    await tester.pump(const Duration(seconds: 30));
    expect(find.byKey(const ValueKey('hanoi-help')), findsNothing, reason: '30 с — ещё думает');
    // Ход сбрасывает часы: простой считается от ПОСЛЕДНЕГО хода.
    await _tapMove(tester, 0, 2);
    await tester.pump(const Duration(seconds: 30));
    expect(find.byKey(const ValueKey('hanoi-help')), findsNothing, reason: 'ход обязан сбросить часы простоя');
    await tester.pump(const Duration(seconds: 16));
    expect(find.byKey(const ValueKey('hanoi-help')), findsOneWidget, reason: '45 с без хода — помощь обязана появиться');
    expect(find.text('Hint'), findsOneWidget);
    expect(find.text('Walkthrough'), findsWidgets);
  });

  testWidgets('🔴 три ошибки подряд — помощь сразу, без ожидания', (tester) async {
    await _boot(tester);
    await _tapMove(tester, 0, 2); // 1 на правый
    for (var k = 0; k < 2; k++) {
      await _tapMove(tester, 0, 2); // 2 на 1 — нельзя
    }
    expect(find.byKey(const ValueKey('hanoi-help')), findsNothing, reason: 'две ошибки — ещё не повод');
    await _tapMove(tester, 0, 2);
    expect(find.byKey(const ValueKey('hanoi-help')), findsOneWidget, reason: 'третья ошибка подряд — помощь');
  });

  testWidgets('🔴 французский на узком экране: полоса помощи целиком, без переполнения', (tester) async {
    await L.load('fr');
    addTearDown(() => L.load('en'));
    await _boot(tester);
    tester.view.physicalSize = const Size(720, 1280); // 360×640
    await tester.pump(const Duration(seconds: 46));
    final help = find.byKey(const ValueKey('hanoi-help'));
    expect(help, findsOneWidget);
    final rect = tester.getRect(help);
    for (final key in const ['hanoi-hint', 'hanoi-help-lesson']) {
      final r = tester.getRect(find.byKey(ValueKey(key)));
      expect(r.left >= 0 && r.right <= 360, isTrue, reason: '$key за краем экрана: $r');
      expect(r.top >= rect.top && r.bottom <= rect.bottom + 0.5, isTrue, reason: '$key вылез из полосы: $r против $rect');
    }
    expect(tester.takeException(), isNull, reason: 'переполнение полосы помощи');
  });

  testWidgets('🔴 подсказка — законный ход ОПТИМАЛЬНОГО решения: по одним подсказкам башня за минимум', (tester) async {
    await _boot(tester);
    await tester.pump(const Duration(seconds: 46));
    final start = _board(tester);
    final min = frameStewart(start.discs, start.pegs.length);
    var moves = 0;
    while (!_board(tester).solved && moves < min + 3) {
      await tester.tap(find.byKey(const ValueKey('hanoi-hint')));
      await tester.pump();
      final hint = tester.widget<HanoiBoard>(find.byType(HanoiBoard)).hint;
      expect(hint, isNotNull, reason: 'подсказка не дала хода');
      expect(_board(tester).canMove(hint!.from, hint.to), isTrue, reason: 'подсказка дала незаконный ход $hint');
      // Стрелки на тех самых стержнях и в цвете роли «подсветка».
      final from = find.descendant(of: find.byKey(ValueKey('peg-${hint.from}')), matching: find.byKey(const ValueKey('hanoi-hint-from')));
      final to = find.descendant(of: find.byKey(ValueKey('peg-${hint.to}')), matching: find.byKey(const ValueKey('hanoi-hint-to')));
      expect(from, findsOneWidget);
      expect(to, findsOneWidget);
      expect(tester.widget<Icon>(from).color, GameColors.classic.highlight);
      await _tapMove(tester, hint.from, hint.to);
      moves++;
      if (!_board(tester).solved) {
        expect(find.byKey(const ValueKey('hanoi-hint-from')), findsNothing, reason: 'после хода подсказка гаснет');
      }
    }
    expect(_board(tester).solved, isTrue);
    expect(moves, min, reason: 'подсказки обязаны вести кратчайшим путём');
    // Подсказка — помощь, а не учебная партия: уровень засчитывается (правило «Судоку» 20.10).
    expect(LessonUsed.inRound, isFalse, reason: 'подсказка не должна снимать зачёт уровня');
    await tester.pump(const Duration(seconds: 2));
  });
}

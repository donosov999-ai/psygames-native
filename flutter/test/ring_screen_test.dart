import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/ring.dart';
import 'package:psygames_flutter/games/anagrams/ring_board.dart';
import 'package:psygames_flutter/games/anagrams/ring_screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Пробы экрана «Слово-квадрат» — партия играется НАЖАТИЯМИ по банку букв.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: RingScreen(state: state, locale: 'ru')));
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(RingBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

RingBoard _board(WidgetTester t) => t.widget<RingBoard>(find.byType(RingBoard));

Future<void> _spell(WidgetTester tester, String word) async {
  final letters = _board(tester).letters;
  final used = <int>{};
  for (final ch in word.toUpperCase().split('')) {
    var idx = -1;
    for (var k = 0; k < letters.length; k++) {
      if (!used.contains(k) && letters[k].toUpperCase() == ch) {
        idx = k;
        break;
      }
    }
    expect(idx, isNot(-1), reason: 'буквы «$ch» нет в банке: $letters');
    used.add(idx);
    await tester.tap(find.byKey(ValueKey('letter-$idx')));
    await tester.pump();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('🔴 рамка 5×5 нарисована, внутренность в игре не участвует', (tester) async {
    await _boot(tester, state);
    expect(find.byType(GameShell), findsOneWidget);
    // Клетки рамки есть, центральная — нет.
    expect(find.byKey(const ValueKey('ring-cell-0-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('ring-cell-4-4')), findsOneWidget);
    expect(find.byKey(const ValueKey('ring-cell-2-2')), findsNothing,
        reason: 'середина квадрата не играет');
    expect(_board(tester).solved, isEmpty);
  });

  testWidgets('🔴 банк собирает все четыре слова кольца', (tester) async {
    await _boot(tester, state);
    final b = _board(tester);
    for (final w in b.ring.words) {
      expect(madeOfBank(w, b.ring.bank), isTrue, reason: 'банк не собирает «$w»');
    }
  });

  testWidgets('🔴 слово стороны, набранное пальцем, закрывает СВОЮ сторону', (tester) async {
    await _boot(tester, state);
    final word = _board(tester).ring.top;
    await _spell(tester, word);
    await tester.tap(find.byKey(const ValueKey('ring-check')));
    await tester.pump();

    final b = _board(tester);
    expect(b.solved, contains('top'));
    expect(b.solved.length, 1, reason: 'одно слово — одна сторона');
    expect(b.picked, isEmpty);
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    expect(hud.firstWhere((h) => h.label == 'Сторон').value, '1/4');
  });

  testWidgets('🔴 чужое слово не засчитывается, и человек это видит', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('ring-check')));
    await tester.pump();
    expect(_board(tester).solved, isEmpty);
    expect(_board(tester).wrong, isTrue);
  });

  testWidgets('🔴 повтор уже закрытой стороны не засчитывается второй раз', (tester) async {
    await _boot(tester, state);
    final word = _board(tester).ring.top;
    for (var i = 0; i < 2; i++) {
      await _spell(tester, word);
      await tester.tap(find.byKey(const ValueKey('ring-check')));
      await tester.pump();
    }
    expect(_board(tester).solved.length, 1, reason: 'та же сторона не закрывается дважды');
  });

  testWidgets('🔴 подсказка открывает сторону целиком и запас КОНЕЧЕН', (tester) async {
    await _boot(tester, state);
    for (var i = 1; i <= 2; i++) {
      await tester.tap(find.byTooltip('Подсказка'));
      await tester.pump();
      expect(_board(tester).solved.length, i, reason: 'подсказка $i открывает сторону');
    }
    await tester.tap(find.byTooltip('Подсказка'), warnIfMissed: false);
    await tester.pump();
    expect(_board(tester).solved.length, 2, reason: 'третья подсказка не выдаётся');
  });

  testWidgets('🔴 «Перемешать» меняет порядок, но не буквы и не закрытое', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byTooltip('Подсказка'));
    await tester.pump();
    final before = _board(tester);
    final lettersBefore = before.letters.toList()..sort();
    final solvedBefore = before.solved.length;

    await tester.tap(find.byTooltip('Перемешать'));
    await tester.pump();
    final after = _board(tester);
    expect(after.letters.toList()..sort(), lettersBefore, reason: 'буквы те же');
    expect(after.solved.length, solvedBefore, reason: 'перемешивание не отнимает закрытое');
    expect(after.picked, isEmpty);
  });
}

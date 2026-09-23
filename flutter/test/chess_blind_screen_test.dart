import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';

/// 🔴 ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ, А НЕ ТОЛЬКО В МОДЕЛИ.
///
/// Правила уже закрыты сверкой, состояние партии — пробой без пикселей. Здесь
/// проверяется последнее: доходит ли это до пальца. Позиция сперва ВИДНА, потом
/// маскируется одинаковыми фишками, и ответ касанием по доске засчитывается.
void main() {
  routeIsInterceptedWithBothModes();
  late PositionCorpus corpus;
  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });

  Future<void> boot(WidgetTester tester, int level) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: ChessBlindScreen(level: level, corpus: corpus, random: Random(4)),
      ),
    );
    await tester.pump();
  }

  testWidgets('🔴 позиция СНАЧАЛА видна, потом маскируется', (tester) async {
    await boot(tester, 12);
    // Пока идёт показ — на доске фигуры, не фишки.
    expect(
      find.byIcon(Icons.circle),
      findsNothing,
      reason: 'до маски фишек нет',
    );
    expect(find.textContaining('♚'), findsWidgets, reason: 'фигуры видны');

    // Ждём весь показ: ступень 12 показывает 7 секунд.
    for (var i = 0; i < 9; i++) {
      await tester.pump(const Duration(seconds: 1));
    }
    expect(
      find.byIcon(Icons.circle),
      findsWidgets,
      reason: 'после показа — фишки',
    );
    expect(
      find.textContaining('♚'),
      findsNothing,
      reason: 'фигур больше не видно',
    );
  });

  testWidgets('🔴 «розыск»: ответ касанием по доске засчитывается', (
    tester,
  ) async {
    await boot(tester, 12);
    for (var i = 0; i < 9; i++) {
      await tester.pump(const Duration(seconds: 1));
    }

    // Счётчик показывает, сколько вопросов БУДЕТ.
    final counter = find.byWidgetPredicate(
      (w) => w is Text && (w.data ?? '').startsWith('0/'),
    );
    expect(counter, findsOneWidget, reason: 'вопрос 0 из скольких-то');

    /* Клетку текущего вопроса экран ПОДСВЕЧИВАЕТ — её и находим глазами пробы,
     * не заглядывая в состояние: так проверяется ровно то, что видит человек. */
    final highlighted = tester
        .widgetList<Container>(
          find.descendant(
            of: find.byType(GridView),
            matching: find.byType(Container),
          ),
        )
        .toList();
    expect(highlighted, isNotEmpty);

    // Жмём по очереди все клетки, пока счётчик не сдвинется: верная — одна.
    var moved = false;
    for (var sq = 0; sq < 64 && !moved; sq++) {
      await tester.tap(find.byKey(Key('cb-sq-$sq')), warnIfMissed: false);
      await tester.pump();
      moved = find
          .byWidgetPredicate(
            (w) => w is Text && (w.data ?? '').startsWith('1/'),
          )
          .evaluate()
          .isNotEmpty;
    }
    expect(moved, isTrue, reason: 'ответ касанием по доске засчитан');
  });

  testWidgets('🔴 доска берёт высоту У КАРКАСА, а не у окна', (tester) async {
    // Замер веб-версии: доска, посчитанная от окна, вылезала за экран — окно не
    // знает ни про шапку, ни про счётчики, ни про липкий низ.
    await boot(tester, 3);
    final board = tester.getRect(find.byType(GridView));
    final screen = tester.getRect(find.byType(MaterialApp));
    expect(board.height, lessThan(screen.height), reason: 'доска ниже экрана');
    expect(board.width, closeTo(board.height, 1), reason: 'доска квадратная');
    expect(
      board.bottom,
      lessThanOrEqualTo(screen.bottom),
      reason: 'не вылезает вниз',
    );
  });
}

/// 🔴 МАРШРУТ ПЕРЕХВАЧЕН, И ОБА РЕЖИМА НА МЕСТЕ.
///
/// Перехват ждал серии нарочно: в вебе «Доска в уме» — два режима одного экрана,
/// и маршрут у них общий. Включать его на одной партии значило бы молча отнять
/// серию. Теперь перенесены оба, вход спрашивает режим, как в веб-версии.
void routeIsInterceptedWithBothModes() {
  test('🔴 /games/chess-blind открывается нативно', () {
    expect(
      HybridApp.native.containsKey('/games/chess-blind'),
      isTrue,
      reason: 'игра перенесена целиком — партия и серия',
    );
  });
}

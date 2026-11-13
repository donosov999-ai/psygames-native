import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';

/// 🔴 КОЛЕСО БУКВ ВЕДЁТСЯ ПАЛЬЦЕМ.
///
/// 📍 Отзыв игрока 2b597852 (10.10.2026): «смысл круга с буквами, что их не только лапают, но и
/// соединяет пальцем в слова — не работает». В вебе колесо вело палец (`LetterWheel.tsx`,
/// `onResponderMove`), в нативе остались только тапы. Колесо ОДНО на все четыре режима
/// анаграмм (`LetterRing`), поэтому и проба одна.
void main() {
  const side = 300.0;
  const letters = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
  const n = 6;

  Offset center(int i) {
    final a = -pi / 2 + 2 * pi * i / n;
    final r = ringRadius(side);
    return const Offset(side / 2, side / 2) + Offset(r * cos(a), r * sin(a));
  }

  /// Колесо в обвязке, которая, как экран, копит взятое в [picked] и перерисовывается.
  Future<List<int>> pump(WidgetTester tester) async {
    final picked = <int>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: StatefulBuilder(
            builder: (context, setState) => SizedBox(
              width: side,
              height: side,
              child: LetterRing(
                letters: letters,
                picked: picked,
                side: side,
                onPick: (i) => setState(() => picked.add(i)),
              ),
            ),
          ),
        ),
      ),
    ));
    return picked;
  }

  Offset origin(WidgetTester tester) => tester.getTopLeft(find.byKey(const Key('letter-ring')));

  testWidgets('🔴 протяжка по буквам берёт их по порядку, по одной', (tester) async {
    final picked = await pump(tester);
    final o = origin(tester);
    final g = await tester.startGesture(o + center(0));
    for (final i in [1, 2, 3]) {
      await g.moveTo(o + center(i));
    }
    await g.up();
    await tester.pump();
    expect(picked, [0, 1, 2, 3], reason: 'палец прошёл А-Б-В-Г, а взято $picked');
  });

  testWidgets('протяжка через середину не задевает лишнего и не берёт взятое второй раз', (tester) async {
    final picked = await pump(tester);
    final o = origin(tester);
    final g = await tester.startGesture(o + center(0));
    await g.moveTo(o + center(1));
    await g.moveTo(o + center(0)); // вернулся на уже взятую
    await g.moveTo(o + center(1)); // и снова на вторую
    await g.moveTo(o + center(2));
    await g.up();
    await tester.pump();
    expect(picked, [0, 1, 2], reason: 'взятое не берётся дважды: $picked');
  });

  testWidgets('тап по плитке работает как раньше — ровно одна буква', (tester) async {
    final picked = await pump(tester);
    await tester.tap(find.byKey(const ValueKey('letter-3')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('letter-1')));
    await tester.pump();
    expect(picked, [3, 1], reason: 'тап ломает ввод или берёт букву дважды: $picked');
  });

  testWidgets('протяжка, начатая не на плитке, берёт те, что прошла', (tester) async {
    final picked = await pump(tester);
    final o = origin(tester);
    // Центр колеса — пустое место между плитками.
    final g = await tester.startGesture(o + const Offset(side / 2, side / 2));
    await g.moveTo(o + center(4));
    await g.moveTo(o + center(5));
    await g.up();
    await tester.pump();
    expect(picked, [4, 5]);
  });
}

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/series.dart';
import 'package:psygames_flutter/games/chess_blind/series_screen.dart';

/// 🔴 СЕРИЯ ИГРАЕТСЯ НАЖАТИЯМИ ДО КОНЦА — ТРИ БЛОКА ПОДРЯД.
void main() {
  late PositionCorpus corpus;
  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });

  Future<void> boot(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1170, 2532);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: ChessBlindSeriesScreen(level: 2, corpus: corpus, seed: 42),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('🔴 три блока проходятся нажатиями и считают ошибки', (
    tester,
  ) async {
    await boot(tester);
    expect(
      find.text('Цвет поля', findRichText: true),
      findsNothing,
      reason: 'название блока идёт в общей строке вопроса',
    );
    expect(find.byKey(const Key('cbs-question')), findsOneWidget);

    // Отвечаем «да» на всё: часть ответов заведомо неверна, и ошибки обязаны
    // посчитаться — иначе блок ничего не меряет.
    var taps = 0;
    while (taps < questionsPerBlock * chessSeriesPlan.length + 2) {
      final yes = find.byKey(const Key('cbs-yes'));
      if (yes.evaluate().isEmpty) break;
      await tester.tap(yes);
      await tester.pump();
      taps++;
    }

    final text =
        tester.widget<Text>(find.byKey(const Key('cbs-question'))).data ?? '';
    expect(
      text,
      contains('seriesDone'),
      reason: 'итог показан (строка из словаря)',
    );
    expect(
      RegExp(r'\d').hasMatch(text),
      isTrue,
      reason: 'ошибки показаны числом',
    );
    expect(
      taps,
      greaterThanOrEqualTo(questionsPerBlock * chessSeriesPlan.length),
      reason: 'спросили все три блока, а не один',
    );
  });

  testWidgets('🔴 счётчик блоков доходит до третьего', (tester) async {
    await boot(tester);
    expect(
      find.text('1/3'),
      findsOneWidget,
      reason: 'начинаем с первого блока',
    );
    for (var i = 0; i < questionsPerBlock * 2; i++) {
      final yes = find.byKey(const Key('cbs-yes'));
      if (yes.evaluate().isEmpty) break;
      await tester.tap(yes);
      await tester.pump();
    }
    expect(
      find.text('3/3'),
      findsOneWidget,
      reason: 'после двух блоков идёт третий',
    );
  });
}

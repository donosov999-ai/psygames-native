import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/warmup_bridge.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// МОСТ ЗАРЯДКИ: нативная развилка «Слова»/«Языки» и веб-карточка зарядки под ней.
///
/// Страница подставная: отвечает на `info()` и `start()` так, как ответила бы
/// веб-карточка (`frontend/src/__tests__/warmup-bridge.test.tsx` сторожит ту сторону).
Map<String, dynamic> info({bool ready = true}) => {
      'title': 'Зарядка: слова',
      'desc': 'Три захода к слову',
      'sub': '',
      'unit': 'мин',
      'startLabel': 'Начать',
      'ready': ready,
      'options': [
        for (final m in [5, 10, 15, 20])
          {'min': m, 'count': m ~/ 2, 'label': 'Подходов: ${m ~/ 2}', 'names': ['Анаграммы', 'Филворды']},
      ],
    };

void main() {
  testWidgets('🔴 обе развилки раздела перехватываются С мостом к зарядке в шапке', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    for (final (route, bridge) in [('/games/words-hub', 'words'), ('/games/languages-hub', 'languages'), ('/games/chess-hub', 'chess')]) {
      final w = HybridApp.native[route]!(state);
      expect(w, isA<HubScreen>(), reason: route);
      final header = (w as HubScreen).header;
      expect(header, isA<WarmupBridgeHeader>(), reason: 'у $route над списком должна стоять зарядка');
      expect((header as WarmupBridgeHeader).bridgeId, bridge);
    }
  });

  testWidgets('🔴 шапка ждёт карточку и готовность, потом запускает выбранную длительность', (tester) async {
    final calls = <String>[];
    var answers = <Object?>[null, jsonEncode(info(ready: false)), jsonEncode(info())];
    Future<Object?> run(String js) async {
      calls.add(js);
      if (js.contains('.start(')) return 'true';
      return answers.length > 1 ? answers.removeAt(0) : answers.first;
    }

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: WarmupBridgeHeader(bridgeId: 'words', accent: Colors.purple, run: run, pollEvery: const Duration(milliseconds: 10))),
    ));
    await tester.pump();
    expect(find.byKey(const Key('warmup-bridge-words')), findsNothing, reason: 'карточка ещё не ответила');
    // Опрос раз в 10 мс: шаг ровно в один опрос — один новый ответ страницы.
    await tester.pump(const Duration(milliseconds: 10));
    final start = find.byKey(const Key('warmup-start-words'));
    expect(start, findsOneWidget);
    expect(tester.widget<FilledButton>(start).onPressed, isNull, reason: 'уровни не загружены — запуск заперт');
    await tester.pump(const Duration(milliseconds: 10));
    expect(tester.widget<FilledButton>(start).onPressed, isNotNull);
    expect(find.text('Подходов: 5 · ≈ 10 мин'), findsOneWidget, reason: 'подпись длительности — из карточки');
    await tester.tap(find.byKey(const Key('warmup-min-15')));
    await tester.pump();
    await tester.tap(start);
    await tester.pump();
    expect(calls.where((c) => c.contains(".start(15)")), hasLength(1), reason: 'запущена выбранная длительность');
    expect(calls.last, contains("['words']"));
  });

  testWidgets('ответ Android — строка ещё раз в кавычках — тоже читается', (tester) async {
    Future<Object?> run(String js) async => jsonEncode(jsonEncode(info()));
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: WarmupBridgeHeader(bridgeId: 'languages', accent: Colors.teal, run: run))));
    await tester.pump();
    await tester.pump();
    expect(find.text('Зарядка: слова'), findsOneWidget);
  });

  testWidgets('без хоста гибрида шапки нет — развилка остаётся рабочим списком', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: WarmupBridgeHeader(bridgeId: 'words', accent: Colors.purple))));
    await tester.pump();
    expect(find.byType(Card), findsNothing);
  });
}

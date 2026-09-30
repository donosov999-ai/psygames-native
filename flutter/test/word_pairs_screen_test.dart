/// ПАРТИЯ «ПАР СЛОВ» ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Ядро знает правила, но не знает, проходим ли круг пальцем: показываются ли
/// пары, перемешан ли правый столбец, закрывается ли пара по двум нажатиям и
/// доходит ли заход до итога.
library;

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/word_pairs/model.dart';
import 'package:psygames_flutter/games/word_pairs/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late SharedState state;
  late WordPairsContent content;

  setUpAll(() {
    content = WordPairsContent.fromJsonStrings(
      File('assets/word-pairs.json').readAsStringSync(),
      File('assets/vocab/translation-vocab.json').readAsStringSync(),
    );
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /// ⚠️ У каждого захода СВОЙ ключ. Без него `pumpWidget` переиспользует прежнее
  /// состояние экрана: партия остаётся старой, кнопки «Начать» на экране уже нет,
  /// и проба падает не там, где ищет.
  Future<void> boot(WidgetTester tester, {int attempt = 0}) async {
    await tester.pumpWidget(MaterialApp(
      home: WordPairsScreen(key: ValueKey('boot-$attempt'), state: state, content: content),
    ));
    await tester.pump();
    await tester.pump();
  }

  List<String> keysStarting(WidgetTester tester, String prefix) {
    final found = <String>[];
    for (final widget in tester.allWidgets) {
      final key = widget.key;
      if (key is ValueKey<String> && key.value.startsWith(prefix) && !found.contains(key.value)) {
        found.add(key.value);
      }
    }
    return found;
  }

  testWidgets('🔴 круг проходится пальцем: показ → соединение → итог', (tester) async {
    await boot(tester);
    await tester.tap(find.byKey(const ValueKey('wp-start')));
    await tester.pump();
    await tester.pump();

    // Показ: пары видны, и ждать таймер не обязательно.
    expect(find.byKey(const ValueKey('wp-check')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('wp-check')));
    await tester.pump();

    final lefts = keysStarting(tester, 'wp-left-');
    final rights = keysStarting(tester, 'wp-right-');
    expect(lefts, hasLength(4), reason: 'первый уровень — четыре пары');
    expect(rights, hasLength(4));

    // Соединяем верно: левое i-й пары с её же правым словом.
    for (var i = 0; i < lefts.length; i += 1) {
      final pairId = int.parse(lefts[i].split('-').last);
      await tester.tap(find.byKey(ValueKey(lefts[i])));
      await tester.pump();
      final right = rights.firstWhere(
        (r) => r == 'wp-right-${_rightOf(tester, pairId)}',
        orElse: () => rights.first,
      );
      await tester.tap(find.byKey(ValueKey(right)));
      await tester.pump();
    }

    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('wp-again')), findsOneWidget, reason: 'круг обязан дойти до итога');
  });

  testWidgets('🔴 правый столбец перемешан, а не повторяет порядок показа', (tester) async {
    // Совпадение порядка означало бы, что пары читаются построчно — без памяти.
    var sameOrder = 0;
    for (var attempt = 0; attempt < 6; attempt += 1) {
      SharedPreferences.setMockInitialValues({});
      state = await SharedState.open();
      await boot(tester, attempt: attempt);
      await tester.tap(find.byKey(const ValueKey('wp-start')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('wp-check')));
      await tester.pump();
      final lefts = keysStarting(tester, 'wp-left-');
      final rights = keysStarting(tester, 'wp-right-');
      final inOrder = [
        for (var i = 0; i < lefts.length; i += 1)
          'wp-right-${_rightOf(tester, int.parse(lefts[i].split('-').last))}',
      ];
      if (const ListEquality().equals(rights, inOrder)) sameOrder += 1;
    }
    expect(sameOrder, lessThan(6), reason: 'шесть раз подряд тот же порядок — это не перемешивание');
  });
}

/// Правое слово пары по её номеру — читаем из живого дерева.
String _rightOf(WidgetTester tester, int pairId) {
  for (final widget in tester.allWidgets) {
    if (widget is WordPairsScreen) continue;
  }
  final state = tester.state<State<WordPairsScreen>>(find.byType(WordPairsScreen));
  // ignore: invalid_use_of_protected_member
  final session = (state as dynamic).session as WordPairsSession?;
  return session!.pairs.firstWhere((p) => p.id == pairId).right;
}

class ListEquality {
  const ListEquality();
  bool equals(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i += 1) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

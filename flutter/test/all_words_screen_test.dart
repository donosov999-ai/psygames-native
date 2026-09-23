import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/all_words_board.dart';
import 'package:psygames_flutter/games/anagrams/all_words_screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Пробы экрана «Все слова» — партия играется НАЖАТИЯМИ по буквам.
///
/// Правила сверены отдельно с эталонами живого TS (`allwords_test.dart`). Здесь
/// проверяется, что до них доходит палец: в этом проекте уже бывало «правила ок,
/// продукт не работает» — кнопка нарисована и объявлена, а нажатие до неё не идёт.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: AllWordsScreen(state: state, locale: 'ru')));
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(AllWordsBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

AllWordsBoard _board(WidgetTester t) => t.widget<AllWordsBoard>(find.byType(AllWordsBoard));

/// Набрать слово, нажимая буквы колеса в нужном порядке.
Future<void> _spell(WidgetTester tester, String word) async {
  final letters = _board(tester).letters;
  final used = <int>{};
  for (final ch in word.toUpperCase().runes.map(String.fromCharCode)) {
    var idx = -1;
    for (var k = 0; k < letters.length; k++) {
      if (!used.contains(k) && letters[k].toUpperCase() == ch) {
        idx = k;
        break;
      }
    }
    expect(idx, isNot(-1), reason: 'буквы «$ch» нет на колесе: $letters');
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

  testWidgets('🔴 экран доходит до поля: цели показаны клетками по числу букв', (tester) async {
    await _boot(tester, state);
    final b = _board(tester);
    expect(find.byType(GameShell), findsOneWidget);
    expect(b.pack.words, isNotEmpty);
    // Клетки показывают ДЛИНУ каждой цели — по ним человек понимает, что искать.
    for (final w in b.pack.words) {
      expect(find.byKey(ValueKey('target-$w')), findsOneWidget, reason: 'нет строки цели «$w»');
    }
    expect(b.letters.length, b.pack.base.runes.length);
  });

  testWidgets('🔴 цель, набранная пальцем, засчитывается и попадает в счётчик', (tester) async {
    await _boot(tester, state);
    final target = _board(tester).pack.words.first;
    await _spell(tester, target);
    await tester.tap(find.byKey(const ValueKey('all-words-check')));
    await tester.pump();

    expect(_board(tester).found, contains(target));
    expect(_board(tester).picked, isEmpty, reason: 'после зачёта черновик сбрасывается');
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    expect(hud.firstWhere((h) => h.label == 'Найдено').value, startsWith('1/'));
  });

  testWidgets('🔴 повтор той же цели не засчитывается дважды', (tester) async {
    await _boot(tester, state);
    final target = _board(tester).pack.words.first;
    await _spell(tester, target);
    await tester.tap(find.byKey(const ValueKey('all-words-check')));
    await tester.pump();
    expect(_board(tester).found.length, 1);

    await _spell(tester, target);
    await tester.tap(find.byKey(const ValueKey('all-words-check')));
    await tester.pump();
    expect(_board(tester).found.length, 1, reason: 'повтор — не новая находка');
    expect(_board(tester).wrong, isTrue, reason: 'и человек должен это видеть');
  });

  testWidgets('🔴 «Сбросить» очищает черновик, мусор не засчитывается', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    expect(_board(tester).picked, [0]);

    await tester.tap(find.byKey(const ValueKey('all-words-clear')));
    await tester.pump();
    expect(_board(tester).picked, isEmpty);

    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('all-words-check')));
    await tester.pump();
    expect(_board(tester).found, isEmpty);
    expect(_board(tester).wrong, isTrue);
  });

  testWidgets('🔴 подсказка открывает букву цели и запас конечен', (tester) async {
    await _boot(tester, state);
    expect(_board(tester).opened, isEmpty);
    for (var i = 1; i <= 3; i++) {
      await tester.tap(find.byTooltip('Подсказка'));
      await tester.pump();
      final openedCount = _board(tester).opened.values.fold<int>(0, (a, b) => a + b);
      expect(openedCount, i, reason: 'подсказка $i обязана открыть букву');
    }
    await tester.tap(find.byTooltip('Подсказка'), warnIfMissed: false);
    await tester.pump();
    final openedAfter = _board(tester).opened.values.fold<int>(0, (a, b) => a + b);
    expect(openedAfter, 3, reason: 'запас подсказок конечен');
  });

  testWidgets('🔴 «Перемешать» меняет порядок, но не буквы и не находки', (tester) async {
    await _boot(tester, state);
    final target = _board(tester).pack.words.first;
    await _spell(tester, target);
    await tester.tap(find.byKey(const ValueKey('all-words-check')));
    await tester.pump();

    final before = _board(tester).letters;
    await tester.tap(find.byTooltip('Перемешать'));
    await tester.pump();
    final after = _board(tester);
    expect(after.letters.toList()..sort(), before.toList()..sort(), reason: 'буквы те же');
    expect(after.found, contains(target), reason: 'перемешивание не отнимает найденное');
    expect(after.picked, isEmpty);
  });
}

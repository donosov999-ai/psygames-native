import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Пробы экрана «Анаграммы» — партия играется НАЖАТИЯМИ, а не вызовом правил.
///
/// Правила сверены отдельно с эталонами живого TS (`anagrams_test.dart`). Но
/// зелёные правила при неработающей доске уже давали в этом проекте «правила ок,
/// продукт не работает»: кнопка была нарисована и объявлена, а нажатие до неё не
/// доходило. Поэтому здесь буквы жмутся по-настоящему.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: AnagramsScreen(state: state, locale: 'ru')));
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(AnagramBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

AnagramBoard _board(WidgetTester t) => t.widget<AnagramBoard>(find.byType(AnagramBoard));

/// Нажать буквы колеса в том порядке, который собирает `word`.
Future<void> _spell(WidgetTester tester, String word) async {
  final letters = _board(tester).letters;
  final used = <int>{};
  for (final ch in word.runes.map(String.fromCharCode)) {
    var idx = -1;
    for (var k = 0; k < letters.length; k++) {
      if (!used.contains(k) && letters[k] == ch) {
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

  testWidgets('🔴 экран доходит до доски, а не крутит загрузку вечно', (tester) async {
    await _boot(tester, state);
    expect(find.byType(AnagramBoard), findsOneWidget);
    expect(find.byType(GameShell), findsOneWidget);
    final b = _board(tester);
    expect(b.letters.length, b.target.runes.length, reason: 'букв столько же, сколько в слове');
  });

  testWidgets('🔴 слово собирается НАЖАТИЯМИ по буквам и засчитывается', (tester) async {
    await _boot(tester, state);
    final target = _board(tester).target;
    await _spell(tester, target);
    await tester.pump(const Duration(milliseconds: 50));

    // Слово сдано автоматически на последней букве: пришло следующее.
    final after = _board(tester);
    expect(after.picked, isEmpty, reason: 'после зачёта набранное сбрасывается');
    expect(find.textContaining('Собрано'), findsNothing); // подпись в Semantics, не текстом
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    final solved = hud.firstWhere((h) => h.label == 'Собрано').value;
    expect(solved, '1', reason: 'собранное слово обязано попасть в счётчик');
  });

  testWidgets('🔴 «Сбросить» снимает набранное, а «Проверить» не принимает мусор', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    expect(_board(tester).picked, [0]);

    await tester.tap(find.byKey(const ValueKey('anagrams-reset')));
    await tester.pump();
    expect(_board(tester).picked, isEmpty, reason: '«Сбросить» обязана очищать набранное');

    // Набираем заведомо не слово: первая буква дважды нажата быть не может,
    // поэтому берём две первые буквы колеса и сдаём вручную.
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('anagrams-check')));
    await tester.pump();
    expect(_board(tester).wrong, isTrue, reason: 'непринятое слово обязано быть видно');
  });

  testWidgets('🔴 подсказка открывает букву и тратится, а не бесконечна', (tester) async {
    await _boot(tester, state);
    expect(_board(tester).revealed, 0);
    for (var i = 1; i <= 3; i++) {
      await tester.tap(find.byTooltip('Подсказка'));
      await tester.pump();
      expect(_board(tester).revealed, i, reason: 'подсказка $i обязана открыть букву');
    }
    // Запас кончился. Проверяем не «кнопка серая», а ПОВЕДЕНИЕ: четвёртое
    // нажатие не открывает четвёртой буквы. Серый вид — оформление, а ресурс,
    // который тратится молча, и есть дефект.
    await tester.tap(find.byTooltip('Подсказка'), warnIfMissed: false);
    await tester.pump();
    expect(_board(tester).revealed, 3, reason: 'запас подсказок конечен');
  });

  testWidgets('🔴 «Перемешать» меняет порядок, но не буквы', (tester) async {
    await _boot(tester, state);
    final before = _board(tester);
    final target = before.target;
    await tester.tap(find.byTooltip('Перемешать'));
    await tester.pump();
    final after = _board(tester);
    expect(after.target, target, reason: 'слово то же');
    expect(after.letters.toList()..sort(), before.letters.toList()..sort(),
        reason: 'буквы те же');
    expect(after.picked, isEmpty, reason: 'набранное сбрасывается — порядок индексов изменился');
  });
}

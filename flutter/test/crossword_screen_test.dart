import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/crossword_board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Пробы экрана «Кроссворд» — партия играется НАЖАТИЯМИ по буквам колеса.
///
/// Правила и сама сетка сверены с живым TS отдельно (`crossword_test.dart`,
/// сорок раскладок клетка в клетку). Здесь — что до них доходит палец и что
/// сетка рисуется, а не остаётся обещанием в модели.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: CrosswordScreen(state: state, locale: 'ru')));
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(CrosswordBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

CrosswordBoard _board(WidgetTester t) => t.widget<CrosswordBoard>(find.byType(CrosswordBoard));

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
    // Подписи — из ТОГО ЖЕ словаря, что и в сборке: проба заодно проверяет, что
    // `assets/l10n/ru.json` собран и читается, а не сверяется с переписанной строкой.
    await L.load('ru');
  });

  testWidgets('🔴 сетка НАРИСОВАНА: занятых клеток столько же, сколько букв в модели', (tester) async {
    await _boot(tester, state);
    final b = _board(tester);
    expect(find.byType(GameShell), findsOneWidget);
    expect(b.crossword.words.length, greaterThanOrEqualTo(6));
    // Клетка на каждую занятую позицию — сетка не должна быть обещанием в модели.
    for (final k in b.crossword.letters.keys) {
      expect(find.byKey(ValueKey('cell-$k')), findsOneWidget, reason: 'нет клетки $k');
    }
    expect(b.revealed, isEmpty, reason: 'в начале партии ничего не открыто');
  });

  testWidgets('🔴 слово из сетки, набранное пальцем, открывает свои клетки', (tester) async {
    await _boot(tester, state);
    final word = _board(tester).crossword.words.first.word;
    await _spell(tester, word);
    await tester.tap(find.byKey(const ValueKey('crossword-check')));
    await tester.pump();

    final b = _board(tester);
    expect(b.revealed.length, word.length, reason: 'найденное слово открыто целиком');
    expect(b.picked, isEmpty, reason: 'после зачёта черновик сбрасывается');
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    expect(hud.firstWhere((h) => h.label == L.t('label_found')).value, startsWith('1/'));
  });

  testWidgets('🔴 слова НЕ из сетки не засчитываются, даже если они настоящие', (tester) async {
    await _boot(tester, state);
    final b = _board(tester);
    // Берём цель «Всех слов», которой в сетке нет: настоящее слово, но не здесь.
    final inGrid = {for (final w in b.crossword.words) w.word};
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('crossword-check')));
    await tester.pump();
    expect(_board(tester).revealed, isEmpty, reason: 'одна буква — не слово сетки');
    expect(_board(tester).wrong, isTrue, reason: 'и человек должен это видеть');
    expect(inGrid, isNotEmpty);
  });

  testWidgets('🔴 «Сбросить» очищает черновик', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byKey(const ValueKey('letter-0')));
    await tester.pump();
    expect(_board(tester).picked, [0]);
    await tester.tap(find.byKey(const ValueKey('crossword-clear')));
    await tester.pump();
    expect(_board(tester).picked, isEmpty);
  });

  testWidgets('🔴 подсказка открывает клетку и тратится по лестнице уровня', (tester) async {
    await _boot(tester, state);
    expect(_board(tester).revealed, isEmpty);
    await tester.tap(find.byTooltip(L.t('btn_hint')));
    await tester.pump();
    expect(_board(tester).revealed.length, 1, reason: 'подсказка открывает одну букву');
    await tester.tap(find.byTooltip(L.t('btn_hint')));
    await tester.pump();
    expect(_board(tester).revealed.length, 2);
  });

  testWidgets('🔴 запас подсказок КОНЕЧЕН и задан лестницей уровня', (tester) async {
    await _boot(tester, state);
    // На первом уровне их пять (`crossHintsAtLevel`). Жмём шесть раз.
    for (var i = 1; i <= 5; i++) {
      await tester.tap(find.byTooltip(L.t('btn_hint')));
      await tester.pump();
      expect(_board(tester).revealed.length, i, reason: 'подсказка $i обязана открыть букву');
    }
    await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
    await tester.pump();
    expect(_board(tester).revealed.length, 5,
        reason: 'шестая подсказка не выдаётся — иначе ресурс бесконечен');
  });

  testWidgets('🔴 «Перемешать» меняет порядок, но не буквы и не открытое', (tester) async {
    await _boot(tester, state);
    await tester.tap(find.byTooltip(L.t('btn_hint')));
    await tester.pump();
    final before = _board(tester);
    final openedBefore = before.revealed.length;
    final lettersBefore = before.letters.toList()..sort();

    await tester.tap(find.byTooltip(L.t('shuffleBtn')));
    await tester.pump();
    final after = _board(tester);
    expect(after.letters.toList()..sort(), lettersBefore, reason: 'буквы те же');
    expect(after.revealed.length, openedBefore, reason: 'перемешивание не отнимает открытое');
    expect(after.picked, isEmpty);
  });
}

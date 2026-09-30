import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/games/anagrams/teach.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
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
    // Подписи — из ТОГО ЖЕ словаря, что и в сборке: проба заодно проверяет, что
    // `assets/l10n/ru.json` собран и читается, а не сверяется с переписанной строкой.
    await L.load('ru');
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
    final solved = hud.firstWhere((h) => h.label == L.t('hud_correct')).value;
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
      await tester.tap(find.byTooltip(L.t('btn_hint')));
      await tester.pump();
      expect(_board(tester).revealed, i, reason: 'подсказка $i обязана открыть букву');
    }
    // Запас кончился. Проверяем не «кнопка серая», а ПОВЕДЕНИЕ: четвёртое
    // нажатие не открывает четвёртой буквы. Серый вид — оформление, а ресурс,
    // который тратится молча, и есть дефект.
    await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
    await tester.pump();
    expect(_board(tester).revealed, 3, reason: 'запас подсказок конечен');
  });

  testWidgets('🔴 «Перемешать» меняет порядок, но не буквы', (tester) async {
    await _boot(tester, state);
    final before = _board(tester);
    final target = before.target;
    await tester.tap(find.byTooltip(L.t('shuffleBtn')));
    await tester.pump();
    final after = _board(tester);
    expect(after.target, target, reason: 'слово то же');
    expect(after.letters.toList()..sort(), before.letters.toList()..sort(),
        reason: 'буквы те же');
    expect(after.picked, isEmpty, reason: 'набранное сбрасывается — порядок индексов изменился');
  });

  /// 🔴 ОБЕЩАНИЕ ПРОВЕРЯЕТСЯ НА ЧУЖОМ ЯЗЫКЕ, А НЕ НА РУССКОМ.
  ///
  /// Пробы выше зовут `L.t('ключ')` и на русском словаре получают ровно те слова,
  /// что раньше были зашиты, — то есть покраснеть от возврата литералов они НЕ
  /// могут. Обещание тут другое: немец видит немецкое. Поэтому один заход идёт
  /// на немецком и сверяется с НАПИСАННЫМИ немецкими словами: вернут литерал —
  /// проба покраснеет, и неважно, каким способом его вернут.
  ///
  /// Язык слов и язык интерфейса — РАЗНЫЕ вещи: банк остаётся русским (`locale:
  /// 'ru'`), подписи становятся немецкими. Так же устроен и веб-экран, где язык
  /// слов выбирается отдельной строкой `wordLangLabel`.
  testWidgets('🔴 подписи говорят на языке игрока, а не на языке разработчика', (tester) async {
    // ⚠️ ПОПРАВКА 30.09.2026 к первому объяснению. Здесь стояло «голый
    // `await L.load` в testWidgets не завершается никогда» — опыт это опроверг:
    // малый файл грузится, а висел только файл от 50 КБ, который
    // `AssetBundle.loadString` отдавал в `compute()`. С 30.09 `L.load` декодирует
    // байты сам, и голый await безопасен; `runAsync` оставлен — он не вредит.
    await tester.runAsync(() => L.load('de'));
    await _boot(tester, state);
    expect(find.text('Anagramme'), findsWidgets, reason: 'заголовок');
    expect(find.byTooltip('Tipp'), findsOneWidget, reason: 'подсказка');
    expect(find.byTooltip('Mischen'), findsOneWidget, reason: 'перемешать');
    expect(find.text('Löschen'), findsOneWidget, reason: 'сброс черновика');
    expect(find.text('Prüfen'), findsOneWidget, reason: 'сдать слово');
    final hud = tester.widget<GameShell>(find.byType(GameShell)).hud;
    expect(hud.map((h) => h.label), containsAll(<String>['Stufe', 'Runde', 'Richtig']));
    await tester.runAsync(() => L.load('ru'));
  });

  /* ═══════════ РАЗБОР ПО ШАГАМ ═══════════
   *
   * 🔴 ПОЧЕМУ ЭТО ЗДЕСЬ, А НЕ ТОЛЬКО В ПЕРЕПИСИ. Гейт `lesson_census_test.dart`
   * требует у экрана кнопку и краснеет, если её нет. Но он НЕ проверяет, что разбор
   * доводит слово до конца и что партия после него перестаёт быть зачётной: перепись
   * считает носители, а не поведение. Поэтому разбор играется здесь.
   */
  testWidgets('🔴 разбор доводит слово до конца и открывает РОВНО те плитки, что объясняет',
      (tester) async {
    await _boot(tester, state);
    expect(find.byKey(const Key('game-lesson')), findsOneWidget,
        reason: 'на первом уровне разбор обязан быть');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    expect(find.textContaining(L.t('teachTitle')), findsWidgets, reason: 'плеер открылся');

    // Шаги листаем до последнего и смотрим на доску ПЛЕЕРА, а не на доску партии.
    final target = _board(tester).target;
    for (var i = 0; i < 12; i++) {
      final next = find.byTooltip(L.t('puzzleNextStep'));
      if (next.evaluate().isEmpty) break;
      await tester.tap(next);
      await tester.pump(const Duration(milliseconds: 50));
    }
    final board = tester
        .widgetList<AnagramBoard>(find.byType(AnagramBoard))
        .last;
    final assembled = [for (final i in board.picked) board.letters[i]].join();
    expect(assembled, upJs(target),
        reason: 'разбор обязан довести до слова, а не до половины');
  });

  testWidgets('🔴 партия с разбором перестаёт быть зачётной', (tester) async {
    LessonUsed.reset();
    await _boot(tester, state);
    expect(LessonUsed.inRound, isFalse, reason: 'до разбора партия зачётная');
    await tester.tap(find.byKey(const Key('game-lesson')));
    await tester.pumpAndSettle();
    // Отметку ставит экран при открытии: правило «лестницу не двигаем» живёт в
    // каркасе (`LevelLadder.win/fail`), но включить его обязана игра.
    expect(LessonUsed.inRound, isTrue,
        reason: 'без отметки лестница пошла бы вверх по показанному решению');
    LessonUsed.reset();
  });

  testWidgets('🔴 с четвёртого уровня разбора нет: приёмы уже названы', (tester) async {
    await state.set('psygames_anagrams_level_nzt48', '4');
    await _boot(tester, state);
    expect(find.byKey(const Key('game-lesson')), findsNothing,
        reason: 'правило перенесено дословно: разбор до третьего уровня включительно');
    // И это не «экран сломался»: партия на месте.
    expect(find.byType(AnagramBoard), findsOneWidget);
  });
}

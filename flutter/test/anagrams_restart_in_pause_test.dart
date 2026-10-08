import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/anagrams/all_words_board.dart';
import 'package:psygames_flutter/games/anagrams/all_words_screen.dart';
import 'package:psygames_flutter/games/anagrams/board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_board.dart';
import 'package:psygames_flutter/games/anagrams/crossword_screen.dart';
import 'package:psygames_flutter/games/anagrams/ring_board.dart';
import 'package:psygames_flutter/games/anagrams/ring_screen.dart';
import 'package:psygames_flutter/games/anagrams/screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ЗАНОВО» В ПАУЗЕ У ВСЕХ ЧЕТЫРЁХ ИГР АНАГРАММ — НА НАСТОЯЩИХ ЭКРАНАХ.
///
/// 📍 Отчёт 5be4998f (09.09.2026): «чтобы начать новую партию, тыкаю неправильные числа три
/// раза, чтобы жизни закончились». Веб тогда завёл «Заново» в паузу анаграмм; при переносе на
/// Flutter пункт не доехал. С 02.10 его добавляет каркас (`RestartScope`, задача 1e21b974),
/// но проба каркаса (`restart_in_pause_test`) стоит на ИГРУШЕЧНОЙ игре. Здесь — четыре
/// настоящих экрана: у каждого своя пауза («Перемешать», «Пропустить»), и проверяется, что
/// каркас не принял ни один из них за свой «Заново» и пункт действительно есть.
///
/// Что держит каждая проба: ход на поле → пауза → «Заново» ровно один → поле с нуля (набранное
/// снято) → ступень лестницы та же (перезапуск не проигрыш и не выигрыш).
///
/// 🔴 Попутно файл держит загрузчик словаря: три экрана из четырёх читают ОДИН банк слов, и при
/// `loadString` вторая и третья проба висели — кэш отдавал будущее из зоны первой (07.10.2026,
/// «Все слова» и кроссворд красные, классика и квадрат зелёные). Поэтому все четыре — в одном файле.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  final cases = <({
    String name,
    String levelKey,
    Widget Function(SharedState) screen,
    Type board,
    List<int> Function(WidgetTester) picked,
  })>[
    (
      name: 'классика',
      levelKey: 'psygames_anagrams_level_nzt48',
      screen: (s) => AnagramsScreen(state: s, locale: 'ru'),
      board: AnagramBoard,
      picked: (t) => t.widget<AnagramBoard>(find.byType(AnagramBoard)).picked,
    ),
    (
      name: '«Все слова»',
      levelKey: 'psygames_anagrams_all_level_nzt48',
      screen: (s) => AllWordsScreen(state: s, locale: 'ru'),
      board: AllWordsBoard,
      picked: (t) => t.widget<AllWordsBoard>(find.byType(AllWordsBoard)).picked,
    ),
    (
      name: 'кроссворд',
      levelKey: 'psygames_anagrams_cross_level_nzt48',
      screen: (s) => CrosswordScreen(state: s, locale: 'ru'),
      board: CrosswordBoard,
      picked: (t) => t.widget<CrosswordBoard>(find.byType(CrosswordBoard)).picked,
    ),
    (
      name: 'слово-квадрат',
      levelKey: 'psygames_anagrams_square_level_nzt48',
      screen: (s) => RingScreen(state: s, locale: 'ru'),
      board: RingBoard,
      picked: (t) => t.widget<RingBoard>(find.byType(RingBoard)).picked,
    ),
  ];

  /// Экран грузит словарь с диска — ждём поле настоящим временем, а не поддельным.
  Future<void> waitBoard(WidgetTester tester, Type board) async {
    await tester.runAsync(() async {
      for (var i = 0; i < 200; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(board).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.byType(board), findsOneWidget, reason: 'поле не поднялось');
  }

  /// Ступень, которую показывает полоса. Без этой сверки «ступень та же» пустая: ошибись проба
  /// в имени ключа — записанная тройка не тронулась бы при любом поведении экрана.
  String hudLevel(WidgetTester tester) =>
      tester.widget<GameShell>(find.byType(GameShell)).hud.firstWhere((h) => h.label == L.t('level')).value;

  for (final c in cases) {
    testWidgets('🔴 ${c.name}: «Заново» в паузе есть, начинает с нуля и ступень не трогает', (tester) async {
      await state.set(c.levelKey, '3');
      await tester.pumpWidget(MaterialApp(home: RestartScope(builder: (_) => c.screen(state))));
      await waitBoard(tester, c.board);
      expect(hudLevel(tester), '3', reason: 'лестница не прочла ключ ${c.levelKey} — сверка ступени ниже была бы пустой');

      await tester.tap(find.byKey(const ValueKey('letter-0')));
      await tester.pump();
      expect(c.picked(tester), isNotEmpty, reason: 'ход не лёг на поле — проверять было бы нечего');

      await tester.tap(find.byTooltip(L.t('teachPause')));
      await tester.pumpAndSettle();
      expect(find.text(L.t('restart')), findsOneWidget,
          reason: 'в паузе ${c.name} нет «Заново» (или их два) — отчёт 5be4998f вернулся');

      await tester.tap(find.text(L.t('restart')));
      await tester.pumpAndSettle();
      await waitBoard(tester, c.board);
      expect(c.picked(tester), isEmpty, reason: '«Заново» не начало партию с нуля');
      expect(state.get(c.levelKey), '3', reason: '«Заново» сдвинуло ступень лестницы');
      expect(hudLevel(tester), '3', reason: '«Заново» сдвинуло ступень на экране');
    });
  }
}

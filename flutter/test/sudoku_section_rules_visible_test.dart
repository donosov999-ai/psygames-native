import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/games/puzzles/engine.dart';
import 'package:psygames_flutter/games/puzzles/ladder.dart';
import 'package:psygames_flutter/games/puzzles/screen.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/rule_help.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРАВИЛО ВИДНО — ТАМ, ГДЕ ЕГО ИЩУТ (три отзыва раздела «Судоку», приёмка 20.10.2026).
///
/// · 0c682daf (Релакс, 10.10): «Небоскрёбы» — «ничего не понятно». «?» в шапке показывал описание
///   карточки каталога «Подсказки на краях: сколько зданий видно»; правило с примером было только
///   в карточке «новое правило» (один раз) и в паузе. Теперь «?» — справка правила доски.
/// · ab1e8434 (Релакс, 10.10): «Чёт-нечет» — «что за игра, правил нет». «?» давал строку карточки,
///   учитель — ходы без слова о правилах, подпись — общая «Тычок отмечает клетку», а полная справка
///   в 10 переводах из 12 была вступлением ко всем «Головоломкам». Теперь «?» и первый шаг разбора —
///   полная справка режима, подпись тычка — своя.
/// · 9449db7a (NZT-48, 19.10): «Кошки» — «как ставить котов?», на кадре одни ✕. Как ставить —
///   теперь строкой под полем, а не только в окне правил за «?».
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final libPath = '${Directory.current.path}/build/tatham/${TathamEngine.libraryName}';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    await PuzzleModes.load();
  });

  Future<void> settle(WidgetTester tester, {required bool Function() until, int rounds = 120}) async {
    await tester.runAsync(() async {
      for (var i = 0; i < rounds; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (until()) break;
      }
    });
    await tester.pump();
  }

  Future<void> mount(WidgetTester tester, Widget screen, Map<String, Object> prefs, {required bool Function() ready}) async {
    SharedPreferences.setMockInitialValues(prefs);
    await tester.runAsync(() async => state = await SharedState.open());
    await tester.pumpWidget(MaterialApp(home: screen));
    await settle(tester, until: ready);
  }

  Finder rulesButton() => find.byTooltip(L.t('btn_rules'));

  group('«Небоскрёбы»', () {
    testWidgets('🔴 «?» открывает правило доски с примером, а не описание карточки', (tester) async {
      // Карточку «новое правило» человек уже закрыл — как у Вали на кадре: правило берут только из «?».
      await mount(tester, Builder(builder: (_) => SudokuScreen(state: state, mode: SideMode.towers)),
          {'language': 'ru', sudokuRuleSeenKey('towers'): '1'},
          ready: () => find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty);
      expect(rulesButton(), findsOneWidget, reason: 'в шапке нет «?»');
      await tester.tap(rulesButton());
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('sudoku-rule-help')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('sudoku-rule-text'))).data, L.t('sudokuRuleTowers'));
      expect(tester.widget<Text>(find.byKey(const Key('sudoku-rule-caption'))).data, L.t('sudokuEx_towers'),
          reason: 'пример «1 у края — первое самое высокое» — то, что объясняет числа по краям');
      expect(find.text(L.t('sudokuTowersHubDesc')), findsNothing, reason: 'вместо правила — строка карточки каталога');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('классика своей справки правила не имеет — «?» не ведёт в окно правила варианта', (tester) async {
      await mount(tester, Builder(builder: (_) => SudokuScreen(state: state)),
          {'language': 'ru', 'psygames_sudoku_level_nzt48': '5'},
          ready: () => find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty);
      if (rulesButton().evaluate().isNotEmpty) {
        await tester.tap(rulesButton());
        await tester.pumpAndSettle();
      }
      expect(find.byKey(const Key('sudoku-rule-help')), findsNothing);
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('«Кошки»', () {
    testWidgets('🔴 как ставить кошку — строкой под полем, пока идёт партия', (tester) async {
      await mount(tester, Builder(builder: (_) => CatsScreen(state: state)), {'language': 'ru'},
          ready: () => find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty);
      final line = find.byKey(const Key('cats-how-press-line'));
      expect(line, findsOneWidget, reason: 'под полем нет строки «как ставить»');
      expect(tester.widget<Text>(line).data, L.t('catsHowPress'));
      expect(L.t('catsHowPress'), contains('Долгое нажатие'), reason: 'строка обязана назвать жест кошки');
      await tester.pumpWidget(const SizedBox());
    });
  });

  group('«Чёт-нечет»', () {
    setUpAll(() {
      expect(File(libPath).existsSync(), isTrue, reason: 'нет движка Тэтхэма $libPath — из flutter/: tool/build_tatham.sh');
    });

    Future<void> boot(WidgetTester tester) => mount(
          tester,
          Builder(builder: (_) => PuzzlesScreen(state: state, mode: 'Unruly', libraryPath: libPath)),
          {'language': 'ru', 'psygames_active_profile': 'nzt48'},
          ready: () => find.byKey(const Key('game-lesson')).evaluate().isNotEmpty,
        );

    testWidgets('🔴 «?» — полная справка с тремя правилами и вводом; подпись тычка — своя', (tester) async {
      await boot(tester);
      expect(find.text(L.t('puzzleTapUnruly')), findsOneWidget, reason: 'под полем общая «Тычок отмечает клетку»');
      await tester.tap(rulesButton());
      await tester.pumpAndSettle();
      final text = tester.widget<Text>(find.byKey(const Key('game-rules-text'))).data!;
      expect(text, L.t('puzzlesUnrulyIntroDesc'));
      expect(text, contains('двух одинаковых строк'), reason: 'третье правило — то, чего нет в строке карточки');
      expect(text, contains('⇄'), reason: 'справка обязана назвать нативный ввод');
      await tester.pumpWidget(const SizedBox());
    });

    testWidgets('🔴 учитель начинает с правила, а не с первого хода', (tester) async {
      await boot(tester);
      await tester.runAsync(() async {
        await tester.tap(find.byKey(const Key('game-lesson')));
        for (var i = 0; i < 40; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
          if (find.byKey(const Key('lesson-counter')).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
      expect(find.textContaining('Шаг 1 из'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('lesson-text'))).data, L.t('puzzlesUnrulyIntroDesc'));
      await tester.pumpWidget(const SizedBox());
    });

    test('🔴 справка «Чёт-нечет» на всех 12 языках — про эту игру и про нативный ввод', () {
      final wrong = <String>[];
      for (final f in Directory('assets/l10n').listSync().whereType<File>()) {
        final name = f.uri.pathSegments.last;
        if (!RegExp(r'^[a-z]{2}\.json$').hasMatch(name)) continue;
        final d = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
        final t = d['puzzlesUnrulyIntroDesc'] as String? ?? '';
        // ⏸ — примета вступления ко всем «Головоломкам», которое лежало тут в десяти переводах.
        if (!t.contains('⇄') || t.contains('⏸')) wrong.add(name);
        if ((d['puzzleTapUnruly'] as String? ?? '').isEmpty) wrong.add('$name: нет puzzleTapUnruly');
      }
      expect(wrong, isEmpty);
    });
  });
}

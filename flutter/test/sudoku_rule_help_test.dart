import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРАВИЛО ВАРИАНТА ОБЪЯСНЕНО ДО ПЕРВОГО ХОДА — И ДОСТУПНО ВО ВРЕМЯ ПАРТИИ (b5df5096 п.5).
///
/// Повод — отчёт Вали: играла «ход конём», не зная правила; в нативе правило было только
/// именем в полосе. Сверка 138f7818, строки 109 и 111. Проверяется видимое, нажатиями:
/// карточка «новое правило» на первом входе (доска при этом живая), окно со схемой 5×5 и
/// подписью-примером, флаг «видел» общий с вебом, пункт паузы, режим «Киллер», узкий экран.
void main() {
  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });
  late SharedState state;
  const knightLevel = '14';   // ход коня: ступени 14–17 (sudoku-ladder.json)

  Future<void> boot(WidgetTester tester, {Map<String, Object> prefs = const {}, SideMode? mode}) async {
    SharedPreferences.setMockInitialValues(prefs);
    await tester.runAsync(() async {
      state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, mode: mode)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 30));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pumpAndSettle();
  }

  int valueAt(WidgetTester tester, int r, int c) {
    for (final e in find.descendant(of: find.byKey(Key('cell_${r}_$c')), matching: find.byType(Text)).evaluate()) {
      final t = e.widget as Text;
      final v = int.tryParse(t.data ?? '');
      if (t.key == null && v != null) return v;
    }
    return 0;
  }

  String? textOf(WidgetTester tester, String key) {
    final f = find.byKey(Key(key));
    return f.evaluate().isEmpty ? null : tester.widget<Text>(f).data;
  }

  testWidgets('🔴 первый вход на «ход коня»: карточка с правилом над доской, доска при этом живая', (tester) async {
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel});
    expect(find.byKey(const Key('sudoku-rule-banner')), findsOneWidget, reason: 'новое правило объявлено');
    expect(textOf(tester, 'sudoku-rule-banner-text'), L.t('sudokuRuleAntiknight'));
    expect(textOf(tester, 'sudoku-rule-banner-text'), isNot('sudokuRuleAntiknight'), reason: 'текст, а не ключ');
    // Карточка не модальная: ход ставится как обычно.
    late int r0, c0;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (valueAt(tester, r, c) == 0) {
          (r0, c0) = (r, c);
          found = true;
        }
      }
    }
    await tap(tester, find.byKey(Key('cell_${r0}_$c0')));
    await tap(tester, find.byKey(const Key('digit5')));
    expect(valueAt(tester, r0, c0), 5, reason: 'карточка не закрывает доску');
  });

  testWidgets('🔴 «Правила» в карточке: окно со схемой хода коня и подписью; флаг «видел» общий с вебом', (tester) async {
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel});
    await tap(tester, find.byKey(const Key('sudoku-rule-more')));
    expect(find.byKey(const Key('sudoku-rule-help')), findsOneWidget);
    expect(textOf(tester, 'sudoku-rule-base'), L.f('sudokuBaseRule', {'n': '9'}));
    expect(textOf(tester, 'sudoku-rule-base'), isNot(contains('{n}')), reason: 'подстановка сделана');
    expect(textOf(tester, 'sudoku-rule-text'), L.t('sudokuRuleAntiknight'));
    expect(textOf(tester, 'sudoku-rule-caption'), L.t('sudokuEx_antiknight'));
    Color cell(int r, int c) =>
        (tester.widget<Container>(find.byKey(Key('example_${r}_$c'))).decoration! as BoxDecoration).color!;
    expect(cell(2, 2), const Color(0xFF7F7FD5), reason: 'поставленная тройка — в центре');
    for (final (r, c) in const [(0, 1), (0, 3), (1, 0), (1, 4), (3, 0), (3, 4), (4, 1), (4, 3)]) {
      expect(cell(r, c), const Color(0xFFFECACA), reason: '($r,$c) — ход коня: такую же нельзя');
    }
    expect(cell(1, 1), isNot(const Color(0xFFFECACA)), reason: 'по диагонали — можно');
    await tap(tester, find.byKey(const Key('sudoku-rule-ok')));
    expect(find.byKey(const Key('sudoku-rule-banner')), findsNothing, reason: 'прочитал — карточка ушла');
    expect(state.get('psygames_sudoku_rulehint_antiknight'), isNotNull, reason: 'ключ веба — показанное в одной половине не всплывёт в другой');
  });

  testWidgets('🔴 закрытая карточка не возвращается; правило, виденное в вебе, карточку не вызывает', (tester) async {
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel});
    await tap(tester, find.byKey(const Key('sudoku-rule-close')));
    expect(find.byKey(const Key('sudoku-rule-banner')), findsNothing);
    expect(state.get('psygames_sudoku_rulehint_antiknight'), isNotNull);

    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel, 'psygames_sudoku_rulehint_antiknight': '1'});
    expect(find.byKey(const Key('sudoku-rule-banner')), findsNothing, reason: 'видел в вебе — второй раз не объявляем');
  });

  testWidgets('🔴 правило доступно и после: пункт паузы открывает то же окно', (tester) async {
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel, 'psygames_sudoku_rulehint_antiknight': '1'});
    await tap(tester, find.byIcon(Icons.pause).first);
    await tap(tester, find.text('${L.t('simonRule')}: ${variantTitle('antiknight')}'));
    expect(find.byKey(const Key('sudoku-rule-help')), findsOneWidget);
    expect(textOf(tester, 'sudoku-rule-text'), L.t('sudokuRuleAntiknight'));
  });

  testWidgets('🔴 классика: ни карточки, ни пункта правила — объяснять нечего', (tester) async {
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': '5'});
    expect(find.byKey(const Key('sudoku-rule-banner')), findsNothing);
    await tap(tester, find.byIcon(Icons.pause).first);
    expect(find.textContaining('${L.t('simonRule')}:'), findsNothing);
  });

  testWidgets('🔴 режим «Киллер»: карточка с правилом киллера, окно без схемы, с подписью', (tester) async {
    await boot(tester, mode: SideMode.killer);
    expect(textOf(tester, 'sudoku-rule-banner-text'), L.t('sudokuKillerRule'));
    await tap(tester, find.byKey(const Key('sudoku-rule-more')));
    expect(find.text(L.t('sudokuModeKiller')), findsWidgets);
    expect(find.byKey(const Key('sudoku-rule-example')), findsNothing, reason: 'у сумм схемы 5×5 нет');
    expect(textOf(tester, 'sudoku-rule-caption'), L.t('sudokuEx_killer'));
  });

  testWidgets('🔴 360×640: с карточкой доска и клавиши на экране, каркас не переполнен', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await boot(tester, prefs: {'psygames_sudoku_level_nzt48': knightLevel});
    expect(find.byKey(const Key('sudoku-rule-banner')), findsOneWidget);
    expect(tester.takeException(), isNull, reason: 'переполнение каркаса');
    for (final k in ['cell_0_0', 'cell_8_8', 'digit1', 'digit9', 'sudoku-rule-close']) {
      final rect = tester.getRect(find.byKey(Key(k)));
      expect(rect.bottom, lessThanOrEqualTo(640.0), reason: '$k ниже экрана: $rect');
      expect(rect.top, greaterThanOrEqualTo(0.0), reason: '$k выше экрана: $rect');
    }
    // Доска не залезла под карточку.
    expect(tester.getRect(find.byKey(const Key('cell_0_0'))).top,
        greaterThanOrEqualTo(tester.getRect(find.byKey(const Key('sudoku-rule-banner'))).bottom - 0.5));
  });
}

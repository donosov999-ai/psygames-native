import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/modes.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 СПРАВКА РАЗДЕЛА «СУДОКУ» — задача ab6abedf (аудит справки, Luna).
///
/// Две находки аудита:
///   1. `puzzlesKeenDesc` по-английски говорил «arithmetic adds up» — будто в Keen
///      только сложение. В Keen есть и вычитание, и умножение, и деление: человек
///      по такой справке искал бы суммы там, где нужно произведение.
///   2. «Небоскрёбы» и «Неравенства» — режимы ОДНОГО экрана (`?mode=`), и справка
///      обязана быть своя у каждого, а не общая «правила судоку». Веб брал общую —
///      но веб-экран судоку человеку больше не показывается; здесь проверяется
///      нативный, который он видит.
///
/// Проба открывает НАСТОЯЩИЙ экран режима и жмёт «Правила» — как человек.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await GameRules.load();
  });
  tearDown(() => GameRules.currentRoute = null);

  Future<String> rulesShownFor(WidgetTester tester, String route, SideMode mode) async {
    GameRules.currentRoute = route;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state, mode: mode)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    await tester.tap(find.byTooltip(L.t('btn_rules')));
    await tester.pumpAndSettle();
    final dialog = find.byKey(const Key('game-rules'));
    expect(dialog, findsOneWidget, reason: '$route: справка не открылась');
    final texts = find.descendant(of: dialog, matching: find.byType(Text)).evaluate()
        .map((e) => (e.widget as Text).data ?? '').join(' ');
    return texts;
  }

  for (final locale in ['ru', 'en']) {
    testWidgets('🔴 [$locale] «Небоскрёбы» и «Неравенства» показывают СВОЮ справку', (tester) async {
      await tester.runAsync(() => L.load(locale));
      final towers = await rulesShownFor(tester, '/games/sudoku?mode=towers', SideMode.towers);
      expect(towers, contains(L.t('sudokuTowersHubDesc')),
          reason: 'в режиме «Небоскрёбы» — правило небоскрёбов');
      // Окно справки закрывается сменой экрана: у диалога каркаса своя кнопка, и
      // пробе незачем знать её вид — проверяется текст, а не оформление.
      await tester.pumpWidget(const SizedBox());
      await tester.pump();

      final unequal = await rulesShownFor(tester, '/games/sudoku?mode=unequal', SideMode.unequal);
      expect(unequal, contains(L.t('sudokuUnequalHubDesc')),
          reason: 'в режиме «Неравенства» — правило неравенств');

      // ⚠️ И ни одна из двух — не общая «судоку»: откат к базовому тексту и был
      // дефектом, который нашёл аудит.
      final base = L.t(GameRules.keyFor('/games/sudoku')!);
      expect(towers.contains(base), isFalse, reason: 'небоскрёбам подсунули общее правило');
      expect(unequal.contains(base), isFalse, reason: 'неравенствам подсунули общее правило');
    });
  }

  test('🔴 Keen по-английски не называет арифметику сложением', () {
    final en = jsonDecode(File('${Directory.current.path}/assets/l10n/en.json').readAsStringSync())
        as Map<String, dynamic>;
    final keen = (en['puzzlesKeenDesc'] as String?) ?? '';
    expect(keen, isNotEmpty, reason: 'ключ справки Keen потерялся из сборки');
    for (final lie in ['adds up', ' sum ', 'sums to']) {
      expect(keen.contains(lie), isFalse,
          reason: 'в Keen есть −, × и ÷; «$lie» учит искать только суммы');
    }
  });
}

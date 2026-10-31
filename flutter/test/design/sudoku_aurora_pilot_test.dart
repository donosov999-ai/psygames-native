import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_rules.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 СУДОКУ — ПИЛОТ CODEX «СТЕКЛО И КАМНИ» (31.10, выбор Дениса) НА НАСТОЯЩЕМ ЭКРАНЕ.
///
/// Те же проверки, что в превью Codex (`codex-game-chrome-handoff-20261031/…/codex_chrome_preview_test.dart`),
/// но без путей его машины: поле прозрачное на фоне рамки, «Заново» — только в паузе, подписи нижнего
/// ряда не пересекают кромку, в паузе — панель «Уровни · Сложность» с тремя дорогами одним рядом.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
    await GameRules.load();
  });

  for (final brightness in Brightness.values) {
    testWidgets('${brightness.name}: Судоку под «Авророй» — пилот «стекло и камни»', (t) async {
      SharedPreferences.setMockInitialValues({'psygames_sudoku_level_nzt48': '5'});
      t.view.physicalSize = const Size(780, 1688);
      t.view.devicePixelRatio = 2;
      addTearDown(t.view.reset);
      GameRules.currentRoute = '/games/sudoku';
      addTearDown(() => GameRules.currentRoute = null);
      GameExit.feedback = () {};
      addTearDown(() => GameExit.feedback = null);
      await t.runAsync(() async {
        final state = await SharedState.open();
        await t.pumpWidget(MaterialApp(
          theme: applyUiTemplate(classicShellTheme(brightness), UiTemplate.aurora),
          home: AuroraGameScope(route: '/games/sudoku', child: SudokuScreen(state: state)),
        ));
        for (var i = 0; i < 100 && find.byKey(const Key('cell_0_0')).evaluate().isEmpty; i++) {
          await t.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 20));
        }
      });
      await t.pump();
      expect(find.byKey(const Key('cell_0_0')), findsOneWidget);

      final field = t.widget<ColoredBox>(
          find.descendant(of: find.byKey(const Key('game-field')), matching: find.byType(ColoredBox)).first);
      expect(field.color, Colors.transparent, reason: 'фон рамки непрерывен за полем');

      final bar = t.getRect(find.byKey(const Key('game-bar-aurora')));
      expect(find.descendant(of: find.byKey(const Key('game-bar-aurora')), matching: find.text(L.t('restart'))), findsNothing,
          reason: '«Заново» — только в паузе');
      for (final key in ['teachPause', 'btn_undo', 'btn_hint', 'sudokuPencilMode', 'sudokuColorMode']) {
        final r = t.getRect(find.descendant(of: find.byKey(const Key('game-bar-aurora')), matching: find.text(L.t(key))));
        expect(r.bottom, lessThan(bar.bottom - 2), reason: 'подпись $key не пересекает кромку');
        expect(r.top, greaterThan(bar.top), reason: 'подпись $key внутри панели');
      }
      expect(t.takeException(), isNull);

      await t.tap(find.byKey(const Key('game-pause')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('pause-restart')), findsOneWidget);
      expect(find.byKey(const Key('pause-level-group')), findsOneWidget);
      final roads = find.descendant(
          of: find.byKey(const Key('pause-level-group')),
          matching: find.byWidgetPredicate((w) => w is Icon && (w.icon == Icons.radio_button_checked || w.icon == Icons.radio_button_unchecked)));
      expect(roads, findsNWidgets(3), reason: 'три дороги сложности — в панели уровней');
      final ys = {for (final e in roads.evaluate()) t.getCenter(find.byWidget(e.widget)).dy.round()};
      expect(ys.length, 1, reason: 'одним рядом');
      expect(t.takeException(), isNull);
    });
  }
}

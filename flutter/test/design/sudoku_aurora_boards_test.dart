import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/ladder.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ОСТАЛЬНЫЕ ДОСКИ РАЗДЕЛА ПОД «АВРОРОЙ» — КАК «СУДОКУ» (задача 6016f895, ответ каркаса ffc61832).
///
/// Приёмка 29.10 по листу 25: у «Самурая», «Фрактала», «Бездны» выбор был заливкой primaryContainer,
/// у «Самурая» и «Бездны» клавиши — акцентом профиля, ✕ промаха «Кошек» — свой красный. Правило каркаса
/// одно: под «Авророй» — роль (кольцо selected, плитки клавиш, wrong), в Classic — прежний цвет.
/// Роли сверяются с `GameColors.aurora(b)` ЯВНО: `GameColors.of` без расширения темы молча отдаёт Classic.
void main() {
  setUpAll(() async => L.load('ru'));

  ThemeData themeOf(Brightness b, UiTemplate t) => applyUiTemplate(classicShellTheme(b), t);

  Future<SharedState> open(WidgetTester t, [Map<String, Object> prefs = const {}]) async {
    SharedPreferences.setMockInitialValues({'language': 'ru', ...prefs});
    late SharedState state;
    await t.runAsync(() async => state = await SharedState.open());
    return state;
  }

  Future<void> mount(WidgetTester t, ThemeData theme, Widget screen, String ready, {String? start}) async {
    await t.runAsync(() async {
      await t.pumpWidget(MaterialApp(theme: theme, home: screen));
      for (var i = 0; i < 80; i++) {
        await t.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (start != null && find.byKey(Key(start)).evaluate().isNotEmpty) await t.tap(find.byKey(Key(start)));
        if (find.byKey(Key(ready)).evaluate().isNotEmpty) break;
      }
    });
    await t.pump();
  }

  /// Нажимает клетки `prefix r_c` по порядку, пока одна не станет выбранной; true — нашлась.
  Future<bool> selectSome(WidgetTester t, String prefix, Brightness b, {required bool aurora, required Color classicFill}) async {
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final f = find.byKey(Key('$prefix${r}_$c'));
        if (f.evaluate().isEmpty) continue;
        await t.tap(f, warnIfMissed: false);
        await t.pump();
        final ring = find.byKey(Key('aurora-ring_$prefix${r}_$c')).evaluate().isNotEmpty ||
            find.byKey(Key('aurora-ring_${r}_$c')).evaluate().isNotEmpty;
        final fill = t.widget<Material>(find.ancestor(of: f, matching: find.byType(Material)).first).color;
        if (aurora && ring) {
          expect(fill, isNot(GameColors.aurora(b).selected), reason: 'под кольцом нет сплошной заливки');
          return true;
        }
        if (!aurora && fill == classicFill) {
          expect(ring, isFalse, reason: 'в Classic кольца нет');
          return true;
        }
      }
    }
    return false;
  }

  for (final b in Brightness.values) {
    for (final tpl in UiTemplate.values) {
      final aurora = tpl == UiTemplate.aurora;
      final tag = '${b.name} · ${tpl.name}';

      testWidgets('$tag: «Самурай» — ${aurora ? 'кольцо и плитки клавиш' : 'заливка и прежние клавиши'}', (t) async {
        final state = await open(t);
        final theme = themeOf(b, tpl);
        await mount(t, theme, SamuraiScreen(state: state), 'cell_0_0');
        final key = t.widget<FilledButton>(find.byKey(const Key('digit1'))).style;
        if (aurora) {
          expect(key?.backgroundColor?.resolve(<WidgetState>{}), GameColors.aurora(b).cell);
        } else {
          expect(key?.backgroundColor, isNull, reason: 'Classic: цвет кнопки — из темы');
        }
        expect(await selectSome(t, 'cell_', b, aurora: aurora, classicFill: theme.colorScheme.primaryContainer), isTrue);
        await t.pumpWidget(const SizedBox());
      });

      testWidgets('$tag: «Фрактал» — выбор ${aurora ? 'кольцом' : 'заливкой'}', (t) async {
        final state = await open(t);
        final theme = themeOf(b, tpl);
        await mount(t, theme, FractalScreen(state: state), 'tile0');
        expect(await selectSome(t, 'root_', b, aurora: aurora, classicFill: theme.colorScheme.primaryContainer), isTrue);
        await t.pumpWidget(const SizedBox());
      });

      testWidgets('$tag: «Бездна» — выбор ${aurora ? 'кольцом' : 'заливкой'}, клавиши', (t) async {
        final state = await open(t);
        final theme = themeOf(b, tpl);
        await mount(t, theme, DeepScreen(state: state), 'cell_0_0', start: 'deep-start');
        await t.pumpAndSettle();
        final key = t.widget<FilledButton>(find.byKey(const Key('digit1'))).style;
        expect(key?.backgroundColor?.resolve(<WidgetState>{}), aurora ? GameColors.aurora(b).cell : null);
        expect(await selectSome(t, 'cell_', b, aurora: aurora, classicFill: theme.colorScheme.primaryContainer), isTrue);
        await t.pumpWidget(const SizedBox());
      });

      testWidgets('$tag: «Кошки» — ✕ промаха ${aurora ? 'роль wrong' : '#DC2626'}', (t) async {
        final state = await open(t);
        await mount(t, themeOf(b, tpl), CatsScreen(state: state), 'cell_0_0');
        final puzzle = dealCatsLevel(1, 'cats|L1|A0')!.puzzle;
        final miss = (puzzle.board.solution[0] + 1) % puzzle.board.n;
        await t.longPress(find.byKey(Key('cell_0_$miss')));
        await t.pump();
        final icon = t.widget<Icon>(find.byKey(Key('miss_0_$miss')));
        expect(icon.color, aurora ? GameColors.aurora(b).wrong : const Color(0xFFDC2626));
        // Области: под «Авророй» — бледная заливка и граница по краю области (лист 25), в Classic — прежние плитки.
        expect(find.byKey(const Key('aurora-region_0_0')).evaluate().isNotEmpty, aurora);
        await t.pumpWidget(const SizedBox());
      });
    }
  }
}

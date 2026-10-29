import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';

/// 🎨 «Аврора» отдаёт играм свои смысловые цвета; Classic и неперенесённые игры — прежние.
void main() {
  Future<GameColors> colorsIn(WidgetTester t, ThemeData theme, {String? route, Set<String> ready = const {}}) async {
    late GameColors got;
    final probe = Builder(
      builder: (c) {
        got = GameColors.of(c);
        return const SizedBox();
      },
    );
    await t.pumpWidget(
      MaterialApp(
        theme: theme,
        home: route == null ? probe : AuroraGameScope(route: route, ready: ready, child: probe),
      ),
    );
    return got;
  }

  for (final b in Brightness.values) {
    testWidgets('${b.name}: тема «Аврора» — цвета игр «Авроры»', (t) async {
      final theme = applyUiTemplate(classicShellTheme(b), UiTemplate.aurora);
      expect(await colorsIn(t, theme), same(GameColors.aurora(b)));
    });

    testWidgets('${b.name}: Classic — прежние цвета, доска из ColorScheme', (t) async {
      final theme = applyUiTemplate(classicShellTheme(b), UiTemplate.classic);
      final got = await colorsIn(t, theme);
      expect(got.roles, GameColors.classicFor(theme.colorScheme).roles);
    });

    testWidgets('${b.name}: игра, ещё не перенесённая на «Аврору», — Classic; перенесённая — «Аврора»', (t) async {
      final theme = applyUiTemplate(classicShellTheme(b), UiTemplate.aurora);
      final classic = GameColors.classicFor(classicShellTheme(b).colorScheme);
      expect((await colorsIn(t, theme, route: '/games/sudoku')).roles, classic.roles);
      expect(await colorsIn(t, theme, route: '/games/sudoku', ready: {'/games/sudoku'}), same(GameColors.aurora(b)));
    });
  }

  test('повторное применение шаблона не задваивает цвета игр', () {
    final once = applyUiTemplate(classicShellTheme(Brightness.dark), UiTemplate.aurora);
    final twice = applyUiTemplate(once, UiTemplate.aurora);
    expect(twice.extensions.values.whereType<GameColors>().length, 1);
  });
}

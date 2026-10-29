import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_scope.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/web_theme.dart';

/// Игра без отметки готовности не должна перекраситься, когда человек выбрал «Аврору».
void main() {
  // Маршрут, которого нет ни в одном списке: проба не ломается, когда раздел переходит в готовые.
  const unready = '/games/__aurora_unready_probe__';
  test('проба-маршрут не в списке готовых', () => expect(auroraReadyRoutes.contains(unready), isFalse));

  Future<ThemeData> themeInside(
    WidgetTester tester, {
    required UiTemplate template,
    required Brightness brightness,
    Set<String> ready = auroraReadyRoutes,
    String route = unready,
  }) async {
    late ThemeData seen;
    final app = applyUiTemplate(classicShellTheme(brightness), template);
    await tester.pumpWidget(MaterialApp(
      theme: app,
      home: AuroraGameScope(
        route: route,
        ready: ready,
        child: Builder(builder: (context) {
          seen = Theme.of(context);
          return const SizedBox();
        }),
      ),
    ));
    return seen;
  }

  for (final brightness in Brightness.values) {
    testWidgets('аврора: неготовая игра получает классическую тему ($brightness)', (tester) async {
      final seen = await themeInside(tester, template: UiTemplate.aurora, brightness: brightness);
      final classic = classicShellTheme(brightness);
      expect(seen.extension<UiTemplateTheme>(), isNull);
      expect(seen.colorScheme.surface, classic.colorScheme.surface);
      expect(seen.scaffoldBackgroundColor, classic.scaffoldBackgroundColor);
      expect(seen.brightness, brightness);
    });

    testWidgets('аврора: игра из списка готовых получает «Аврору» ($brightness)', (tester) async {
      final seen = await themeInside(
        tester,
        template: UiTemplate.aurora,
        brightness: brightness,
        route: '/games/sudoku',
        ready: const {'/games/sudoku'},
      );
      expect(seen.extension<UiTemplateTheme>()?.template, UiTemplate.aurora);
      expect(seen.scaffoldBackgroundColor, auroraToken('background', dark: brightness == Brightness.dark));
    });

    testWidgets('classic: рамка ничего не меняет ($brightness)', (tester) async {
      final seen = await themeInside(tester, template: UiTemplate.classic, brightness: brightness);
      expect(seen.colorScheme, classicShellTheme(brightness).colorScheme);
      expect(seen.extension<UiTemplateTheme>(), isNull);
    });
  }

  testWidgets('веб-палитра неготовой игры под «Авророй» — классическая', (tester) async {
    late WebColors seen;
    await tester.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), UiTemplate.aurora),
      home: AuroraGameScope(
        route: unready,
        child: Builder(builder: (context) {
          seen = WebTheme.of(context);
          return const SizedBox();
        }),
      ),
    ));
    expect(seen.background == auroraToken('background', dark: true), isFalse);
  });
}

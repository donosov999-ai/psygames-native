import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:psygames_flutter/shell/app_look.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/web_theme.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('shell preference notifies once, restores, and leaves brightness/profile/cosmetics intact', () async {
    SharedPreferences.setMockInitialValues({
      AppLook.overrideKey: 'dark',
      'psygames_active_profile': 'chess',
      'psygames_cosmetics_equipped_chess': '{"accent":"mint"}',
    });
    final state = await SharedState.open();
    AppLook.useForTest({
      'profiles': {'chess': {'mood': 'dark', 'accent': '#FF9900'}},
      'accents': {'mint': '#27CBB0'},
    });
    var changes = 0;
    state.addListener(() => changes++);
    expect(appShellTheme(state).colorScheme.primary,
        ThemeData(colorSchemeSeed: const Color(0xFF7F7FD5), useMaterial3: true).colorScheme.primary);
    final before = state.snapshot();
    await state.set(uiTemplateKey, UiTemplate.aurora.id);
    await state.set(uiTemplateKey, UiTemplate.aurora.id);
    expect(changes, 1);
    for (final brightness in Brightness.values) {
      final theme = appShellTheme(state, brightness: brightness);
      expect(theme.brightness, brightness);
      expect(theme.colorScheme.primary, const Color(0xFF27CBB0));
      expect(theme.extension<UiTemplateTheme>()?.template, UiTemplate.aurora);
    }
    expect(appThemeMode(state), ThemeMode.dark);
    AppLook.refresh(state);
    expect(AppLook.token('background', dark: true), auroraToken('background', dark: true));
    final reopened = await SharedState.open();
    expect(reopened.snapshot(), {...before, uiTemplateKey: UiTemplate.aurora.id});
    await state.remove(uiTemplateKey);
    expect(changes, 2);
    expect(state.snapshot(), before);
    AppLook.refresh(state);
    expect(AppLook.template, UiTemplate.classic);
  });

  for (final brightness in Brightness.values) {
    testWidgets('context-local WebTheme uses Aurora tokens in ${brightness.name}', (tester) async {
      final base = ThemeData(brightness: brightness);
      for (final template in UiTemplate.values) {
        WebColors? actual;
        await tester.pumpWidget(MaterialApp(
          theme: applyUiTemplate(base, template),
          home: Builder(builder: (context) {
            actual = WebTheme.of(context);
            return const SizedBox();
          }),
        ));
        await tester.pumpAndSettle();
        expect(actual!.background, template == UiTemplate.aurora
            ? auroraToken('background', dark: brightness == Brightness.dark)
            : (brightness == Brightness.dark ? WebTheme.dark : WebTheme.light).background);
      }
    });
  }

  test('all twelve locales contain the four template labels', () async {
    for (final locale in ['ru','en','de','es','fr','it','pt','ja','ko','zh','hi','ar']) {
      await L.load(locale);
      for (final key in ['ui_template_title','modeClassic','frameAurora','ui_template_hint']) {
        expect(L.t(key), isNot(key), reason: '$locale/$key');
        expect(L.t(key), isNotEmpty);
      }
    }
  });
}

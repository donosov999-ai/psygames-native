import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/game_colors.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/native_tabs.dart';

/// 🧭 Нижние вкладки «Авроры» (лист 01 v2, LAYOUT_CORRECTIONS §2): пять вкладок с подписями, сплошная панель
/// фона шаблона, активная — оранжевым; Classic — прежнее стекло. Одна разметка вкладок на оба вида.
void main() {
  setUpAll(() {
    NativeTabs.use((jsonDecode(File('assets/tabs.json').readAsStringSync()) as Map).cast<String, dynamic>());
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
  });

  const accent = Color(0xFF7F7FD5);

  Future<void> show(WidgetTester t, UiTemplate template, Brightness b, {double width = 390, double scale = 1}) async {
    t.view.physicalSize = Size(width, 200) * 2;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      MaterialApp(
        theme: applyUiTemplate(classicShellTheme(b), template),
        builder: (c, child) => MediaQuery(
          data: MediaQuery.of(c).copyWith(textScaler: TextScaler.linear(scale)),
          child: child!,
        ),
        home: Scaffold(
          bottomNavigationBar: NativeTabBar(active: '/games', onTap: (_) {}, accent: accent),
        ),
      ),
    );
  }

  Color iconColor(WidgetTester t, String route) => t
      .widget<Icon>(find.descendant(of: find.byKey(ValueKey('native-tab-$route')), matching: find.byType(Icon)))
      .color!;

  for (final b in Brightness.values) {

    testWidgets('${b.name}: «Аврора» — фон шаблона, активная оранжевая, прочие вторичным текстом', (t) async {
      await show(t, UiTemplate.aurora, b);
      final bar = t.widget<Container>(find.byKey(const ValueKey('native-tab-bar')));
      expect((bar.decoration! as BoxDecoration).image!.centerSlice, isNotNull);
      final activeLabel = t.widget<Text>(find.text(L.t('tabGames')));
      expect(activeLabel.style!.color, GameColors.aurora(b).highlight);
      expect(find.byType(Image), findsNWidgets(5));
      final widths = NativeTabs.tabs.map((tab) => t.getSize(find.byKey(ValueKey('native-tab-${tab.route}'))).width).toSet();
      expect(widths.length, 1, reason: 'five equal tap targets');
      expect(find.byType(BackdropFilter), findsNothing, reason: 'в «Авроре» панель сплошная');
      // Полоса под активной вкладкой — как на рефе главной 30.10; ровно одна, под активной.
      final underline = find.byKey(const ValueKey('native-tab-underline'));
      expect(underline, findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('native-tab-/games')), matching: underline), findsOneWidget);
    });

    testWidgets('${b.name}: Classic — прежнее стекло и акцент профиля', (t) async {
      await show(t, UiTemplate.classic, b);
      expect(find.byType(BackdropFilter), findsOneWidget);
      expect(iconColor(t, '/games'), accent);
      expect(find.byKey(const ValueKey('native-tab-underline')), findsNothing, reason: 'Classic без полосы');
    });

    for (final width in const [320.0, 390.0]) {
      testWidgets('${b.name} ${width.toInt()} pt, шрифт ×2: пять вкладок с подписями, ничего не вылезает', (t) async {
        await show(t, UiTemplate.aurora, b, width: width, scale: 2);
        expect(t.takeException(), isNull);
        for (final tab in NativeTabs.tabs) {
          expect(find.byKey(ValueKey('native-tab-${tab.route}')), findsOneWidget);
          expect(find.text(L.t(tab.labelKey)), findsOneWidget, reason: 'подпись ${tab.labelKey}');
        }
        expect(NativeTabs.tabs.length, 5);
      });
    }
  }
}

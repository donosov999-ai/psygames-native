import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/aurora_hub_tile.dart';
import 'package:psygames_flutter/shell/catalog.dart';
import 'package:psygames_flutter/shell/catalog_screen.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Вкладка «Игры» в «Авроре»: фильтр — чипы (лист 01/02 Codex), варианты те же, что у списка
/// Classic: все игры, развилки, разделы, навыки. Развилки — иллюстрированные плитки.
Map<String, dynamic> _asset(String p) => jsonDecode(File(p).readAsStringSync()) as Map<String, dynamic>;

void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', _asset('assets/l10n/ru.json').cast<String, String>());
  });

  Future<void> open(WidgetTester t, UiTemplate template) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final catalog = Catalog.fromJson(_asset('assets/catalog.json'), _asset('assets/hubs.json'));
    await t.runAsync(() async {
      await t.pumpWidget(MaterialApp(
        theme: applyUiTemplate(classicShellTheme(Brightness.dark), template),
        home: CatalogScreen(state: state, catalog: catalog),
      ));
      for (var i = 0; i < 60; i++) {
        await t.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(AuroraHubTile).evaluate().isNotEmpty || find.byType(ChoiceChip).evaluate().isNotEmpty) break;
      }
    });
    await t.pump();
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('«Аврора»: фильтр чипами, «Все развилки» оставляет только развилки', (t) async {
    await open(t, UiTemplate.aurora);
    expect(key('catalog-chip-all'), findsOneWidget);
    expect(key('catalog-chip-skills'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<CatalogFilter?>), findsNothing);
    expect(find.byType(AuroraHubTile), findsWidgets);

    await t.ensureVisible(key('catalog-chip-hubs'));
    await t.pump();
    await t.tap(key('catalog-chip-hubs'));
    await t.pump();
    expect(key('catalog-flat'), findsOneWidget);
    expect(t.widget<ChoiceChip>(key('catalog-chip-hubs')).selected, isTrue);

    await t.ensureVisible(key('catalog-chip-all'));
    await t.pump();
    await t.tap(key('catalog-chip-all'));
    await t.pump();
    expect(key('catalog-flat'), findsNothing);
  });

  testWidgets('«Аврора»: чип «Навыки» открывает список навыков и фильтрует по выбранному', (t) async {
    await open(t, UiTemplate.aurora);
    await t.tap(key('catalog-chip-skills'));
    await t.pumpAndSettle();
    final skill = find.byWidgetPredicate((w) => w.key is ValueKey && '${(w.key as ValueKey).value}'.startsWith('catalog-skill-')).first;
    await t.tap(skill);
    await t.pumpAndSettle();
    expect(t.widget<ChoiceChip>(key('catalog-chip-skills')).selected, isTrue);
    expect(key('catalog-flat'), findsOneWidget);
  });

  testWidgets('Classic: прежний выпадающий фильтр, чипов нет', (t) async {
    await open(t, UiTemplate.classic);
    expect(find.byType(DropdownButtonFormField<CatalogFilter?>), findsOneWidget);
    expect(key('catalog-chip-all'), findsNothing);
    expect(find.byType(AuroraHubTile), findsNothing);
  });
}

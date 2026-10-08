import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/info_screens.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sources_model.dart';
import 'package:psygames_flutter/shell/web_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ИСТОЧНИКИ»: МОДЕЛЬ НА DART СОВПАДАЕТ С МОДЕЛЬЮ ВЕБА ДО ЗНАКА (задача d6a60b02, вариант Б).
///
/// Эталон — модель, выгруженная с настоящего веб-экрана (`info-pages-host-model.test.tsx`):
/// `fixtures/sources_model.json` (RU) и `sources_model_en.json` (EN). Данные — `assets/sources.json`
/// выгрузкой из констант веба (`tools/embed-sources.mjs`), подписи — словарём натива.
///   · RU и EN — модель Dart равна эталону целиком;
///   · экран с состоянием считает модель сам: страницы под ним нет — список на месте;
///   · ссылка — во внешний браузер без веба.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  Map<String, Object?> json(String f) => (jsonDecode(File(f).readAsStringSync()) as Map).cast<String, Object?>();
  final data = json('assets/sources.json');

  for (final (lang, fixture) in [('ru', 'sources_model.json'), ('en', 'sources_model_en.json')]) {
    test('🔴 $lang: модель Dart = модель веба', () {
      L.useForTest(lang, (jsonDecode(File('assets/l10n/$lang.json').readAsStringSync()) as Map).cast<String, String>());
      final web = json('test/fixtures/$fixture');
      final dart = sourcesModel(data, primary: web['primary']! as String);
      expect(jsonDecode(jsonEncode(dart)), web);
    });
  }

  testWidgets('🔴 экран со своим состоянием считает модель сам — страница под ним не нужна; ссылка — наружу', (t) async {
    L.useForTest('en', (jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map).cast<String, String>());
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    final state = await SharedState.open();
    await t.runAsync(WebTheme.load); // таблица акцентов профилей — как при старте приложения
    ScreenUi.reset();
    final opened = <String>[];
    final real = SourcesScreen.openUrl;
    SourcesScreen.openUrl = (u) async => opened.add(u);
    addTearDown(() => SourcesScreen.openUrl = real);
    t.view.physicalSize = const Size(780, 4000);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    await t.pumpWidget(MaterialApp(home: SourcesScreen(state: state)));
    for (var i = 0; i < 20 && find.byKey(const ValueKey('sources-list')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump();
    }
    final en = json('test/fixtures/sources_model_en.json');
    expect(find.text(en['title']! as String), findsOneWidget);
    final card = (en['cards']! as List).cast<Map>()[1];
    expect(find.text(card['name'] as String), findsOneWidget, reason: 'имя источника по-английски');
    await t.tap(find.byKey(ValueKey('sources-link-${card['name']}')));
    expect(opened, [card['url']]);
    // Цвет профиля — свой расчёт оболочки (WebTheme.accent), а не взятый из эталона.
    final own = await t.runAsync(() => sourcesModelFor(state));
    expect(own!['primary'], en['primary']);
  });
}

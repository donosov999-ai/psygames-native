import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/app_theme.dart';
import 'package:psygames_flutter/shell/catalog_kit.dart';
import 'package:psygames_flutter/shell/design_template.dart';
import 'package:psygames_flutter/shell/home_inputs.dart';
import 'package:psygames_flutter/shell/home_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 КУПЛЕННОЕ ОФОРМЛЕНИЕ ВИДНО В «АВРОРЕ» (задача 89517ae3, решение Дениса 11.11.2026).
///
/// В Classic купленный фон, рамка и цвет видны на Главной; «Аврора» (по умолчанию с 2.56.60) их не
/// рисовала — звёзды потрачены, результата нет. Теперь: фон — под стеклом Главной, рамка — кольцом
/// вокруг Синапса в шапке (профиля в шапке Главной нет, канон §2), цвет — налётом сверху.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  final inputs = (jsonDecode(File('assets/home_inputs.json').readAsStringSync()) as Map).cast<String, Object?>();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    L.useForTest('ru', (jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map).cast<String, String>());
    ScreenUi.reset();
    ScreenUi.run = (s) async {};
  });

  test('купленное читается из надетого: фон — картинка выбранного профиля, рамка — её цвет, цвет — признак', () async {
    expect(auroraCosmetics(state, inputs), (background: null, frame: null, accent: false), reason: 'ничего не куплено');
    await state.set('${SharedState.prefix}cosmetics_equipped_${state.activeProfile}',
        jsonEncode({'background': 'bg_kids', 'frame': 'frame_gold', 'accent': 'acc_violet'}));
    final b = auroraCosmetics(state, inputs);
    expect(b.background, ((inputs['profileImages'] as Map)['kids'] as Map)['bg']);
    expect(b.frame, '#f5b50a');
    expect(b.accent, isTrue);
  });

  Future<void> mount(WidgetTester t, Map<String, Object?>? bought) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final m = (jsonDecode(File('test/fixtures/home_model_ru.json').readAsStringSync()) as Map).cast<String, Object?>()
      ..['goalSheet'] = null
      ..['auroraCosmetics'] = bought;
    late CatalogKit kit;
    await t.runAsync(() async => kit = await CatalogKit.load());
    ScreenUi.model(HomeScreen.route).value = m;
    await t.pumpWidget(MaterialApp(
      theme: applyUiTemplate(classicShellTheme(Brightness.dark), UiTemplate.aurora),
      home: Scaffold(
        body: HomeScreen(state: state, origin: 'http://127.0.0.1:1', kit: kit, onOpen: (_) {}, onTab: (_) {}, onSwitcher: () {}, ownModel: false),
      ),
    ));
    await t.pump();
    await t.pump(const Duration(milliseconds: 400));
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('«Аврора» с покупками: фон под стеклом, кольцо рамки вокруг Синапса, налёт цвета', (t) async {
    await mount(t, {'background': '/assets/images/profile-bg/kids.webp', 'frame': '#f5b50a', 'accent': true});
    expect(key('home-purchased-bg'), findsOneWidget);
    expect(key('home-pet-frame'), findsOneWidget);
    expect(key('home-accent-tint'), findsOneWidget);
    expect(key('home-profile-chip'), findsNothing, reason: 'профиль в шапку Главной не возвращаем (канон §2)');
  });

  testWidgets('«Аврора» без покупок — как было: ни фона, ни кольца, ни налёта', (t) async {
    await mount(t, {'background': null, 'frame': null, 'accent': false});
    expect(key('home-purchased-bg'), findsNothing);
    expect(key('home-pet-frame'), findsNothing);
    expect(key('home-accent-tint'), findsNothing);
  });
}

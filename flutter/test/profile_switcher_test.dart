import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/profile_switcher.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';

/// 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача 5b3513bd).
///
/// Модель — образец живого `ProfileSwitcherModal` (`test/fixtures/switcher_model.json`, выгружает
/// `profile-switcher-host-model.test.tsx`). Проверяется:
///   · лист — все профили модели, активный отмечен;
///   · открытый профиль — действие `switch` вебу и лист закрыт; активный — просто закрыть;
///   · закрытый — карточка профиля, не переключение (доступ решает веб);
///   · код: ввод уходит вебу (`redeem`), ошибка видна под полем, удача (растёт `redeemed`)
///     закрывает окно и лист.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final js = <String>[];
  late Map<String, Object?> model;

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
    model = (jsonDecode(File('test/fixtures/switcher_model.json').readAsStringSync()) as Map).cast<String, Object?>();
  });

  Future<void> open(WidgetTester t, {String? lockId, bool code = false}) async {
    t.view.physicalSize = const Size(780, 1688);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    final m = jsonDecode(jsonEncode(model)) as Map<String, Object?>;
    if (lockId != null) {
      for (final p in (m['profiles'] as List).cast<Map>()) {
        if (p['id'] == lockId) p['locked'] = true;
      }
      ((m['details'] as Map)[lockId] as Map)['locked'] = true;
    }
    m['codeEntry'] = code;
    ScreenUi.model('#switcher').value = m.cast<String, Object?>();
    await t.pumpWidget(MaterialApp(
      home: Scaffold(body: Builder(builder: (c) => TextButton(onPressed: () => openProfileSwitcher(c, 'http://x'), child: const Text('open')))),
    ));
    await t.tap(find.text('open'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  testWidgets('🔴 лист — все профили модели; открытый переключает и закрывается', (t) async {
    await open(t);
    expect(key('switcher-sheet'), findsOneWidget);
    for (final p in (model['profiles'] as List).cast<Map>()) {
      expect(key('switcher-profile-${p['id']}'), findsOneWidget, reason: '${p['id']}');
    }
    final other = (model['profiles'] as List).cast<Map>().firstWhere((p) => p['active'] != true)['id'];
    await t.ensureVisible(key('switcher-profile-$other'));
    await t.pump();
    await t.tap(key('switcher-profile-$other'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
    expect(js.last, contains('["#switcher"].switch("$other")'));
    expect(key('switcher-sheet'), findsNothing);
  });

  testWidgets('активный профиль — просто закрыть, без переключения', (t) async {
    await open(t);
    await t.ensureVisible(key('switcher-profile-${model['activeId']}'));
    await t.pump();
    await t.tap(key('switcher-profile-${model['activeId']}'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
    expect(js.where((s) => s.contains('switch(')), isEmpty);
    expect(key('switcher-sheet'), findsNothing);
  });

  testWidgets('🔴 закрытый профиль — карточка, а не переключение; код уходит вебу, удача закрывает', (t) async {
    await open(t, lockId: 'nzt48', code: true);
    await t.ensureVisible(key('switcher-profile-nzt48'));
    await t.pump();
    await t.tap(key('switcher-profile-nzt48'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
    expect(js.where((s) => s.contains('switch(')), isEmpty);
    expect(key('switcher-detail-nzt48'), findsOneWidget);
    await t.ensureVisible(key('switcher-detail-code'));
    await t.pump();
    await t.tap(key('switcher-detail-code'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
    expect(key('switcher-code-dialog'), findsOneWidget);
    await t.enterText(key('switcher-code-input'), 'NZT-2026');
    await t.tap(key('switcher-code-unlock'));
    await t.pump();
    expect(js.last, contains('redeem("NZT-2026")'));
    // Веб ответил ошибкой — подпись под полем, окно на месте.
    final err = jsonDecode(jsonEncode(ScreenUi.model('#switcher').value)) as Map<String, Object?>;
    (err['code'] as Map)['error'] = 'Неверный код.';
    ScreenUi.model('#switcher').value = err;
    await t.pump();
    expect(key('switcher-code-error'), findsOneWidget);
    // Веб принял код — счётчик вырос, окно и лист закрылись.
    final ok = jsonDecode(jsonEncode(err)) as Map<String, Object?>;
    (ok['code'] as Map)['error'] = null;
    (ok['code'] as Map)['redeemed'] = ((ok['code'] as Map)['redeemed'] as num) + 1;
    ScreenUi.model('#switcher').value = ok;
    await t.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 5));
    expect(key('switcher-code-dialog'), findsNothing);
    expect(key('switcher-sheet'), findsNothing);
  });
}

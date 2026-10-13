import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/profile_switcher.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'support/real_fonts.dart';

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
  final capture = GlobalKey();
  setUpAll(loadRoboto);

  setUp(() {
    ScreenUi.reset();
    js.clear();
    ScreenUi.run = (s) async => js.add(s);
    model = (jsonDecode(File('test/fixtures/switcher_model.json').readAsStringSync()) as Map).cast<String, Object?>();
  });

  Future<void> open(WidgetTester t, {String? lockId, bool code = false, Size size = const Size(390, 844), double scale = 1}) async {
    t.view.physicalSize = size * 2;
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
    await t.pumpWidget(RepaintBoundary(key: capture, child: MaterialApp(
      theme: ThemeData(fontFamily: 'Roboto'),
      builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      home: Scaffold(body: Builder(builder: (c) => TextButton(onPressed: () => openProfileSwitcher(c, 'http://x'), child: const Text('open')))),
    )));
    await t.tap(find.text('open'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 500));
  }

  Finder key(String k) => find.byKey(ValueKey(k));

  Future<void> screenshot(WidgetTester t, String name) async {
    const folder = String.fromEnvironment('PROFILE_EVIDENCE_DIR');
    if (folder.isEmpty) return;
    await t.runAsync(() async {
      final boundary = capture.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: 2);
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      await Directory(folder).create(recursive: true);
      await File('$folder/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
      image.dispose();
    });
  }

  for (final size in const [Size(320, 568), Size(360, 760), Size(390, 844)]) {
    testWidgets('en ${size.width.toInt()}×${size.height.toInt()}: лист, детали, код без русских строк, Roboto ×1.3', (t) async {
      await open(t, lockId: 'nzt48', code: true, size: size, scale: 1.3);
      void english() {
        for (final text in t.widgetList<Text>(find.byType(Text))) {
          expect(text.data ?? text.textSpan?.toPlainText() ?? '', isNot(matches(RegExp('[А-Яа-яЁё]'))));
        }
        expect(t.takeException(), isNull);
      }
      english();
      await screenshot(t, 'en-${size.width.toInt()}-list');
      await t.ensureVisible(key('switcher-profile-nzt48'));
      await t.tap(key('switcher-profile-nzt48'));
      await t.pumpAndSettle();
      expect(key('switcher-detail-nzt48'), findsOneWidget);
      english();
      await screenshot(t, 'en-${size.width.toInt()}-detail');
      await t.ensureVisible(key('switcher-detail-code'));
      await t.tap(key('switcher-detail-code'));
      await t.pumpAndSettle();
      expect(key('switcher-code-dialog'), findsOneWidget);
      english();
      await screenshot(t, 'en-${size.width.toInt()}-code');
      await t.pumpWidget(const SizedBox());
    });
  }

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

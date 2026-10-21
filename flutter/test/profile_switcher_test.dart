import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/ionicons.g.dart';
import 'package:psygames_flutter/shell/profile_switcher.dart';
import 'package:psygames_flutter/shell/screen_ui.dart';
import 'support/real_fonts.dart';

/// 🔴 ПЕРЕКЛЮЧАТЕЛЬ ПРОФИЛЕЙ НА FLUTTER РИСУЕТ МОДЕЛЬ ВЕБА (задача 5b3513bd).
///
/// Модель — образец живого `ProfileSwitcherModal` (`test/fixtures/switcher_model.json`, выгружает
/// `profile-switcher-host-model.test.tsx`). Проверяется:
///   · лист — все профили модели, активный отмечен;
///   · любой другой профиль — действие `switch` вебу и лист закрыт; активный — просто закрыть;
///   · 21.10.2026 (d5e5814a): монетизации нет — в листе нет замка, окна кода и карточки закрытого профиля.
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

  Future<void> open(WidgetTester t, {Size size = const Size(390, 844), double scale = 1}) async {
    t.view.physicalSize = size * 2;
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    ScreenUi.model('#switcher').value = (jsonDecode(jsonEncode(model)) as Map).cast<String, Object?>();
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
    testWidgets('en ${size.width.toInt()}×${size.height.toInt()}: лист без русских строк, без замка и кода, Roboto ×1.3', (t) async {
      await open(t, size: size, scale: 1.3);
      for (final text in t.widgetList<Text>(find.byType(Text))) {
        final shown = text.data ?? text.textSpan?.toPlainText() ?? '';
        expect(shown, isNot(matches(RegExp('[А-Яа-яЁё]'))));
        expect(shown, isNot(contains('🔒')));
      }
      expect(t.takeException(), isNull);
      for (final name in const ['lock-closed', 'lock-open']) {
        expect(find.byIcon(Ion.of(name)!), findsNothing, reason: 'замка в листе нет');
      }
      expect(find.byKey(const ValueKey('switcher-code')), findsNothing);
      await screenshot(t, 'en-${size.width.toInt()}-list');
      await t.pumpWidget(const SizedBox());
    });
  }

  testWidgets('🔴 лист — все профили модели; другой переключает и закрывается', (t) async {
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
}

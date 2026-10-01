import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/span_hub/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ШАПКА РАЗВИЛКИ ГОВОРИТ НА ЯЗЫКЕ ПРИЛОЖЕНИЯ.
///
/// До 30.09.2026 заголовок, описание, сноска и призыв «выбери» всех 13 нативных
/// развилок лежали в `assets/hubs.json` готовыми русскими строками — 52 поля, в
/// вебе все названы ключами словаря. Теперь в данных ключи (их снимает с веб-экрана
/// `tools/embed-hubs.mjs`), и проба держит обе половины: ключи есть у каждой
/// развилки и собраны в словарь, а экран на английском показывает английское.
void main() {
  final data = jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map<String, dynamic>;
  const fields = ['titleKey', 'descKey', 'footnoteKey', 'pickKey'];

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('en');
  });

  test('🔴 у каждой развилки четыре ключа шапки, и все собраны в словари', () {
    final ru = jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map<String, dynamic>;
    final en = jsonDecode(File('assets/l10n/en.json').readAsStringSync()) as Map<String, dynamic>;
    final meta = data['meta'] as Map<String, dynamic>;
    final problems = <String>[];
    for (final hub in (data['hubs'] as Map<String, dynamic>).keys) {
      final m = meta[hub] as Map<String, dynamic>?;
      for (final f in fields) {
        final key = m?[f];
        if (key is! String || key.isEmpty) {
          problems.add('$hub: нет $f');
        } else if (!ru.containsKey(key) || !en.containsKey(key)) {
          problems.add('$hub: $f=$key не собран в словарь — node flutter/tools/embed-l10n.mjs');
        }
      }
    }
    expect(meta.length, (data['hubs'] as Map).length, reason: 'шапка есть у каждой развилки');
    expect(problems, isEmpty);
  });

  testWidgets('🔴 развилка на английском — английская шапка, а не русская', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SpanHubScreen(state: state, isNative: (r) => true)));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(find.text('Memory Span'), findsWidgets, reason: 'заголовок spanGroup по-английски');
    expect(find.text('Choose modality'), findsOneWidget, reason: 'призыв spanPickModality по-английски');
    expect(find.text('Объём памяти'), findsNothing, reason: 'русская строка из данных не просочилась');
    expect(find.text('spanGroup'), findsNothing, reason: 'ключ не показан вместо текста');
  });
}

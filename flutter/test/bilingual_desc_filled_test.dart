import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПОДПИСЬ РЕЖИМА «ДВА ЯЗЫКА СРАЗУ» — С ПАРОЙ, А НЕ С СЫРЫМИ СКОБКАМИ.
///
/// Живой прогон 30.09.2026 в «Словаре»: «{a} и {b} вперемешку, русский — опора».
/// Веб подставляет самоназвания пары (`BilingualToggle.tsx`), четыре перенесённых
/// экрана раздела брали строку словаря как есть. Проба поднимает КАЖДЫЙ такой
/// экран из карты перехвата и ищет на нём незаполненные скобки.
void main() {
  late SharedState state;
  setUp(() async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
    await L.load('ru');
  });

  for (final route in ['/games/vocab-srs', '/games/cloze', '/games/semantic-sort', '/games/lexical-decision']) {
    testWidgets('$route: в подписи режима пара языков, а не {a}/{b}', (tester) async {
      tester.view.physicalSize = const Size(780, 1688);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(MaterialApp(home: HybridApp.native[route]!(state)));
      for (var i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      final texts = [for (final t in tester.widgetList<Text>(find.byType(Text))) t.data ?? ''];
      expect(texts.where((t) => t.contains('{a}') || t.contains('{b}')), isEmpty, reason: route);
      expect(texts.where((t) => t.contains('Español')), isNotEmpty, reason: 'второй язык пары назван самоназванием');
    });
  }
}

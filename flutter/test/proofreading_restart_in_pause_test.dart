import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/proofreading/screen.dart';
import 'package:psygames_flutter/shell/game_shell.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/restart_scope.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «ЗАНОВО» В ПАУЗЕ «КОРРЕКТУРЫ» — НА НАСТОЯЩЕМ ЭКРАНЕ.
///
/// 📍 Отчёт 5be4998f (09.09.2026) и веб-починка 5146ab7b0 закрывали ОБА экрана тогдашнего
/// раздела «Слова» — анаграммы и корректуру. На Flutter «Заново» добавляет каркас
/// (`RestartScope`, задача 1e21b974); пара для анаграмм — `anagrams_restart_in_pause_test.dart`.
///
/// ⚠️ Серии из трёх блоков в нативной корректуре НЕТ (веб `proofreading.tsx`: `seriesPreset`,
/// `beginSeries`), поэтому второе правило веб-починки — «в серии «Заново» начинает серию» —
/// здесь проверить нечем. Перенесут серию — сюда второй случай: `?series=1` → ход → «Заново»
/// → снова первый блок серии.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SharedState state;
  final levelKey = SharedState.levelKey('proofreading', 'nzt48');
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  /// Экран грузит алфавиты с диска — ждём настоящим временем, а не поддельным.
  Future<void> waitFor(WidgetTester tester, Finder f) async {
    await tester.runAsync(() async {
      for (var i = 0; i < 200; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (f.evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    expect(f, findsOneWidget, reason: 'экран не поднялся');
  }

  String hud(WidgetTester tester, String key) =>
      tester.widget<GameShell>(find.byType(GameShell)).hud.firstWhere((h) => h.label == L.t(key)).value;

  testWidgets('🔴 «Заново» в паузе есть, возвращает к началу партии и ступень не трогает', (tester) async {
    await state.set(levelKey, '3');
    await tester.pumpWidget(
        MaterialApp(home: RestartScope(builder: (_) => ProofreadingScreen(state: state, rnd: Random(7)))));
    await waitFor(tester, find.text(L.t('start')));
    expect(hud(tester, 'level'), '3', reason: 'лестница не прочла $levelKey — сверка ступени ниже была бы пустой');

    await tester.tap(find.text(L.t('start')));
    await tester.pump();
    expect(find.byKey(const Key('proof-params')), findsNothing, reason: 'партия не началась');
    await tester.tap(find.byKey(const Key('proof-cell-0')));
    await tester.pump();
    expect(hud(tester, 'label_found').startsWith('1/') || hud(tester, 'hud_errors') == '1', isTrue,
        reason: 'ход не лёг на поле — проверять было бы нечего');

    await tester.tap(find.byTooltip(L.t('teachPause')));
    await tester.pumpAndSettle();
    expect(find.text(L.t('restart')), findsOneWidget, reason: 'в паузе корректуры нет «Заново» (или их два)');

    await tester.tap(find.text(L.t('restart')));
    await tester.pumpAndSettle();
    await waitFor(tester, find.text(L.t('start')));
    expect(find.byKey(const Key('proof-params')), findsOneWidget, reason: '«Заново» не вернуло к началу партии');
    expect(hud(tester, 'label_found').startsWith('0/'), isTrue, reason: 'найденное не снято');
    expect(hud(tester, 'hud_errors'), '0', reason: 'ошибки не сняты');
    expect(state.get(levelKey), '3', reason: '«Заново» сдвинуло ступень лестницы');
    expect(hud(tester, 'level'), '3', reason: '«Заново» сдвинуло ступень на экране');
  });
}

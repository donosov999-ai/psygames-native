import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 «БЕЗДНА» ДОСТИЖИМА, И В НЕЙ ЕСТЬ ВЫБОР (сверка веб против натива 138f7818, 02.10.2026).
///
/// Было: в нативе объём всегда «Разведка», ступень всегда первая (`_preset`/`_band` не менялись),
/// «Новая партия» одним касанием затирала недельный снимок, а дверь в режим жила на экране
/// настройки фрактала, которого у натива нет, — режим стал недостижим.
/// Здесь нажатиями: выбор объёма и ступени доходит до снимка; «Отмена» партию не трогает;
/// пункт паузы фрактала ведёт на адрес «Бездны».
void main() {
  late SharedState state;
  const resumeKey = 'psygames_resume_sudoku_fractal_deep_nzt48';

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  Future<void> bootDeep(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Map<String, Object?> snapshot() =>
      ((jsonDecode(state.get(resumeKey)!) as Map)['state'] as Map).cast<String, Object?>();

  Future<void> openChooser(WidgetTester tester) async {
    await tester.tap(find.byTooltip(L.t('sdkNewGame')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('deep-new')), findsOneWidget, reason: '«Новая партия» сначала спрашивает');
  }

  testWidgets('🔴 выбор «Экспедиции» и третьей ступени доходит до партии и снимка', (tester) async {
    await bootDeep(tester);
    final before = snapshot();
    expect(before['preset'], 'scout');
    await openChooser(tester);
    for (final k in ['scout', 'trek', 'abyss']) {
      expect(find.byKey(Key('deep-preset-$k')), findsOneWidget, reason: 'объём $k на выбор');
    }
    for (var i = 0; i < 6; i++) {
      expect(find.byKey(Key('deep-band-$i')), findsOneWidget, reason: 'ступень ${i + 1} на выбор');
    }
    await tester.tap(find.byKey(const Key('deep-preset-trek')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('deep-band-2')));
    await tester.pump();
    await tester.runAsync(() async {
      await tester.tap(find.byKey(const Key('deep-start')));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    });
    await tester.pump();
    final after = snapshot();
    expect(after['preset'], 'trek', reason: 'выбранный объём не дошёл до партии');
    expect(after['band'], 2, reason: 'выбранная ступень не дошла до партии');
    expect(after['seed'], isNot(before['seed']), reason: 'новая партия — новое зерно');
    expect(find.text('3/6'), findsOneWidget, reason: 'полоса счётчиков показывает ступень 3 из 6');
  });

  testWidgets('🔴 «Отмена» не трогает идущую партию', (tester) async {
    await bootDeep(tester);
    final before = snapshot();
    await openChooser(tester);
    await tester.tap(find.byKey(const Key('deep-preset-abyss')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('deep-cancel')));
    await tester.pumpAndSettle();
    final after = snapshot();
    expect(after['seed'], before['seed'], reason: 'отмена затёрла партию');
    expect(after['preset'], before['preset']);
  });

  testWidgets('🔴 в паузе фрактала — дверь в «Бездну», ведёт на её адрес', (tester) async {
    String? opened;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state, onOpen: (r) => opened = r)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('tile0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    await tester.tap(find.byIcon(Icons.pause).first);
    await tester.pumpAndSettle();
    final door = find.text(L.t('deepTitle'));
    expect(door, findsOneWidget, reason: 'пункта «Бездна» в паузе нет');
    await tester.tap(door);
    await tester.pumpAndSettle();
    expect(opened, '/games/sudoku-fractal-deep');
  });
}

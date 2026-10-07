import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/screen.dart';
import 'package:psygames_flutter/games/memory_matrix/screen.dart';
import 'package:psygames_flutter/shell/game_clock.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_rules.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/suite_switch.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 НАБОР «ПОЗИЦИИ» ПЕРЕКЛЮЧАЕТСЯ И В НАТИВЕ — иначе «Корси» и «Наоборот» не открыть из развилки.
///
/// Замер 02.10.2026: в нативной развилке «Объём памяти» карточка «Позиции» вела в «Матрицу», а
/// плашек «Матрица · Корси · Наоборот» (веб GameSuiteSwitch) не было ни в одном экране — две игры
/// раздела не открывались из развилки вовсе. Плашки показывают только открытое профилю: детям в
/// «Позициях» открыта одна «Матрица» — плашек нет, как в вебе.
void main() {
  setUpAll(() async {
    await L.load('ru');
    await LevelRules.load();
    await GameSuites.load();
  });

  tearDown(() {
    GamePreset.clear();
    gameWallMs = () => DateTime.now().millisecondsSinceEpoch;
  });

  const all = ['/games/memory-matrix', '/games/corsi', '/games/spatial-span'];

  /// Память устройства: активный профиль и состав, посчитанный вебом (`hubVisibility.ts`).
  Future<SharedState> state({List<String>? positions, String computedFor = 'odv999'}) async {
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'odv999',
      for (final k in ['grid6', 'fast', 'two_series', 'decoys']) LevelRules.seenKey('memory_matrix', k): '1',
      if (positions != null)
        'psygames_hub_visible': jsonEncode({
          'profile': computedFor,
          'hubs': <String, Object>{},
          'suites': {'suite_positions': positions},
        }),
    });
    return SharedState.open();
  }

  /// Экран открыт поверх «оболочки»: результат его закрытия — то, что получит HybridApp._openNative.
  Future<Object? Function()> open(WidgetTester tester, Widget Function() screen) async {
    gameWallMs = () => tester.binding.clock.now().millisecondsSinceEpoch;
    Object? result;
    await tester.pumpWidget(MaterialApp(
      home: Builder(
        builder: (ctx) => Center(
          child: FilledButton(
            key: const Key('host-open'),
            onPressed: () async => result = await Navigator.of(ctx).push<Object?>(MaterialPageRoute(builder: (_) => screen())),
            child: const Text('open'),
          ),
        ),
      ),
    ));
    await tester.tap(find.byKey(const Key('host-open')));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return () => result;
  }

  Finder chip(String route) => find.byKey(Key('suite-mode-$route'));

  testWidgets('🔴 «Матрица»: плашки набора, текущая выбрана; «Корси» уводит в Корси заменой маршрута', (tester) async {
    final s = await state(positions: all);
    final result = await open(tester, () => MemoryMatrixScreen(state: s));
    expect(find.text(L.t('suitePositions')), findsOneWidget, reason: 'подпись набора над плашками');
    for (final (route, key) in [
      ('/games/memory-matrix', 'suiteModeGrid'),
      ('/games/corsi', 'suiteModeCorsi'),
      ('/games/spatial-span', 'suiteModeBackward'),
    ]) {
      expect(find.descendant(of: chip(route), matching: find.text(L.t(key))), findsOneWidget, reason: route);
    }
    expect(tester.widget<ChoiceChip>(chip('/games/memory-matrix')).selected, isTrue);
    await tester.tap(chip('/games/corsi'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    final r = result();
    expect(r, isA<HubCardTap>(), reason: 'экран закрыт с выбранным маршрутом — оболочка откроет его');
    expect((r as HubCardTap).route, '/games/corsi');
  });

  testWidgets('🔴 «Корси»: те же плашки, «Матрица» уводит обратно', (tester) async {
    final s = await state(positions: all);
    final result = await open(tester, () => CorsiScreen(state: s));
    expect(tester.widget<ChoiceChip>(chip('/games/corsi')).selected, isTrue);
    await tester.tap(chip('/games/memory-matrix'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    expect((result() as HubCardTap).route, '/games/memory-matrix');
  });

  testWidgets('🔴 только открытое профилю: у детей в «Позициях» одна «Матрица» — плашек нет', (tester) async {
    final s = await state(positions: ['/games/memory-matrix']);
    await open(tester, () => MemoryMatrixScreen(state: s));
    expect(find.byKey(const Key('suite-switch-suite_positions')), findsNothing);
    expect(chip('/games/corsi'), findsNothing);
  });

  testWidgets('🔴 состав посчитан не для этого профиля или не посчитан вовсе — плашек нет', (tester) async {
    for (final s in [await state(positions: all, computedFor: 'kids'), await state()]) {
      await open(tester, () => MemoryMatrixScreen(state: s));
      expect(chip('/games/corsi'), findsNothing);
    }
  });

  testWidgets('шаг зарядки — упражнение задано шагом: плашек нет', (tester) async {
    final s = await state(positions: all);
    GamePreset.set({'wu': '1'});
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SuiteSwitch(route: '/games/memory-matrix', state: s))));
    for (var i = 0; i < 5; i++) {
      await tester.pump();
    }
    expect(chip('/games/corsi'), findsNothing);
  });
}

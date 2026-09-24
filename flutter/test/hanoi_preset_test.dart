import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/model.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/preset_cap.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ШАГ ЗАРЯДКИ ИГРАЕТ СВОЮ ДОСКУ И НЕ ТРОГАЕТ ЛИЧНЫЙ УРОВЕНЬ.
///
/// 🔴 ЧТО ЭТА ПРОБА СТОРОЖИТ. До 24.09.2026 перенесённые экраны не читали хвост
/// адреса вовсе: шаг плейлиста `?wu=1&discs=5` открывал ханой на ЛИЧНОМ уровне
/// игрока — то есть играл не то, что назначено, — и по окончании двигал этот
/// уровень вверх или вниз. Лестницу теперь держит каркас; здесь проверяется
/// вторая половина: ДОСКА приходит из шага.
///
/// ⚠️ ПРОБА СМОТРИТ НА ДОСКУ И НА ШАПКУ, а не спрашивает `GamePreset`. Спросить
/// пресет — значит проверить пресет пресетом: экран, который его игнорирует,
/// остался бы зелёным.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: HanoiScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(HanoiBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

HanoiState _board(WidgetTester tester) =>
    tester.widget<HanoiBoard>(find.byType(HanoiBoard)).state;

/// ⚠️ Ряд счётчиков рисует ТОЛЬКО значение; подпись каркас кладёт в семантику
/// (`game_shell.dart:320`). Искать «Уровень» текстом бесполезно — найдётся ноль
/// и при исправном экране, и при сломанном.
Finder _hud(String label, [String? value]) =>
    find.bySemanticsLabel(RegExp('^$label: ${value ?? ''}'));

void main() {
  setUp(() => GamePreset.clear());
  tearDown(() => GamePreset.clear());

  group('предел «не выше освоенного»', () {
    test('шаг не даёт прыгнуть дальше одной ступени', () {
      // Замер из веба (`preset-cap-coverage.test.ts`): хочет 20, освоил 5 → 6.
      expect(capPresetByLevel(want: 20, atLevel: 5), 6);
      expect(capPresetByLevel(want: 6, atLevel: 5), 6);
      expect(capPresetByLevel(want: 3, atLevel: 5), 3);   // просит меньше — отдаём просимое
    });

    test('на вершине лестницы предел снимается', () {
      expect(capPresetByLevel(want: 20, atLevel: 12, atTop: true), 20);
    });

    test('бессмысленное число из адреса не ломает партию', () {
      expect(capPresetByLevel(want: 0, atLevel: 7), 7);
      expect(capPresetByLevel(want: -3, atLevel: 7), 7);
    });
  });

  testWidgets('🔴 ШАГ ЗАРЯДКИ РАЗДАЁТ СВОЮ ДОСКУ, а не личный уровень', (tester) async {
    // Игрок освоил уровень 6: по лестнице это 6 дисков на ЧЕТЫРЁХ стержнях.
    SharedPreferences.setMockInitialValues({'psygames_hanoi_level_nzt48': '6'});
    final state = await SharedState.open();
    GamePreset.set({'wu': '1', 'discs': '4'});
    await _boot(tester, state);

    final b = _board(tester);
    expect(b.discs, 4, reason: 'шаг просил четыре диска — их и раздали');
    expect(b.pegs.length, 3, reason: 'при пресете стержней всегда три: четвёртый — награда лестницы');
    expect(_hud('Уровень'), findsNothing, reason: 'шаг лестницу не двигает — и счётчик не обещает');
    expect(_hud('Дисков'), findsOneWidget);
    expect(_hud('Дисков', '4'), findsOneWidget, reason: 'в шапке число дисков с ДОСКИ');
  });

  testWidgets('🔴 ЖАДНЫЙ ШАГ УРЕЗАЕТСЯ ОСВОЕННЫМ УРОВНЕМ', (tester) async {
    // Уровень 1 — три диска. Шаг просит десять: получит четыре, а не десять.
    SharedPreferences.setMockInitialValues({'psygames_hanoi_level_nzt48': '1'});
    final state = await SharedState.open();
    GamePreset.set({'wu': '1', 'discs': '10'});
    await _boot(tester, state);
    expect(_board(tester).discs, 4,
        reason: 'освоено 3 диска, шаг просил 10 → отдаём одну ступень вверх');
  });

  testWidgets('обычный заход играет ЛЕСТНИЦУ и показывает её счётчик', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_hanoi_level_nzt48': '6'});
    final state = await SharedState.open();
    await _boot(tester, state);

    final p = levelParams(6);
    final b = _board(tester);
    expect(b.discs, p.discs);
    expect(b.pegs.length, p.pegs, reason: 'на уровне 6 стержней четыре — это и есть награда');
    expect(_hud('Уровень'), findsOneWidget);
    expect(_hud('Уровень', '6'), findsOneWidget);
  });

  testWidgets('шаг БЕЗ числа дисков играет уровень игрока, а не ломается', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_hanoi_level_nzt48': '3'});
    final state = await SharedState.open();
    GamePreset.set({'wu': '1'});   // плейлист задал только «это шаг»
    await _boot(tester, state);
    expect(_board(tester).discs, levelParams(3).discs);
  });
}

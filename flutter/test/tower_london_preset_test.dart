import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:psygames_flutter/games/tower_london/board.dart';
import 'package:psygames_flutter/games/tower_london/model.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/game_preset.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ШАГ ЗАРЯДКИ ЗАДАЁТ СЛОЖНОСТЬ И ЧИСЛО ЗАДАЧ, А ЛЕСТНИЦУ НЕ ТРОГАЕТ.
///
/// 🔴 ЧТО СТОРОЖИТСЯ. В вебе шаг собирает задачу по сложности
/// (`tower-london.tsx:175`: лёгкий — план в 3 хода, средний 5, трудный 7, шаров
/// всегда три) и берёт число задач из `trials`. Перенос этого не читал вовсе:
/// шаг играл уровень лестницы и по окончании его же двигал.
///
/// ⚠️ ГЕНЕРАТОР МЫ НЕ ПЕРЕНОСИЛИ — задачи лежат набором. Значит по тем же числам
/// надо ВЫБРАТЬ готовый уровень (`byTarget`), и проба проверяет именно выбор:
/// длину плана на доске, а не то, что экран «прочитал параметр».
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: TowerLondonScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(TolBoard).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

Finder _hud(String label, [String? value]) =>
    find.bySemanticsLabel(RegExp('^$label: ${value ?? ''}'));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => GamePreset.clear());
  tearDown(() => GamePreset.clear());

  test('набор отдаёт уровень по длине плана, а не по номеру', () async {
    final set = TolLevelSet.fromJsonString(
        await rootBundle.loadString('assets/levels/tower_london.json'));
    // Набор даёт планы 2…8 при трёх шарах — три просимые длины в нём ЕСТЬ.
    for (final want in [3, 5, 7]) {
      final l = set.byTarget(want, 3);
      expect(l.targetMoves, want, reason: 'план в $want ходов есть в наборе, его и надо отдать');
      expect(l.balls, 3);
    }
    // Небывалая длина не валит игру, а даёт ближайшую.
    expect(set.byTarget(99, 3).targetMoves, 8);
    expect(set.byTarget(1, 3).targetMoves, 2);
  });

  testWidgets('🔴 ЛЁГКИЙ ШАГ ДАЁТ КОРОТКИЙ ПЛАН, а не уровень игрока', (tester) async {
    // Игрок на уровне 8 — по лестнице это длинный план. Шаг просит лёгкий.
    SharedPreferences.setMockInitialValues({'psygames_tower_london_level_nzt48': '8'});
    final state = await SharedState.open();
    GamePreset.set({'wu': '1', 'diff': 'easy'});
    await _boot(tester, state);
    expect(_board(tester).state.pegs.isNotEmpty, isTrue);
    /*
     * ⚠️ СВЕРЯЕМСЯ С ДИАПАЗОНОМ, А НЕ С ОДНИМ ЧИСЛОМ. Шапка показывает минимум
     * КОНКРЕТНОЙ задачи, а он гуляет вокруг плана уровня: у уровня 2 (план 3)
     * задачи на 2…4 хода, у уровня 8 (план 8) — на 7…8. Требовать ровно «0/3»
     * значило бы краснеть на исправной игре через раз.
     */
    final moves = _minMovesOnScreen(tester);
    expect(moves, lessThanOrEqualTo(4),
        reason: 'лёгкий шаг даёт задачу уровня 2 (2…4 хода), а не восьмого (7…8)');
    expect(_hud('Уровень'), findsNothing, reason: 'шаг лестницу не двигает — счётчик скрыт');
  });

  testWidgets('🔴 ЧИСЛО ЗАДАЧ БЕРЁТСЯ ИЗ ШАГА', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_tower_london_level_nzt48': '3'});
    final state = await SharedState.open();
    GamePreset.set({'wu': '1', 'diff': 'medium', 'trials': '2'});
    await _boot(tester, state);
    expect(_hud('Задача', '1/2'), findsOneWidget, reason: 'шаг просил две задачи');
  });

  testWidgets('обычный заход играет уровень лестницы и показывает счётчик', (tester) async {
    SharedPreferences.setMockInitialValues({'psygames_tower_london_level_nzt48': '3'});
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(_hud('Уровень', '3'), findsOneWidget);
    expect(_hud('Задача', '1/5'), findsOneWidget, reason: 'число задач берётся из набора');
  });

  testWidgets('🔴 КОНТРОЛЬ: без шага тот же игрок получает ДЛИННУЮ задачу', (tester) async {
    // Тот же уровень 8, что и в пробе лёгкого шага, но без пресета. Без этой
    // пары «≤ 4 хода» ничего не доказывало бы: короткая задача могла попасться
    // и случайно.
    SharedPreferences.setMockInitialValues({'psygames_tower_london_level_nzt48': '8'});
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(_minMovesOnScreen(tester), greaterThanOrEqualTo(7),
        reason: 'уровень 8 — задачи на 7…8 ходов');
  });
}

TolBoard _board(WidgetTester tester) => tester.widget<TolBoard>(find.byType(TolBoard));

/// Минимум ходов текущей задачи — с ЭКРАНА, из счётчика «Ходы: сделано/минимум».
int _minMovesOnScreen(WidgetTester tester) {
  for (final w in tester.widgetList<Semantics>(find.byType(Semantics))) {
    final l = w.properties.label;
    if (l != null && l.startsWith('Ходы: ')) {
      return int.parse(l.substring(6).split('/')[1].trim().split('\n')[0]);
    }
  }
  throw StateError('счётчика ходов на экране нет');
}

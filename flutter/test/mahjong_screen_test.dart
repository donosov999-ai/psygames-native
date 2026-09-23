import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mahjong/model.dart';
import 'package:psygames_flutter/games/mahjong/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО ПЛИТКАМ, а не вызовом правил.
///
/// Какие плитки свободны и что на них нарисовано, проба узнаёт из ПОДПИСЕЙ на
/// экране (Semantics), а не из модели: так проверяется ровно то, что видит человек.
void main() {
  late SharedState state;

  /// Зерно у экрана и у пробы ОДНО: проба знает ту же доску, что видит человек,
  /// и потому может сыграть её нажатиями, а не пересказом правил.
  const seed = 7;

  Future<void> open(WidgetTester tester, {int level = 1}) async {
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}mahjong_level_nzt48': '$level',
    });
    state = await SharedState.open();
    // Ресурс раскладок читается с диска — ждём по-настоящему, как в пробе «Одной линии».
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: MahjongScreen(state: state, rnd: Random(seed))));
      for (var i = 0; i < 60; i += 1) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('плитка0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Живые плитки на экране: индекс → подпись.
  Map<int, String> tilesOnScreen(WidgetTester tester) {
    final out = <int, String>{};
    for (var i = 0; i < 200; i += 1) {
      final f = find.byKey(Key('плитка$i'));
      if (f.evaluate().isEmpty) continue;
      final s = tester.widget<Semantics>(find.descendant(of: f, matching: find.byType(Semantics)).first);
      out[i] = s.properties.label ?? '';
    }
    return out;
  }

  testWidgets('🔴 доска разбирается нажатиями: пара за парой до конца уровня', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один алгоритм. Порядок снятия из
    // раздачи — это готовое решение доски; проба играет его ТЫЧКАМИ по плиткам.
    final layouts = MahjongLayouts.fromJson(File('assets/levels/mahjong_layouts.json').readAsStringSync());
    final deal = dealSolvable(layouts.forLevel(1)!.places, 36, rnd: Random(seed).nextDouble);

    await open(tester);
    expect(find.text('Маджонг'), findsOneWidget);
    expect(tilesOnScreen(tester).length, deal.tiles.length,
        reason: 'на экране ровно та доска, что раздал генератор');

    for (final pair in deal.peelOrder) {
      final shown = tilesOnScreen(tester);
      expect(shown[pair[0]], contains('свободна'), reason: 'плитка ${pair[0]} обязана быть свободной');
      expect(shown[pair[1]], contains('свободна'), reason: 'плитка ${pair[1]} обязана быть свободной');
      await tester.tap(find.byKey(Key('плитка${pair[0]}')));
      await tester.pump();
      await tester.tap(find.byKey(Key('плитка${pair[1]}')));
      await tester.pump();
    }

    expect(tilesOnScreen(tester), isEmpty, reason: 'доска разобрана до конца');
    expect(find.text('Следующий уровень'), findsOneWidget);
  });

  testWidgets('🔴 занятую плитку снять нельзя — она остаётся на доске', (tester) async {
    await open(tester, level: 4);   // три слоя: накрытые плитки точно есть
    final shown = tilesOnScreen(tester);
    final busy = shown.entries.firstWhere((e) => !e.value.contains('свободна'));
    await tester.tap(find.byKey(Key('плитка${busy.key}')));
    await tester.pump();
    expect(find.byKey(Key('плитка${busy.key}')), findsOneWidget,
        reason: 'плитка под другой не снимается ни выбором, ни парой');
  });

  testWidgets('🔴 две разные плитки парой не снимаются', (tester) async {
    await open(tester);
    final shown = tilesOnScreen(tester);
    final free = shown.entries.where((e) => e.value.contains('свободна')).toList();
    final a = free.first;
    final b = free.firstWhere((e) => e.value.split(',').first != a.value.split(',').first);
    await tester.tap(find.byKey(Key('плитка${a.key}')));
    await tester.pump();
    await tester.tap(find.byKey(Key('плитка${b.key}')));
    await tester.pump();
    expect(find.byKey(Key('плитка${a.key}')), findsOneWidget);
    expect(find.byKey(Key('плитка${b.key}')), findsOneWidget);
  });

  testWidgets('🔴 на скрытом уровне накрытые плитки лежат лицом вниз', (tester) async {
    expect(mahjongHidden(10), isTrue, reason: 'десятый — первый скрытый');
    await open(tester, level: 10);
    final shown = tilesOnScreen(tester);
    expect(shown.values.where((v) => v.contains('скрыта')), isNotEmpty,
        reason: 'накрытые лица не показываются');
    expect(shown.values.where((v) => v.contains('свободна') && !v.contains('скрыта')), isNotEmpty,
        reason: 'свободные плитки видно');
  });
}

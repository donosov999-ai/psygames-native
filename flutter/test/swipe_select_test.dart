import 'dart:ui' show Tristate;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/model.dart' as counter;
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/games/monster_traits/screen.dart';
import 'package:psygames_flutter/games/number_bonds/model.dart' as bonds;
import 'package:psygames_flutter/games/number_bonds/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/swipe_select.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПРОТЯЖКА — ОБЩИЙ ЖЕСТ КАРКАСА (`shell/swipe_select.dart`).
///
/// 📍 Скрин Дениса 13.11.2026, «Считалка: счёт» (сумма 7, плитки 3×3): «цифры мелкие и такая же
/// проблема, как в анаграммах — нельзя пальцем соединять цифры, надо тыкать каждую». Жест был
/// написан внутри колеса «Анаграмм» (#501) и вынесен в каркас. Проба держит САМ компонент на
/// плитках в `Wrap` и его подключение в «Считалке» и «Числовых парах»; колесо анаграмм —
/// `letter_ring_drag_test.dart`.
void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  // ─── сам компонент: сетка 3×3 плиток 60×60 с зазором 10 ───

  const tile = 60.0;
  const gap = 10.0;

  Future<({List<int> picked, List<int> undone, List<int> taps})> pumpGrid(WidgetTester tester, {bool undo = true}) async {
    final picked = <int>[];
    final undone = <int>[];
    final taps = <int>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Align(
          alignment: Alignment.topLeft,
          child: StatefulBuilder(
            builder: (context, setState) => SwipeSelect(
              key: const Key('grid'),
              isSelected: picked.contains,
              onSelect: (i) => setState(() => picked.add(i)),
              onUnselect: undo
                  ? (i) => setState(() {
                        picked.remove(i);
                        undone.add(i);
                      })
                  : null,
              child: SizedBox(
                width: tile * 3 + gap * 2,
                child: Wrap(
                  spacing: gap,
                  runSpacing: gap,
                  children: [
                    for (var i = 0; i < 9; i++)
                      SwipeTarget(
                        index: i,
                        child: GestureDetector(
                          key: Key('t$i'),
                          onTap: () => taps.add(i),
                          child: Container(width: tile, height: tile, color: Colors.teal),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ));
    return (picked: picked, undone: undone, taps: taps);
  }

  Offset center(WidgetTester tester, int i) => tester.getCenter(find.byKey(Key('t$i')));

  Future<void> sweep(WidgetTester tester, List<Offset> points) async {
    final g = await tester.startGesture(points.first);
    for (final p in points.skip(1)) {
      await g.moveTo(p);
    }
    await g.up();
    await tester.pump();
  }

  testWidgets('🔴 протяжка по трём плиткам берёт их по порядку, по одной', (tester) async {
    final s = await pumpGrid(tester);
    await sweep(tester, [for (final i in [0, 1, 2]) center(tester, i)]);
    expect(s.picked, [0, 1, 2]);
    expect(s.taps, isEmpty, reason: 'протяжка не должна вызывать тап');
  });

  testWidgets('быстрый палец не перепрыгивает плитки: одно событие из угла в угол берёт всё на пути', (tester) async {
    final s = await pumpGrid(tester);
    await sweep(tester, [center(tester, 0), center(tester, 2)]);
    expect(s.picked, [0, 1, 2], reason: 'средняя плитка пропущена: ${s.picked}');
  });

  testWidgets('🔴 возврат на предыдущую снимает последнюю', (tester) async {
    final s = await pumpGrid(tester);
    await sweep(tester, [center(tester, 0), center(tester, 1), center(tester, 2), center(tester, 1)]);
    expect(s.picked, [0, 1], reason: 'возврат на вторую плитку должен снять третью: ${s.picked}');
    expect(s.undone, [2]);
  });

  testWidgets('без обработчика снятия возврат ничего не снимает', (tester) async {
    final s = await pumpGrid(tester, undo: false);
    await sweep(tester, [center(tester, 0), center(tester, 1), center(tester, 2), center(tester, 1)]);
    expect(s.picked, [0, 1, 2]);
  });

  testWidgets('🔴 диагональ через угол не задевает соседей (середина плитки, а не вся)', (tester) async {
    final s = await pumpGrid(tester);
    // Из центра плитки 0 в центр плитки 4 — палец проходит угол плитки 1 (x 70–72, y 55): по
    // всей плитке это «вошёл в плитку 1», по середине — нет.
    final a = center(tester, 0);
    await sweep(tester, [a, a + const Offset(42, 25), center(tester, 4)]);
    expect(s.picked, [0, 4], reason: 'у угла засчитана чужая плитка: ${s.picked}');
  });

  testWidgets('🔴 тап по плитке — один тап, протяжка не включается', (tester) async {
    final s = await pumpGrid(tester);
    await tester.tap(find.byKey(const Key('t4')));
    await tester.pump();
    expect(s.taps, [4]);
    expect(s.picked, isEmpty);
  });

  testWidgets('лёгкий сдвиг пальца внутри допуска — это тап, а не протяжка', (tester) async {
    final s = await pumpGrid(tester);
    final c = center(tester, 4);
    await sweep(tester, [c, c + const Offset(8, 0)]);
    expect(s.picked, isEmpty, reason: 'сдвиг в 8 точек принят за протяжку');
  });

  testWidgets('протяжка, начатая в щели между плитками, берёт те, что прошла', (tester) async {
    final s = await pumpGrid(tester);
    final a = center(tester, 0);
    await sweep(tester, [a + const Offset(35, 0), center(tester, 1), center(tester, 2)]);
    expect(s.picked, [1, 2]);
  });

  // ─── «Считалка: счёт» ───

  Future<SharedState> openCounter(WidgetTester tester, String seed) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: CounterScreen(key: ValueKey('c$seed'), state: state, rnd: counter.createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
    return state;
  }

  List<int> counterCells(WidgetTester tester) => [
        for (var i = 0; i < 9; i++)
          int.parse(tester.widget<Text>(find.descendant(of: find.byKey(Key('cell$i')), matching: find.byType(Text))).data!),
      ];

  int counterTarget(WidgetTester tester) => int.parse(tester.widget<Text>(find.byKey(const Key('target'))).data!);

  int counterSum(WidgetTester tester) =>
      int.parse(tester.widget<Text>(find.byKey(const Key('sum'))).data!.split(' ').last);

  /// Соседи по строке (i, i+1) в сетке 3×3.
  List<int> rowPairs() => [0, 1, 3, 4, 6, 7];

  testWidgets('🔴 «Считалка»: одна протяжка по соседним плиткам набирает сумму и засчитывает её', (tester) async {
    List<int>? pair;
    for (var n = 0; n < 60 && pair == null; n++) {
      await openCounter(tester, 'протяжка$n');
      final cells = counterCells(tester);
      final target = counterTarget(tester);
      for (final i in rowPairs()) {
        if (cells[i] + cells[i + 1] == target) {
          pair = [i, i + 1];
          break;
        }
      }
    }
    expect(pair, isNotNull, reason: 'за 60 партий не нашлось пары соседей с нужной суммой');
    await sweep(tester, [for (final i in pair!) tester.getCenter(find.byKey(Key('cell$i')))]);
    expect(find.byKey(const Key('feedback')), findsOneWidget, reason: 'сумма набрана одним движением, а отклика «верно» нет');
  });

  testWidgets('«Считалка»: протяжка вперёд-назад — выбрана одна плитка', (tester) async {
    List<int>? pair;
    for (var n = 0; n < 60 && pair == null; n++) {
      await openCounter(tester, 'назад$n');
      final cells = counterCells(tester);
      final target = counterTarget(tester);
      for (final i in rowPairs()) {
        if (cells[i] + cells[i + 1] < target) {
          pair = [i, i + 1];
          break;
        }
      }
    }
    expect(pair, isNotNull);
    final cells = counterCells(tester);
    final a = tester.getCenter(find.byKey(Key('cell${pair![0]}')));
    final b = tester.getCenter(find.byKey(Key('cell${pair[1]}')));
    await sweep(tester, [a, b]);
    expect(counterSum(tester), cells[pair[0]] + cells[pair[1]]);
    await sweep(tester, [b, a]);
    // Вторая протяжка начинается на выбранной плитке b и идёт на a: берёт a (b уже выбрана).
    expect(counterSum(tester), cells[pair[0]] + cells[pair[1]],
        reason: 'уже выбранная плитка, на которой начата протяжка, не должна сниматься');
  });

  testWidgets('🔴 «Считалка»: цифра на плитке крупная — от размера плитки', (tester) async {
    await openCounter(tester, 'размер');
    final cell = find.byKey(const Key('cell0'));
    final size = tester.getSize(cell).width;
    final text = tester.widget<Text>(find.descendant(of: cell, matching: find.byType(Text)));
    expect(text.style!.fontSize!, greaterThanOrEqualTo(size * 0.4),
        reason: 'цифра ${text.style!.fontSize} на плитке $size — снова мелкая (скрин Дениса 13.11)');
  });

  // ─── «Числовые пары» ───

  testWidgets('🔴 «Числовые пары»: протяжка по соседним фишкам берёт их по порядку', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: NumberBondsScreen(state: state, rnd: bonds.createRng('протяжка')),
    ));
    await tester.pump();
    await tester.pump();
    // Две соседние фишки в одной строке.
    int? i;
    for (var k = 0; k < 8; k++) {
      final a = find.byKey(Key('фишка$k'));
      final b = find.byKey(Key('фишка${k + 1}'));
      if (a.evaluate().isEmpty || b.evaluate().isEmpty) break;
      if ((tester.getCenter(a).dy - tester.getCenter(b).dy).abs() < 1) {
        i = k;
        break;
      }
    }
    expect(i, isNotNull, reason: 'нет двух соседних фишек в одной строке');
    final a = tester.getCenter(find.byKey(Key('фишка$i')));
    final b = tester.getCenter(find.byKey(Key('фишка${i! + 1}')));
    final va = int.parse(tester.widget<Text>(find.descendant(of: find.byKey(Key('фишка$i')), matching: find.byType(Text))).data!);
    final vb = int.parse(tester.widget<Text>(find.descendant(of: find.byKey(Key('фишка${i + 1}')), matching: find.byType(Text))).data!);
    final target = int.parse(tester.widget<Text>(find.byKey(const Key('цель'))).data!);
    if (va + vb == target) return; // протяжка сразу решила бы раунд — проверять нечего
    await sweep(tester, [a, b]);
    final sum = tester.widget<Text>(find.byKey(const Key('сумма'))).data!;
    expect(sum, contains('${va + vb}'), reason: 'протяжка по двум фишкам не набрала сумму: «$sum»');
  });

  // ─── «Найди признак» ───

  testWidgets('🔴 «Найди признак»: протяжка по соседним карточкам отмечает их, возврат снимает', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(home: MonsterTraitsScreen(state: state, seed: 5)));
    await tester.pump();
    await tester.pump();
    int? i;
    for (var k = 0; k < 8; k++) {
      final a = find.byKey(ValueKey('mt-card-$k'));
      final b = find.byKey(ValueKey('mt-card-${k + 1}'));
      if (a.evaluate().isEmpty || b.evaluate().isEmpty) break;
      if ((tester.getCenter(a).dy - tester.getCenter(b).dy).abs() < 1) {
        i = k;
        break;
      }
    }
    expect(i, isNotNull, reason: 'нет двух соседних карточек в одной строке');
    final a = tester.getCenter(find.byKey(ValueKey('mt-card-$i')));
    final b = tester.getCenter(find.byKey(ValueKey('mt-card-${i! + 1}')));
    final semantics = tester.ensureSemantics();
    bool marked(int k) => tester.getSemantics(find.byKey(ValueKey('mt-card-$k'))).flagsCollection.isSelected == Tristate.isTrue;
    await sweep(tester, [a, b]);
    expect([marked(i), marked(i + 1)], [true, true], reason: 'протяжка не отметила обе карточки');
    await sweep(tester, [a, b, a]);
    // Протяжка a→b→a: a и b уже отмечены, возвращаться снимать нечего — отметки целы.
    expect([marked(i), marked(i + 1)], [true, true]);
    semantics.dispose();
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/tower_london/board.dart';
import 'package:psygames_flutter/games/tower_london/model.dart';
import 'package:psygames_flutter/games/tower_london/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ИГРАЕТ ПАРТИЮ ПАЛЬЦЕМ: доходит ли экран до поля, виден ли ЦЕЛЕВОЙ
/// расклад, считается ли ход тапом и перетаскиванием, отличается ли отказ по
/// вместимости от обычного хода, называется ли итог партии числом.
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

TolBoard _board(WidgetTester tester) => tester.widget<TolBoard>(find.byType(TolBoard));

Future<void> _tapMove(WidgetTester tester, int from, int to) async {
  await tester.tap(find.byKey(ValueKey('peg-$from')));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('peg-$to')));
  await tester.pump();
}

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('экран доходит до поля, и ЦЕЛЬ видна рядом', (tester) async {
    await _boot(tester, state);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(TolBoard), findsOneWidget);
    expect(find.text('Цель'), findsOneWidget, reason: 'держать цель в голове — другая задача');
    expect(find.byKey(const ValueKey('goal-0')), findsOneWidget);
    /*
     * ⚠️ ЗДЕСЬ СТОЯЛО `expect(pegs[0], ['R','G','B'])` — то есть проба помнила
     * ПОРЯДОК шаров первого уровня наизусть. Свойство, которое она хотела
     * стеречь, называлось в её же пояснении: «все шары на первом». Порядок в
     * это свойство не входит, а лестница пересобирается
     * (`tool/export_tol_levels.dart`), и старт теперь БАШНЯ С РАЗНЫМ ПОРЯДКОМ:
     * при одном порядке целей на нужной длине плана не хватает, оттого в
     * прежней выгрузке и повторялись задачи. Проверяем само свойство.
     */
    final st = _board(tester).state;
    var spare = false;
    for (var i = 0; i < st.pegs.length; i += 1) {
      if (spare) {
        expect(st.pegs[i], isEmpty, reason: 'старт не башня: шар лежит за неполным стержнем');
      }
      if (st.pegs[i].length < st.caps[i]) spare = true;
    }
    expect(st.pegs[0], isNotEmpty, reason: 'старт: шары складываются с первого стержня');
  });

  testWidgets('🔴 ход ТАПОМ и отказ ПО ВМЕСТИМОСТИ считаются по-разному', (tester) async {
    await _boot(tester, state);
    await _tapMove(tester, 0, 2);   // третий стержень одноместный
    expect(_board(tester).state.pegs[2].length, 1, reason: 'первый шар туда влезает');
    await _tapMove(tester, 0, 2);   // а второй — уже нет
    expect(_board(tester).state.pegs[2].length, 1, reason: 'вместимость не пускает');
    expect(
      find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Ошибки: 1'),
      findsOneWidget,
      reason: 'отказ обязан быть посчитан, а не проглочен',
    );
  });

  testWidgets('🔴 ход засчитывается ПЕРЕТАСКИВАНИЕМ', (tester) async {
    await _boot(tester, state);
    // Ключ шара берём У ДОСКИ, а не помним наизусть: верхний шар первого
    // стержня — единственный, который с него можно снять.
    final top = _board(tester).state.pegs[0].last;
    final from = tester.getCenter(find.byKey(ValueKey('peg-ball-0-$top')));
    final to = tester.getCenter(find.byKey(const ValueKey('peg-1')));
    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2));
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(to);
    await tester.pump(const Duration(milliseconds: 60));
    await g.up();
    await tester.pumpAndSettle();
    /*
     * ⚠️ ПРОВЕРЯЕМ НЕ «шар на втором стержне», А ЧТО ХОД ЗАСЧИТАН — доска после
     * хода может и вернуться к старту, если задача решилась и началась
     * следующая. Первая редакция пробы приняла это за «ход не прошёл».
     * ⚠️ И НЕ «партия перешла ко второй задаче»: это верно, только пока план
     * первого уровня в один ход. На пересобранной лестнице (`tool/export_tol_levels.dart`)
     * план первого уровня — два хода, и такая проба краснела бы на здоровой
     * игре. Считаем то, что от длины плана не зависит: счётчик ходов.
     */
    expect(
      find.byWidgetPredicate((w) =>
          w is Semantics && (w.properties.label ?? '').startsWith('Ходы: 1/')),
      findsOneWidget,
      reason: 'ход перетаскиванием обязан быть посчитан',
    );
  });

  testWidgets('🔴 ПАРТИЯ ИДЁТ ПЯТЬЮ ЗАДАЧАМИ и итог называется числом', (tester) async {
    await _boot(tester, state);
    // Решаем каждую задачу поиском по самим правилам игры и играем ТАПАМИ.
    for (var round = 1; round <= 5; round += 1) {
      final b = _board(tester);
      final path = _solve(b.state, b.goal);
      expect(path, isNotNull, reason: 'задача раунда $round обязана решаться');
      for (final m in path!) {
        await _tapMove(tester, m.from, m.to);
      }
    }
    final result = tester.widget<Text>(find.byKey(const ValueKey('tol-result')));
    expect(result.data, contains('Партия взята'), reason: 'решено за минимум — партия берётся');
    expect(result.data, contains('5'), reason: 'и назван порог лишних ходов');
  });

  testWidgets('отмена возвращает положение', (tester) async {
    await _boot(tester, state);
    final before = _board(tester).state.key;
    // Ход НЕ В ЦЕЛЬ: на первом уровне цель — «B на втором стержне», поэтому
    // несём шар на третий; иначе задача решится и отменять будет уже нечего.
    await _tapMove(tester, 0, 2);
    expect(_board(tester).state.key, isNot(before));
    await tester.tap(find.bySemanticsLabel('Отменить'));
    await tester.pump();
    expect(_board(tester).state.key, before, reason: 'положение обязано вернуться');
  });
}

/// Кратчайший путь до цели — ТОЛЬКО ДЛЯ ПРОБЫ: игра решателя не носит.
List<({int from, int to})>? _solve(TolState start, TolState goal) {
  final want = goal.key;
  if (start.key == want) return [];
  final seen = <String>{start.key};
  var frontier = <(TolState, List<({int from, int to})>)>[(start, [])];
  for (var depth = 0; depth < 16; depth += 1) {
    final next = <(TolState, List<({int from, int to})>)>[];
    for (final (st, path) in frontier) {
      for (final m in st.legalMoves()) {
        final ns = st.move(m.from, m.to)!;
        if (!seen.add(ns.key)) continue;
        final p = [...path, m];
        if (ns.key == want) return p;
        next.add((ns, p));
      }
    }
    frontier = next;
  }
  return null;
}

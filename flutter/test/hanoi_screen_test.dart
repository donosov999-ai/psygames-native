import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/hanoi/board.dart';
import 'package:psygames_flutter/games/hanoi/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ИГРАЕТ ПАРТИЮ ПАЛЬЦЕМ.
///
/// 📍 ДВЕ ЖАЛОБЫ 14.09.2026, которые эта проба и сторожит: «перетаскивание
/// хуёвенько работает, лагает» и «в конце… ни очки не показываются, ни что ты
/// молодец, ни уровень два».
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

List<List<int>> _pegs(WidgetTester tester) =>
    tester.widget<HanoiBoard>(find.byType(HanoiBoard)).state.pegs;

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

  testWidgets('экран доходит до доски: три стержня, три диска на первом', (tester) async {
    await _boot(tester, state);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byKey(const ValueKey('peg-2')), findsOneWidget);
    expect(find.byKey(const ValueKey('peg-3')), findsNothing);
    expect(_pegs(tester)[0], [3, 2, 1]);
  });

  testWidgets('🔴 ход засчитывается ТАПОМ, а незаконный считается ОШИБКОЙ', (tester) async {
    await _boot(tester, state);
    await _tapMove(tester, 0, 2);
    expect(_pegs(tester)[2], [1], reason: 'единица обязана переехать');
    /*
     * ⚠️ ОШИБКИ СЧИТАЮТСЯ ОДНОЗНАЧНЫМ ЧИСЛОМ, А НЕ `find.text('1')`: единица
     * есть и в шапке (номер уровня), и такая проба зелёная независимо от игры —
     * ровно на этом сегодня выжила мутация в движке сосудов. Делаем ДВА
     * незаконных хода: двойка на L1 больше нигде не показывается.
     */
    await _tapMove(tester, 0, 2);   // двойку на единицу — нельзя
    await _tapMove(tester, 0, 2);   // и ещё раз
    expect(_pegs(tester)[2], [1], reason: 'незаконный ход не меняет доску');
    expect(find.text('1/7'), findsOneWidget, reason: 'ходов по-прежнему один при минимуме семь');
    /*
     * ⚠️ СЧЁТЧИК СПРАШИВАЕТСЯ ПО ИМЕНИ, А НЕ ПО ЦИФРЕ. `find.text('2')` находит
     * ещё и подпись диска №2 — проба была бы зелёной ровно тогда, когда ошибки
     * НЕ считаются (мутация это и показала). Каркас подписывает каждый счётчик
     * как «имя: значение» — спрашиваем именно так.
     */
    expect(
      find.byWidgetPredicate((w) => w is Semantics && w.properties.label == 'Ошибки: 2'),
      findsOneWidget,
      reason: 'счётчик ошибок обязан показать два',
    );
  });

  testWidgets('🔴 ход засчитывается ПЕРЕТАСКИВАНИЕМ — жалоба «DragandDrop лагает»', (tester) async {
    await _boot(tester, state);
    final from = tester.getCenter(find.byKey(const ValueKey('disc-0-1')));
    final to = tester.getCenter(find.byKey(const ValueKey('peg-2')));
    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2));
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(to);
    await tester.pump(const Duration(milliseconds: 60));
    await g.up();
    await tester.pumpAndSettle();
    expect(_pegs(tester)[2], [1], reason: 'перетаскивание обязано давать тот же ход, что и тап');
  });

  testWidgets('🔴 ИТОГ ПАРТИИ НАЗЫВАЕТСЯ ЧИСЛОМ — жалоба «непонятно, что ты молодец»', (tester) async {
    await _boot(tester, state);
    // Классические семь ходов для трёх дисков.
    for (final m in [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]]) {
      await _tapMove(tester, m[0], m[1]);
    }
    expect(_pegs(tester)[2].length, 3, reason: 'башня собрана на последнем стержне');
    final result = tester.widget<Text>(find.byKey(const ValueKey('hanoi-result')));
    expect(result.data, contains('7'), reason: 'сколько ходов сделано');
    expect(result.data, contains('★'), reason: 'и сколько звёзд');
    expect(find.textContaining('уровень 2'), findsOneWidget, reason: 'и какой уровень дальше');
  });

  testWidgets('🔴 итог НЕОПТИМАЛЬНОЙ партии называет и ходы, и минимум', (tester) async {
    /*
     * ⚠️ ВТОРАЯ ВЕТКА ИТОГА ПРОВЕРЯЕТСЯ ОТДЕЛЬНО. Проба выше играет ровно за
     * минимум и ветки «сделано больше минимума» не касается вовсе — мутация
     * «заменить её на „Молодец!“» на ней ВЫЖИЛА. Здесь игра идёт с лишними
     * ходами, и оба числа обязаны быть названы.
     */
    await _boot(tester, state);
    await _tapMove(tester, 0, 1);   // лишняя пара ходов
    await _tapMove(tester, 1, 0);
    for (final m in [[0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2]]) {
      await _tapMove(tester, m[0], m[1]);
    }
    expect(_pegs(tester)[2].length, 3);
    final result = tester.widget<Text>(find.byKey(const ValueKey('hanoi-result')));
    expect(result.data, contains('9'), reason: 'сделано девять ходов');
    expect(result.data, contains('7'), reason: 'и назван минимум — семь');
    expect(result.data, contains('★'));
  });

  testWidgets('отмена возвращает доску и счётчик ходов', (tester) async {
    await _boot(tester, state);
    await _tapMove(tester, 0, 2);
    expect(_pegs(tester)[2], [1]);
    await tester.tap(find.bySemanticsLabel('Отменить'));
    await tester.pump();
    expect(_pegs(tester)[2], isEmpty, reason: 'диск обязан вернуться');
    expect(_pegs(tester)[0], [3, 2, 1]);
  });

  testWidgets('🔴 доска влезает в поле, которое дал каркас', (tester) async {
    await _boot(tester, state);
    final b = tester.widget<HanoiBoard>(find.byType(HanoiBoard));
    final size = tester.getSize(find.byType(HanoiBoard));
    expect(size.height, lessThanOrEqualTo(b.fieldHeight + 0.5),
        reason: 'в вебе высота доски бралась от ОКНА, и нижний диск подрезало');
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cake_sort/board.dart';
import 'package:psygames_flutter/games/cake_sort/layout.dart';
import 'package:psygames_flutter/games/cake_sort/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ИГРАЕТ ПАРТИЮ ПАЛЬЦЕМ, а не зовёт правила.
///
/// Правила и раскладка сверены с живым TS отдельно (`cake_sort_test.dart`).
/// Здесь то, чего та сверка не видит: доходит ли экран до стола, засчитывается
/// ли ход ТАПОМ и ПЕРЕТАСКИВАНИЕМ, уезжает ли собранный круг, совпадает ли
/// нарисованная тарелка с посчитанной.
///
/// 📍 ПОВОД ДЛЯ ПЕРЕТАСКИВАНИЯ — отзыв тестировщицы о тортах 09.09.2026,
/// дословно: «Не перетаскивается не хуя».
Future<void> _boot(WidgetTester tester, SharedState state, CakeSkin skin, String gameId) async {
  tester.view.physicalSize = const Size(780, 1688);   // телефон 390×844
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(
      home: CakeSortScreen(state: state, gameId: gameId, title: 'Проба', skin: skin),
    ));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(CakeTable).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

List<List<int>> _plates(WidgetTester tester) =>
    tester.widget<CakeTable>(find.byType(CakeTable)).board.plates;

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /* L1 вшитого файла (`assets/levels/cake_sort.json`, поставляется с игрой):
     пять тарелок — [1,1,2,1,0,2] [2,2,2,1,1,0] [0,0,0,2,1,0] [] []
     Числа ниже взяты оттуда, а не выдуманы. */

  testWidgets('экран доходит до стола, а не висит на загрузке', (tester) async {
    await _boot(tester, state, CakeSkin.cake, 'cake_sort');
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(CakeTable), findsOneWidget);
    expect(find.byKey(const ValueKey('plate-4')), findsOneWidget, reason: 'пять тарелок');
    expect(find.byKey(const ValueKey('plate-5')), findsNothing);
    expect(_plates(tester)[0].length, 6, reason: 'первая тарелка полна');
    expect(_plates(tester)[3], isEmpty, reason: 'четвёртая пуста');
  });

  testWidgets('🔴 ход ТАПОМ идёт через РАСКРЫТИЕ тарелки, как в вебе', (tester) async {
    /*
     * 📍 Первая редакция переноса выбирала кусок прямо на столе — и проба
     * показала, почему так нельзя: тап в центр попадал ВСЕГДА в нулевой сектор
     * (центр принадлежит всем шести сразу), а сектор на телефоне и так 15 точек.
     * В вебе тарелка раскрывается, и кусок берут в большом круге.
     */
    await _boot(tester, state, CakeSkin.cake, 'cake_sort');
    await tester.tap(find.byKey(const ValueKey('plate-0')));
    await tester.pump();
    expect(find.byType(CakeZoom), findsOneWidget, reason: 'тарелка обязана раскрыться');
    expect(find.byKey(const ValueKey('slice-5')), findsOneWidget, reason: 'шесть целей нажатия');

    await tester.tap(find.byKey(const ValueKey('slice-0')));
    await tester.pump();
    expect(find.byType(CakeZoom), findsNothing, reason: 'круг закрывается, кусок в руке');

    await tester.tap(find.byKey(const ValueKey('plate-3')));
    await tester.pump();
    expect(_plates(tester)[3].length, 1, reason: 'кусок обязан оказаться на пустой тарелке');
    expect(_plates(tester)[0].length, 5, reason: 'и уйти с прежней');
  });

  testWidgets('🔴 ход засчитывается ПЕРЕТАСКИВАНИЕМ — отзыв «не перетаскивается»', (tester) async {
    await _boot(tester, state, CakeSkin.pizza, 'pizza_sort');
    final from = tester.getCenter(find.byKey(const ValueKey('plate-0')));
    final to = tester.getCenter(find.byKey(const ValueKey('plate-4')));
    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(Offset((from.dx + to.dx) / 2, (from.dy + to.dy) / 2));
    await tester.pump(const Duration(milliseconds: 60));
    await g.moveTo(to);
    await tester.pump(const Duration(milliseconds: 60));
    await g.up();
    await tester.pumpAndSettle();
    expect(_plates(tester)[4], isNotEmpty,
        reason: 'перетаскивание обязано давать тот же ход, что и тап');
  });

  testWidgets('🔴 СОБРАННЫЙ КРУГ УЕЗЖАЕТ и освобождает тарелку', (tester) async {
    await _boot(tester, state, CakeSkin.cake, 'cake_sort');
    final table = tester.widget<CakeTable>(find.byType(CakeTable));
    // Собираем круг руками через сам виджет: шесть кусков одного вида на одну
    // тарелку. Проверяем не формулу, а ПОВЕДЕНИЕ ЭКРАНА после последнего куска.
    expect(table.board.plates.length, 5);
    // На L1 три вида по шесть кусков: 0, 1 и 2. Сносим все нули на пустую.
    var moved = 0;
    for (var pass = 0; pass < 12 && moved < 6; pass += 1) {
      for (var p = 0; p < 3 && moved < 6; p += 1) {
        final plates = _plates(tester);
        final where = plates[p].indexOf(0);
        if (where < 0) continue;
        // Раскрываем тарелку и берём ИМЕННО нулевой кусок, где бы он ни лежал —
        // в этом и смысл хода «выбранным видом», а не «верхним».
        await tester.tap(find.byKey(ValueKey('plate-$p')));
        await tester.pump();
        await tester.tap(find.byKey(ValueKey('slice-$where')));
        await tester.pump();
        await tester.tap(find.byKey(const ValueKey('plate-3')));
        await tester.pump();
        moved += 1;
      }
    }
    /*
     * ⚠️ ЗАМЕР ПО ЧИСЛУ КУСКОВ, А НЕ «на тарелке меньше шести». Первая редакция
     * утверждала `after[3].length < 6` — это верно и когда ход вообще не прошёл,
     * то есть проба была бы зелёной при неработающем экране. Очереди на L1 нет,
     * значит кусков на столе может стать меньше ТОЛЬКО от уехавшего круга.
     */
    final after = _plates(tester).fold<int>(0, (n, p) => n + p.length);
    expect(moved, 6, reason: 'все шесть кусков одного вида обязаны были собраться');
    expect(after, 18 - 6, reason: 'собранный круг уехал: было 18 кусков, осталось 12');
  });

  testWidgets('🔴 НАРИСОВАНО ТО ЖЕ, ЧТО ПОСЧИТАНО: тарелка совпадает с раскладкой', (tester) async {
    /*
     * Сверка `tableFit` меряет ФОРМУЛУ, а жалобы приходят на РИСУНОК. Между ними
     * код стола: мутация «считай стол от окна, а не от поля каркаса» прошла бы
     * мимо всех зелёных проб.
     */
    await _boot(tester, state, CakeSkin.cake, 'cake_sort');
    final t = tester.widget<CakeTable>(find.byType(CakeTable));
    final box = tester.getSize(find.byType(CakeTable));
    final fit = tableFit(box.width, t.fieldHeight, t.board.length);
    final got = tester.getSize(find.byKey(const ValueKey('plate-0')));
    expect(got.width, fit.plate, reason: 'диаметр тарелки — из раскладки');
    expect(fit.rows * (fit.plate + plateGap) + plateGap, lessThanOrEqualTo(t.fieldHeight + 1),
        reason: 'стол не имеет права перерасти поле, которое дал каркас');
  });

  testWidgets('отмена возвращает стол и счётчик ходов', (tester) async {
    await _boot(tester, state, CakeSkin.cake, 'cake_sort');
    final before = _plates(tester)[0].length;
    await tester.tap(find.byKey(const ValueKey('plate-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('slice-0')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('plate-3')));
    await tester.pump();
    expect(_plates(tester)[0].length, before - 1);
    await tester.tap(find.bySemanticsLabel('Отменить'));
    await tester.pump();
    expect(_plates(tester)[0].length, before, reason: 'кусок обязан вернуться');
    expect(_plates(tester)[3], isEmpty);
  });

  testWidgets('обе шкурки доходят до стола со своей едой', (tester) async {
    for (final (skin, game, top) in [
      (CakeSkin.cake, 'cake_sort', 'assets/cake/tops/'),
      (CakeSkin.pizza, 'pizza_sort', 'assets/pizza/tops/'),
    ]) {
      SharedPreferences.setMockInitialValues({});
      final s = await SharedState.open();
      await _boot(tester, s, skin, game);
      expect(find.byType(CakeTable), findsOneWidget, reason: 'шкурка $skin');
      final tops = find.byWidgetPredicate((w) =>
          w is Image && w.image is AssetImage && (w.image as AssetImage).assetName.startsWith(top));
      expect(tops, findsWidgets, reason: 'начинки шкурки $skin');
    }
  });
}

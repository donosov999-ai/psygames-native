import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/layout.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА ИГРАЕТ ПАРТИЮ ПАЛЬЦЕМ, а не зовёт правила.
///
/// Правила сверены с живым TS отдельно (`goods_sort_test.dart`), раскладка —
/// тоже (`goods_sort_layout_test.dart`). Здесь проверяется то, чего ни одна из
/// тех сверок не видит: доходит ли экран до доски, засчитывается ли ход ТАПОМ и
/// ПЕРЕТАСКИВАНИЕМ, собирается ли тройка, растут ли очки, возвращает ли отмена.
/// У этого экрана в вебе четыре жалобы на вёрстку и жалоба «не перетаскивается
/// ничего» — зелёные правила при неработающей доске тут уже случались.
///
/// ⚠️ ЭКРАН ТЕЛЕФОННЫЙ (390×844), а не десктопный по умолчанию: раздача зависит
/// от ширины (узкая сетка до 560 px), и на широком поле игралась бы ДРУГАЯ доска.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: GoodsSortScreen(state: state)));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(GoodsField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

/// Ход тапом: взять товар и положить в нишу.
Future<void> _tapMove(WidgetTester tester, String item, int toNiche) async {
  await tester.tap(find.byKey(ValueKey(item)));
  await tester.pump();
  await tester.tap(find.byKey(ValueKey('niche-$toNiche')));
  await tester.pump();
}

void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  /* L1 телефонной раздачи (`assets/levels/goods_sort.json`, зерно 20260923):
     сетка 3×4 с дырами по углам, десять ниш, ёмкость 3.
       0:[2,2]  1:[]  2:[43,43]  3:[37,37]  4:[]  5:[43,37]  6:[]  7:[42,2]  8:[]  9:[42,42]
     Отсюда все номера ниже: они не выдуманы, а взяты из выгруженной доски. */

  testWidgets('экран доходит до доски, а не висит на загрузке', (tester) async {
    await _boot(tester, state);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.byType(GoodsField), findsOneWidget);
    expect(find.text('Сортировка товаров'), findsOneWidget);
    expect(find.byKey(const ValueKey('niche-9')), findsOneWidget, reason: 'десять ниш');
    expect(find.byKey(const ValueKey('item-0-1')), findsOneWidget, reason: 'в первой нише два товара');
    expect(find.byKey(const ValueKey('item-1-0')), findsNothing, reason: 'вторая ниша пуста');
  });

  testWidgets('🔴 ход засчитывается ТАПОМ: товар уезжает в пустую нишу', (tester) async {
    await _boot(tester, state);
    await _tapMove(tester, 'item-5-1', 1);   // 37 из пятой ниши в пустую вторую
    expect(find.byKey(const ValueKey('item-1-0')), findsOneWidget,
        reason: 'товар обязан появиться в нише-цели');
    expect(find.byKey(const ValueKey('item-5-1')), findsNothing, reason: 'и исчезнуть из прежней');
    expect(find.text('1'), findsWidgets, reason: 'счётчик ходов обязан вырасти');
  });

  testWidgets('🔴 ход засчитывается ПЕРЕТАСКИВАНИЕМ — жалоба «не перетаскивается ничего»', (tester) async {
    await _boot(tester, state);
    final from = tester.getCenter(find.byKey(const ValueKey('item-5-1')));
    final to = tester.getCenter(find.byKey(const ValueKey('niche-1')));
    final g = await tester.startGesture(from);
    await tester.pump(const Duration(milliseconds: 50));
    await g.moveTo(to);
    await tester.pump(const Duration(milliseconds: 50));
    await g.up();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('item-1-0')), findsOneWidget,
        reason: 'перетаскивание обязано давать тот же ход, что и тап');
  });

  testWidgets('🔴 три одинаковых товара в нише исчезают и дают очки', (tester) async {
    await _boot(tester, state);
    // 43 лежат в нишах 2 (два) и 5 (один) — переносим третий к паре.
    await _tapMove(tester, 'item-5-0', 2);
    await tester.pump();
    expect(find.byKey(const ValueKey('item-2-0')), findsNothing,
        reason: 'тройка обязана исчезнуть, ниша — опустеть');
    expect(find.text('50'), findsWidgets, reason: 'очки за собранную тройку');
    expect(find.text('1'), findsWidgets, reason: 'ход сделан один');
  });

  testWidgets('🔴 НАРИСОВАНО ТО ЖЕ, ЧТО ПОСЧИТАНО: ниша и товар совпадают с раскладкой', (tester) async {
    /*
     * 🔴 ЗАЧЕМ ЭТА ПРОБА, КОГДА РАСКЛАДКА УЖЕ СВЕРЕНА. Сверка `gsLayout` меряет
     * ФОРМУЛУ, а жалобы тестировщиц («полки мелкие», «половина банок обрезана»)
     * приходят на РИСУНОК. Между ними — код поля, и он ничем не был измерен:
     * мутация «рисуй товар квадратом» или «ставь встык» прошла бы мимо всех
     * зелёных проб. Ровно так в вебе шесть недель зеленел гейт, меривший не ту
     * формулу.
     */
    await _boot(tester, state);
    final field = tester.widget<GoodsField>(find.byType(GoodsField));
    final fieldBox = tester.getSize(find.byType(GoodsField));
    final lay = GsLayout(
      width: fieldBox.width,
      availH: field.fieldHeight,
      cols: field.level.cols,
      rows: field.level.rows,
      capWide: field.board.caps.reduce((a, b) => a > b ? a : b),
      hintH: 0,
      floorItem: field.level.floorItem,
    );

    final niche = tester.getSize(find.byKey(const ValueKey('niche-0')));
    expect(niche.height, lay.nicheH.toDouble(), reason: 'высота ниши — из раскладки');
    expect(niche.width, lay.nicheW(3).toDouble(), reason: 'ширина ниши — из раскладки');

    final item = tester.getSize(find.byKey(const ValueKey('item-0-0')));
    expect(item.width, lay.itemBox(3).w.toDouble());
    expect(item.height, lay.itemBox(3).h.toDouble(),
        reason: 'товар УЗКИЙ И ВЫСОКИЙ (пропорция спрайтов 0,6), а не квадрат');
    expect(item.height, greaterThan(item.width * 1.5), reason: 'квадратный товар терял половину размера');

    // Шкаф не имеет права перерасти поле, пока раскладка не объявила его едущим.
    if (!lay.scrolls) {
      expect(lay.shelfH, lessThanOrEqualTo(field.fieldHeight.ceil()),
          reason: 'нижний ряд под обрез — отчёт 05.09.2026');
    }

    // Нахлёст: соседние товары ПЕРЕКРЫВАЮТСЯ, иначе три встык ужимают товар.
    final a = tester.getRect(find.byKey(const ValueKey('item-0-0')));
    final b = tester.getRect(find.byKey(const ValueKey('item-0-1')));
    expect(b.left, lessThan(a.right), reason: 'товары стоят внахлёст, а не встык');
    final step = b.left - a.left;
    expect(step, closeTo(item.width * (1 - GsLayout.overlap) + GsLayout.cellGap, 1.0),
        reason: 'шаг ряда — тот же, по которому считался размер товара');
  });

  testWidgets('отмена возвращает доску и счётчик ходов', (tester) async {
    await _boot(tester, state);
    await _tapMove(tester, 'item-5-1', 1);
    expect(find.byKey(const ValueKey('item-1-0')), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Отменить'));
    await tester.pump();
    expect(find.byKey(const ValueKey('item-1-0')), findsNothing, reason: 'товар обязан вернуться');
    expect(find.byKey(const ValueKey('item-5-1')), findsOneWidget);
  });
}

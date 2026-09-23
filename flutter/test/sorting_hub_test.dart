import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sorting_hub/screen.dart';
import 'package:psygames_flutter/shell/hub_screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПРОБА РАЗВИЛКИ «СОРТИРОВКА» — и заодно ОБЩЕГО хаба, на котором она стоит.
///
/// Здесь проверяется то, ради чего хаб вообще существует: видно ли восемь игр
/// раздела, стоит ли рядом УРОВЕНЬ из общей памяти (то самое, за чем человек
/// возвращается), и возвращает ли нажатие маршрут наверх — открывать игру должна
/// оболочка, а не хаб.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(
      home: Navigator(
        onGenerateRoute: (_) => MaterialPageRoute(
          builder: (_) => SortingHubScreen(
            state: state,
            isNative: (r) => r == '/games/goods-sort',
          ),
        ),
      ),
    ));
    for (var i = 0; i < 40; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 50));
      if (find.byType(Card).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

void main() {
  setUp(() async {
    // Развилка берёт названия карточек из СЛОВАРЯ (ключи в assets/hubs.json),
    // а не из готовых строк: без него на экране были бы сами ключи.
    await L.load('ru');
    SharedPreferences.setMockInitialValues({
      // Уровни пишет веб-половина ТЕМИ ЖЕ ключами: psygames_<игра>_level_<профиль>.
      'psygames_goods_sort_level_nzt48': '7',
      'psygames_hanoi_level_nzt48': '12',
    });
  });

  testWidgets('развилка показывает все восемь игр раздела с описаниями', (tester) async {
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(find.text('Сортировка'), findsWidgets, reason: 'заголовок развилки');
    expect(find.text('Выбери упражнение'), findsOneWidget);
    // ⚠️ Список ПРОКРУЧИВАЕТСЯ, и нижние карточки не построены, пока не
    // показаны: проверять их надо с прокруткой, иначе проба врёт про «нет».
    for (final name in [
      'Сортировка товаров', 'Пробирки', 'Сортировка шариков', 'Сортировка гаек',
      'Торты', 'Пицца', 'Ханойская башня', 'Башня Лондона',
    ]) {
      await tester.scrollUntilVisible(find.text(name), 120, scrollable: find.byType(Scrollable).first);
      expect(find.text(name), findsOneWidget, reason: 'карточка «$name»');
    }
  });

  testWidgets('🔴 НА КАРТОЧКЕ СТОИТ УРОВЕНЬ ИЗ ОБЩЕЙ ПАМЯТИ, а не единица', (tester) async {
    // Прогресс общий с веб-половиной: человек возвращается в развилку именно
    // чтобы увидеть, где остановился.
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(find.text('ур. 7'), findsOneWidget, reason: 'уровень «Сортировки товаров» из памяти');
    expect(find.text('ур. 1'), findsWidgets, reason: 'у нетронутых игр — первый');
    await tester.scrollUntilVisible(find.text('Ханойская башня'), 120,
        scrollable: find.byType(Scrollable).first);
    expect(find.text('ур. 12'), findsOneWidget, reason: 'и «Ханоя» — тоже из памяти');
  });

  testWidgets('🔴 нажатие ВОЗВРАЩАЕТ МАРШРУТ наверх, а не открывает игру само', (tester) async {
    /*
     * Так же, как это делает оболочка: она ОТКРЫВАЕТ хаб через push и ждёт
     * результат. Хаб не знает ни карты нативных экранов, ни веб-адресов — иначе
     * он стал бы второй оболочкой.
     */
    final state = await SharedState.open();
    Object? popped;
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(
        home: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              popped = await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SortingHubScreen(state: state, isNative: (r) => true),
                ),
              );
            },
            child: const Text('открыть развилку'),
          ),
        ),
      ));
      await tester.pump();
      await tester.tap(find.text('открыть развилку'));
      for (var i = 0; i < 40; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byType(Card).evaluate().isNotEmpty) break;
      }
      /*
       * ⚠️ НАЖАТИЕ И ОЖИДАНИЕ — ВНУТРИ `runAsync`. Продолжение `await push(...)`
       * живёт в НАСТОЯЩЕМ асинхронном мире; выйди из `runAsync` раньше — и оно
       * не выполнится никогда, а проба скажет «хаб ничего не вернул».
       */
      await tester.tap(find.byKey(const ValueKey('hub-card-/games/nut-sort')));
      for (var i = 0; i < 20 && popped == null; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    });
    await tester.pumpAndSettle();
    expect(popped, isA<HubCardTap>());
    expect((popped! as HubCardTap).route, '/games/nut-sort');
  });

  testWidgets('значок «перенесено» стоит только у перенесённых', (tester) async {
    final state = await SharedState.open();
    await _boot(tester, state);
    expect(find.byIcon(Icons.bolt), findsOneWidget,
        reason: 'в пробе нативной объявлена ровно одна игра');
  });
}

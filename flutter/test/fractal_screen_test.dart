import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fractal/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ВО ФРАКТАЛ ИГРАЕТСЯ НАЖАТИЯМИ.
///
/// Правила сверены отдельно лентой живого TS (`fractal_rules_test.dart`). Здесь —
/// ПРОДУКТ: карта с корнем и девятью плитками, вход в дочернюю, ПОДЪЁМ ОБРАТНО
/// (отзыв af047c78), кормление корня снизу и возврат на карту в момент открытия.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      // Шестая ступень — первая с порталом.
      'psygames_sudoku_fractal_level_nzt48': '6',
    });
    state = await SharedState.open();
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: FractalScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('плитка0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  int digitAt(WidgetTester tester, String prefix, int r, int c) {
    final cell = find.byKey(Key('$prefix${r}_$c'));
    if (cell.evaluate().isEmpty) return -1;
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  testWidgets('🔴 карта: корень крупно и девять плиток дочерних', (tester) async {
    await boot(tester);
    expect(find.text('Фрактал'), findsOneWidget);
    expect(find.byKey(const Key('корень0_0')), findsOneWidget);
    expect(find.byKey(const Key('корень8_8')), findsOneWidget);
    for (var i = 0; i < 9; i++) {
      expect(find.byKey(Key('плитка$i')), findsOneWidget, reason: 'плитка $i');
    }
    expect(find.text('0/9'), findsOneWidget, reason: 'открытых сеток на старте нет');
  });

  /// 🔴 ОТЗЫВ af047c78 «Как выйти на уровень обратно»: дверь наверх объявлена явно и
  /// стоит ТОЛЬКО там, где подниматься есть куда.
  testWidgets('🔴 подъём на карту: внутри сетки есть, на карте нет', (tester) async {
    await boot(tester);
    expect(find.byTooltip('На карту'), findsNothing, reason: 'на карте подниматься некуда');

    await tap(tester, find.byKey(const Key('плитка2')));
    expect(find.byKey(const Key('клетка0_0')), findsOneWidget, reason: 'открылась дочерняя');
    expect(find.byKey(const Key('корень0_0')), findsNothing, reason: 'корень уступил место');
    expect(find.byTooltip('На карту'), findsOneWidget, reason: 'дверь наверх на виду');

    await tap(tester, find.byTooltip('На карту'));
    expect(find.byKey(const Key('корень0_0')), findsOneWidget, reason: 'вернулись на карту');
    expect(find.byTooltip('На карту'), findsNothing);
  });

  testWidgets('🔴 цифра встаёт в дочернюю, отмена её снимает', (tester) async {
    await boot(tester);
    await tap(tester, find.byKey(const Key('плитка0')));

    // Первая пустая клетка дочерней.
    late int er, ec;
    outer:
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (digitAt(tester, 'клетка', r, c) == 0) { er = r; ec = c; break outer; }
      }
    }
    await tap(tester, find.byKey(Key('клетка${er}_$ec')));
    await tap(tester, find.byKey(const Key('цифра5')));
    expect(digitAt(tester, 'клетка', er, ec), 5);

    await tap(tester, find.byTooltip('Отменить'));
    expect(digitAt(tester, 'клетка', er, ec), 0, reason: 'отмена вернула клетку');
  });

  /// 🔴 ГЛАВНОЕ ПРАВИЛО ИГРЫ ЖИВЬЁМ: дочерняя, добранная до порога, открывается,
  /// отдаёт цифру наверх и САМА возвращает на карту.
  testWidgets('🔴 порог взят: цифра уходит в корень, экран возвращается на карту', (tester) async {
    await boot(tester);

    // Клетка корня, которую кормит дочерняя 0, — середина её блока: (1,1).
    expect(digitAt(tester, 'корень', 1, 1), 0, reason: 'кормящая клетка пуста на старте');
    // Руками её не заполнить: тычок не выбирает её вовсе.
    await tap(tester, find.byKey(const Key('корень1_1')));
    await tap(tester, find.byKey(const Key('цифра7')));
    expect(digitAt(tester, 'корень', 1, 1), 0, reason: 'кормящую клетку руками не заполняют');

    // Играем дочернюю 0 по решению, пока экран сам не вернётся на карту.
    await tap(tester, find.byKey(const Key('плитка0')));
    var guard = 0;
    while (find.byKey(const Key('клетка0_0')).evaluate().isNotEmpty && guard++ < 90) {
      // Нужна цифра из решения: берём её из подписи плитки — нет, из состояния нельзя.
      // Поэтому идём иначе: перебираем цифры 1..9 в первой пустой клетке и оставляем ту,
      // после которой счётчик прогресса вырос. Это то же, что делает человек.
      late int r, c;
      var found = false;
      for (var rr = 0; rr < 9 && !found; rr++) {
        for (var cc = 0; cc < 9 && !found; cc++) {
          if (digitAt(tester, 'клетка', rr, cc) == 0) { r = rr; c = cc; found = true; }
        }
      }
      if (!found) break;
      await tap(tester, find.byKey(Key('клетка${r}_$c')));
      final before = _progress(tester);
      for (var v = 1; v <= 9; v++) {
        await tap(tester, find.byKey(Key('цифра$v')));
        if (find.byKey(const Key('клетка0_0')).evaluate().isEmpty) break;   // вернулись на карту
        if (_progress(tester) > before) break;                              // цифра верная
      }
    }

    expect(find.byKey(const Key('корень0_0')), findsOneWidget, reason: 'экран сам вернулся на карту');
    expect(digitAt(tester, 'корень', 1, 1), greaterThan(0),
        reason: 'цифра пришла снизу в кормящую клетку');
    expect(find.text('1/9'), findsOneWidget, reason: 'одна сетка открыта');
  });

  testWidgets('🔴 тесный экран: карта помещается без прокрутки', (tester) async {
    await tester.binding.setSurfaceSize(const Size(360, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await boot(tester);
    // Переполнение каркаса Flutter отдаёт исключением — его ловит сам прогон.
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('плитка8')), findsOneWidget, reason: 'плитки на месте');
    final rect = tester.getRect(find.byKey(const Key('плитка8')));
    expect(rect.bottom, lessThanOrEqualTo(640.0), reason: 'плитки не уехали за низ: $rect');
  });
}

/// Прогресс открытой сетки — число из крышки показателей, вида «12/23».
int _progress(WidgetTester tester) {
  final texts = tester.widgetList<Text>(find.byType(Text));
  for (final t in texts) {
    final s = t.data ?? '';
    final m = RegExp(r'^(\d+)/(\d+)$').firstMatch(s);
    if (m != null && int.parse(m.group(2)!) > 9) return int.parse(m.group(1)!);
  }
  return -1;
}

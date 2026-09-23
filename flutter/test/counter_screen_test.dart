import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/counter/model.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/games/counter/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ПАРТИЯ ИГРАЕТСЯ НАЖАТИЯМИ ПО КЛЕТКАМ. Числа проба читает С ЭКРАНА и сама
/// ищет пару под цель — как человек, а не подглядывая в генератор.
void main() {
  late SharedState state;
  var opens = 0;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    await L.load('ru');
  });

  Future<void> open(WidgetTester tester, {int level = 1, Size? screen, String seed = 'проба'}) async {
    if (screen != null) {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = screen;
      addTearDown(tester.view.reset);
    }
    SharedPreferences.setMockInitialValues({
      if (level != 1) '${SharedState.prefix}counter_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: CounterScreen(key: ValueKey('open${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  /// Значение показателя читается рядом с ЕГО значком: голая цифра на экране
  /// встречается много где, и проверка по ней прошла бы и при незасчитанной ошибке.
  int hudValue(WidgetTester tester, IconData icon) {
    final row = find.ancestor(of: find.byIcon(icon), matching: find.byType(Row)).first;
    return int.parse(tester.widget<Text>(find.descendant(of: row, matching: find.byType(Text))).data!);
  }

  int targetOnScreen(WidgetTester tester) =>
      int.parse(tester.widget<Text>(find.byKey(const Key('target'))).data!);

  int sumOnScreen(WidgetTester tester) =>
      int.parse(tester.widget<Text>(find.byKey(const Key('sum'))).data!.split(' ').last);

  List<int> cellsOnScreen(WidgetTester tester) {
    final out = <int>[];
    for (var i = 0; i < 100; i += 1) {
      final f = find.byKey(Key('cell$i'));
      if (f.evaluate().isEmpty) break;
      out.add(int.parse(tester.widget<Text>(find.descendant(of: f, matching: find.byType(Text))).data!));
    }
    return out;
  }

  /// Пара или тройка клеток, дающая цель, — перебором по прочитанному с экрана.
  List<int> solve(List<int> cells, int target) {
    for (var i = 0; i < cells.length; i += 1) {
      for (var j = i + 1; j < cells.length; j += 1) {
        if (cells[i] + cells[j] == target) return [i, j];
        for (var k = j + 1; k < cells.length; k += 1) {
          if (cells[i] + cells[j] + cells[k] == target) return [i, j, k];
        }
      }
    }
    return const [];
  }

  Future<void> tapCells(WidgetTester tester, List<int> idx) async {
    for (final i in idx) {
      await tester.tap(find.byKey(Key('cell$i')));
      await tester.pump();
    }
  }

  testWidgets('🔴 раунд проходится нажатиями: сумма принимается САМА, без кнопки', (tester) async {
    await open(tester);
    final cells = cellsOnScreen(tester);
    final target = targetOnScreen(tester);
    expect(cells.length, 9, reason: 'на первом уровне сетка 3×3');
    final move = solve(cells, target);
    expect(move, isNotEmpty, reason: 'цель $target не собирается из $cells');
    await tapCells(tester, move);
    expect(find.byKey(const Key('feedback')), findsOneWidget, reason: 'нет отклика на верную сумму');
    // Счётчик раунда сдвигается только после паузы отклика.
    expect(find.text('1/10'), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pump();
    expect(find.text('2/10'), findsOneWidget, reason: 'раунд не сменился после верного ответа');
  });

  testWidgets('🔴 ЗАЧЁТ ПО СУММЕ, а не по задуманным клеткам', (tester) async {
    // Ищем цель, которая собирается ДВУМЯ РАЗНЫМИ парами, и отвечаем второй.
    for (var attempt = 1; attempt <= 12; attempt += 1) {
      await open(tester, seed: 'сумма$attempt');
      final cells = cellsOnScreen(tester);
      final target = targetOnScreen(tester);
      final pairs = <List<int>>[];
      for (var i = 0; i < cells.length; i += 1) {
        for (var j = i + 1; j < cells.length; j += 1) {
          if (cells[i] + cells[j] == target) pairs.add([i, j]);
        }
      }
      if (pairs.length < 2) continue;
      await tapCells(tester, pairs.last);
      expect(find.byKey(const Key('feedback')), findsOneWidget,
          reason: 'вторая верная пара не засчитана: $cells → $target');
      return;
    }
    fail('за 12 раздач не нашлось цели с двумя парами — проба ничего не померила');
  });

  testWidgets('перебор — ошибка, а выбор гаснет не сразу', (tester) async {
    await open(tester, seed: 'перебор');
    final cells = cellsOnScreen(tester);
    final target = targetOnScreen(tester);
    // Набираем заведомо больше цели.
    final idx = <int>[];
    var sum = 0;
    final order = List.generate(cells.length, (i) => i)
      ..sort((a, b) => cells[b].compareTo(cells[a]));
    for (final i in order) {
      idx.add(i);
      sum += cells[i];
      if (sum > target) break;
    }
    expect(sum, greaterThan(target), reason: 'не удалось перебрать цель');
    await tapCells(tester, idx);
    expect(hudValue(tester, Icons.error_outline), 1, reason: 'ошибка не засчитана');

    // 🔴 ЗАМЕР СТОИТ ТАМ, ГДЕ ПРАВИЛО РАБОТАЕТ — ВНУТРИ ОКНА 300 мс.
    // Задержка нужна ровно затем, чтобы нажатие, попавшее в окно, не потерялось;
    // проверка «после окна пусто» одна этого не ловит — мгновенный сброс проходил
    // бы её так же (замер 23.09.2026: мутация «Duration.zero» не краснела).
    await tester.pump(const Duration(milliseconds: 150));
    expect(sumOnScreen(tester), greaterThan(target),
        reason: 'выбор погас внутри окна — нажатие в эти 300 мс пропадёт');
    final free = List.generate(cells.length, (i) => i).firstWhere((i) => !idx.contains(i));
    final before = sumOnScreen(tester);
    await tester.tap(find.byKey(Key('cell$free')));
    await tester.pump();
    expect(sumOnScreen(tester), before + cells[free],
        reason: 'нажатие внутри окна сброса потеряно');

    // Окно вышло — выбор гаснет.
    await tester.pump(const Duration(milliseconds: 350));
    expect(sumOnScreen(tester), 0, reason: 'выбор не сбросился после окна');
  });

  testWidgets('просрочка раунда — ошибка и переход дальше', (tester) async {
    await open(tester);
    expect(find.text('1/10'), findsOneWidget);
    // Окно первого уровня — 15 с; ждём его целиком, не нажимая.
    await tester.pump(const Duration(seconds: 15));
    await tester.pump();
    expect(find.byKey(const Key('feedback')), findsOneWidget, reason: 'нет отклика на просрочку');
    await tester.pump(const Duration(milliseconds: 700));
    await tester.pump();
    expect(find.text('2/10'), findsOneWidget, reason: 'после просрочки раунд не сменился');
  });

  testWidgets('🔴 уровень берётся при 8 решённых из 10, а при 7 — нет', (tester) async {
    Future<bool> play(int solved) async {
      await open(tester, seed: 'итог$solved');
      for (var r = 1; r <= 10; r += 1) {
        if (r <= solved) {
          final move = solve(cellsOnScreen(tester), targetOnScreen(tester));
          await tapCells(tester, move);
          await tester.pump(const Duration(milliseconds: 800));
        } else {
          await tester.pump(const Duration(seconds: 15));
          await tester.pump(const Duration(milliseconds: 700));
        }
        await tester.pump();
      }
      expect(find.byKey(const Key('result')), findsOneWidget, reason: 'партия не закончилась');
      return find.text('Следующий').evaluate().isNotEmpty;
    }

    expect(await play(8), isTrue, reason: '8 из 10 — это ровно порог прохода');
    expect(await play(7), isFalse, reason: '7 из 10 — недобор, уровень не берётся');
  });

  testWidgets('экран открывается на ТОМ уровне, что записан в лестнице', (tester) async {
    await open(tester, level: 8);
    expect(cellsOnScreen(tester).length, 36, reason: 'на L8 сетка 6×6');
    expect(find.text('8'), findsWidgets);
  });

  testWidgets('🔴 сетка помещается в поле и не вылезает за экран', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      for (final level in [1, 8, 15]) {
        await open(tester, level: level, screen: screen);
        final cells = cellsOnScreen(tester);
        expect(cells, isNotEmpty);
        final gs = counterLevelParams(level).gridSize;
        expect(cells.length, gs * gs);
        // 🔴 МЕРИМ ПО ПОЛЮ, А НЕ ПО КРАЮ ЭКРАНА. Wrap о переполнении не сообщает —
        // просто рисует ряды поверх нижних полос, и проверка «внутри экрана»
        // такую сетку пропускает (замер 23.09.2026: мутация «место без вычета
        // шапки» не краснела). Нижняя граница поля — верх ряда значков под ним:
        // до строки подсказки остаётся ещё полоса значков, и этот запас прятал
        // сетку, вылезшую из поля на десяток точек.
        final hint = tester.getRect(find.byType(AuxBar));
        // ⚠️ ЦЕЛЬ ОБЯЗАНА БЫТЬ ВИДНА, а не просто существовать в дереве. Шапка
        // поля ужимается FittedBox'ом, и при нулевом бюджете число ужалось бы в
        // точку: проба, которая только ЧИТАЕТ текст, осталась бы зелёной
        // (замер 23.09.2026 — мутация «нет бюджета шапки» не краснела).
        final target = tester.getRect(find.byKey(const Key('target')));
        expect(target.height, greaterThanOrEqualTo(12),
            reason: 'цель ужата до ${target.height.toStringAsFixed(1)} px, $screen L$level');
        for (var i = 0; i < cells.length; i += 1) {
          final r = tester.getRect(find.byKey(Key('cell$i')));
          expect(r.left, greaterThanOrEqualTo(-0.01), reason: 'клетка $i ушла влево, $screen L$level');
          expect(r.right, lessThanOrEqualTo(screen.width + 0.01),
              reason: 'клетка $i ушла вправо, $screen L$level');
          expect(r.bottom, lessThanOrEqualTo(screen.height + 0.01),
              reason: 'клетка $i ушла за нижний край на ${r.bottom - screen.height}, $screen L$level');
          expect(r.bottom, lessThanOrEqualTo(hint.top + 0.01),
              reason: 'клетка $i вылезла из поля на ${r.bottom - hint.top}, $screen L$level');
          expect(r.width, greaterThanOrEqualTo(27.9), reason: 'клетка $i мельче пола 28');
        }
        // Сетка выложена рядами по gridSize: у первой строки один верх.
        final first = tester.getRect(find.byKey(const Key('cell0')));
        final lastInRow = tester.getRect(find.byKey(Key('cell${gs - 1}')));
        expect(lastInRow.top, closeTo(first.top, 0.01),
            reason: 'первая строка развалилась, $screen L$level');
        final secondRow = tester.getRect(find.byKey(Key('cell$gs')));
        expect(secondRow.top, greaterThan(first.top),
            reason: 'сетка выложена в одну строку, $screen L$level');
      }
    }
  });

  testWidgets('🔴 на тесном экране клетки не пропадают: поле прокручивается', (tester) async {
    // Пол клетки 28 px (порог нажатия) — на 320×480 сетка 9×9 в поле физически
    // не помещается. Тогда правило такое: домотать можно, недоступных клеток нет.
    await open(tester, level: 15, screen: const Size(320, 480));
    expect(cellsOnScreen(tester).length, 81);
    final last = find.byKey(const Key('cell80'));
    await tester.scrollUntilVisible(last, 60, scrollable: find.byType(Scrollable).first);
    await tester.pump();
    final r = tester.getRect(last);
    expect(r.bottom, lessThanOrEqualTo(480.01), reason: 'последняя клетка недостижима прокруткой');
    expect(r.width, greaterThanOrEqualTo(27.9), reason: 'клетка ужата ниже порога нажатия');
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПАРТИЯ В «КОШКАХ» ИГРАЕТСЯ НАЖАТИЯМИ, А НЕ ВЫЗОВОМ ПРАВИЛ.
///
/// Правила и генератор сверены отдельно (`cats_rules_test.dart`,
/// `cats_generator_test.dart`). Здесь проверяется ПРОДУКТ: доска появляется, тычок
/// гоняет клетку по кругу, кошка не на своём месте отнимает жизнь, партия доигрывается
/// до победы и ступень растёт.
///
/// ⚠️ ПРОБА ЗНАЕТ РАЗГАДКУ ЧЕСТНО: зерно экрана складывается из номера уровня и номера
/// попытки (`cats|L1|A0`), и проба собирает ту же задачу тем же генератором. Читать
/// разгадку из виджета было бы проверкой кода этим же кодом.
void main() {
  late SharedState state;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
    await L.load('ru');
  });

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: CatsScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 50));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  /// Та же задача, что соберёт экран на первом уровне первой попытки.
  final first = generateCats(6, 'cats|L1|A0')!;

  Future<void> tapCell(WidgetTester tester, int r, int c, {int times = 1}) async {
    for (var i = 0; i < times; i++) {
      await tester.tap(find.byKey(Key('cell_${r}_$c')));
      await tester.pump();
    }
  }

  testWidgets('🔴 тычок гоняет клетку по кругу: пусто → ✕ → кошка → пусто', (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('cross_0_0')), findsNothing);
    expect(find.byKey(const Key('cat_0_0')), findsNothing);

    await tapCell(tester, 0, 0);
    expect(find.byKey(const Key('cross_0_0')), findsOneWidget, reason: 'первый тычок — пометка ✕');

    await tapCell(tester, 0, 0);
    expect(find.byKey(const Key('cat_0_0')), findsOneWidget, reason: 'второй — кошка');
    expect(find.byKey(const Key('cross_0_0')), findsNothing);

    await tapCell(tester, 0, 0);
    expect(find.byKey(const Key('cat_0_0')), findsNothing, reason: 'третий — снова пусто');
  });

  /// ⚠️ ЖИЗНИ ЧИТАЮТСЯ У СВОЕГО СЧЁТЧИКА, А НЕ ПОИСКОМ ЦИФРЫ ПО ЭКРАНУ.
  /// Первая редакция писала `find.text('2')` и была ЗЕЛЁНОЙ при мутации «ошибка не
  /// отнимает жизнь»: двойку на экране рисовал счётчик отмен, у которого к тому
  /// моменту как раз два хода. Счётчик каркаса подписан для чтеца экрана строкой
  /// «подпись: значение» — по ней и ищем.
  testWidgets('🔴 ✕ не стоит жизни, а кошка не на своём месте — стоит', (tester) async {
    final semantics = tester.ensureSemantics();
    await boot(tester);
    final lives = L.t('label_lives');
    final wrong = [for (var c = 0; c < 6; c++) c].firstWhere((c) => c != first.board.solution[0]);

    // Пометка ✕ — бухгалтерия игрока, жизни на месте.
    await tapCell(tester, 0, wrong);
    // ⚠️ ИЩЕМ ОБРАЗЦОМ, А НЕ ТОЧНОЙ СТРОКОЙ: подпись счётчика сливается с текстом
    // внутри него, и у узла оказывается «Жизни: 3\n3». Точное равенство на этом
    // ломается, хотя человек видит ровно то, что нужно.
    expect(find.bySemanticsLabel(RegExp('${RegExp.escape(lives)}: 3')), findsOneWidget,
        reason: 'три жизни целы после пометки');

    // Вторым тычком та же клетка становится кошкой — и это ошибка.
    await tapCell(tester, 0, wrong);
    expect(find.bySemanticsLabel(RegExp('${RegExp.escape(lives)}: 2')), findsOneWidget,
        reason: 'жизнь снята за кошку не на своём месте');
    semantics.dispose();
  });

  testWidgets('🔴 партия доигрывается нажатиями до победы, и ступень растёт', (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('next')), findsNothing);

    for (var r = 0; r < 6; r++) {
      await tapCell(tester, r, first.board.solution[r], times: 2);
    }

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'победа видна человеку');
    await tester.pump(const Duration(milliseconds: 50));
    expect(state.get('${SharedState.prefix}cats_level_nzt48'), '2',
        reason: 'ступень записана в общую память');
  });

  testWidgets('🔴 три ошибки кончают партию, и следующая доска ДРУГАЯ', (tester) async {
    await boot(tester);
    var made = 0;
    for (var r = 0; r < 6 && made < 3; r++) {
      for (var c = 0; c < 6 && made < 3; c++) {
        if (first.board.solution[r] == c) continue;
        await tapCell(tester, r, c, times: 2);
        made++;
      }
    }

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'партия кончилась');
    await tester.pump(const Duration(milliseconds: 50));
    // 🔴 НОМЕР ПОПЫТКИ ВХОДИТ В ЗЕРНО — тот же приём, что вернул судоку новую доску
    // после проигрыша (решение Дениса 23.09). Без него человек получал бы ту же самую.
    expect(state.get('${SharedState.prefix}cats_try_nzt48'), '1',
        reason: 'следующая партия соберётся с другим зерном');
    expect(generateCats(6, 'cats|L1|A1')!.board.regions, isNot(first.board.regions),
        reason: 'и доска действительно другая');
  });

  testWidgets('🔴 отмена возвращает клетку, а подсказка ставит кошку на место',
      (tester) async {
    final semantics = tester.ensureSemantics();
    await boot(tester);
    await tapCell(tester, 0, 0);
    expect(find.byKey(const Key('cross_0_0')), findsOneWidget);
    await tester.tap(find.byTooltip(L.t('btn_undo')));
    await tester.pump();
    expect(find.byKey(const Key('cross_0_0')), findsNothing, reason: 'отмена сняла пометку');

    await tester.tap(find.byTooltip(L.t('btn_hint')));
    await tester.pump();
    final cats = find.byWidgetPredicate(
        (w) => w is Text && w.key != null && w.key.toString().contains('cat_'));
    expect(cats, findsOneWidget, reason: 'подсказка поставила одну кошку');
    expect(find.bySemanticsLabel(RegExp('${RegExp.escape(L.t('label_lives'))}: 3')),
        findsOneWidget, reason: 'подсказка — не ошибка, жизни целы');
    semantics.dispose();
  });

  testWidgets('🔴 доска влезает в экран на 403×873 и на 360×640', (tester) async {
    for (final size in [const Size(403, 873), const Size(360, 640)]) {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);

      await boot(tester);
      expect(tester.takeException(), isNull, reason: 'переполнение на $size');
      expect(find.byKey(const Key('cell_5_5')), findsOneWidget,
          reason: 'на $size видна дальняя клетка доски');
    }
  });

  testWidgets('подписи берутся из словаря, зашитого текста в экране нет', (tester) async {
    await boot(tester);
    expect(find.text(L.t('catsTitle')), findsWidgets);
    expect(L.t('catsTitle'), isNot('catsTitle'), reason: 'ключ заведён в словаре');
    expect(L.t('catsRuleTouch'), isNot('catsRuleTouch'));
  });
}

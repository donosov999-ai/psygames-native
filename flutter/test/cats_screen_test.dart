import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/ladder.dart';
import 'package:psygames_flutter/games/cats/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ПАРТИЯ В «КОШКАХ» ИГРАЕТСЯ НАЖАТИЯМИ, А НЕ ВЫЗОВОМ ПРАВИЛ.
///
/// Правила и генератор сверены отдельно (`cats_rules_test.dart`,
/// `cats_generator_test.dart`). Здесь проверяется ПРОДУКТ: доска появляется, короткий
/// тычок ставит и снимает ✕, долгое нажатие вскрывает кошку (мимо — красный ✕ и минус
/// жизнь, с вибрацией), партия доигрывается до победы и ступень растёт.
///
/// ⚠️ 02.10.2026, замечание Дениса: тычок гонял клетку по кругу пусто → ✕ → кошка, и
/// кошка вставала в ЛЮБУЮ клетку — неверная оставалась на доске, пока не расставишь всех.
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
  final first = dealCatsLevel(1, 'cats|L1|A0')!.puzzle;

  Future<void> tapCell(WidgetTester tester, int r, int c, {int times = 1}) async {
    for (var i = 0; i < times; i++) {
      await tester.tap(find.byKey(Key('cell_${r}_$c')));
      await tester.pump();
    }
  }

  /// Долгое нажатие — вскрыть кошку.
  Future<void> reveal(WidgetTester tester, int r, int c) async {
    await tester.longPress(find.byKey(Key('cell_${r}_$c')));
    await tester.pump();
  }

  testWidgets('🔴 короткий тычок — только пометка ✕: ставит и снимает, кошку не ставит никогда', (tester) async {
    await boot(tester);
    final right = first.board.solution[0];
    for (var i = 0; i < 4; i++) {
      await tapCell(tester, 0, right);
      expect(find.byKey(Key('cat_0_$right')), findsNothing, reason: 'тычок $i не ставит кошку даже на её место');
      expect(find.byKey(Key('cross_0_$right')), i.isEven ? findsOneWidget : findsNothing,
          reason: 'тычок ${i + 1}: ✕ ${i.isEven ? 'стоит' : 'снят'}');
    }
  });

  testWidgets('🔴 долгое нажатие вскрывает: в разгадке — кошка насовсем, мимо — красный ✕ без кошки', (tester) async {
    await boot(tester);
    final right = first.board.solution[0];
    final wrong = [for (var c = 0; c < 6; c++) c].firstWhere((c) => c != right);

    await tapCell(tester, 0, right);   // сначала пометка — вскрытие её заменяет
    await reveal(tester, 0, right);
    expect(find.byKey(Key('cat_0_$right')), findsOneWidget, reason: 'кошка вскрыта на своём месте');
    await tapCell(tester, 0, right);
    expect(find.byKey(Key('cat_0_$right')), findsOneWidget, reason: 'вскрытая кошка тычком не снимается');

    await reveal(tester, 0, wrong);
    expect(find.byKey(Key('cat_0_$wrong')), findsNothing, reason: 'мимо — кошка НЕ ставится');
    expect(find.byKey(Key('miss_0_$wrong')), findsOneWidget, reason: 'мимо — красный ✕');
    await tapCell(tester, 0, wrong);
    expect(find.byKey(Key('miss_0_$wrong')), findsOneWidget, reason: 'промах тычком не стирается');
  });

  testWidgets('🔴 вскрытие отзывается вибрацией: в разгадке — средней, мимо — сильной; тумблер выключен — тишина',
      (tester) async {
    final calls = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'HapticFeedback.vibrate') calls.add('${call.arguments}');
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await boot(tester);
    final right = first.board.solution[0];
    final wrong = [for (var c = 0; c < 6; c++) c].firstWhere((c) => c != right);

    await tapCell(tester, 1, 0);
    final afterTap = calls.length;
    await reveal(tester, 0, right);
    await reveal(tester, 0, wrong);
    expect(calls.sublist(afterTap).where((c) => c.contains('Impact')).toList(),
        ['HapticFeedbackType.mediumImpact', 'HapticFeedbackType.heavyImpact'],
        reason: 'кошка — средний толчок, промах — сильный');

    state.set('${SharedState.prefix}haptic_enabled', 'false');
    final before = calls.length;
    await reveal(tester, 2, first.board.solution[2]);
    expect(calls.sublist(before).where((c) => c.contains('Impact')), isEmpty,
        reason: 'вибрация выключена в настройках — экран молчит');
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

    // Вскрытие той же клетки — кошки там нет, это ошибка.
    await reveal(tester, 0, wrong);
    expect(find.bySemanticsLabel(RegExp('${RegExp.escape(lives)}: 2')), findsOneWidget,
        reason: 'жизнь снята за вскрытие мимо');
    semantics.dispose();
  });

  testWidgets('🔴 партия доигрывается нажатиями до победы, и ступень растёт', (tester) async {
    await boot(tester);
    expect(find.byKey(const Key('next')), findsNothing);

    for (var r = 0; r < 6; r++) {
      await reveal(tester, r, first.board.solution[r]);
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
        await reveal(tester, r, c);
        made++;
      }
    }

    expect(find.byKey(const Key('next')), findsOneWidget, reason: 'партия кончилась');
    await tester.pump(const Duration(milliseconds: 50));
    // 🔴 НОМЕР ПОПЫТКИ ВХОДИТ В ЗЕРНО — тот же приём, что вернул судоку новую доску
    // после проигрыша (решение Дениса 23.09). Без него человек получал бы ту же самую.
    expect(state.get('${SharedState.prefix}cats_try_nzt48'), '1',
        reason: 'следующая партия соберётся с другим зерном');
    expect(dealCatsLevel(1, 'cats|L1|A1')!.puzzle.board.regions, isNot(first.board.regions),
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
    expect(L.t('catsHowPress'), isNot('catsHowPress'), reason: 'как играть: долгое нажатие и ✕');
  });
}

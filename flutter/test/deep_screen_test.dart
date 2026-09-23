import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/deep/screen.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// «БЕЗДНА» ИГРАЕТСЯ НАЖАТИЯМИ — И ГЛАВНОЕ, ПЕРЕЖИВАЕТ ВЫХОД.
///
/// Партия здесь идёт неделями, поэтому проверяются два свойства, без которых она
/// бессмысленна: ПРОДОЛЖЕНИЕ (снимок пишется в тот же ключ и в том же виде, что у
/// веб-версии) и ПОДЪЁМ НАВЕРХ (провалился вниз — вернись).
void main() {
  late SharedState state;

  Future<void> boot(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: DeepScreen(state: state)));
      for (var i = 0; i < 60; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> tap(WidgetTester tester, Finder f) async {
    await tester.tap(f, warnIfMissed: false);
    await tester.pump();
  }

  int digitAt(WidgetTester tester, int r, int c) {
    final cell = find.byKey(Key('cell_${r}_$c'));
    final text = find.descendant(of: cell, matching: find.byType(Text));
    if (text.evaluate().isEmpty) return 0;
    final s = tester.widget<Text>(text.first).data ?? '';
    return s.isEmpty ? 0 : int.parse(s);
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    state = await SharedState.open();
  });

  testWidgets('🔴 доска появляется, и партия сразу записана в снимок', (tester) async {
    await boot(tester);
    expect(find.text('Бездна'), findsOneWidget);
    expect(find.byKey(const Key('cell_8_8')), findsOneWidget);
    expect(find.text('1/2'), findsOneWidget, reason: 'глубина: корень из двух слоёв');

    final raw = state.get('psygames_resume_sudoku_fractal_deep_nzt48');
    expect(raw, isNotNull, reason: 'снимок пишется сразу, а не при выходе');
    final env = jsonDecode(raw!) as Map<String, Object?>;
    expect(env['v'], 1, reason: 'версия снимка та же, что у веб-версии');
    final s = (env['state'] as Map).cast<String, Object?>();
    expect(s['preset'], 'scout');
    expect((s['seed'] as String).isNotEmpty, isTrue);
    expect(s['path'], '');
    expect((s['history'] as Map).containsKey('past'), isTrue,
        reason: 'лента ходов в том же виде, что у веб-версии');
  });

  /// 🔴 ПРОВАЛ ВНИЗ И ПОДЪЁМ ОБРАТНО — то, без чего дерево становится ловушкой.
  testWidgets('🔴 тычок в кормимую клетку уводит вниз, «Наверх» возвращает', (tester) async {
    await boot(tester);
    expect(find.byTooltip('Наверх'), findsNothing, reason: 'на корне подниматься некуда');

    // Кормимая клетка помечена стрелкой вниз — туда и тычем.
    final arrow = find.byIcon(Icons.arrow_downward);
    expect(arrow, findsWidgets, reason: 'кормимые клетки видны человеку');
    await tap(tester, arrow.first);

    expect(find.text('2/2'), findsOneWidget, reason: 'ушли на слой ниже');
    expect(find.byTooltip('Наверх'), findsOneWidget);

    await tap(tester, find.byTooltip('Наверх'));
    expect(find.text('1/2'), findsOneWidget, reason: 'вернулись на слой выше');
    expect(find.byTooltip('Наверх'), findsNothing);
  });

  testWidgets('🔴 цифра встаёт, отмена снимает, и всё это попадает в снимок', (tester) async {
    await boot(tester);
    // Первая пустая клетка, не кормимая (у кормимых стоит стрелка).
    late int er, ec;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        final cell = find.byKey(Key('cell_${r}_$c'));
        final hasArrow = find.descendant(of: cell, matching: find.byIcon(Icons.arrow_downward));
        if (digitAt(tester, r, c) == 0 && hasArrow.evaluate().isEmpty) {
          er = r; ec = c; found = true;
        }
      }
    }
    expect(found, isTrue, reason: 'нашлась пустая клетка для хода');

    await tap(tester, find.byKey(Key('cell_${er}_$ec')));
    await tap(tester, find.byKey(const Key('digit7')));
    expect(digitAt(tester, er, ec), 7);

    final saved = jsonDecode(state.get('psygames_resume_sudoku_fractal_deep_nzt48')!)
        as Map<String, Object?>;
    final past = (((saved['state'] as Map)['history'] as Map)['past'] as List);
    expect(past.length, 1, reason: 'ход записан в ленту снимка');

    await tap(tester, find.byTooltip('Отменить'));
    expect(digitAt(tester, er, ec), 0, reason: 'отмена вернула клетку');
  });

  /// 🔴 ПРОДОЛЖЕНИЕ: партия поднимается из снимка ровно той же.
  testWidgets('🔴 снимок веб-версии продолжается: то же зерно, тот же узел, те же цифры',
      (tester) async {
    const seed = 'бездна-проверка-продолжения';
    SharedPreferences.setMockInitialValues({
      'psygames_resume_sudoku_fractal_deep_nzt48': jsonEncode({
        'v': 1,
        'savedAt': 1758600000000,
        'state': {
          'preset': 'trek',
          'band': 2,
          'rating': 2.6,
          'seed': seed,
          'path': '',
          'grids': <String, Object?>{},
          'marks': <String, Object?>{},
          'history': {'past': <Object?>[], 'future': <Object?>[]},
        },
      }),
    });
    state = await SharedState.open();
    await boot(tester);

    expect(find.text('1/3'), findsOneWidget, reason: 'пресет «Поход» — три слоя');
    expect(find.text('3/6'), findsOneWidget, reason: 'ступень из снимка, а не по умолчанию');

    // ⚠️ ПРОВЕРЯТЬ НАДО ТО, ЧТО ЗАПИСЫВАЕТ ЭКРАН, А НЕ ТО, ЧТО ПОЛОЖИЛА ПРОБА.
    // Первая редакция читала снимок сразу после загрузки — то есть свой же исходный
    // текст, и мутация «затирать чужие поля» прошла мимо. Поэтому сначала делаем
    // действие, которое заставляет экран ПЕРЕЗАПИСАТЬ снимок.
    await tap(tester, find.byIcon(Icons.arrow_downward).first);
    expect(find.text('2/3'), findsOneWidget, reason: 'ушли вниз — снимок перезаписан');

    final saved = jsonDecode(state.get('psygames_resume_sudoku_fractal_deep_nzt48')!)
        as Map<String, Object?>;
    final s = (saved['state'] as Map).cast<String, Object?>();
    expect(s['seed'], seed, reason: 'зерно то же — иначе дерево пересоберётся другим');
    expect(s.containsKey('marks'), isTrue, reason: 'поля, которых мы не умеем, не затираются');
  });
}

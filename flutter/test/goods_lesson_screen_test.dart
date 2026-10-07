import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/goods_sort/board.dart';
import 'package:psygames_flutter/games/goods_sort/model.dart';
import 'package:psygames_flutter/games/goods_sort/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 РАЗБОР ТОВАРОВ ОТКРЫВАЕТСЯ НАЖАТИЕМ И ИДЁТ ПО ПУТИ — ПРОВЕРЯЕТСЯ ПАЛЬЦЕМ.
///
/// ⚠️ ПОЧЕМУ ЭТОГО НЕ ХВАТАЛО ПЕРЕПИСИ. Общий гейт (`lesson_census_test.dart`)
/// поднимает каждый экран и ищет КНОПКУ — и он был зелёным на товарах, когда
/// разбор показывал три карточки с правилом и ОДНИМ ходом. Кнопка есть, а
/// решения нет: «зелёный набор проб ≠ целый экран». Здесь меряется другое —
/// сколько шагов в разборе и чем они подписаны.
///
/// Экран телефонный (390×844): от ширины зависит маска сетки, а значит и доска.
Future<void> _boot(WidgetTester tester, SharedState state) async {
  tester.view.physicalSize = const Size(780, 1688);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  await tester.runAsync(() async {
    await tester.pumpWidget(MaterialApp(home: GoodsSortScreen(state: state)));
    for (var i = 0; i < 60; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 30));
      if (find.byType(GoodsField).evaluate().isNotEmpty) break;
    }
  });
  await tester.pump();
}

Future<void> _openLesson(WidgetTester tester) async {
  await tester.runAsync(() async {
    await tester.tap(find.byKey(const Key('game-lesson')));
    for (var i = 0; i < 80; i++) {
      await tester.pump(const Duration(milliseconds: 50));
      await Future<void>.delayed(const Duration(milliseconds: 30));
      if (find.byKey(const Key('lesson-counter')).evaluate().isNotEmpty) break;
    }
  });
  // ⚠️ ПЕРЕХОД ОБЯЗАН ДОИГРАТЬ. Пока страница разбора ВЪЕЗЖАЕТ справа, её кнопки
  // стоят за краем экрана, и `tap` по ним промахивается МОЛЧА — проба зеленеет,
  // ничего не пролистав. Замер 24.09.2026: на середине перехода «Следующий шаг»
  // лежал в 357..405 при ширине 390, то есть целиком снаружи.
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  late SharedState state;

  setUpAll(() async => L.load('ru'));

  setUp(() async {
    SharedPreferences.setMockInitialValues({'psygames_active_profile': 'nzt48'});
    state = await SharedState.open();
  });

  tearDown(LessonUsed.reset);

  testWidgets('🔴 разбор идёт ПУТЁМ до решения, а не показывает один ход', (tester) async {
    await _boot(tester, state);
    expect(find.byKey(const Key('game-lesson')), findsOneWidget, reason: 'кнопки разбора нет');
    await _openLesson(tester);

    expect(find.byKey(const Key('lesson-counter')), findsOneWidget, reason: 'плеер не открылся');
    final counter = tester.widget<Text>(find.byKey(const Key('lesson-counter'))).data!;
    // «Шаг 1 из N» — N и есть длина разбора.
    final total = int.parse(RegExp(r'(\d+)\s*$').firstMatch(counter)!.group(1)!);
    // ⚠️ ПОРОГ НЕ С ПОТОЛКА: прежняя заглушка давала РОВНО 3 шага (правило, один
    // ход, правило про ёмкость). Всё, что больше четырёх, заглушкой быть не
    // может, а настоящий путь L1 по замеру решателя длиннее десяти.
    expect(total, greaterThan(4),
        reason: 'шагов $total — это снова карточки с правилом, а не путь решателя');
  });

  testWidgets('🔴 шаги подписаны ПРИЧИНОЙ хода, а не пустотой и не ключом словаря', (tester) async {
    await _boot(tester, state);
    await _openLesson(tester);

    // Правило на первом шаге.
    expect(find.byKey(const Key('lesson-text')), findsOneWidget);
    var first = tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '';
    expect(first, isNotEmpty);

    // Дальше — причины ходов. Листаем и собираем подписи.
    // Листаем ВПЕРЁД кнопкой. Промах по кнопке делаем смертельным: молчаливый
    // промах и был бы «проба стоит не там, где правило работает».
    final next = find.byKey(const Key('lesson-next'));
    expect(tester.getRect(next).right, lessThanOrEqualTo(390),
        reason: 'кнопка шага за правым краем — листать нечем');
    final seen = <String>{first};
    for (var i = 0; i < 8; i++) {
      await tester.tap(next, warnIfMissed: true);
      await tester.pump();
      final t = tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '';
      seen.add(t);
    }

    for (final t in seen) {
      expect(t.trim(), isNotEmpty, reason: 'шаг без подписи');
      // 🔴 `L.t` на промахе возвращает САМ КЛЮЧ и не падает. Подпись, состоящая
      // из латиницы без пробелов, — это не текст, а непопавший в словарь ключ;
      // ровно так четыре причины хода едва не уехали в сборку.
      expect(RegExp(r'^[a-zA-Z][a-zA-Z0-9_]*$').hasMatch(t.trim()), isFalse,
          reason: 'вместо текста показан ключ словаря: «$t»');
    }
    // Причин у решателя четыре; на девяти шагах их обязано встретиться больше
    // одной, иначе подпись раздаётся не замером, а константой.
    expect(seen.length, greaterThan(2),
        reason: 'все шаги подписаны одинаково — причина берётся не из доски: $seen');
  });

  testWidgets('🔴 второй разбор не велит вернуть ход, который показал первый', (tester) async {
    // 02.10.2026, задача 978b07b4. Разбор каждый раз решал доску с чистого листа, и
    // ход «вернуть товар, откуда взяли» стоял у перебора в почёте. Профиль nzt48
    // играет набором «Напитки»; на его L11 телефонной лестницы первый разбор вёл
    // товар из ниши 1 в нишу 0, а второй — после того как человек это сделал — из
    // 0 обратно в 1. Ход берётся с ПОКАЗАННОЙ разбором доски и делается пальцем:
    // так проверяется и решатель, и то, что экран отдаёт ему пройденное.
    SharedPreferences.setMockInitialValues({
      'psygames_active_profile': 'nzt48',
      'psygames_goods_sort_level_nzt48': '11',
    });
    state = await SharedState.open();
    await _boot(tester, state);
    // Уровень, вводящий новое правило, каркас открывает карточкой поверх партии;
    // пока она открыта, кнопки шапки под барьером.
    await tester.pump(const Duration(seconds: 2));
    if (find.byKey(const Key('level-rule-ok')).evaluate().isNotEmpty) {
      await tester.tap(find.byKey(const Key('level-rule-ok')));
      for (var i = 0; i < 8; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
    }

    GoodsField onScreen() => tester.widget<GoodsField>(find.byType(GoodsField));
    GoodsField inLesson() => tester.widget<GoodsField>(
        find.descendant(of: find.byType(LessonPlayerScreen), matching: find.byType(GoodsField)));
    String cells(GoodsBoard b) => b.cells.map((c) => c.join(',')).join('|');

    // Доска после первого шага разбора.
    Future<String> firstStep() async {
      await _openLesson(tester);
      await tester.tap(find.byKey(const Key('lesson-next')), warnIfMissed: true);
      await tester.pump();
      final shown = cells(inLesson().board);
      await tester.tap(find.byKey(const Key('lesson-close')));
      for (var i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      return shown;
    }

    final f = onScreen();
    final start = GoodsPlay(level: f.level, board: f.board, obstacles: f.obstacles, frozenRow: f.frozenRow);
    final shown = await firstStep();

    // Какой ход верхнего товара приводит к показанной доске.
    ({int from, int to})? step;
    for (var from = 0; from < start.board.cells.length && step == null; from++) {
      for (var to = 0; to < start.board.cells.length; to++) {
        final next = from == to ? null : start.moveTopOf(from, to);
        if (next != null && cells(next.board) == shown) {
          step = (from: from, to: to);
          break;
        }
      }
    }
    expect(step, isNotNull, reason: 'первый шаг разбора не повторяется ходом верхнего товара');
    await tester.tap(find.byKey(ValueKey('item-${step!.from}-${start.board.cells[step.from].length - 1}')));
    await tester.pump();
    await tester.tap(find.byKey(ValueKey('niche-${step.to}')));
    await tester.pump();
    expect(cells(onScreen().board), shown, reason: 'ход пальцем привёл не туда, куда показал разбор');

    final again = await firstStep();
    expect(again, isNot(cells(start.board)),
        reason: 'второй разбор начался с отката: товар вернулся в нишу ${step.from}, '
            'откуда первый разбор велел его взять');
  });

  testWidgets('партия с разбором в уровень не засчитывается', (tester) async {
    await _boot(tester, state);
    expect(LessonUsed.inRound, isFalse);
    await _openLesson(tester);
    expect(LessonUsed.inRound, isTrue,
        reason: 'решение показали — мерить по нему человека нечестно');
  });
}

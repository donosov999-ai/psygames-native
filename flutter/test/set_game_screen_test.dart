import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/set_game/model.dart';
import 'package:psygames_flutter/games/set_game/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// СТОЛ РАЗБИРАЕТСЯ НАЖАТИЯМИ. Карты проба знает из той же раздачи по зерну,
/// а сет ищет САМА перебором — как человек, а не подглядывая в ответ.
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
      if (level != 1) '${SharedState.prefix}set_game_level_nzt48': '$level',
    });
    state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: SetGameScreen(key: ValueKey('открытие${opens += 1}'), state: state, rnd: createRng(seed)),
    ));
    await tester.pump();
    await tester.pump();
  }

  testWidgets('🔴 серия проходится нажатиями: сет найден перебором, уровень взят', (tester) async {
    // Та же раздача, что у экрана: одно зерно, один генератор.
    final rnd = createRng('серия');
    await open(tester, seed: 'серия');
    final p = levelParams(1);
    expect(find.text(L.t('setGame')), findsOneWidget);

    for (var i = 1; i <= p.trials; i += 1) {
      expect(find.text('$i/${p.trials}'), findsOneWidget, reason: 'расклад $i');
      final board = buildBoard(rnd);
      expect(find.byKey(Key('карта${board.length - 1}')), findsOneWidget,
          reason: 'на столе ${board.length} карт');
      final found = findAnySet(board)!;
      for (final idx in found) {
        await tester.tap(find.byKey(Key('карта$idx')));
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.textContaining(L.t('nextLabel')), findsWidgets, reason: 'без ошибок — уровень взят');
  });

  testWidgets('🔴 не-сет засчитывается ошибкой, и две ошибки уровень не берут', (tester) async {
    final rnd = createRng('ошибки');
    await open(tester, seed: 'ошибки');
    final p = levelParams(1);

    for (var i = 1; i <= p.trials; i += 1) {
      final board = buildBoard(rnd);
      if (i <= 2) {
        // Ищем заведомо НЕ сет: первая тройка, которую перебор отверг.
        final bad = <int>[];
        outer:
        for (var a = 0; a < board.length; a += 1) {
          for (var b = a + 1; b < board.length; b += 1) {
            for (var c = b + 1; c < board.length; c += 1) {
              if (!isSet(board[a], board[b], board[c])) {
                bad.addAll([a, b, c]);
                break outer;
              }
            }
          }
        }
        for (final idx in bad) {
          await tester.tap(find.byKey(Key('карта$idx')));
          await tester.pump();
        }
      } else {
        for (final idx in findAnySet(board)!) {
          await tester.tap(find.byKey(Key('карта$idx')));
          await tester.pump();
        }
      }
      await tester.pump(const Duration(milliseconds: 800));
    }
    expect(find.textContaining(L.t('retry')), findsWidgets, reason: 'две ошибки при пороге одна — не взят');
  });

  testWidgets('🔴 лимит времени приходит с одиннадцатого уровня, а не раньше', (tester) async {
    expect(levelParams(10).timeLimit, 0);
    await open(tester, level: 11, seed: 'время');
    expect(levelParams(11).timeLimit, 26);
    expect(find.text('26'), findsOneWidget, reason: 'остаток лимита показан');
    await tester.pump(const Duration(seconds: 27));
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.text('1/1'), findsOneWidget, reason: 'просрочка засчитана ошибкой');
  });

  testWidgets('🔴 РАСКЛАДКА: двенадцать карт влезают в поле — 360×640 и 390×844', (tester) async {
    for (final screen in [const Size(360, 640), const Size(390, 844)]) {
      await open(tester, screen: screen, seed: 'раскладка');
      final table = tester.getRect(find.byKey(const Key('стол')));
      final tops = <double>{};
      for (var i = 0; i < setBoardSize; i += 1) {
        final r = tester.getRect(find.byKey(Key('карта$i')));
        expect(r.width >= setMinCard, isTrue, reason: '$screen карта $i уже пальца: ${r.width}');
        expect(r.left >= 0 && r.right <= screen.width, isTrue, reason: '$screen карта $i за экраном: $r');
        expect(r.top >= table.top - 0.5 && r.bottom <= table.bottom + 0.5, isTrue,
            reason: '$screen карта $i вне стола: $r против $table');
        tops.add(r.top);
      }
      // Три колонки: двенадцать карт ложатся ровно в четыре ряда.
      expect(tops.length, 4, reason: '$screen рядов ${tops.length}, а должно быть четыре');
    }
  });
}

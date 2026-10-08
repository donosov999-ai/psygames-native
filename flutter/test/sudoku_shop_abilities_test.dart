import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/samurai/rules.dart';
import 'package:psygames_flutter/games/samurai/screen.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/ability_wallet.dart';
import 'package:psygames_flutter/shell/aux_action.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/level_ladder.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 ВТОРАЯ ЖИЗНЬ И КУПЛЕННАЯ ПОДСКАЗКА В «СУДОКУ» (задача 576405e7, решение Дениса 08.10.2026).
///
/// Покупает магазин веба, тратит нативный экран — из одного кошелька (`psygames_abilities_v1`).
/// Пробы играют нажатиями: ошибки кончились → партия замирает и спрашивает; «Потратить одну» →
/// штука ушла, партия идёт дальше, и победа ступень НЕ поднимает (а без покупки — поднимает);
/// «Закончить» → проигрыш, штука цела; нет штуки — предложения нет. Подсказка сверх бесплатных
/// тратит штуку и открывает клетку; на клетке задания штуку не тратит. «Самурай» — то же.
void main() {
  setUpAll(() async => L.load('ru'));
  const walletKey = 'psygames_abilities_v1';
  const resumeKey = 'psygames_resume_sudoku_nzt48';
  const levelKey = 'psygames_sudoku_level_nzt48';
  late SharedState state;
  final sent = <Map<String, Object?>>[];

  setUp(() {
    sent.clear();
    SessionReport.sink = (json) async => sent.add((jsonDecode(json) as Map).cast<String, Object?>());
  });
  tearDown(() => SessionReport.sink = null);

  const sol = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];

  Map<String, Object?> wallet() => (jsonDecode(state.get(walletKey) ?? '{}') as Map).cast<String, Object?>();
  int have(String id) => ((wallet()['nzt48'] as Map?)?[id] as num?)?.toInt() ?? 0;

  Future<void> settle(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    await tester.pump();
  }

  Future<void> mountSudoku(WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
  }

  Future<void> leave(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  }

  /// Ступень 5 лестницы, классика; на доске пусты две клетки — (0,0) = 5 и (0,3) = 6.
  Future<void> openSudoku(WidgetTester tester, {Map<String, Object?> wallet = const {}, Map<String, Object?> patch = const {}}) async {
    SharedPreferences.setMockInitialValues({
      'language': 'ru',
      levelKey: '5',
      if (wallet.isNotEmpty) walletKey: jsonEncode({'nzt48': wallet}),
    });
    await tester.runAsync(() async => state = await SharedState.open());
    await mountSudoku(tester);
    await tester.tap(find.byKey(const Key('cell_0_0')), warnIfMissed: false);
    await tester.pump();
    await leave(tester);
    final puzzle = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) (r + c) % 3 == 0 ? 0 : sol[r][c]]];
    final grid = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) r == 0 && (c == 0 || c == 3) ? 0 : sol[r][c]]];
    final env = (jsonDecode(state.get(resumeKey)!) as Map).cast<String, Object?>();
    final s = (env['state'] as Map).cast<String, Object?>()
      ..['variant'] = 'none'
      ..['puzzle'] = puzzle
      ..['solution'] = sol
      ..['grid'] = grid
      ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
      ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
      ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
      ..['history'] = {'past': <Object>[], 'future': <Object>[]}
      ..['errors'] = 0
      ..['answersRevealed'] = false
      ..['hintUses'] = 0
      ..addAll(patch);
    env['state'] = s;
    await tester.runAsync(() => state.set(resumeKey, jsonEncode(env)));
    await mountSudoku(tester);
  }

  Future<void> tapKey(WidgetTester tester, String k) async {
    await tester.tap(find.byKey(Key(k)), warnIfMissed: false);
    await tester.pump();
  }

  /// Неверные цифры в (0,0), пока не кончатся ошибки: предложение или проигрыш.
  Future<int> missUntilOut(WidgetTester tester) async {
    await tapKey(tester, 'cell_0_0');
    for (var i = 0; i < 12; i++) {
      await tapKey(tester, 'digit${1 + i % 4}');   // 1..4 — все мимо пятёрки
      if (find.byKey(const Key('life-offer')).evaluate().isNotEmpty ||
          find.byKey(const Key('lost-note')).evaluate().isNotEmpty) {
        return i + 1;
      }
    }
    return -1;
  }

  Future<void> solve(WidgetTester tester) async {
    await tapKey(tester, 'cell_0_0');
    await tapKey(tester, 'digit5');
    await tapKey(tester, 'cell_0_3');
    await tapKey(tester, 'digit6');
    await settle(tester);
  }

  group('кошелёк', () {
    test('тот же ключ и та же форма, что у веба; профили раздельные; ноль не тратится', () async {
      SharedPreferences.setMockInitialValues({
        walletKey: jsonEncode({'nzt48': {'second_life': 1, 'sudoku_hint': 2}, 'free': {'second_life': 3}}),
      });
      final s = await SharedState.open();
      final w = AbilityWallet(s);
      expect(w.count(AbilityWallet.secondLife), 1);
      expect(w.count(AbilityWallet.sudokuHint), 2);
      expect(await w.spend(AbilityWallet.secondLife), isTrue);
      expect(await w.spend(AbilityWallet.secondLife), isFalse, reason: 'штуки нет — не тратится');
      final raw = (jsonDecode(s.get(walletKey)!) as Map).cast<String, Object?>();
      expect(raw['nzt48'], {'second_life': 0, 'sudoku_hint': 2});
      expect(raw['free'], {'second_life': 3}, reason: 'чужой профиль не тронут');
    });

    test('битый кошелёк — пустой, а не падение', () async {
      SharedPreferences.setMockInitialValues({walletKey: '{oops'});
      final w = AbilityWallet(await SharedState.open());
      expect(w.count(AbilityWallet.secondLife), 0);
      expect(await w.spend(AbilityWallet.secondLife), isFalse);
    });
  });

  group('лестница: advance: false', () {
    test('победа не поднимает ступень и не засчитывается', () async {
      final l = LevelLadder(gameId: 'g', store: MemoryLevelStore());
      await l.load();
      expect(await l.win(advance: false), isFalse);
      expect(l.level, 1);
      expect(await l.win(), isTrue);
      expect(l.level, 2);
    });

    test('провалы с покупкой не копятся и ступень не роняют', () async {
      final l = LevelLadder(gameId: 'g', store: MemoryLevelStore());
      await l.load();
      await l.pick(3);
      for (var i = 0; i < 3; i++) {
        await l.fail(advance: false);
      }
      expect(l.level, 3);
      for (var i = 0; i < 3; i++) {
        await l.fail();
      }
      expect(l.level, 2, reason: 'контроль: без покупки три провала роняют ступень');
    });
  });

  group('классика', () {
    testWidgets('🔴 ошибки кончились → предложение → «Потратить одну» → победа ступень не поднимает', (tester) async {
      await openSudoku(tester, wallet: {'second_life': 1});
      expect(await missUntilOut(tester), greaterThan(0));
      expect(find.byKey(const Key('life-offer')), findsOneWidget, reason: 'партия замерла и спрашивает');
      expect(find.byKey(const Key('lost-note')), findsNothing);
      expect(tester.widget<Text>(find.byKey(const Key('life-wallet'))).data, contains('1'));
      // Пока висит предложение, ввод закрыт: клавиш нет, отмена и подсказка погашены. Открытая
      // отмена снимала бы неверную цифру, и партия шла бы дальше с ошибками за порогом.
      expect(find.byKey(const Key('digit5')), findsNothing);
      for (final label in [L.t('btn_undo'), L.t('btn_hint')]) {
        final aux = tester.widget<AuxAction>(find.byWidgetPredicate((w) => w is AuxAction && w.label == label));
        expect(aux.onPressed, isNull, reason: '$label во время предложения');
      }

      await tapKey(tester, 'life-take');
      await settle(tester);
      expect(have('second_life'), 0, reason: 'штука списана');
      expect(find.byKey(const Key('life-offer')), findsNothing);
      expect(find.byKey(const Key('life-spent-note')), findsOneWidget);

      sent.clear();
      await solve(tester);
      expect(find.byKey(const Key('next')), findsOneWidget, reason: 'партия доиграна');
      expect(state.get(levelKey), '5', reason: 'купленная жизнь ступень не поднимает');
      final win = sent.firstWhere((m) => (m['details'] as Map?)?['completed'] == true);
      expect((win['details'] as Map)['second_life'], isTrue, reason: 'в партии видно, что жизнь куплена');
      await leave(tester);
    });

    testWidgets('контроль: без покупки та же доска ступень поднимает', (tester) async {
      await openSudoku(tester);
      await solve(tester);
      expect(state.get(levelKey), '6');
      await leave(tester);
    });

    testWidgets('«Закончить партию» — проигрыш, штука цела', (tester) async {
      await openSudoku(tester, wallet: {'second_life': 1});
      await missUntilOut(tester);
      await tapKey(tester, 'life-decline');
      await settle(tester);
      expect(find.byKey(const Key('lost-note')), findsOneWidget);
      expect(have('second_life'), 1);
      await leave(tester);
    });

    testWidgets('штуки нет — предложения нет, сразу проигрыш', (tester) async {
      await openSudoku(tester);
      expect(await missUntilOut(tester), greaterThan(0));
      expect(find.byKey(const Key('life-offer')), findsNothing);
      expect(find.byKey(const Key('lost-note')), findsOneWidget);
      await leave(tester);
    });

    testWidgets('вторая жизнь одна на партию: поднятая партия помнит трату', (tester) async {
      await openSudoku(tester, wallet: {'second_life': 3}, patch: {'secondLife': true});
      expect(find.byKey(const Key('life-spent-note')), findsOneWidget);
      await missUntilOut(tester);
      expect(find.byKey(const Key('life-offer')), findsNothing, reason: 'вторую не предлагают');
      expect(find.byKey(const Key('lost-note')), findsOneWidget);
      expect(have('second_life'), 3);
      await leave(tester);
    });

    testWidgets('купленная подсказка: бесплатные кончились → тратится штука и открывается клетка', (tester) async {
      await openSudoku(tester, wallet: {'sudoku_hint': 1}, patch: {'hintUses': 99, 'answersRevealed': true});
      // Клетка задания: штука не тратится.
      await tapKey(tester, 'cell_0_1');
      await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
      await settle(tester);
      expect(have('sudoku_hint'), 1, reason: 'на клетке задания подсказка ушла бы впустую');
      // Пустая клетка: штука ушла, цифра на месте.
      await tapKey(tester, 'cell_0_0');
      await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
      await settle(tester);
      expect(have('sudoku_hint'), 0);
      final cell = find.descendant(of: find.byKey(const Key('cell_0_0')), matching: find.text('5'));
      expect(cell, findsOneWidget, reason: 'клетка открыта по решению');
      // Штук больше нет — вторая клетка не открывается.
      await tapKey(tester, 'cell_0_3');
      await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
      await settle(tester);
      expect(find.descendant(of: find.byKey(const Key('cell_0_3')), matching: find.text('6')), findsNothing);
      await leave(tester);
    });
  });

  group('«Самурай»', () {
    const samuraiKey = 'psygames_resume_sudoku_samurai_nzt48';

    Future<void> boot(WidgetTester tester) async {
      await tester.runAsync(() async {
        await tester.pumpWidget(MaterialApp(home: SamuraiScreen(state: state)));
        for (var i = 0; i < 60; i++) {
          await tester.pump(const Duration(milliseconds: 50));
          await Future<void>.delayed(const Duration(milliseconds: 50));
          if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
        }
      });
      await tester.pump();
    }

    Future<void> tapCell(WidgetTester tester, int r, int c) async {
      final f = find.byKey(Key('cell_${r}_$c'));
      await tester.ensureVisible(f);
      await tester.pump();
      await tester.tap(f, warnIfMissed: false);
      await tester.pump();
    }

    /// Первая пустая клетка фигуры и её разгадка — из снимка партии.
    ({int r, int c, int v}) firstBlank() {
      final s = ((jsonDecode(state.get(samuraiKey)!) as Map)['state'] as Map).cast<String, Object?>();
      final given = s['given'] as List, solution = s['solution'] as List;
      for (var r = 0; r < samuraiSize; r++) {
        for (var c = 0; c < samuraiSize; c++) {
          if (isSamuraiCell(r, c) && (given[r] as List)[c] != true) return (r: r, c: c, v: (solution[r] as List)[c] as int);
        }
      }
      throw StateError('no blank');
    }

    Future<void> open(WidgetTester tester, Map<String, Object?> wallet) async {
      SharedPreferences.setMockInitialValues({'language': 'ru', walletKey: jsonEncode({'nzt48': wallet})});
      await tester.runAsync(() async => state = await SharedState.open());
      await boot(tester);
    }

    testWidgets('🔴 ошибки кончились → предложение → «Потратить одну» → партия идёт дальше', (tester) async {
      await open(tester, {'second_life': 1});
      final b = firstBlank();
      await tapCell(tester, b.r, b.c);
      await tapCell(tester, b.r, b.c);
      final wrong = [for (var d = 1; d <= 9; d++) if (d != b.v) d];
      for (var i = 0; i < 12 && find.byKey(const Key('life-offer')).evaluate().isEmpty; i++) {
        await tapKey(tester, 'digit${wrong[i % wrong.length]}');
      }
      expect(find.byKey(const Key('life-offer')), findsOneWidget);
      await tapKey(tester, 'life-take');
      await settle(tester);
      expect(have('second_life'), 0);
      expect(find.byKey(const Key('life-spent-note')), findsOneWidget);
      expect(find.byKey(Key('digit${b.v}')), findsOneWidget, reason: 'клавиши вернулись — партия идёт');
      await leave(tester);
    });

    testWidgets('купленная подсказка открывает клетку и тратит штуку', (tester) async {
      await open(tester, {'sudoku_hint': 1});
      // Бесплатные подсказки ступени — потратить через снимок: 99 заведомо больше любой ступени.
      final env = (jsonDecode(state.get(samuraiKey)!) as Map).cast<String, Object?>();
      (env['state'] as Map)['hintUses'] = 99;
      await leave(tester);
      await tester.runAsync(() => state.set(samuraiKey, jsonEncode(env)));
      await boot(tester);
      final b = firstBlank();
      await tapCell(tester, b.r, b.c);
      await tapCell(tester, b.r, b.c);
      await tester.tap(find.byTooltip(L.t('btn_hint')), warnIfMissed: false);
      await settle(tester);
      expect(have('sudoku_hint'), 0);
      expect(find.descendant(of: find.byKey(Key('cell_${b.r}_${b.c}')), matching: find.text('${b.v}')), findsOneWidget);
      await leave(tester);
    });
  });
}

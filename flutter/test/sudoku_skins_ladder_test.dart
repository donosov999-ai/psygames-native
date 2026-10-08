import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 WORDOKU И ЗВЕРИ — ВАРИАНТЫ ЛЕСТНИЦЫ (письмо раздела уровней 2d8320ed, блоки 153+). На этих
/// ступенях значки — правило ступени: буквы со спрятанным словом или звери при любом выборе игрока;
/// пункта «значки» в паузе там нет; имя и правило — строки скина. Нажатиями: на ступени Wordoku
/// клавиши подписаны буквами доски.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const key = 'psygames_resume_sudoku_nzt48';
  late SharedState state;

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
  });

  const sol = [
    [5, 3, 4, 6, 7, 8, 9, 1, 2], [6, 7, 2, 1, 9, 5, 3, 4, 8], [1, 9, 8, 3, 4, 2, 5, 6, 7],
    [8, 5, 9, 7, 6, 1, 4, 2, 3], [4, 2, 6, 8, 5, 3, 7, 9, 1], [7, 1, 3, 9, 2, 4, 8, 5, 6],
    [9, 6, 1, 5, 3, 7, 2, 8, 4], [2, 8, 7, 4, 1, 9, 6, 3, 5], [3, 4, 5, 2, 8, 6, 1, 7, 9],
  ];

  test('🔴 значки задаёт ступень: буквы и звери при любом выборе игрока', () {
    for (final skin in SudokuSkin.values) {
      final w = symbolsFor(skin: skin, variant: 'wordoku', solution: sol, language: 'ru', seed: 7);
      expect(w.isDigits, isFalse, reason: 'wordoku при выборе $skin');
      expect(w.images, isNull);
      final a = symbolsFor(skin: skin, variant: 'animals', solution: sol, language: 'ru', seed: 7);
      expect(a.images, isNotNull, reason: 'звери при выборе $skin');
    }
    // Классика по-прежнему слушает выбор игрока.
    expect(symbolsFor(skin: SudokuSkin.digits, variant: 'none', solution: sol, language: 'ru', seed: 7).isDigits, isTrue);
  });

  test('пункта «значки» на этих ступенях нет; имя и правило — строки скина', () async {
    expect(skinApplies('wordoku'), isFalse, reason: 'выбор игрока на этой ступени не действует');
    expect(skinApplies('animals'), isFalse);
    expect(skinApplies('none'), isTrue);
    expect(forcedSkinVariants, {'wordoku', 'animals'});
    await L.load('ru');
    expect(variantTitle('wordoku'), L.t('sudokuSkinLetters'));
    expect(variantTitle('animals'), L.t('sudokuSkinAnimals'));
    expect(variantRuleKey('wordoku'), 'sudokuSkinLetters');
    expect(variantRuleKey('animals'), 'sudokuSkinAnimals');
  });

  testWidgets('🔴 нажатиями: на ступени Wordoku клавиши подписаны буквами доски', (tester) async {
    Future<void> mount() async {
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

    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '5'});
    await tester.runAsync(() async => state = await SharedState.open());
    await mount();
    expect(tester.widget<Text>(find.descendant(of: find.byKey(const Key('digit1')), matching: find.byType(Text))).data, '1',
        reason: 'классика — цифры');
    await tester.tap(find.byKey(const Key('cell_0_0')), warnIfMissed: false);
    await tester.pump();
    await tester.tap(find.byKey(const Key('digit5')), warnIfMissed: false);
    await tester.pump();
    await tester.pumpWidget(const SizedBox());
    await tester.pump();

    final puzzle = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) (r + c) % 3 == 0 ? 0 : sol[r][c]]];
    final env = (jsonDecode(state.get(key)!) as Map).cast<String, Object?>();
    final s = (env['state'] as Map).cast<String, Object?>()
      ..['variant'] = 'wordoku'
      ..['puzzle'] = puzzle
      ..['solution'] = sol
      ..['grid'] = puzzle
      ..['given'] = [for (final row in puzzle) [for (final v in row) v != 0]]
      ..['marks'] = List.generate(9, (_) => List.filled(9, 0))
      ..['cellColors'] = List.generate(9, (_) => List.filled(9, noSudokuColor))
      ..['history'] = {'past': <Object>[], 'future': <Object>[]}
      ..['errors'] = 0;
    env['state'] = s;
    await tester.runAsync(() => state.set(key, jsonEncode(env)));
    await mount();
    final label = tester.widget<Text>(find.descendant(of: find.byKey(const Key('digit1')), matching: find.byType(Text))).data!;
    expect(int.tryParse(label), isNull, reason: 'на ступени Wordoku клавиша — буква, а не «1»: «$label»');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}

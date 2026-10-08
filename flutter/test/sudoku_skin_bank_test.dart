import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/symbols.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 WORDOKU И ЗВЕРИ — ДОСКИ ИЗ БАНКА С РЕЙТИНГОМ (письмо раздела уровней c148a67a, 08.10).
///
/// Логический путь у этих ступеней насыщался на уровне классики ~37 (ступень 3–4, ~56 пустых), хотя
/// стоят они на 153–160, а классика 54–80 играет банк с рейтингом 6,3–7,8. Теперь у ступени своя
/// полоса банка (`rating` в выгрузке, `levelConfig.bankRating` веба): 8,3 / 8,5 / 8,9 / 9,0 по
/// ступеням блока. Проба: каждая из 160-х ступеней — доска банка своей полосы; дорога — соседняя
/// ПОЛНАЯ полоса; нажатиями — на ступени 153 доска из банка и клавиши подписаны буквами.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SudokuLevels levels;
  late Map<int, Set<String>> bankByBand;

  setUpAll(() async {
    await L.load('ru');
    await WordokuWords.load();
    levels = await SudokuLevels.load();
    final bank = jsonDecode(File('assets/levels/sudoku-bank.json').readAsStringSync()) as Map<String, dynamic>;
    bankByBand = {};
    for (final r in (bank['rows'] as List).cast<Map<String, dynamic>>()) {
      (bankByBand[((r['r'] as num) * 10).round()] ??= <String>{}).add(r['p'] as String);
    }
  });

  String flat(List<List<int>> g) => g.map((r) => r.join()).join();

  test('🔴 153–160: доска из банка своей полосы, значки ступени, решение сходится', () {
    const want = [8.3, 8.5, 8.9, 9.0];
    for (var lv = 153; lv <= 160; lv++) {
      final cfg = levels.config(lv);
      expect(cfg.variant, lv <= 156 ? 'wordoku' : 'animals');
      expect(cfg.rating, want[(lv - 1) % 4], reason: 'полоса ступени $lv');
      expect(cfg.fromBank, isTrue, reason: 'ступень $lv берёт банк');
      for (var seed = 1; seed <= 5; seed++) {
        final b = levels.boardFor(lv, seed: seed)!;
        expect(b.variant, cfg.variant, reason: 'значки задаёт ступень — вариант доски тот же');
        expect(b.rating, cfg.rating);
        expect(bankByBand[(cfg.rating! * 10).round()], contains(flat(b.puzzle)), reason: 'ступень $lv, зерно $seed: доска не из своей полосы банка');
        for (var r = 0; r < 9; r++) {
          for (var c = 0; c < 9; c++) {
            if (b.puzzle[r][c] != 0) expect(b.solution[r][c], b.puzzle[r][c]);
          }
        }
      }
    }
    // Остальные ступени лестницы своей полосы не получили: банк по-прежнему у классики, у вариантов — выгрузка.
    expect(levels.config(161).rating, isNull);
    expect(levels.config(161).fromBank, isFalse);
    expect(levels.config(66).fromBank, isTrue, reason: 'классика — банк, как была');
  });

  test('дорога сдвигает на соседнюю ПОЛНУЮ полосу банка, а не по строкам классики', () {
    expect(levels.bankRating(153), 8.3);
    expect(levels.bankRating(153, shift: 1), 8.4);
    expect(levels.bankRating(153, shift: -1), 8.2);
    expect(levels.bankRating(155, shift: 1), 9.0, reason: '8,9 → 9,0: полосы 8,6–8,8 неполные, но выше 8,9 — 9,0');
    expect(levels.bankRating(156, shift: 1), 9.0, reason: 'выше 9,0 полных полос нет — край');
    // Классика — как раньше, по строкам ratingRows.
    expect(levels.bankRating(80), 7.8);
  });

  testWidgets('🔴 нажатиями: ступень 153 — доска банка полосы 8,3, клавиши буквами', (tester) async {
    SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_sudoku_level_nzt48': '153'});
    late SharedState state;
    await tester.runAsync(() async => state = await SharedState.open());
    await tester.runAsync(() async {
      await tester.pumpWidget(MaterialApp(home: SudokuScreen(state: state)));
      for (var i = 0; i < 80; i++) {
        await tester.pump(const Duration(milliseconds: 50));
        await Future<void>.delayed(const Duration(milliseconds: 20));
        if (find.byKey(const Key('cell_0_0')).evaluate().isNotEmpty) break;
      }
    });
    await tester.pump();
    final label = tester.widget<Text>(find.descendant(of: find.byKey(const Key('digit1')), matching: find.byType(Text))).data!;
    expect(int.tryParse(label), isNull, reason: 'на ступени Wordoku клавиша — буква: «$label»');
    final env = (jsonDecode(state.get('psygames_resume_sudoku_nzt48')!) as Map)['state'] as Map;
    expect(env['variant'], 'wordoku');
    final puzzle = [for (final row in (env['puzzle'] as List)) [for (final v in (row as List)) (v as num).toInt()]];
    expect(bankByBand[83], contains(flat(puzzle)), reason: 'на экране доска полосы 8,3 из банка');
    await tester.pumpWidget(const SizedBox());
    await tester.pump();
  });
}

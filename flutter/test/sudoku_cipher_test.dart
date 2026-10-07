import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/reject_why.dart';
import 'package:psygames_flutter/games/sudoku/resume.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// 🔴 ШИФР (6aecf181 п.2, задача 1f8fbd7f): часть подсказок показана буквами; одинаковые буквы —
/// одинаковые цифры, разные — разные. Ходы против живого ядра сверяет `sudoku_rules_test` (эталон
/// выгрузки); здесь — то, что видит человек: в пустой клетке-букве крупная буква, после хода — цифра и
/// буква в углу; имя и правило на 12 языках; снимок партии хранит буквы.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync()) as Map<String, Object?>;
  final ref = (data['boards'] as List).cast<Map<String, Object?>>().firstWhere((b) => b['variant'] == 'cipher');
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final solution = ints(ref['solution']);
  final extras = (ref['extras'] as Map).cast<String, Object?>();
  final cipher = ints(extras['cipher']);

  test('разбор выгрузки: буква — всегда одна и та же цифра решения, разные буквы — разные цифры', () {
    final digitOf = <int, int>{};
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        final l = cipher[r][c];
        if (l == 0) continue;
        expect(digitOf.putIfAbsent(l, () => solution[r][c]), solution[r][c], reason: 'буква $l в ($r,$c)');
      }
    }
    expect(digitOf.length, greaterThanOrEqualTo(2));
    expect(digitOf.values.toSet().length, digitOf.length, reason: 'разные буквы — разные цифры');
    expect(BoardGeometry.fromJson(extras).cipher, isNotNull);
  });

  test('🔴 правило: та же буква — та же цифра, другая буква — другая', () {
    final ci = List.generate(9, (_) => List.filled(9, 0));
    ci[0][0] = 1;
    ci[4][4] = 1;
    ci[8][8] = 2;
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[4][4] = 6;
    final geo = BoardGeometry(cipher: ci);
    expect(isValid(g, 0, 0, 6, 9, 3, 3, variant: 'cipher', geometry: geo), isTrue);
    expect(isValid(g, 0, 0, 7, 9, 3, 3, variant: 'cipher', geometry: geo), isFalse, reason: 'та же буква A уже 6');
    expect(isValid(g, 8, 8, 6, 9, 3, 3, variant: 'cipher', geometry: geo), isFalse, reason: 'буква B не может быть 6 — это A');
    expect(isValid(g, 8, 8, 7, 9, 3, 3, variant: 'cipher', geometry: geo), isTrue);
  });

  Future<void> pumpBoard(WidgetTester tester, List<List<int>> grid) async {
    final puzzle = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) cipher[r][c] > 0 ? 0 : solution[r][c]]];
    final board = SudokuBoard(
      level: 133, n: 9, br: 3, bc: 3, variant: 'cipher',
      puzzle: puzzle, solution: solution,
      geometry: BoardGeometry.fromJson(extras), geometryJson: extras,
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          height: 460,
          child: SudokuBoardView(
            board: board,
            grid: grid,
            given: [for (final row in puzzle) [for (final v in row) v != 0]],
            marks: List.generate(9, (_) => List.filled(9, 0)),
            colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
            selected: null,
            height: 460,
            onTap: (_, _) {},
          ),
        ),
      ),
    ));
  }

  testWidgets('🔴 пустая клетка-буква показывает букву; после хода — цифру и букву в углу', (tester) async {
    late int r0, c0;
    var found = false;
    for (var r = 0; r < 9 && !found; r++) {
      for (var c = 0; c < 9 && !found; c++) {
        if (cipher[r][c] > 0) {
          (r0, c0) = (r, c);
          found = true;
        }
      }
    }
    final letter = cipherLetters[cipher[r0][c0] - 1];
    final empty = [for (var r = 0; r < 9; r++) [for (var c = 0; c < 9; c++) cipher[r][c] > 0 ? 0 : solution[r][c]]];
    await pumpBoard(tester, empty);
    expect(tester.widget<Text>(find.byKey(Key('letter_${r0}_$c0'))).data, letter);
    final big = tester.getRect(find.byKey(Key('letter_${r0}_$c0')));
    final cell = tester.getRect(find.byKey(Key('cell_${r0}_$c0')));
    expect((big.center - cell.center).distance, lessThan(cell.width * 0.2), reason: 'в пустой клетке — по центру');
    // Клетки без буквы её не показывают.
    final plain = [for (var r = 0; r < 9; r++) for (var c = 0; c < 9; c++) if (cipher[r][c] == 0) (r, c)].first;
    expect(find.byKey(Key('letter_${plain.$1}_${plain.$2}')), findsNothing);

    final played = [for (final row in empty) [...row]]..[r0][c0] = solution[r0][c0];
    await pumpBoard(tester, played);
    expect(find.descendant(of: find.byKey(Key('cell_${r0}_$c0')), matching: find.text('${solution[r0][c0]}')), findsOneWidget);
    final small = tester.getRect(find.byKey(Key('letter_${r0}_$c0')));
    expect(small.center.dx, greaterThan(cell.center.dx), reason: 'после хода буква уходит в угол');
    expect(small.center.dy, lessThan(cell.center.dy));
  });

  test('снимок партии хранит буквы и поднимает их обратно', () {
    final web = webGeometry(extras);
    expect(web['cipher'], extras['cipher']);
    expect(BoardGeometry.fromJson(exportGeometry(web)).cipher, cipher);
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило шифра словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_cipher', 'sudokuRuleCipher']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('cipher'), L.t('sdkRule_cipher'));
      expect(variantRuleKey('cipher'), 'sudokuRuleCipher');
    });
  }
}

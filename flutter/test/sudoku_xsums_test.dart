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

/// 🔴 X-СУММЫ (6aecf181 п.9, задача 5ea317fc): число у края — сумма первых X цифр с этой стороны, X —
/// первая из них и входит в сумму. Ходы против живого ядра сверяет `sudoku_rules_test` (эталон
/// выгрузки); здесь — то, что видит человек: суммы над столбцами и слева от строк, скрытые — пустые,
/// доска в узком экране; имя и правило на 12 языках; снимок партии их хранит.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync()) as Map<String, Object?>;
  final ref = (data['boards'] as List).cast<Map<String, Object?>>().firstWhere((b) => b['variant'] == 'xsums');
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final solution = ints(ref['solution']);
  final extras = (ref['extras'] as Map).cast<String, Object?>();
  final xs = SandwichClues.fromJson(extras['xsums'])!;
  int xsum(List<int> line) => [for (var k = 0; k < line[0]; k++) line[k]].fold(0, (a, b) => a + b);

  test('разбор выгрузки: показанные суммы — X-суммы своих рядов по решению', () {
    var shown = 0;
    for (var i = 0; i < 9; i++) {
      if (xs.rows[i] >= 0) {
        shown++;
        expect(xs.rows[i], xsum(solution[i]), reason: 'строка $i');
      }
      if (xs.cols[i] >= 0) {
        shown++;
        expect(xs.cols[i], xsum([for (final row in solution) row[i]]), reason: 'столбец $i');
      }
    }
    expect(shown, 12);
    expect(BoardGeometry.fromJson(extras).xsums, isNotNull);
  });

  test('🔴 правило: X — первая цифра и входит в сумму; пока X пуст — молчим', () {
    expect(xsumLineOk([3, 0, 0, 0, 0, 0, 0, 0, 0], 4, 9), isFalse, reason: '3 + две пустые по 1 = 5 > 4');
    expect(xsumLineOk([3, 0, 0, 0, 0, 0, 0, 0, 0], 5, 9), isTrue);
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], 9, 9), isTrue);
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], 10, 9), isFalse);
    expect(xsumLineOk([0, 5, 0, 0, 0, 0, 0, 0, 0], 3, 9), isTrue);
    expect(xsumLineOk([2, 7, 0, 0, 0, 0, 0, 0, 0], -1, 9), isTrue, reason: 'скрытая — не подсказка');
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[0][0] = 3;
    final geo = BoardGeometry(xsums: SandwichClues(rows: [5, ...List.filled(8, -1)], cols: List.filled(9, -1)));
    expect(isValid(g, 0, 1, 4, 9, 3, 3, variant: 'xsums', geometry: geo), isFalse, reason: '3 + 4 + пустая ≥ 8 > 5');
    expect(isValid(g, 0, 1, 1, 9, 3, 3, variant: 'xsums', geometry: geo), isTrue);
  });

  Future<void> pumpBoard(WidgetTester tester, double width) async {
    final board = SudokuBoard(
      level: 185, n: 9, br: 3, bc: 3, variant: 'xsums',
      puzzle: ints(ref['grid']), solution: solution,
      geometry: BoardGeometry.fromJson(extras), geometryJson: extras,
    );
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: width,
            height: 460,
            child: SudokuBoardView(
              board: board,
              grid: board.puzzle,
              given: [for (final row in board.puzzle) [for (final v in row) v != 0]],
              marks: List.generate(9, (_) => List.filled(9, 0)),
              colors: List.generate(9, (_) => List.filled(9, noSudokuColor)),
              selected: null,
              height: 460,
              onTap: (_, _) {},
            ),
          ),
        ),
      ),
    ));
  }

  testWidgets('🔴 суммы над своими столбцами и слева от своих строк; скрытые — пустые', (tester) async {
    await pumpBoard(tester, 400);
    for (var i = 0; i < 9; i++) {
      final col = tester.widget<Text>(find.byKey(Key('xsums-col-$i')));
      final row = tester.widget<Text>(find.byKey(Key('xsums-row-$i')));
      expect(col.data, xs.cols[i] < 0 ? '' : '${xs.cols[i]}');
      expect(row.data, xs.rows[i] < 0 ? '' : '${xs.rows[i]}');
      // Место — от клетки ряда, а не от ключа: над столбцом i и слева от строки i.
      final top = tester.getRect(find.byKey(Key('cell_0_$i')));
      final left = tester.getRect(find.byKey(Key('cell_${i}_0')));
      final c = tester.getRect(find.byKey(Key('xsums-col-$i')));
      final r = tester.getRect(find.byKey(Key('xsums-row-$i')));
      expect((c.center.dx - top.center.dx).abs(), lessThan(top.width * 0.5));
      expect(c.center.dy, lessThan(top.top));
      expect((r.center.dy - left.center.dy).abs(), lessThan(left.height * 0.5));
      expect(r.center.dx, lessThan(left.left));
    }
    expect(find.byKey(const Key('sandwich-col-0')), findsNothing, reason: 'ключи — с именем правила');
  });

  testWidgets('узкий экран 320: поля и доска в ширине, каркас не переполнен', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await pumpBoard(tester, 320);
    expect(tester.takeException(), isNull);
    expect(tester.getRect(find.byKey(const Key('cell_0_8'))).right, lessThanOrEqualTo(320));
    expect(tester.getRect(find.byKey(const Key('xsums-row-0'))).left, greaterThanOrEqualTo(0));
  });

  test('снимок партии хранит суммы в форме веба и поднимает их обратно', () {
    final web = webGeometry(extras);
    expect(web['xsums'], extras['xsums']);
    expect(BoardGeometry.fromJson(exportGeometry(web)).xsums!.rows, xs.rows);
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило X-сумм словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_xsums', 'sudokuRuleXsums']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('xsums'), L.t('sdkRule_xsums'));
      expect(variantRuleKey('xsums'), 'sudokuRuleXsums');
    });
  }
}

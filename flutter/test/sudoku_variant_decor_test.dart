import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';
import 'package:psygames_flutter/games/sudoku/marks.dart';
import 'package:psygames_flutter/games/sudoku/rules.dart';
import 'package:psygames_flutter/games/sudoku/screen.dart';
import 'package:psygames_flutter/games/sudoku/variant_decor.dart';

/// 🔴 КАЖДАЯ ПОДСКАЗКА ВЫГРУЗКИ ДОШЛА ДО ЭКРАНА (задача 450c0211).
///
/// С переноса 23.09 нативная доска рисовала только рамки, а разбор геометрии выбрасывал
/// метки чётности, точки Кропки и суммы сэндвича — вышло в Play 2.56.2. Прежние пробы были
/// зелёными, потому что проверяли целость доски, а не то, что видит человек. Здесь каждая
/// вариантная ступень открывается ВИДЖЕТОМ доски, и каждое поле её геометрии ищется на нём.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late SudokuLevels levels;
  setUpAll(() async => levels = await SudokuLevels.load());

  Future<void> pumpBoard(WidgetTester tester, SudokuBoard b) async {
    final n = b.n;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 400,
          height: 460,
          child: SudokuBoardView(
            board: b,
            grid: [for (final row in b.puzzle) [...row]],
            given: [for (final row in b.puzzle) [for (final v in row) v != 0]],
            marks: List.generate(n, (_) => List.filled(n, 0)),
            colors: List.generate(n, (_) => List.filled(n, noSudokuColor)),
            selected: null,
            height: 460,
            onTap: (_, _) {},
          ),
        ),
      ),
    ));
  }

  CellDecor? decorAt(WidgetTester tester, int r, int c) {
    final f = find.byKey(Key('decor_${r}_$c'));
    if (f.evaluate().isEmpty) return null;
    return (tester.widget<CustomPaint>(f).painter! as CellDecorPainter).decor;
  }

  testWidgets('🔴 на каждой вариантной ступени каждое поле геометрии нарисовано', (tester) async {
    final checked = <String, int>{};
    for (var lv = 1; lv <= levels.lastLevel; lv++) {
      final cfg = levels.config(lv);
      if (cfg.fromBank) continue;
      for (var i = 0; i < 2 && i < levels.boardsFor(lv); i++) {
        final b = levels.boardAt(lv, i)!;
        final g = b.geometry;
        await pumpBoard(tester, b);
        final at = 'L$lv/${b.variant}/$i';
        for (var r = 0; r < b.n; r++) {
          for (var c = 0; c < b.n; c++) {
            final d = decorAt(tester, r, c);
            if (g.thermo?[r][c] != null) {
              expect(d?.thermo, isNotNull, reason: '$at: звено термометра $r,$c не нарисовано');
              checked['thermo'] = (checked['thermo'] ?? 0) + 1;
            }
            if (g.arrow?[r][c] != null) {
              expect(d?.arrow, isNotNull, reason: '$at: клетка стрелки $r,$c не нарисована');
              checked['arrow'] = (checked['arrow'] ?? 0) + 1;
            }
            final p = g.parity?[r][c] ?? 0;
            if (p != 0) {
              expect(d?.parity, p, reason: '$at: метка чётности $r,$c не нарисована');
              checked['parity'] = (checked['parity'] ?? 0) + 1;
            }
          }
        }
        final cages = g.cages;
        if (cages != null) {
          for (var id = 0; id < cages.sum.length; id++) {
            if (id >= cages.anchor.length || cages.anchor[id] < 0 || cages.cells[id].isEmpty) continue;
            final a = cages.anchor[id];
            final t = find.byKey(Key('cage-sum-${a ~/ b.n}_${a % b.n}'));
            expect(t, findsOneWidget, reason: '$at: сумма группы $id не написана');
            expect(tester.widget<Text>(t).data, '${cages.sum[id]}');
            checked['cage'] = (checked['cage'] ?? 0) + 1;
          }
        }
        final k = g.kropki;
        if (k != null) {
          final want = [for (final row in k.h) ...row, for (final row in k.v) ...row].where((v) => v != 0).length;
          final layer = tester.widget<CustomPaint>(find.byKey(const Key('kropki-layer')));
          expect((layer.painter! as KropkiPainter).dots.length, want, reason: '$at: не все точки Кропки на доске');
          checked['kropki'] = (checked['kropki'] ?? 0) + want;
        }
        if (b.variant == 'diagonal' || b.variant == 'killerdiag') {
          expect(find.byKey(const Key('diagonal-layer')), findsOneWidget, reason: '$at: диагонали не нарисованы');
          checked['diagonal'] = (checked['diagonal'] ?? 0) + 1;
        }
        if (b.variant == 'hyper') {
          expect(find.byKey(const Key('hyper-layer')), findsOneWidget, reason: '$at: доп. зоны не обведены');
          checked['hyper'] = (checked['hyper'] ?? 0) + 1;
        }
        final sw = g.sandwich;
        if (sw != null) {
          for (var j = 0; j < b.n; j++) {
            String shown(String key) => tester.widget<Text>(find.byKey(Key(key))).data ?? '';
            expect(shown('sandwich-row-$j'), sw.rows[j] < 0 ? '' : '${sw.rows[j]}', reason: '$at: сумма строки $j');
            expect(shown('sandwich-col-$j'), sw.cols[j] < 0 ? '' : '${sw.cols[j]}', reason: '$at: сумма столбца $j');
          }
          checked['sandwich'] = (checked['sandwich'] ?? 0) + 1;
        }
      }
    }
    // Проба не пустая: каждая из шести подсказок встретилась на доске.
    for (final kind in ['thermo', 'arrow', 'parity', 'cage', 'kropki', 'sandwich', 'diagonal', 'hyper']) {
      expect(checked[kind] ?? 0, greaterThan(0), reason: 'подсказка «$kind» не встретилась ни разу — проба мимо');
    }
  });

  test('🔴 показанные подсказки проверяются: чётность, точка Кропки, сумма сэндвича', () {
    final empty = List.generate(9, (_) => List.filled(9, 0));
    final parity = List.generate(9, (_) => List.filled(9, 0))..[0][0] = 1;   // 1 — чётная
    final g1 = BoardGeometry(parity: parity);
    expect(isValid(empty, 0, 0, 3, 9, 3, 3, variant: 'evenodd', geometry: g1), isFalse, reason: 'нечёт на чётной метке');
    expect(isValid(empty, 0, 0, 4, 9, 3, 3, variant: 'evenodd', geometry: g1), isTrue);

    final h = List.generate(9, (_) => List.filled(9, 0))..[0][0] = 1;          // белая точка между (0,0) и (0,1)
    final g2 = BoardGeometry(kropki: KropkiMap(h: h, v: List.generate(9, (_) => List.filled(9, 0))));
    final grid = [for (final row in empty) [...row]]..[0][1] = 5;
    expect(isValid(grid, 0, 0, 7, 9, 3, 3, variant: 'kropki', geometry: g2), isFalse, reason: 'белая точка — разница 1');
    expect(isValid(grid, 0, 0, 6, 9, 3, 3, variant: 'kropki', geometry: g2), isTrue);

    final g3 = BoardGeometry(sandwich: SandwichClues(rows: [5, -1, -1, -1, -1, -1, -1, -1, -1], cols: List.filled(9, -1)));
    final row = [for (final row in empty) [...row]]..[0] = [1, 2, 0, 9, 0, 0, 0, 0, 0];
    expect(isValid(row, 0, 2, 4, 9, 3, 3, variant: 'sandwich', geometry: g3), isFalse, reason: '2+4 ≠ 5');
    expect(isValid(row, 0, 2, 3, 9, 3, 3, variant: 'sandwich', geometry: g3), isTrue, reason: '2+3 = 5');
  });
}

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
            if (g.whisper?[r][c] != null) {
              expect(d?.whisper, isNotNull, reason: '$at: звено линии шёпота $r,$c не нарисовано');
              checked['whisper'] = (checked['whisper'] ?? 0) + 1;
            }
            if (g.renban?[r][c] != null) {
              expect(d?.renban, isNotNull, reason: '$at: звено полосы ренбана $r,$c не нарисовано');
              checked['renban'] = (checked['renban'] ?? 0) + 1;
            }
            if (g.regionsum?[r][c] != null) {
              expect(d?.regionsum, isNotNull, reason: '$at: звено линии равных сумм $r,$c не нарисовано');
              checked['regionsum'] = (checked['regionsum'] ?? 0) + 1;
            }
            if (g.palindrome?[r][c] != null) {
              expect(d?.palindrome, isNotNull, reason: '$at: звено линии «палиндром» $r,$c не нарисовано');
              checked['palindrome'] = (checked['palindrome'] ?? 0) + 1;
            }
            if (g.between?[r][c] != null) {
              expect(d?.between, isNotNull, reason: '$at: звено линии «между концами» $r,$c не нарисовано');
              checked['between'] = (checked['between'] ?? 0) + 1;
            }
            if (g.lockout?[r][c] != null) {
              expect(d?.lockout, isNotNull, reason: '$at: звено линии «замок» $r,$c не нарисовано');
              checked['lockout'] = (checked['lockout'] ?? 0) + 1;
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
        final xv = g.xv;
        if (xv != null) {
          final want = [for (final row in xv.h) ...row, for (final row in xv.v) ...row].where((v) => v != 0).length;
          final layer = tester.widget<CustomPaint>(find.byKey(const Key('xv-layer')));
          expect((layer.painter! as XvPainter).marks.length, want, reason: '$at: не все знаки XV на доске');
          checked['xv'] = (checked['xv'] ?? 0) + want;
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
    for (final kind in ['thermo', 'arrow', 'parity', 'cage', 'kropki', 'sandwich', 'diagonal', 'hyper', 'whisper', 'renban', 'regionsum', 'palindrome', 'between', 'lockout', 'xv']) {
      expect(checked[kind] ?? 0, greaterThan(0), reason: 'подсказка «$kind» не встретилась ни разу — проба мимо');
    }
  });

  test('🔴 показанные подсказки проверяются: чётность, точка Кропки, сумма сэндвича, линии шёпота, ренбана и равных сумм', () {
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

    // Линия шёпота (0,0)–(0,1): соседи по линии отличаются минимум на 5.
    final w = List<List<ThermoLink?>>.generate(9, (_) => List<ThermoLink?>.filled(9, null));
    w[0][0] = const ThermoLink(next: [0, 1]);
    w[0][1] = const ThermoLink(prev: [0, 0]);
    final g4 = BoardGeometry(whisper: w);
    final line = [for (final row in empty) [...row]]..[0][1] = 7;
    expect(isValid(line, 0, 0, 3, 9, 3, 3, variant: 'whisper', geometry: g4), isFalse, reason: '|3−7| = 4 < 5');
    expect(isValid(line, 0, 0, 2, 9, 3, 3, variant: 'whisper', geometry: g4), isTrue, reason: '|2−7| = 5');
    expect(isValid(line, 1, 0, 3, 9, 3, 3, variant: 'whisper', geometry: g4), isTrue, reason: 'вне линии правило молчит');

    // Полоса ренбана (0,0)–(0,1)–(0,2): цифры разные и подряд в любом порядке.
    final rb = List<List<ThermoLink?>>.generate(9, (_) => List<ThermoLink?>.filled(9, null));
    rb[0][0] = const ThermoLink(next: [0, 1]);
    rb[0][1] = const ThermoLink(prev: [0, 0], next: [0, 2]);
    rb[0][2] = const ThermoLink(prev: [0, 1]);
    final g5 = BoardGeometry(renban: rb);
    final run = [for (final row in empty) [...row]]..[0][2] = 5;
    expect(isValid(run, 0, 0, 3, 9, 3, 3, variant: 'renban', geometry: g5), isTrue, reason: '3 и 5 — окно из трёх (3-4-5)');
    expect(isValid(run, 0, 0, 2, 9, 3, 3, variant: 'renban', geometry: g5), isFalse, reason: '2 и 5 — шире трёх подряд');
    expect(isValid(run, 0, 0, 7, 9, 3, 3, variant: 'renban', geometry: g5), isTrue, reason: '5 и 7 — окно 5-6-7');

    // Линия равных сумм (0,2)–(0,3)–(0,4): (0,2) в блоке 0, (0,3)–(0,4) в блоке 1.
    final rs = List<List<ThermoLink?>>.generate(9, (_) => List<ThermoLink?>.filled(9, null));
    rs[0][2] = const ThermoLink(next: [0, 3]);
    rs[0][3] = const ThermoLink(prev: [0, 2], next: [0, 4]);
    rs[0][4] = const ThermoLink(prev: [0, 3]);
    final g6 = BoardGeometry(regionsum: rs);
    final sums = [for (final row in empty) [...row]]..[0][3] = 1;
    sums[0][4] = 2;   // блок 1: 1+2 = 3 → в блоке 0 одиночная клетка обязана быть 3
    expect(isValid(sums, 0, 2, 3, 9, 3, 3, variant: 'regionsum', geometry: g6), isTrue, reason: '3 = 1+2');
    expect(isValid(sums, 0, 2, 4, 9, 3, 3, variant: 'regionsum', geometry: g6), isFalse, reason: '4 ≠ 1+2');

    // XV: X между (0,0)–(0,1) — сумма 10; между (0,1)–(0,2) знака нет — не 5 и не 10.
    final xh = List.generate(9, (_) => List.filled(9, 0))..[0][0] = 2;
    final g7 = BoardGeometry(xv: KropkiMap(h: xh, v: List.generate(9, (_) => List.filled(9, 0))));
    final xrow = [for (final row in empty) [...row]]..[0][1] = 3;
    expect(isValid(xrow, 0, 0, 7, 9, 3, 3, variant: 'xv', geometry: g7), isTrue, reason: '7+3 = 10 под X');
    expect(isValid(xrow, 0, 0, 6, 9, 3, 3, variant: 'xv', geometry: g7), isFalse, reason: '6+3 ≠ 10');
    expect(isValid(xrow, 0, 2, 2, 9, 3, 3, variant: 'xv', geometry: g7), isFalse, reason: 'без знака 2+3 = 5 нельзя');
    expect(isValid(xrow, 0, 2, 4, 9, 3, 3, variant: 'xv', geometry: g7), isTrue, reason: 'без знака 4+3 = 7 можно');
  });
}

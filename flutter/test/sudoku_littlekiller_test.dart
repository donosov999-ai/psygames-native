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

/// 🔴 МАЛЫЙ КИЛЛЕР (6aecf181 п.8, задача 2dddd227): число со стрелкой снаружи доски — сумма цифр на
/// диагонали, цифры на ней могут повторяться. Ходы против живого ядра сверяет `sudoku_rules_test`
/// (эталон выгрузки); здесь — то, что видит человек: подсказки на своих местах кольца, со стрелкой,
/// доска не вылезает за узкий экран; имя и правило словами на 12 языках; снимок партии их хранит.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final data = jsonDecode(File('test/fixtures/sudoku-rules-reference.json').readAsStringSync()) as Map<String, Object?>;
  final ref = (data['boards'] as List).cast<Map<String, Object?>>().firstWhere((b) => b['variant'] == 'littlekiller');
  List<List<int>> ints(Object? v) => [for (final row in v! as List) [for (final x in row as List) (x as num).toInt()]];
  final solution = ints(ref['solution']);
  final extras = (ref['extras'] as Map).cast<String, Object?>();
  final clues = LittleKillerClue.fromJson(extras['littlekiller'])!;

  test('разбор выгрузки: подсказки, клетки, гнёзда — и суммы сходятся с решением', () {
    expect(clues, hasLength(10));
    expect({for (final k in clues) '${k.slot.side}${k.slot.i}'}, hasLength(10), reason: 'одно гнездо — одна подсказка');
    for (final k in clues) {
      final cells = k.cells(9);
      expect(cells.length, greaterThanOrEqualTo(3));
      expect(k.sum, cells.fold<int>(0, (t, rc) => t + solution[rc.$1][rc.$2]));
      for (final (r, c) in cells) {
        expect(k.on(r, c), isTrue);
      }
    }
    expect(BoardGeometry.fromJson({'littlekiller': extras['littlekiller']}).littleKiller, hasLength(10));
  });

  test('🔴 правило: повтор цифры на диагонали разрешён, сумма держится сверху и снизу', () {
    const k = LittleKillerClue(r: 0, c: 0, dc: 1, sum: 10);
    final g = List.generate(9, (_) => List.filled(9, 0));
    g[0][0] = 1;
    final geo = BoardGeometry(littleKiller: const [k]);
    expect(isValid(g, 1, 1, 1, 9, 3, 3, variant: 'littlekiller', geometry: geo), isFalse,
        reason: 'тут повтор 1 запрещает блок (0,0)-(1,1) — классика, не правило');
    expect(littleKillerOk(g, 1, 1, 1, const [k], 9), isTrue, reason: 'само правило повтор разрешает');
    expect(littleKillerOk(g, 1, 1, 3, const [k], 9), isFalse, reason: '1 + 3 + 7 пустых по 1 = 11 > 10');
    expect(isValid(g, 4, 4, 9, 9, 3, 3, variant: 'littlekiller', geometry: geo), isFalse, reason: '1 + 9 + 7 = 17 > 10');
    expect(isValid(g, 4, 4, 2, 9, 3, 3, variant: 'littlekiller', geometry: geo), isTrue);
  });

  Future<void> pumpBoard(WidgetTester tester, double width) async {
    final board = SudokuBoard(
      level: 181, n: 9, br: 3, bc: 3, variant: 'littlekiller',
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

  testWidgets('🔴 кольцо подсказок: каждая сумма в своём гнезде, со стрелкой туда, куда смотрит диагональ', (tester) async {
    await pumpBoard(tester, 400);
    for (final k in clues) {
      final f = find.byKey(Key('lk-${k.slot.side}-${k.slot.i}'));
      expect(f, findsOneWidget, reason: '${k.slot}');
      expect(find.descendant(of: f, matching: find.text('${k.sum}')), findsOneWidget);
      expect(find.descendant(of: f, matching: find.byIcon(k.dc == 1 ? Icons.south_east : Icons.south_west)), findsOneWidget);
    }
    // Подсказка стоит на шаг ПОЗАДИ клетки-старта по своей диагонали: (r − 1, c − dc). Меряется от
    // клетки, а не через `slot`, — иначе сдвинутое гнездо прошло бы само с собой.
    for (final k in clues) {
      final t = tester.getRect(find.byKey(Key('cell_${k.r}_${k.c}')));
      final r = tester.getRect(find.byKey(Key('lk-${k.slot.side}-${k.slot.i}')));
      final reason = 'старт (${k.r},${k.c}) dc=${k.dc}: подсказка $r, клетка $t';
      expect(r.center.dy, lessThan(t.top), reason: '$reason — подсказка выше старта');
      expect((r.center.dy - (t.center.dy - t.height)).abs(), lessThan(t.height * 0.5), reason: reason);
      expect((r.center.dx - (t.center.dx - k.dc * t.width)).abs(), lessThan(t.width * 0.5), reason: reason);
    }
  });

  testWidgets('узкий экран 320: кольцо и доска в ширине, каркас не переполнен', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    await pumpBoard(tester, 320);
    expect(tester.takeException(), isNull);
    for (final k in clues) {
      final r = tester.getRect(find.byKey(Key('lk-${k.slot.side}-${k.slot.i}')));
      expect(r.left, greaterThanOrEqualTo(0));
      expect(r.right, lessThanOrEqualTo(320));
    }
  });

  test('снимок партии хранит подсказки в форме веба и поднимает их обратно', () {
    final web = webGeometry(extras);
    expect(web['littlekiller'], extras['littlekiller']);
    expect(BoardGeometry.fromJson(exportGeometry(web)).littleKiller, hasLength(10));
  });

  for (final lang in ['ru', 'en', 'de', 'es', 'fr', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi']) {
    test('имя и правило малого киллера словами — $lang', () async {
      await L.load(lang);
      for (final k in ['sdkRule_littlekiller', 'sudokuRuleLittlekiller']) {
        expect(L.has(k), isTrue, reason: '$lang: нет $k');
      }
      expect(variantTitle('littlekiller'), L.t('sdkRule_littlekiller'));
      expect(variantRuleKey('littlekiller'), 'sudokuRuleLittlekiller');
    });
  }
}

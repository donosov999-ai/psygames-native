// «Подлодки» (MindLab submarinos/sea.py): перенос правил и бота, лестница, партия нажатиями.
//
// Эталон: test/fixtures/submarines-reference.json (flutter/tool/record_submarines_reference.py) —
// вероятностная карта бота и множество его ходов в 40 состояниях живого движка.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/submarines/model.dart';
import 'package:psygames_flutter/games/submarines/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/session_report.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => L.load('ru'));
  tearDown(() {
    LessonUsed.reset();
    SessionReport.sink = null;
  });

  group('перенос sea.py', () {
    final ref = jsonDecode(File('test/fixtures/submarines-reference.json').readAsStringSync()) as Map<String, dynamic>;
    final states = (ref['states'] as List).cast<Map<String, dynamic>>();

    test('эталон: поле 10×10 и флот 5/4/3/3/2 — как в движке', () {
      expect(ref['size'], 10);
      expect([for (final f in ref['fleet'] as List) (f as List)[1]], [for (final s in standardFleet) s.length]);
      expect([for (final f in ref['fleet'] as List) (f as List)[0]], [for (final s in standardFleet) s.name]);
    });

    for (final st in states) {
      test('🔴 зерно ${st['seed']}: карта бота и его выбор совпадают с живым движком', () {
        final shots = <Cell, bool>{
          for (final s in (st['shots'] as List).cast<List>()) (s[0] as int, s[1] as int): s[2] == 1,
        };
        final sunk = (st['sunk'] as List).cast<String>().toSet();
        final prob = probMap(10, standardFleet, shots, sunk);
        final want = {for (final p in (st['prob'] as List).cast<List>()) (p[0] as int, p[1] as int): p[2] as int};
        expect(prob, want, reason: 'карта разошлась');
        final (kind, cand) = aiCandidates(10, standardFleet, shots, sunk);
        expect(kind.name, st['kind']);
        final got = cand.toSet().toList()..sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
        expect([for (final c in got) [c.$1, c.$2]], st['candidates'], reason: 'бот выбирает из других клеток');
      });
    }

    test('🔴 бот на стандартном поле: среднее по 100 флотам рядом с движком (65,5)', () {
      final shots = <int>[];
      for (var seed = 1; seed <= 100; seed++) {
        final sea = Sea.random(10, standardFleet, Random(seed));
        shots.add(botShots(sea, Random(seed + 1000)));
      }
      final mean = shots.reduce((a, b) => a + b) / shots.length;
      final want = ((ref['botShots'] as Map)['mean'] as num).toDouble();
      // Генераторы случайности разные — флоты и броски другие, правила те же: среднее
      // обязано быть рядом, а не совпадать.
      // ignore: avoid_print
      print('БОТ: Dart ${mean.toStringAsFixed(1)} против движка ${want.toStringAsFixed(1)} выстрела');
      expect(mean, closeTo(want, 6), reason: 'бот Dart в среднем $mean против $want у движка');
    });

    test('выстрел: мимо / попал / потопил; повтор и вне поля — ошибка правил', () {
      final sea = Sea(size: 10, fleet: const [ShipSpec('D', 2)], ships: {'D': [(0, 0), (0, 1)]});
      expect(sea.fire(5, 5), (ShotResult.miss, null));
      expect(sea.fire(0, 0), (ShotResult.hit, 'D'));
      expect(sea.fire(0, 1), (ShotResult.sunk, 'D'));
      expect(sea.done, isTrue);
      expect(() => sea.fire(0, 1), throwsStateError);
      expect(() => sea.fire(10, 10), throwsArgumentError);
    });
  });

  group('лестница и доска', () {
    test('🔴 ступени: поле и флот растут, множитель бюджета убывает, соседние не повторяются', () {
      String? prev;
      for (var level = 1; level <= 19; level++) {
        final lv = subLevelFor(level);
        expect(lv.signature, isNot(prev), reason: 'L$level повторяет L${level - 1}');
        prev = lv.signature;
        if (level > 1) {
          final p = subLevelFor(level - 1);
          expect(lv.size, greaterThanOrEqualTo(p.size));
          expect(lv.cells, greaterThanOrEqualTo(p.cells));
          expect(lv.factor, lessThan(p.factor), reason: 'L$level: бюджет не стал строже');
        }
      }
      expect(subLevelFor(9).fleet, standardFleet);
      expect(subLevelFor(19).factor, closeTo(1.1, 1e-9));
      expect(subLevelFor(40).factor, closeTo(1.1, 1e-9), reason: 'ниже границы 1,1');
    });

    test('раздача 12 ступеней × 20 зёрен: флот в поле без пересечений, бюджет честный', () {
      for (var level = 1; level <= 12; level++) {
        final rnd = Random(level * 5);
        for (var k = 0; k < 20; k++) {
          final b = SubBoard.deal(level, rnd);
          final cells = [for (final s in b.sea.ships.values) ...s];
          expect(cells.toSet(), hasLength(b.level.cells), reason: 'L$level: корабли пересеклись');
          for (final (r, c) in cells) {
            expect(r >= 0 && r < b.level.size && c >= 0 && c < b.level.size, isTrue);
          }
          for (final s in b.level.fleet) {
            final ship = b.sea.ships[s.name]!;
            final straight = ship.every((x) => x.$1 == ship.first.$1) || ship.every((x) => x.$2 == ship.first.$2);
            expect(straight, isTrue, reason: 'корабль не прямой');
          }
          expect(b.budget, greaterThanOrEqualTo(b.level.cells + 2));
          expect(b.budget, min(b.level.size * b.level.size, max(b.level.cells + 2, (b.bot * b.level.factor).ceil())),
              reason: 'L$level: бюджет не по формуле «бот × множитель»');
          expect(b.budget, greaterThanOrEqualTo(b.bot), reason: 'бюджет меньше, чем нужно самому боту');
        }
      }
    });
  });

  group('экран', () {
    late List<Map<String, dynamic>> reports;

    Future<void> open(WidgetTester tester, {int level = 1, int seed = 5, Size? screen}) async {
      if (screen != null) {
        tester.view.devicePixelRatio = 1.0;
        tester.view.physicalSize = screen;
        addTearDown(tester.view.reset);
      }
      SharedPreferences.setMockInitialValues({
        if (level != 1) '${SharedState.prefix}submarines_level_nzt48': '$level',
      });
      reports = [];
      SessionReport.sink = (json) async => reports.add(jsonDecode(json) as Map<String, dynamic>);
      final state = await SharedState.open();
      await tester.pumpWidget(MaterialApp(home: SubmarinesScreen(key: UniqueKey(), state: state, seed: seed)));
      await tester.pump();
      await tester.pump();
    }

    Future<void> fireAt(WidgetTester tester, Cell c) async {
      await tester.tap(find.byKey(ValueKey('sub-cell-${c.$1}-${c.$2}')));
      await tester.pump();
    }

    testWidgets('🔴 флот потоплен в бюджет — ступень взята, партия записана', (tester) async {
      await open(tester, level: 3, seed: 7);
      final b = SubBoard.deal(3, Random(7));
      for (final ship in b.sea.ships.values) {
        for (final c in ship) {
          await fireAt(tester, c);
        }
      }
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.byKey(const ValueKey('sub-next')), findsOneWidget, reason: 'партия не закончилась');
      expect(find.textContaining(L.t('nextLabel')), findsOneWidget);
      final d = reports.single['details'] as Map<String, dynamic>;
      expect(reports.single['game_type'], 'submarines');
      expect(d['shots'], b.level.cells);
      expect(d['budget'], b.budget);
      expect(d['bot'], b.bot);
    });

    testWidgets('🔴 бюджет кончился, флот цел — ступень не взята, флот показан', (tester) async {
      await open(tester, level: 1, seed: 2);
      final b = SubBoard.deal(1, Random(2));
      final ship = {for (final s in b.sea.ships.values) ...s};
      final water = [
        for (var r = 0; r < b.level.size; r++)
          for (var c = 0; c < b.level.size; c++)
            if (!ship.contains((r, c))) (r, c),
      ];
      for (var i = 0; i < b.budget; i++) {
        await fireAt(tester, water[i]);
      }
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.textContaining(L.t('retry')), findsWidgets, reason: 'флот цел, а ступень взята');
      // Мерим НАРИСОВАННОЕ, а не ключ: ключ клетки считается отдельно от рамки, и проба по
      // ключу оставалась зелёной, когда рамку убрали (мутация 01.10.2026).
      final revealed = find.descendant(
        of: find.byKey(ValueKey('sub-reveal-${ship.first.$1}-${ship.first.$2}')),
        matching: find.byType(Container),
      );
      final deco = tester.widget<Container>(revealed.first).decoration as BoxDecoration;
      expect(deco.border, isNotNull, reason: 'после провала флот не показан');
      expect(reports.single['details']['sunk'], 0);
    });

    testWidgets('повторный выстрел в ту же клетку не тратит бюджет', (tester) async {
      await open(tester, level: 1, seed: 4);
      await fireAt(tester, (0, 0));
      await fireAt(tester, (0, 0));
      expect(find.textContaining('1/'), findsWidgets, reason: 'повтор засчитан выстрелом');
    });

    testWidgets('разбор называет приёмы: шахматка, добивание по линии, карта вероятностей', (tester) async {
      await open(tester, level: 2, seed: 3);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pumpAndSettle();
      expect(find.textContaining(L.t('teachSubParity').substring(0, 25)), findsWidgets);
      expect(LessonUsed.inRound, isTrue);
      for (final key in ['teachSubParity', 'teachSubFinish', 'teachSubHeat']) {
        expect(L.t(key), isNot(key), reason: '$key не собран в словарь');
      }
    });

    testWidgets('🔴 раскладка: поле 10×10 на 320×568 — внутри поля, клетка не мельче 26 точек', (tester) async {
      await open(tester, level: 9, seed: 1, screen: const Size(320, 568));
      final field = tester.getRect(find.byKey(const Key('game-field')));
      final board = tester.getRect(find.byKey(const ValueKey('sub-board')));
      expect(board.top >= field.top - 0.5 && board.bottom <= field.bottom + 0.5, isTrue, reason: 'поле вне: $board');
      expect(board.left >= field.left - 0.5 && board.right <= field.right + 0.5, isTrue);
      final cell = tester.getRect(find.byKey(const ValueKey('sub-cell-0-0')));
      expect(cell.width >= 26, isTrue, reason: 'клетка мельче пальца: $cell');
    });
  });
}

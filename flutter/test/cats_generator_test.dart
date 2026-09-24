import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/rules.dart';

/// 🔴 ГЕНЕРАТОР ПРОВЕРЯЕТСЯ ТЕМ, ЧТО ОБЕЩАЕТ ИГРОКУ, А НЕ ТЕМ, ЧТО УДОБНО СЧИТАТЬ.
///
/// Обещаний три, и каждое ломается по-своему:
///   1. решение ЕСТЬ — иначе задача нечестна;
///   2. решение ЕДИНСТВЕННО — иначе человек доходит до развилки и вынужден гадать,
///      а проигрыш выглядит несправедливостью;
///   3. карта покрыта целиком, и в каждой области ровно одна кошка — иначе на поле
///      дырка без цвета или цвет, в котором кошке места нет.
void main() {
  const sizes = [6, 7, 8, 9, 10];

  test('🔴 у каждой выданной задачи ровно ОДНО решение', () {
    for (final n in sizes) {
      for (var i = 0; i < 6; i++) {
        final p = generateCats(n, 'единственность-$n-$i');
        expect(p, isNotNull, reason: 'поле $n×$n, заход $i: задача не собралась');
        expect(countCatSolutions(p!.board.regions, n, limit: 3), 1,
            reason: 'поле $n×$n, заход $i: решений должно быть ровно одно');
      }
    }
  });

  test('🔴 разгадка не нарушает ни одного из трёх правил', () {
    for (final n in sizes) {
      final p = generateCats(n, 'законность-$n')!;
      final b = p.board;
      expect(catsSolved(b, b.solutionCells), isTrue, reason: 'поле $n×$n');

      // Столбцы не повторяются, соседние строки не ставят кошек вплотную.
      expect(b.solution.toSet().length, n, reason: 'столбцы разные');
      for (var r = 1; r < n; r++) {
        expect((b.solution[r] - b.solution[r - 1]).abs(), greaterThan(1),
            reason: 'строки $r и ${r - 1} не касаются');
      }
    }
  });

  test('🔴 карта покрыта целиком, областей столько же, сколько строк, и в каждой одна кошка', () {
    for (final n in sizes) {
      final b = generateCats(n, 'покрытие-$n')!.board;
      final seen = <int>{};
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          final v = b.regionAt(r, c);
          expect(v, greaterThanOrEqualTo(0), reason: 'клетка ($r,$c) без области');
          expect(v, lessThan(n));
          seen.add(v);
        }
      }
      expect(seen.length, n, reason: 'областей ровно $n');

      // 🔴 ОБЛАСТЬ — ОДНО ПЯТНО, А НЕ ДВА. Генератор перекрашивает отдельные клетки,
      // чтобы сломать лишнее решение; без проверки связности область однажды
      // разорвётся, и человек увидит один цвет в двух углах поля — правило «в цвете
      // одна кошка» будет выглядеть ошибкой рисования, а не правилом.
      for (var id = 0; id < n; id++) {
        expect(regionConnected(b.regions, n, id), isTrue,
            reason: 'поле $n×$n: область $id распалась на несколько пятен');
      }

      final byRegion = <int, int>{};
      for (var r = 0; r < n; r++) {
        final reg = b.regionAt(r, b.solution[r]);
        byRegion[reg] = (byRegion[reg] ?? 0) + 1;
      }
      expect(byRegion.length, n, reason: 'кошки разложены по $n областям');
      expect(byRegion.values.every((v) => v == 1), isTrue, reason: 'в области ровно одна');
    }
  });

  test('🔴 одно зерно — одна и та же доска', () {
    final a = generateCats(9, 'повтор')!.board;
    final b = generateCats(9, 'повтор')!.board;
    expect(b.regions, a.regions, reason: 'карта та же');
    expect(b.solution, a.solution, reason: 'разгадка та же');

    final other = generateCats(9, 'повтор-2')!.board;
    expect(other.regions, isNot(a.regions), reason: 'другое зерно — другая доска');
  });

  /// ЗАМЕР, А НЕ ПРОВЕРКА: сколько карт приходится вырастить до единственной и
  /// насколько рваными выходят области. Числа печатаются, чтобы при следующей правке
  /// было с чем сравнить.
  test('замер: заходов до единственной карты и разброс размеров областей', () {
    for (final n in sizes) {
      var worst = 0, total = 0, made = 0;
      var minSize = n * n, maxSize = 0;
      for (var i = 0; i < 20; i++) {
        final p = generateCats(n, 'замер-$n-$i');
        if (p == null) continue;
        made++;
        total += p.attempts;
        if (p.attempts > worst) worst = p.attempts;
        final sizes0 = List<int>.filled(n, 0);
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            sizes0[p.board.regionAt(r, c)]++;
          }
        }
        for (final s in sizes0) {
          if (s < minSize) minSize = s;
          if (s > maxSize) maxSize = s;
        }
      }
      // ignore: avoid_print
      print('поле $n×$n: собрано $made/20 · заходов в среднем '
          '${made == 0 ? 0 : (total / made).toStringAsFixed(1)}, худший $worst · '
          'область от $minSize до $maxSize клеток');
      expect(made, 20, reason: 'поле $n×$n: не все задачи собрались');
    }
  });
}

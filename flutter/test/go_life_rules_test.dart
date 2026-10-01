import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/go_capture/life.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';

/// «ГО: ЖИЗНЬ» — ПРОБЫ БЕНСОНА И РЕШАТЕЛЯ (задача 66dee70c, часть 2).
void main() {
  GoPosition parse(List<String> rows, {int toMove = goBlack}) => GoPosition(
    rows.length,
    [
      for (final r in rows)
        for (final ch in r.split(''))
          ch == 'X'
              ? goBlack
              : ch == 'O'
              ? goWhite
              : goEmpty,
    ],
    toMove: toMove,
  );

  test('Бенсон на известных формах: два глаза — жива; один большой глаз — нет; ложный глаз — нет', () {
    // Два отдельных глаза в углу.
    final two = parse([
      '.X.X.',
      'XXXXX',
      'OOOOO',
      '.....',
      '.....',
    ]);
    expect(bensonAlive(two, goBlack), containsAll([1, 3, 5, 6, 7, 8, 9]));
    // Один глаз из трёх пунктов в ряд — не безусловно жива (белые сыграют в центр).
    final one = parse([
      '...XO',
      'XXXXO',
      'OOOOO',
      '.....',
      '.....',
    ]);
    expect(bensonAlive(one, goBlack), isEmpty);
    // Ложный глаз: пункт 2 окружён двумя РАЗНЫМИ цепочками — живого района у каждой
    // по одному.
    final falseEye = parse([
      '.X.XO',
      'XO.XO',
      'X.XXO',
      'XXOOO',
      'OO...',
    ]);
    expect(bensonAlive(falseEye, goBlack), isEmpty);
  });

  test('🔴 надёжность Бенсона: живые камни не снять, даже если белые ходят подряд 60 раз (50 живых позиций)', () {
    final rng = Random(20261002);
    var checkedAlive = 0;
    for (var t = 0; t < 20000 && checkedAlive < 50; t++) {
      final n = 5 + rng.nextInt(3);
      final pts = List<int>.filled(n * n, goEmpty);
      for (var i = 0; i < n * n; i++) {
        final r = rng.nextDouble();
        pts[i] = r < 0.5 ? goBlack : r < 0.72 ? goWhite : goEmpty;
      }
      var pos = GoPosition(n, pts, toMove: goWhite);
      // Без мёртвых групп на старте.
      var dead = false;
      for (var i = 0; i < n * n && !dead; i++) {
        if (pts[i] != goEmpty && pos.group(i).liberties.isEmpty) dead = true;
      }
      if (dead) continue;
      final alive = bensonAlive(pos, goBlack);
      if (alive.isEmpty) continue;
      checkedAlive++;
      for (var k = 0; k < 60; k++) {
        final moves = pos.legalMoves();
        if (moves.isEmpty) break;
        // Белые ходят, чёрные пасуют.
        pos = pos.play(moves[rng.nextInt(moves.length)])!;
        pos = pos.play(-1)!;
        for (final s in alive) {
          expect(pos.at(s), goBlack, reason: 'позиция $t, ход $k: живой камень $s снят');
        }
      }
    }
    expect(checkedAlive, 50);
  });

  test('решатель «живи»: жизненный пункт — жизнь за 1; без него — нет', () {
    // Глаз из трёх пунктов в ряд у края: центр — жизненный пункт.
    final pos = parse([
      '...XO.',
      'XXXXO.',
      'OOOOO.',
      '......',
      '......',
      '......',
    ]);
    final s = LifeSolver();
    expect(s.lives(pos, 3, 1), GoVerdict.yes);
    expect(s.winningMoves(pos, 3, 1), [1]);
    // Белые ходят первыми в центр — жить нельзя.
    final killed = parse([
      '.O.XO.',
      'XXXXO.',
      'OOOOO.',
      '......',
      '......',
      '......',
    ]);
    expect(s.lives(killed, 3, 2), GoVerdict.no);
  });
}

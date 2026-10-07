import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/generator.dart';
import 'package:psygames_flutter/games/cats/grade.dart';

/// 🔴 МЕРА «КОШЕК» САМА ПО СЕБЕ (задача a7987915).
///
/// Проба лестницы мерит раздачу той же [gradeCats], что и отбор, — испорченная мера там
/// согласилась бы сама с собой. Здесь мера проверяется против того, чего она изменить не
/// может: разгадки и того, что каждый приём действительно работает.
void main() {
  test('🔴 мера приходит к разгадке и пользуется каждым приёмом', () {
    final uses = {for (final s in CatsStep.values) s: 0};
    var maps = 0;
    for (final n in [6, 7, 8, 9, 10]) {
      for (final balance in [0.0, 0.5, 1.0]) {
        for (var i = 0; i < 20; i++) {
          final p = generateCats(n, 'мера|$n|$balance|$i', balance: balance);
          if (p == null) continue;
          maps++;
          // Неверное вычёркивание уводит решатель мимо разгадки — это ловит утверждение
          // в конце gradeCats (в пробах утверждения включены).
          final g = gradeCats(p.board);
          expect(g.tier, inInclusiveRange(1, 5));
          expect(g.cost, greaterThanOrEqualTo(g.steps), reason: 'цена — сумма ступеней, каждая ≥ 1');
          for (final s in CatsStep.values) {
            uses[s] = uses[s]! + g.uses[s]!;
          }
        }
      }
    }
    expect(maps, greaterThan(250));
    for (final s in CatsStep.values) {
      expect(uses[s], greaterThan(0), reason: 'приём ${s.name} не сработал ни разу на $maps картах — выключен?');
    }
  });

  test('одна и та же карта — одна и та же мера', () {
    final b = generateCats(8, 'повтор', balance: 1.0)!.board;
    final a = gradeCats(b), c = gradeCats(b);
    expect([a.tier, a.cost, a.steps], [c.tier, c.cost, c.steps]);
  });
}

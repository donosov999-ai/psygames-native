import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/generator/contract.dart';
import 'package:psygames_flutter/shell/generator/engine.dart';
import 'package:psygames_flutter/shell/generator/ladder_pool.dart';

/// Пул из лестницы — общий путь подключения игры к генератору (задача 543d853c).
void main() {
  test('шаблон на ступень: имена из ключей, полосы по порядку, рейтинг от пола до потолка', () {
    final pool = ladderPool(gameId: 'g', stepKeys: ['a', 'b', 'c', 'd', 'e']);
    expect(pool.map((t) => t.id), ['g:a', 'g:b', 'g:c', 'g:d', 'g:e']);
    expect(pool.map((t) => t.band), [1, 2, 3, 4, 5]);
    expect(pool.first.rating, ratingFloor);
    expect(pool.last.rating, ratingCeil);
    for (var i = 1; i < pool.length; i++) {
      expect(pool[i].rating, greaterThan(pool[i - 1].rating));
    }
  });

  test('одна ступень — середина шкалы; пустая лестница — пустой пул и честный «нечего выбрать»', () {
    expect(ladderPool(gameId: 'g', stepKeys: ['x']).single.rating, (ratingFloor + ratingCeil) / 2);
    expect(ladderPool(gameId: 'g', stepKeys: const []), isEmpty);
    expect(pickNext(AdaptiveState(), const [], Leniency.normal), isNull);
  });

  test('🔴 новичок (1200) получает ступень у своего рейтинга, а не первую и не последнюю', () {
    // Пять ступеней: 800 · 1150 · 1500 · 1850 · 2200; цель «Обычной» — 1220.
    final pool = ladderPool(gameId: 'g', stepKeys: ['a', 'b', 'c', 'd', 'e']);
    expect(pickNext(AdaptiveState(), pool, Leniency.normal)!.band, 2);
  });
}

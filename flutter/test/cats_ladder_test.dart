import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cats/grade.dart';
import 'package:psygames_flutter/games/cats/ladder.dart';
import 'package:psygames_flutter/games/cats/rules.dart';

/// 🔴 ЛЕСТНИЦА «КОШЕК»: СТУПЕНЬ ЗАСЛУЖИВАЕТ СВОЁ ИМЯ (задача a7987915).
///
/// Ступень — окно меры [gradeCats] (нужный приём и цена). Проба мерит раздачу ЗАНОВО, а не
/// верит флагу `inWindow`: иначе испорченная мера и испорченный отбор согласились бы друг
/// с другом. Образец формы — `frontend/src/__tests__/sudoku-tier-is-a-measure.test.ts`.
void main() {
  test('🔴 окна идут вверх без перекрытий: приём сильнее или при том же — дороже', () {
    expect(catsLevelCount, greaterThanOrEqualTo(10));
    for (var k = 2; k <= catsLevelCount; k++) {
      final a = catsLevel(k - 1), b = catsLevel(k);
      final up = b.tier > a.tier || (b.tier == a.tier && b.minCost > a.maxCost);
      expect(up, isTrue, reason: 'ступень $k (приём ${b.tier}, цена ${b.minCost}…) не выше ступени ${k - 1}');
    }
  });

  test('🔴 каждая раздача — в окне своей ступени по перемеру, и решение единственно', () {
    for (var lv = 1; lv <= catsLevelCount; lv++) {
      final cfg = catsLevel(lv);
      final misses = <String>[];
      for (var i = 0; i < 12; i++) {
        final d = dealCatsLevel(lv, 'гейт|$lv|$i')!;
        final again = gradeCats(d.puzzle.board);
        if (!inCatsWindow(cfg, again)) misses.add('приём ${again.tier} цена ${again.cost}');
        expect(countCatSolutions(d.puzzle.board.regions, cfg.n), 1,
            reason: 'ступень $lv, раздача $i: решение не единственно');
      }
      final top = cfg.maxCost >= 1 << 29 ? '∞' : '${cfg.maxCost}';
      expect(misses, isEmpty,
          reason: 'ступень $lv (приём ${cfg.tier}, цена ${cfg.minCost}…$top): мимо окна ${misses.join(' · ')}');
    }
  });

  test('🔴 размер — не ось: поле на лестнице и растёт, и убывает, а мера только растёт', () {
    var shrinks = 0;
    for (var k = 2; k <= catsLevelCount; k++) {
      if (catsLevel(k).n < catsLevel(k - 1).n) shrinks++;
    }
    expect(shrinks, greaterThan(0), reason: 'лестница снова растит только размер — замер 01.10 показал, что он трудности не даёт');
  });

  test('отбор не зависает: при одной попытке карта всё равно есть', () {
    final d = dealCatsLevel(catsLevelCount, 'одна', attempts: 1);
    expect(d, isNotNull);
    expect(d!.grade.tier, inInclusiveRange(1, 5));
  });

  test('уровень выше измеренного — последняя ступень, а не падение', () {
    expect(catsLevel(500), catsLevel(catsLevelCount));
    expect(catsLevel(0), catsLevel(1));
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/contract.dart';
import 'package:psygames_flutter/games/sudoku/generator/engine.dart';
import 'package:psygames_flutter/games/sudoku/generator/pool.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';

/// 🔴 ПУЛ СОБИРАЕТСЯ ИЗ ЖИВОЙ ЛЕСТНИЦЫ, И ЭТО ПРОВЕРЯЕТСЯ ЧИСЛАМИ.
///
/// Вариант В: генератор опирается на прописанные 92 ступени. Значит пул обязан
/// накрывать ВСЕ правила лестницы — иначе часть игры просто исчезнет с пути генератора,
/// и заметит это игрок, а не проба. Плюс начальный рейтинг обязан быть монотонным по
/// нашей мере: доска, которую мера считает труднее, не может получить рейтинг ниже.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SudokuLevels levels;
  late List<Template> pool;

  setUpAll(() async {
    levels = await SudokuLevels.load();
    pool = buildPool(levels);
  });

  test('🔴 в пуле есть КАЖДОЕ правило лестницы', () {
    final ladderVariants = <String>{};
    for (var lv = 1; lv <= 92; lv++) {
      final cfg = levels.config(lv);
      ladderVariants.add(cfg.fromBank ? 'none' : cfg.variant);
    }
    final poolVariants = pool.map((t) => t.variant).toSet();
    final lost = ladderVariants.difference(poolVariants);
    expect(lost, isEmpty, reason: 'правила выпали из пула: ${lost.join(', ')}');
    expect(ladderVariants.length, greaterThan(12), reason: 'правил на лестнице: ${ladderVariants.length}');

    // ⚠️ ПРОВЕРЯТЬ ТОЛЬКО ИМЕНА ПРАВИЛ МАЛО, И ЭТО НЕ ТЕОРИЯ. Мутация «банковские
    // ступени в пул не попадают» прошла мимо первой редакции: классика 'none' в пуле
    // оставалась — её давали маленькие доски 6×6 первых уровней, — а полсотни
    // банковских ступеней исчезали молча. Поэтому банк считается отдельно и числом.
    final ladderBands = <int>{};
    for (var lv = 1; lv <= 92; lv++) {
      if (levels.config(lv).fromBank) ladderBands.add((levels.bankRating(lv) * 10).round());
    }
    final poolBands = pool
        .where((t) => t.id.startsWith('sudoku:bank:'))
        .map((t) => t.band)
        .toSet();
    expect(poolBands, ladderBands,
        reason: 'полос банка на лестнице ${ladderBands.length}, в пуле ${poolBands.length}');
    expect(ladderBands.length, greaterThan(2), reason: 'банковских полос: ${ladderBands.length}');
  });

  test('🔴 шаблон — на пару (правило, полоса), а не на ступень лестницы', () {
    // 92 ступени дают заметно меньше шаблонов: вариант живёт по 4–5 ступеней подряд.
    expect(pool.length, lessThan(60), reason: 'шаблонов: ${pool.length} — рейтинг размажется');
    expect(pool.length, greaterThan(12), reason: 'шаблонов: ${pool.length} — правила потерялись');
    final ids = pool.map((t) => t.id).toSet();
    expect(ids.length, pool.length, reason: 'в пуле есть повторы id');
  });

  test('🔴 начальный рейтинг монотонен по нашей мере', () {
    for (var t = 1; t < maxTier; t++) {
      expect(ratingForTier(t + 1), greaterThan(ratingForTier(t)), reason: 'ступень $t → ${t + 1}');
    }
    expect(ratingForBank(9.2), greaterThan(ratingForBank(1.2)));
    // И шкалы не выходят за границы игрока.
    for (final r in [ratingForTier(1), ratingForTier(maxTier), ratingForBank(1.2), ratingForBank(9.2)]) {
      expect(r, inInclusiveRange(ratingFloor, ratingCeil));
    }
  });

  test('🔴 новичок получает лёгкое, мастер — трудное', () {
    final novice = AdaptiveState(skillRating: 900);
    final master = AdaptiveState(skillRating: 2000);
    final forNovice = pickNext(novice, pool, Leniency.normal)!;
    final forMaster = pickNext(master, pool, Leniency.normal)!;
    expect(forNovice.rating, lessThan(forMaster.rating),
        reason: 'новичку ${forNovice.rating}, masterу ${forMaster.rating}');
    expect(forNovice.rating, lessThan(1400), reason: 'новичку дали ${forNovice.rating}');
  });

  test('🔴 сто партий подряд не застревают на одном правиле', () {
    var s = AdaptiveState(skillRating: 1200);
    final counts = <String, int>{};
    for (var i = 0; i < 100; i++) {
      final t = pickNext(s, pool, Leniency.normal)!;
      counts[t.variant] = (counts[t.variant] ?? 0) + 1;
      s = applyOutcome(
        s,
        OutcomeEvent(
          eventId: 'и$i',
          task: TaskId(gameId: 'sudoku', templateId: t.id, difficultyBand: t.band, generatorVersion: 1, seed: '$i'),
          outcome: i % 4 == 0 ? Outcome.failed : Outcome.passed,
          at: DateTime(2026, 9, 23).add(Duration(minutes: i)),
        ),
        template: t,
      );
    }
    expect(counts.length, greaterThan(3),
        reason: 'за сто партий человек увидел правил: ${counts.length} — ${counts.keys.take(6).join(', ')}');
    final top = counts.values.reduce((a, b) => a > b ? a : b);
    expect(top, lessThan(70), reason: 'одно правило заняло $top партий из ста');
  });

  test('замер: сколько шаблонов и какие полосы', () {
    final byVariant = <String, int>{};
    for (final t in pool) {
      byVariant[t.variant] = (byVariant[t.variant] ?? 0) + 1;
    }
    // ignore: avoid_print
    print('шаблонов ${pool.length} · правил ${byVariant.length} · '
        'рейтинг ${pool.first.rating.round()}–${pool.last.rating.round()}');
    expect(pool, isNotEmpty);
  });

  /// 🔴 СТАРТ У ТОГО, КТО УЖЕ ИГРАЛ ЛЕСТНИЦУ — ОТ ЕГО СТУПЕНИ, А НЕ С НУЛЯ.
  /// Решение Дениса 23.09.2026 про Валю (54-я ступень): «от трудности её ступени».
  /// Без этой пробы человек с половиной пройденной лестницы получил бы на генераторе
  /// доски новичка, и путь читался бы как откат назад.
  test('🔴 пришедший с 54-й ступени стартует от её трудности, а не с 1200', () {
    final s54 = startFromLadder(levels, 54);
    expect(s54.skillRating, ratingForLevel(levels, 54));
    expect(s54.skillRating, greaterThan(AdaptiveState().skillRating),
        reason: 'на 54-й ступени человек уже труднее новичка');

    // Трудность растёт вместе со ступенью — иначе «от ступени» ничего не значит.
    final s8 = startFromLadder(levels, 8);
    final s80 = startFromLadder(levels, 80);
    expect(s8.skillRating, lessThan(s54.skillRating), reason: '8-я легче 54-й');
    expect(s54.skillRating, lessThanOrEqualTo(s80.skillRating), reason: '54-я не труднее 80-й');

    // 🔴 А ВОТ НОМЕР НЕ НАСЛЕДУЕТСЯ: победы на генераторе ещё не сыграны.
    expect(s54.adaptiveWins, 0, reason: 'счётчик побед генератора начинается с нуля');
    expect(s54.ratingUncertainty, greaterThanOrEqualTo(300),
        reason: 'ступень говорит ЧТО проходил, но не НАСКОЛЬКО уверенно');
  });
}

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/generator/contract.dart';
import 'package:psygames_flutter/games/sudoku/generator/engine.dart';
import 'package:psygames_flutter/games/sudoku/generator/pool.dart';
import 'package:psygames_flutter/games/sudoku/levels.dart';

/// 🔴 ПРИЁМКА §9.10: СИНТЕТИЧЕСКИЕ ИГРОКИ НА НАСТОЯЩЕМ ПУЛЕ.
///
/// «Синтетические игроки нескольких уровней показывают сходимость выбора к своей полосе
/// и отсутствие вечной ловушки на одном слабом правиле. Порог сходимости и целевая доля
/// побед фиксируются ДО живого пилота» (`~/dev/psygames/sudoku-chat/GENERATOR_LEVELS.md`).
/// Пороги ниже поставлены 30.09.2026 по замеру — до того, как пилот включил живой человек.
///
/// Игрок с настоящим навыком S играет партию против шаблона с рейтингом R и выигрывает
/// с вероятностью той же логистики, что у движка (`expectedScore`). Движок не знает S —
/// он видит только исходы. По 20 игроков на точку, зерно фиксировано: проба
/// воспроизводима, а не «обычно зелёная».
///
/// ЗАМЕР 30.09.2026 (пул 34 шаблона, 16 правил, рейтинг 800–1955; медиана / худший из 20):
///   навык   40 партий   160 партий   доля побед (хвост 160)   одно правило подряд
///    900    158 / 204    62 / 105          0,40                    до 5
///   1200     32 /  74    27 /  87          0,42                     1
///   1500    132 / 184    27 /  71          0,55                     1
///   1800    281 / 350    46 / 103          0,60                     1
///   2100    528 / 552   108 / 154          0,85                     1
///   переоценённый старт (ступень 54 = 1692,5, настоящий навык 1300), 80 партий: 75 / 196
///   слабое правило (−400 на одном правиле), игрок 1500, 120 партий: доля правила в хвосте ≤ 0,13
///
/// ⚠️ ДВЕ ГРАНИЦЫ, ПОДПИСАННЫЕ ЗАМЕРОМ, — НЕ ДЕФЕКТ ДВИЖКА, А ПОКРЫТИЕ ПУЛА:
///   · СНИЗУ: ниже 1267 в пуле только классика — три шаблона (800, 800, 853), дальше
///     провал в 414 очков до первого вариантного (tier3 = 1267). Слабому игроку правилу
///     «не подряд» переключать не на что: классика идёт до пяти раз подряд.
///   · СВЕРХУ: самый трудный шаблон — банк 1955. Игрок сильнее выигрывает 85 % —
///     трудности, которая его остановит, в пуле нет.
/// Обе растут не правкой движка, а новыми шаблонами: вариантные доски ступеней 1–2 снизу,
/// сетки Тэтхэма и комбо сверху (задача 155ac7c7). Пробы-храповики ниже краснеют, если
/// граница станет хуже, — и должны быть опущены, когда её сдвинут.
///
/// ⚠️ И ОДНА НАХОДКА ДЛЯ КАЛИБРОВКИ (§10 шаг 4): на 40 партиях игрок 1800 с холодного
/// старта недооценён на 281. Неуверенность гаснет ×0,93 за партию независимо от того,
/// насколько исход был неожиданным, — шаг рейтинга кончается раньше, чем рейтинг доходит.
/// Это вопрос калибровки, а не пилота: пороги ниже взяты на 160 партиях.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<Template> pool;

  setUpAll(() async {
    pool = buildPool(await SudokuLevels.load());
  });

  ({double err, double wins, double weakShare, int maxRun}) play(
      double skill, AdaptiveState s, int games, int seed, {String? weakRule, double weakBy = 0}) {
    final rnd = Random(seed);
    final ratings = <double>[], rules = <String>[];
    final outcomes = <bool>[];
    for (var g = 0; g < games; g++) {
      final t = pickNext(s, pool, Leniency.normal)!;
      final eff = t.variant == weakRule ? skill - weakBy : skill;
      final won = rnd.nextDouble() < expectedScore(eff, t.rating);
      s = applyOutcome(
        s,
        OutcomeEvent(
          eventId: 'e$seed-$g',
          task: TaskId(
              gameId: 'sudoku', templateId: t.id, difficultyBand: t.band, generatorVersion: 1, seed: '$g'),
          outcome: won ? Outcome.passed : Outcome.failed,
          at: DateTime(2026, 9, 30),
        ),
        template: t,
      );
      ratings.add(s.skillRating);
      outcomes.add(won);
      rules.add(t.variant);
    }
    final tail = games ~/ 4;
    final err = ratings.sublist(games - tail).map((r) => (r - skill).abs()).reduce((a, b) => a + b) / tail;
    final wins = outcomes.sublist(games - tail).where((w) => w).length / tail;
    final tailRules = rules.sublist(games - tail);
    final weakShare = weakRule == null ? 0.0 : tailRules.where((r) => r == weakRule).length / tail;
    var maxRun = 1, run = 1;
    for (var i = 1; i < rules.length; i++) {
      run = rules[i] == rules[i - 1] ? run + 1 : 1;
      maxRun = max(maxRun, run);
    }
    return (err: err, wins: wins, weakShare: weakShare, maxRun: maxRun);
  }

  /// По 20 игроков: сортированные числа, медиана — [10].
  List<T> twenty<T extends num>(T Function(int seed) f) =>
      [for (var seed = 1; seed <= 20; seed++) f(seed)]..sort();

  for (final skill in [1200.0, 1500.0, 1800.0]) {
    test('🔴 игрок ${skill.round()}: рейтинг сходится к навыку, побед около половины', () {
      final runs = [for (var seed = 1; seed <= 20; seed++) play(skill, AdaptiveState(), 160, seed)];
      final err = runs.map((r) => r.err).toList()..sort();
      final wins = runs.map((r) => r.wins).toList()..sort();
      expect(err[10], lessThanOrEqualTo(80), reason: 'медиана ошибки рейтинга; замер 27–46');
      expect(err.last, lessThanOrEqualTo(150), reason: 'худший из 20; замер 71–103');
      expect(wins[10], inInclusiveRange(0.35, 0.65),
          reason: 'сошедшийся игрок выигрывает около половины (цель — рейтинг +20); замер 0,42–0,60');
      expect(runs.map((r) => r.maxRun).reduce(max), 1,
          reason: 'в середине шкалы правил хватает — одно правило подряд не идёт');
    });
  }

  test('🔴 старт со ступени, переоценившей игрока, сползает к навыку', () {
    final err = twenty((seed) => play(1300, AdaptiveState(skillRating: 1692.5), 80, seed).err);
    expect(err[10], lessThanOrEqualTo(120), reason: 'замер 75');
    expect(err.last, lessThanOrEqualTo(250), reason: 'замер 196');
  });

  // ⚠️ ГОРИЗОНТ 240 ПАРТИЙ, А НЕ 120 (звено 3, 30.09). Ловушка — это ПОСТОЯНСТВО, и
  // короткий хвост его не видит. С обучением рейтингов шаблонов (D3) доля слабого
  // правила в хвосте 120 партий у одного из 20 игроков дошла до 0,27 — переходный процесс,
  // пока шаблоны учатся; к 240 партиям максимум по всем четырём правилам 0,15, к 480 —
  // 0,11, медиана ≤ 0,10. Без обучения было 0,10–0,13, и провалов на слабом правиле
  // больше (90–93 % против 71–90 %): обучение ловушку не создаёт, а смягчает.
  test('🔴 слабое правило не становится ловушкой', () {
    for (final weak in ['antiking', 'antiknight', 'arrow', 'diagonal']) {
      final share = twenty((seed) =>
          play(1500, AdaptiveState(), 240, seed, weakRule: weak, weakBy: 400).weakShare);
      expect(share.last, lessThanOrEqualTo(0.25),
          reason: '$weak: игрок на 400 слабее в этом правиле не должен жить в нём; замер ≤ 0,15');
    }
  });

  test('📐 граница СНИЗУ подписана: ниже ступени техник 3 только классика — не хуже пяти подряд', () {
    // Граница — рейтинг ступени техник 3 (1266,67), а не округлённое «1267»: первая
    // редакция пробы сравнивала с 1267 и захватила сами вариантные шаблоны tier3.
    final below = pool.where((t) => t.rating < ratingForTier(3)).toList();
    expect(below.length, 3, reason: 'снизу три шаблона классики: 800, 800, 853');
    expect(below.map((t) => t.variant).toSet(), {'none'},
        reason: 'граница сдвинулась (появилось правило ниже 1267) — опусти храповик ниже');
    final runs = twenty((seed) => play(900, AdaptiveState(), 160, seed).maxRun);
    expect(runs.last, lessThanOrEqualTo(5), reason: 'замер 30.09: до пяти классических подряд');
  });

  test('📐 граница СВЕРХУ подписана: самый трудный шаблон — 1955, не ниже', () {
    expect(pool.last.rating, greaterThanOrEqualTo(1955),
        reason: 'верх пула упал — из пула выпали трудные ступени');
  });
}

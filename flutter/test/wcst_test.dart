import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/wcst/model.dart';

/// СВЕРКА WCST С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/wcst.tsx` (VER 2) в
/// `test/fixtures/wcst-reference.json`: лестница L1…L12, доля разводящих и
/// ЗАМЕР генератора по 200 000 карт на трёх долях.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/wcst-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 лестница совпадает с эталоном по всем четырём полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = WcstLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём');
      expect(l.ruleChangeStreak, row['ruleChangeStreak'], reason: '$at: серия до смены правила');
      expect(l.persevCap, row['persevCap'], reason: '$at: потолок персевераций');
      expect(l.discriminatingShare, closeTo((row['discriminatingShare'] as num).toDouble(), 1e-12),
          reason: '$at: доля разводящих');
    }
    expect(wcstMaxLevel, ref['maxLevel']);
    expect(classicDiscShare, closeTo((ref['classicDiscShare'] as num).toDouble(), 1e-12));
  });

  test('🔴 доля разводящих в равномерной раздаче СЧИТАЕТСЯ: ровно 24 из 64', () {
    // Четыре эталона, все цвета/формы/числа различны → 4³ = 64 карты.
    // Разводящих (три РАЗНЫХ эталона) 4·3·2 = 24, двух эталонов 36, одного 4.
    var three = 0, two = 0, one = 0;
    for (final c in CardColor.values) {
      for (final s in CardShape.values) {
        for (var n = 1; n <= 4; n++) {
          final spread = refSpread(WcstCard(color: c, shape: s, count: n));
          if (spread == 3) three++;
          if (spread == 2) two++;
          if (spread == 1) one++;
        }
      }
    }
    expect(three + two + one, 64);
    expect(three, 24);
    expect(two, 36);
    expect(one, 4);
    expect(classicDiscShare, closeTo(24 / 64, 1e-12));
    // ⚠️ Доля обязана быть ТОЧНОЙ, а не замеренной: иначе классический режим
    // «почти не изменится», а не «не изменится».
    expect(classicDiscShare, 0.375);
  });

  test('🔴 мёртвых переходов НЕТ: доля разводящих меняется на КАЖДОМ уровне', () {
    expect((ref['мёртвые переходы'] as List), isEmpty, reason: 'эталон уже содержит дубли');
    for (var l = 2; l <= wcstMaxLevel; l++) {
      expect(WcstLevel.of(l - 1).condition.toString(), isNot(WcstLevel.of(l).condition.toString()),
          reason: 'L$l не отличается от L${l - 1}');
      expect(WcstLevel.of(l).discriminatingShare, isNot(WcstLevel.of(l - 1).discriminatingShare),
          reason: 'L$l: доля разводящих не изменилась');
    }
    // Две прежние оси меняются реже: объём на L5 и L9, серия через уровень.
    expect(WcstLevel.of(1).trials, WcstLevel.of(4).trials);
    expect(WcstLevel.of(1).ruleChangeStreak, WcstLevel.of(2).ruleChangeStreak);
  });

  test('🔴 концы оси точные: L1 = 0,40 вплотную к классике, L12 = 1,00', () {
    expect(WcstLevel.of(1).discriminatingShare, 0.40);
    expect(WcstLevel.of(wcstMaxLevel).discriminatingShare, 1.0);
    // ⚠️ Шаг взят делением, а не зашит числом: при шаге 0,06 доля упиралась бы
    // в потолок уже на L11, и две верхние ступени снова стали бы одинаковыми.
    expect(WcstLevel.of(11).discriminatingShare, isNot(WcstLevel.of(12).discriminatingShare));
    expect(WcstLevel.of(1).discriminatingShare - classicDiscShare, closeTo(0.025, 1e-9));
    // Потолок держится за концом лестницы: формула дала бы 1,16.
    final edge = (ref['граничные уровни'] as Map).cast<String, dynamic>();
    expect(WcstLevel.of(15).discriminatingShare, (edge['15'] as Map)['discriminatingShare']);
    expect(WcstLevel.of(15).discriminatingShare, 1.0);
    expect(0.40 + (15 - 1) * 0.60 / (wcstMaxLevel - 1), greaterThan(1.0));
  });

  test('🔴 генератор карт даёт заданную долю разводящих — замером, как в TS', () {
    final want = (ref['замер генератора'] as Map).cast<String, dynamic>();
    final rnd = Random(20260923);
    const n = 200000;
    for (final entry in [[classicDiscShare, 'доля_0.375'], [0.4, 'доля_0.400'], [1.0, 'доля_1.000']]) {
      final share = entry[0] as double;
      final key = entry[1] as String;
      final spread = <int, int>{1: 0, 2: 0, 3: 0};
      for (var i = 0; i < n; i++) {
        final s = refSpread(makeTarget(share, rnd.nextDouble));
        spread[s] = spread[s]! + 1;
      }
      final w = (want[key] as Map).cast<String, num>();
      expect(spread[3]! / n, closeTo(w['три эталона']!.toDouble(), 0.01), reason: '$key: три эталона');
      expect(spread[2]! / n, closeTo(w['два эталона']!.toDouble(), 0.01), reason: '$key: два эталона');
      expect(spread[1]! / n, closeTo(w['один эталон']!.toDouble(), 0.01), reason: '$key: один эталон');
    }
  });

  test('🔴 при доле 1,0 пустых карт НЕТ вовсе — ось чинит измерение', () {
    // Карта одного эталона верна при любом правиле: «перехват за 1 ход» на ней
    // записывался, хотя человек ничего не перехватывал.
    final rnd = Random(3);
    for (var i = 0; i < 5000; i++) {
      expect(refSpread(makeTarget(1.0, rnd.nextDouble)), 3, reason: 'при доле 1,0 выпала неразводящая карта');
    }
  });

  test('🔴 правило сортировки различает признаки', () {
    const card = WcstCard(color: CardColor.r, shape: CardShape.star, count: 3);
    // Цвет указывает на эталон 0, форма на 1, число на 2 — разводящая.
    expect(refSpread(card), 3);
    expect(matchByRule(card, wcstRefCards[0], SortRule.color), isTrue);
    expect(matchByRule(card, wcstRefCards[1], SortRule.color), isFalse);
    expect(matchByRule(card, wcstRefCards[1], SortRule.shape), isTrue);
    expect(matchByRule(card, wcstRefCards[2], SortRule.count), isTrue);
    expect(matchByRule(card, wcstRefCards[0], SortRule.count), isFalse);
  });

  test('🔴 правило меняется МОЛЧА после серии верных и всегда на ДРУГОЕ', () {
    final g = WcstGame(level: 1, rnd: Random(5));
    g.begin();
    final streakNeeded = g.ruleStreak;
    expect(streakNeeded, 9, reason: 'серия L1 протухла');
    var shifts = 0;
    var seenRules = <SortRule>{g.rule};
    for (var i = 0; i < 200; i++) {
      final t = g.target;
      if (t == null) break;
      // Играем БЕЗУПРЕЧНО: находим эталон, подходящий по текущему правилу.
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
      final before = g.rule;
      expect(g.pick(idx), WcstOutcome.hit);
      if (g.closeTrial()) {
        shifts++;
        expect(g.rule, isNot(before), reason: 'правило сменилось на само себя');
        seenRules.add(g.rule);
      }
      if (!g.nextTrial()) break;
    }
    expect(shifts, greaterThan(1), reason: 'правило не сменилось ни разу');
    expect(seenRules.length, greaterThan(1));
    expect(g.categories, shifts, reason: 'закрытые серии не совпали со сдвигами');
  });

  test('🔴 пол серии держится за потолком лестницы', () {
    // На L12 пол связывает РОВНО: 9 − floor(11·6/11) = 3. Дальше формула ушла бы
    // в минус, и правило менялось бы после каждого хода.
    expect(9 - ((12 - 1) * 6 / (wcstMaxLevel - 1)).floor(), 3);
    expect(9 - ((20 - 1) * 6 / (wcstMaxLevel - 1)).floor(), lessThan(3));
    expect(WcstLevel.of(20).ruleChangeStreak, 3);
    expect(WcstLevel.of(40).ruleChangeStreak, 3);
    // ⚠️ Снизу серия НЕ зажата и не должна быть: на нулевом уровне формула даёт
    // 10 — это больше девяти, то есть правило меняется РЕЖЕ, и ничего не ломает.
    // Зажат только пол: опустись серия ниже трёх, правило менялось бы почти
    // каждый ход, и «перехватил» перестало бы отличаться от «угадал».
    expect(WcstLevel.of(0).ruleChangeStreak, 10, reason: 'уровень из хранилища бывает и нулём');
  });

  test('🔴 правило меняется по СЕРИИ ВЕРНЫХ, а не по числу ходов в блоке', () {
    // ⚠️ В безупречной партии серия верных и число ходов в блоке СОВПАДАЮТ, и
    // подмена одного другим незаметна. Играем с ошибками: там числа расходятся.
    final g = WcstGame(level: 12, rnd: Random(13));
    g.begin();
    expect(g.ruleStreak, 3, reason: 'серия L12 протухла');
    var shifts = 0, maxInBlock = 0, inBlock = 0;
    for (var i = 0; i < 400; i++) {
      final t = g.target;
      if (t == null) break;
      final byRule = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
      // Каждый четвёртый ход — нарочно мимо: серия рвётся, счётчик ходов растёт.
      final pick = i % 4 == 3
          ? [0, 1, 2, 3].firstWhere((k) => k != byRule)
          : byRule;
      final streakBefore = g.streak;
      g.pick(pick);
      inBlock++;
      if (g.closeTrial()) {
        shifts++;
        expect(streakBefore + 1, greaterThanOrEqualTo(g.ruleStreak),
            reason: 'смена правила при серии ${streakBefore + 1}');
        if (inBlock > maxInBlock) maxInBlock = inBlock;
        inBlock = 0;
      }
      if (!g.nextTrial()) {
        g.begin();
      }
    }
    expect(shifts, greaterThan(3), reason: 'смен правила не случилось');
    // Ходов в блоке к моменту смены ЗАМЕТНО больше порога серии: считай мы по
    // ходам, правило менялось бы гораздо раньше.
    // ⚠️ Считай мы по ХОДАМ, смена приходила бы РОВНО на пороге, и максимум по
    // блокам был бы в точности равен порогу. Он больше — значит считается серия.
    expect(maxInBlock, greaterThan(g.ruleStreak),
        reason: 'ходов в блоке $maxInBlock против порога серии ${g.ruleStreak}');
  });

  test('🔴 персеверация — ответ по ПРЕЖНЕМУ правилу сразу после смены', () {
    final g = WcstGame(level: 1, rnd: Random(9));
    g.begin();
    // Доводим до смены правила безупречной игрой.
    var guard = 0;
    while (!g.awaitingCatch && guard++ < 200) {
      final t = g.target!;
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
      g.pick(idx);
      g.closeTrial();
      g.nextTrial();
    }
    expect(g.awaitingCatch, isTrue, reason: 'смены правила не случилось');
    final persevBefore = g.perseverative;
    // Ищем карту, где прежнее и новое правило расходятся, и жмём по ПРЕЖНЕМУ.
    var found = false;
    for (var i = 0; i < 60 && !found; i++) {
      final t = g.target!;
      final byNew = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
      final other = [0, 1, 2, 3].where((k) => k != byNew && refSpread(t) == 3).toList();
      if (other.isEmpty) {
        g.pick(byNew);
        g.closeTrial();
        g.nextTrial();
        continue;
      }
      expect(g.pick(other.first), WcstOutcome.miss);
      found = true;
    }
    expect(found, isTrue, reason: 'разводящей карты не нашлось');
    expect(g.errors, greaterThan(0));
    // Персеверация засчитывается, только если выбор совпал с ПРЕЖНИМ правилом.
    expect(g.perseverative, greaterThanOrEqualTo(persevBefore));
  });

  test('🔴 перехват и персеверация — по шагам, на заданной раскладке', () {
    // ⚠️ Случайная партия эти правила не сторожит: в ней почти не встречается
    // нужное сочетание «ошибка ПО ПРЕЖНЕМУ правилу сразу после смены». Поэтому
    // раскладка задаётся руками, а не ищется в потоке.
    final g = WcstGame(level: 1, rnd: Random(1));
    g.begin();
    g.rule = SortRule.color;
    // Доводим до смены правила: серия набрана.
    g.streak = g.ruleStreak;
    final oldRule = g.rule;
    expect(g.closeTrial(), isTrue, reason: 'смены правила не случилось');
    expect(g.rule, isNot(oldRule));
    expect(g.awaitingCatch, isTrue);
    final newRule = g.rule;

    /// Разводящая карта: цвет, форма и число указывают на ТРИ разных эталона.
    WcstCard card() => const WcstCard(color: CardColor.r, shape: CardShape.star, count: 3);
    expect(refSpread(card()), 3);

    int refBy(SortRule r) => [0, 1, 2, 3].firstWhere((k) => matchByRule(card(), wcstRefCards[k], r));

    // ХОД 1 — ошибка ПО ПРЕЖНЕМУ правилу: это и есть персеверация.
    g.nextTrial();
    g.target = card();
    expect(g.pick(refBy(oldRule)), WcstOutcome.miss);
    expect(g.perseverative, 1, reason: 'ответ по прежнему правилу не засчитан персеверацией');
    expect(g.closeTrial(), isFalse);

    // ХОД 2 — ошибка НЕ по прежнему правилу: это метание, а не упрямство.
    final third = SortRule.values.firstWhere((r) => r != oldRule && r != newRule);
    g.nextTrial();
    g.target = card();
    expect(g.pick(refBy(third)), WcstOutcome.miss);
    expect(g.perseverative, 1, reason: 'персеверацией засчитана ЛЮБАЯ ошибка после смены');
    expect(g.closeTrial(), isFalse);

    // ХОД 3 — верный: правило перехвачено за ТРИ хода, а не за один.
    g.nextTrial();
    g.target = card();
    expect(g.pick(refBy(newRule)), WcstOutcome.hit);
    expect(g.catches, [3], reason: 'ходы после смены считаются не все, а только верные');
    expect(g.awaitingCatch, isFalse);
    expect(g.ruleCatch.mean, 3.0);
    expect(g.ruleCatch.shifts, 1);
    expect(g.closeTrial(), isFalse);

    // ХОД 4 — снова ошибка по ПРЕЖНЕМУ правилу, но окно смены УЖЕ ЗАКРЫТО:
    // персеверацией она не считается.
    g.nextTrial();
    g.target = card();
    // ⚠️ Серия к этому моменту НЕ нулевая (ход 3 был верным) — только так и
    // видно, что ошибка её обнуляет. Сразу после смены правила серия и так ноль,
    // и проверка там ничего не значила бы.
    expect(g.streak, 1, reason: 'верный ход не поднял серию');
    expect(g.pick(refBy(oldRule)), WcstOutcome.miss);
    expect(g.streak, 0, reason: 'ошибка не обнулила серию');
    expect(g.perseverative, 1, reason: 'персеверация засчитана вне окна смены правила');
  });

  test('🔴 перехват считается ходами ПОСЛЕ смены, независимо от исхода', () {
    final stats = ruleCatchStats(const [1, 3, 2]);
    expect(stats.mean, 2.0);
    expect(stats.shifts, 3);
    expect(stats.trials, const [1, 3, 2]);
    // ⚠️ Сдвигов не было — средее NULL, а не 0: ноль означал бы мгновенный
    // перехват, которого не случалось. И число сдвигов лежит рядом намеренно:
    // среднее по одному сдвигу и по пяти — разные по надёжности числа.
    final none = ruleCatchStats(const []);
    expect(none.mean, isNull);
    expect(none.shifts, 0);
    expect(none.trials, isNull);
    expect(ruleCatchStats(const [1]).mean, 1.0);
    expect(ruleCatchStats(const [1]).shifts, 1);
  });

  test('🔴 проход: мало персевераций И разумная точность', () {
    final g = WcstGame(level: 1, rnd: Random(2));
    g.begin();
    expect(g.params.persevCap, 3);
    // Ни одного хода — точности нет, уровень не взят.
    expect(g.passed, isFalse);
    // Подставляем расклад руками: точность 55 % ровно.
    final need = (g.trialsTotal * 0.55).ceil();
    expect(need, 14);
    g.hits = need;
    g.perseverative = g.params.persevCap;
    expect(g.passed, isTrue, reason: 'ровно порог не засчитан');
    g.perseverative = g.params.persevCap + 1;
    expect(g.passed, isFalse, reason: 'персевераций сверх потолка засчитано');
    g.perseverative = 0;
    g.hits = need - 1;
    expect(g.passed, isFalse, reason: 'точность ниже порога засчитана');
  });

  test('🔴 в классике серия 10, доля классическая и исхода нет', () {
    final g = WcstGame(level: 12, classic: true, rnd: Random(4));
    expect(g.ruleStreak, wcstClassicStreak);
    expect(g.ruleStreak, 10);
    expect(g.discShare, classicDiscShare);
    g.begin();
    g.hits = g.trialsTotal;
    g.perseverative = 0;
    expect(g.passed, isFalse, reason: 'классика выдала исход');
    // В уровневом режиме тот же расклад прошёл бы.
    final lvl = WcstGame(level: 12, rnd: Random(4));
    lvl.begin();
    lvl.hits = lvl.trialsTotal;
    lvl.perseverative = 0;
    expect(lvl.passed, isTrue);
  });

  test('🔴 партия кончается ровно на объёме уровня', () {
    final g = WcstGame(level: 1, rnd: Random(6));
    g.begin();
    var n = 1;
    while (true) {
      final t = g.target!;
      final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
      g.pick(idx);
      g.closeTrial();
      if (!g.nextTrial()) break;
      n++;
      expect(n, lessThanOrEqualTo(g.trialsTotal + 1));
    }
    expect(n, g.trialsTotal);
    expect(g.finished, isTrue);
  });

  test('🔴 второй выбор в пробе не засчитывается', () {
    final g = WcstGame(level: 1, rnd: Random(8));
    g.begin();
    final t = g.target!;
    final idx = [0, 1, 2, 3].firstWhere((k) => matchByRule(t, wcstRefCards[k], g.rule));
    expect(g.pick(idx), WcstOutcome.hit);
    expect(g.pick(idx), isNull, reason: 'второй выбор в той же пробе');
    expect(g.hits, 1);
    expect(g.errors, 0);
  });
}

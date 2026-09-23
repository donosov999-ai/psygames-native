import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/prl/model.dart';

/// СВЕРКА PRL С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/prl.tsx` (VER 3) в
/// `test/fixtures/prl-reference.json`: лестница L1…L15 по всем пяти полям,
/// границы уровня и проверка «мёртвых переходов нет».
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/prl-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 лестница совпадает с эталоном по всем пяти полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = PrlLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.rewardProb, closeTo((row['rewardProb'] as num).toDouble(), 1e-12), reason: '$at: шум награды');
      expect(l.trialsTotal, row['trialsTotal'], reason: '$at: объём');
      expect(l.revMin, row['revMin'], reason: '$at: нижний порог разворота');
      expect(l.revMax, row['revMax'], reason: '$at: верхний порог разворота');
      expect(l.feedbackDelayMs, row['feedbackDelayMs'], reason: '$at: задержка обратной связи');
      final want = (row['condition'] as Map).cast<String, Object?>();
      final got = l.condition;
      for (final k in want.keys) {
        expect(got[k], closeTo((want[k]! as num).toDouble(), 1e-12), reason: '$at: условие, поле $k');
      }
    }
    expect(prlMaxLevel, ref['maxLevel']);
  });

  test('🔴 мёртвых переходов НЕТ: каждый уровень отличается хоть одним полем', () {
    // Было двенадцать уровней, и L12 совпадал с L11 по всем параметрам: и шум,
    // и частота разворота упираются в свои полы уже на одиннадцатом. Третья ось
    // (задержка) довела лестницу до пятнадцати без дублей.
    expect((ref['мёртвые переходы'] as List), isEmpty, reason: 'эталон уже содержит дубли');
    for (var l = 2; l <= prlMaxLevel; l++) {
      final a = PrlLevel.of(l - 1).condition;
      final b = PrlLevel.of(l).condition;
      expect(a.toString(), isNot(b.toString()), reason: 'L$l не отличается от L${l - 1}');
    }
    // Две первые оси действительно упираются на одиннадцатом — проверяем, что
    // лестницу держит именно третья.
    expect(PrlLevel.of(11).rewardProb, PrlLevel.of(15).rewardProb);
    expect(PrlLevel.of(11).revMin, PrlLevel.of(15).revMin);
    expect(PrlLevel.of(11).feedbackDelayMs, isNot(PrlLevel.of(15).feedbackDelayMs));
  });

  test('🔴 три оси идут в свою сторону и упираются в объявленные полы', () {
    for (var l = 2; l <= prlMaxLevel; l++) {
      final a = PrlLevel.of(l - 1);
      final b = PrlLevel.of(l);
      expect(b.rewardProb <= a.rewardProb, isTrue, reason: 'L$l: награда стала чище');
      expect(b.revMin <= a.revMin, isTrue, reason: 'L$l: развороты стали реже');
      expect(b.feedbackDelayMs >= a.feedbackDelayMs, isTrue, reason: 'L$l: задержка упала');
      expect(b.revMax - b.revMin, 2, reason: 'L$l: окно разворота изменилось');
    }
    expect(PrlLevel.of(1).rewardProb, 0.90);
    expect(PrlLevel.of(15).rewardProb, 0.68);
    expect(PrlLevel.of(1).revMin, 8);
    expect(PrlLevel.of(15).revMin, 3);
    expect(PrlLevel.of(1).feedbackDelayMs, 0);
    expect(PrlLevel.of(15).feedbackDelayMs, 798);
  });

  test('🔴 полы держатся и за потолком лестницы', () {
    final edge = (ref['граничные уровни'] as Map).cast<String, dynamic>();
    for (final k in ['0', '16', '40']) {
      final want = (edge[k] as Map).cast<String, dynamic>();
      final l = PrlLevel.of(int.parse(k));
      expect(l.rewardProb, closeTo((want['rewardProb'] as num).toDouble(), 1e-12), reason: 'L$k: шум');
      expect(l.revMin, want['revMin'], reason: 'L$k: порог разворота');
      expect(l.feedbackDelayMs, want['feedbackDelayMs'], reason: 'L$k: задержка');
    }
    expect(PrlLevel.of(40).rewardProb, 0.68);
    expect(PrlLevel.of(40).revMin, 3);
    expect(PrlLevel.of(40).feedbackDelayMs, 800, reason: 'задержка не зажата потолком');
  });

  test('🔴 исход вероятностный в ОБЕ стороны: верное иногда наказывается', () {
    // Иначе разворот читался бы с первой же ошибки, и меры «упрямства» не
    // существовало бы вовсе.
    final g = PrlGame(level: 1, rnd: Random(4));
    g.begin();
    var correctPunished = 0, wrongRewarded = 0, n = 0;
    for (var i = 0; i < 2000; i++) {
      final good = g.good;
      final t = g.choose(i.isEven ? good : (good == Choice.a ? Choice.b : Choice.a));
      if (t == null) break;
      n++;
      if (!t.isError && !t.rewarded) correctPunished++;
      if (t.isError && t.rewarded) wrongRewarded++;
      g.revealPending();
      g.closeTrial();
      if (g.finished) {
        g.begin();
      }
    }
    expect(n, greaterThan(500));
    expect(correctPunished, greaterThan(0), reason: 'верный выбор всегда награждается');
    expect(wrongRewarded, greaterThan(0), reason: 'неверный выбор никогда не награждается');
  });

  test('🔴 доля наград у верного выбора равна rewardProb уровня', () {
    for (final level in [1, 15]) {
      final p = PrlLevel.of(level);
      final g = PrlGame(level: level, rnd: Random(7));
      g.begin();
      var rewarded = 0, n = 0;
      for (var i = 0; i < 4000; i++) {
        final t = g.choose(g.good);
        if (t == null) {
          g.begin();
          continue;
        }
        n++;
        if (t.rewarded) rewarded++;
        g.revealPending();
        g.closeTrial();
      }
      expect(n, greaterThan(1000));
      expect(rewarded / n, closeTo(p.rewardProb, 0.03), reason: 'L$level: доля ${rewarded / n} против ${p.rewardProb}');
    }
  });

  test('🔴 разворот приходит по порогу «верных подряд», а не по числу проб', () {
    final g = PrlGame(level: 1, rnd: Random(2));
    g.begin();
    final p = PrlLevel.of(1);
    var reversals = 0;
    var streakAtReversal = <int>[];
    for (var i = 0; i < 200; i++) {
      // Играем БЕЗУПРЕЧНО: развороты обязаны приходить по порогу.
      final streak = g.consecutiveCorrect;
      if (g.choose(g.good) == null) {
        g.begin();
        continue;
      }
      g.revealPending();
      final goodBefore = g.good;
      if (g.closeTrial()) {
        reversals++;
        streakAtReversal.add(streak + 1);
        // ⚠️ Разворот обязан ПОМЕНЯТЬ хорошую карточку. Без этой строки
        // «считать развороты, ничего не меняя» проходило: счётчик рос, правило
        // стояло, и человек играл бы одну и ту же задачу всю партию.
        expect(g.good, isNot(goodBefore), reason: 'разворот не поменял хорошую карточку');
      } else {
        expect(g.good, goodBefore, reason: 'карточка сменилась без разворота');
      }
    }
    expect(reversals, greaterThan(3), reason: 'разворотов не случилось');
    for (final s in streakAtReversal) {
      expect(s, greaterThanOrEqualTo(p.revMin), reason: 'разворот раньше нижнего порога: $s');
      expect(s, lessThanOrEqualTo(p.revMax), reason: 'разворот позже верхнего порога: $s');
    }
    // ⚠️ Порог розыгрывается каждый раз заново: при ровном пороге человек
    // считал бы верные и знал момент смены.
    expect(streakAtReversal.toSet().length, greaterThan(1), reason: 'порог разворота не гуляет');
  });

  test('🔴 разворот идёт по СЕРИИ ВЕРНЫХ, а не по числу проб в блоке', () {
    // ⚠️ В безупречной партии серия верных и число проб в блоке СОВПАДАЮТ, и
    // подмена одного другим незаметна. Поэтому играем с ошибками: там числа
    // расходятся, и по числу проб разворот пришёл бы раньше.
    // ⚠️ Берём L15: там порог серии 3…5, и серия из пяти верных достижима между
    // ошибками. На L1 порог 8…10, а серия рвётся каждой четвёртой пробой —
    // разворот не случился бы ни разу, и проба проверяла бы пустоту.
    final g = PrlGame(level: 15, rnd: Random(21));
    g.begin();
    final p = PrlLevel.of(15);
    var reversals = 0;
    var maxTrialsInBlockAtReversal = 0;
    for (var i = 0; i < 600; i++) {
      // Каждая шестая проба — нарочно неверная: серия рвётся на пяти, а счётчик
      // проб в блоке продолжает расти.
      final c = i % 6 == 5 ? (g.good == Choice.a ? Choice.b : Choice.a) : g.good;
      final streak = g.consecutiveCorrect;
      final inBlock = g.trialInBlock;
      if (g.choose(c) == null) {
        g.begin();
        continue;
      }
      g.revealPending();
      if (g.closeTrial()) {
        reversals++;
        expect(streak + 1, greaterThanOrEqualTo(p.revMin), reason: 'разворот при серии ${streak + 1}');
        if (inBlock + 1 > maxTrialsInBlockAtReversal) maxTrialsInBlockAtReversal = inBlock + 1;
      }
    }
    expect(reversals, greaterThan(2), reason: 'разворотов не случилось');
    // Число проб в блоке к моменту разворота ЗАМЕТНО больше порога серии:
    // считай мы по пробам, развороты приходили бы гораздо раньше.
    expect(maxTrialsInBlockAtReversal, greaterThan(p.revMax),
        reason: 'проб в блоке $maxTrialsInBlockAtReversal против порога серии ${p.revMax}');
  });

  test('🔴 ошибка обнуляет серию верных, и разворот отодвигается', () {
    final g = PrlGame(level: 1, rnd: Random(3));
    g.begin();
    g.choose(g.good);
    g.revealPending();
    g.closeTrial();
    expect(g.consecutiveCorrect, 1);
    final bad = g.good == Choice.a ? Choice.b : Choice.a;
    g.choose(bad);
    g.revealPending();
    g.closeTrial();
    expect(g.consecutiveCorrect, 0, reason: 'ошибка не обнулила серию');
  });

  test('🔴 замок: второй выбор до закрытия пробы не засчитывается', () {
    final g = PrlGame(level: 15, rnd: Random(5));
    g.begin();
    expect(g.choose(Choice.a), isNotNull);
    expect(g.locked, isTrue);
    expect(g.choose(Choice.b), isNull, reason: 'второй выбор прошёл сквозь замок');
    expect(g.trials.length, 1);
    g.revealPending();
    expect(g.choose(Choice.b), isNull, reason: 'выбор прошёл, пока виден исход');
    g.closeTrial();
    expect(g.choose(Choice.b), isNotNull);
  });

  test('🔴 счёт двигается ВМЕСТЕ с показом исхода, а не при нажатии', () {
    final g = PrlGame(level: 15, rnd: Random(6));
    g.begin();
    g.choose(g.good);
    expect(g.bank, 0, reason: 'счёт прыгнул до обратной связи и выдал исход');
    g.revealPending();
    expect(g.bank, isNot(0));
    final after = g.bank;
    g.revealPending();
    expect(g.bank, after, reason: 'повторный показ увёл счёт');
  });

  test('🔴 упрямство считается тремя ошибками подряд ОДНИМ выбором', () {
    PrlTrial err(int i, Choice c) => PrlTrial(
        index: i, choice: c, rewardedChoice: c == Choice.a ? Choice.b : Choice.a,
        rewarded: false, isError: true, blockIndex: 1, trialInBlock: i);
    // Три ошибки одним выбором — одна засечка; четвёртая добавляет вторую.
    expect(calcMetrics([err(0, Choice.a), err(1, Choice.a), err(2, Choice.a)]).perseverativeErrors, 1);
    expect(calcMetrics([err(0, Choice.a), err(1, Choice.a), err(2, Choice.a), err(3, Choice.a)]).perseverativeErrors, 2);
    // ⚠️ Три ошибки РАЗНЫМИ выборами — это не упрямство, а метание.
    expect(calcMetrics([err(0, Choice.a), err(1, Choice.b), err(2, Choice.a)]).perseverativeErrors, 0);
    // ⚠️ И ровно ДВЕ ошибки подряд — ещё не упрямство. Без этой строки правило
    // «две вместо трёх» проходило: на тройке и четвёрке оба счёта совпадают.
    PrlTrial ok(int i, Choice c) => PrlTrial(
        index: i, choice: c, rewardedChoice: c, rewarded: true, isError: false, blockIndex: 1, trialInBlock: i);
    expect(calcMetrics([ok(0, Choice.a), err(1, Choice.a), err(2, Choice.a)]).perseverativeErrors, 0);
  });

  test('🔴 win-stay и lose-shift считаются по ИСХОДУ, а не по верности выбора', () {
    // Человек видит только награду или наказание: верное правило от него скрыто.
    PrlTrial t(int i, Choice c, bool rewarded, bool isError) => PrlTrial(
        index: i, choice: c, rewardedChoice: Choice.a, rewarded: rewarded,
        isError: isError, blockIndex: 0, trialInBlock: i);
    // Награда → остался: win-stay 1/1. Наказание → ушёл: lose-shift 1/1.
    final m = calcMetrics([
      t(0, Choice.a, true, false),
      t(1, Choice.a, false, false),
      t(2, Choice.b, true, true),
    ]);
    expect(m.winStayRate, 1.0);
    expect(m.loseShiftRate, 1.0);
    // ⚠️ Слепое место, закрытое нарочно: проба №1 — ВЕРНЫЙ выбор, но наказанный.
    // Считай мы по верности, она попала бы в win-ветку и lose-shift был бы 0.
    expect(m.totalErrors, 1);
  });

  test('🔴 пост-разворотная точность берёт первые ПЯТЬ проб каждого блока', () {
    PrlTrial t(int i, int block, int inBlock, bool err) => PrlTrial(
        index: i, choice: Choice.a, rewardedChoice: Choice.a, rewarded: !err,
        isError: err, blockIndex: block, trialInBlock: inBlock);
    final trials = [
      // Исходный блок — в пост-разворотную меру не входит вовсе.
      for (var i = 0; i < 8; i++) t(i, 0, i, true),
      // Первый блок после разворота: пять первых проб — 3 верные, 2 ошибки.
      t(8, 1, 0, true), t(9, 1, 1, true), t(10, 1, 2, false), t(11, 1, 3, false), t(12, 1, 4, false),
      // Шестая и дальше — за пределами окна.
      t(13, 1, 5, true), t(14, 1, 6, true),
    ];
    final m = calcMetrics(trials);
    expect(m.postReversalAcc, closeTo(3 / 5, 1e-12));
    // adaptAcc берёт ВСЕ пост-разворотные пробы: 3 верные из 7.
    expect(m.adaptAcc, closeTo(3 / 7, 1e-12));
    expect(m.reversalErrors, 4);
    expect(m.reversals, 1);
  });

  test('🔴 без разворота проход считается по общей точности, а не по пустой выборке', () {
    PrlTrial t(int i, bool err) => PrlTrial(
        index: i, choice: Choice.a, rewardedChoice: Choice.a, rewarded: !err,
        isError: err, blockIndex: 0, trialInBlock: i);
    final m = calcMetrics([t(0, false), t(1, false), t(2, true), t(3, false)]);
    // Пост-разворотных проб нет вовсе — падаем на общую точность 3/4, иначе
    // уровень заваливался бы ПУСТОЙ выборкой.
    expect(m.adaptAcc, closeTo(0.75, 1e-12));
    expect(m.postReversalAcc, 0);
    expect(m.reversals, 0);
  });

  test('🔴 порог прохода 0,6: 0,5 не проходит, 0,7 проходит', () {
    // ⚠️ Партии «всё верно» и «всё мимо» проходят при любом пороге из пары
    // 0,3 / 0,6 и подмены не видят. Берём расклады ПО ОБЕ стороны от порога.
    PrlTrial t(int i, bool err) => PrlTrial(
        index: i, choice: Choice.a, rewardedChoice: Choice.a, rewarded: !err,
        isError: err, blockIndex: 1, trialInBlock: i);
    final half = [for (var i = 0; i < 10; i++) t(i, i.isOdd)];
    expect(calcMetrics(half).adaptAcc, closeTo(0.5, 1e-12));
    expect(calcMetrics(half).adaptAcc >= prlPassAccuracy, isFalse, reason: '0,5 засчитано как проход');
    final seven = [for (var i = 0; i < 10; i++) t(i, i >= 7)];
    expect(calcMetrics(seven).adaptAcc, closeTo(0.7, 1e-12));
    expect(calcMetrics(seven).adaptAcc >= prlPassAccuracy, isTrue, reason: '0,7 не засчитано');
    expect(prlPassAccuracy, 0.6);
  });

  test('🔴 в классике исхода нет даже при БЕЗУПРЕЧНОЙ игре', () {
    // ⚠️ Плохая партия «не проходит» и без правила про классику. Отличает
    // подмену только партия, которая прошла бы в уровневом режиме.
    final g = PrlGame(level: 1, classic: true, preset: prlClassicPresets['easy'], rnd: Random(12));
    g.begin();
    // ⚠️ Ограничитель обязателен: без него мутация «партия не кончается» уводит
    // прогон в ВЕЧНЫЙ цикл, и вердикта у неё не будет вовсе.
    var guard = 0;
    while (!g.finished) {
      expect(guard++, lessThan(200), reason: 'партия не кончилась за 200 проб');
      g.choose(g.good);
      g.revealPending();
      g.closeTrial();
    }
    expect(g.metrics.adaptAcc, greaterThanOrEqualTo(prlPassAccuracy), reason: 'партия и так не прошла бы');
    expect(g.passed, isFalse, reason: 'классика выдала исход');
    // Тот же расклад в уровневом режиме прошёл бы.
    final lvl = PrlGame(level: 1, rnd: Random(12));
    lvl.begin();
    var guard2 = 0;
    while (!lvl.finished) {
      expect(guard2++, lessThan(200), reason: 'партия не кончилась за 200 проб');
      lvl.choose(lvl.good);
      lvl.revealPending();
      lvl.closeTrial();
    }
    expect(lvl.passed, isTrue, reason: 'уровневый режим не засчитал безупречную партию');
  });

  test('🔴 в классике исхода нет: провалить её нельзя', () {
    final g = PrlGame(level: 1, classic: true, preset: prlClassicPresets['hard'], rnd: Random(1));
    g.begin();
    // Играем ХУЖЕ некуда — и всё равно «не провалено», потому что исхода нет.
    for (var i = 0; i < 10; i++) {
      final bad = g.good == Choice.a ? Choice.b : Choice.a;
      g.choose(bad);
      g.revealPending();
      g.closeTrial();
    }
    expect(g.passed, isFalse);
    expect(g.metrics.adaptAcc, lessThan(prlPassAccuracy));
    // Пресет «hard» взят как есть, а задержки в классике нет — она ось лестницы.
    expect(g.params.rewardProb, 0.70);
    expect(g.params.trialsTotal, 80);
    expect(g.params.feedbackDelayMs, 0);
  });

  test('🔴 партия кончается ровно на объёме уровня', () {
    final g = PrlGame(level: 1, rnd: Random(9));
    g.begin();
    var n = 0;
    while (!g.finished) {
      expect(g.choose(g.good), isNotNull);
      g.revealPending();
      g.closeTrial();
      n++;
      expect(n, lessThanOrEqualTo(PrlLevel.of(1).trialsTotal + 1));
    }
    expect(n, PrlLevel.of(1).trialsTotal);
    expect(g.choose(Choice.a), isNull, reason: 'после конца партии выдалась проба');
  });

  test('🔴 пустая партия не делит на ноль', () {
    final m = calcMetrics(const []);
    expect(m.accuracy, 0);
    expect(m.adaptAcc, 0);
    expect(m.winStayRate, 0);
    expect(m.loseShiftRate, 0);
    expect(m.reversals, 0);
  });
}

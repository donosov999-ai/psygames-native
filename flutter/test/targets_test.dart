import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/targets/model.dart';

/// СВЕРКА «МИШЕНЕЙ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/targets.tsx` в
/// `test/fixtures/targets-reference.json`: лестница L1…L15, палитра, доля мишеней
/// и ИНВАРИАНТЫ раунда, снятые по 2000 прогонов на каждое сочетание режима,
/// задуманного исхода и числа квадратов.
///
/// ⚠️ Сверяется не перестановка цветов, а инварианты: в веб-версии тасовка
/// сделана через `sort(() => Math.random() − 0.5)`, воспроизводить её посимвольно
/// незачем — она перекошена (см. `shufflePalette`), и здесь стоит Фишер—Йетс.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/targets-reference.json').readAsStringSync()) as Map<String, dynamic>;
  });

  test('🔴 палитра, доля мишеней, раундов на уровень и потолок — из живого кода', () {
    expect(targetColors, (ref['colors'] as List).cast<String>());
    expect(targetRate, ref['targetRate']);
    expect(roundsPerLevel, ref['roundsPerLevel']);
    expect(targetsMaxLevel, ref['maxLevel']);
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = TargetsLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.delayMs, row['delay'], reason: '$at: окно раунда');
      expect(l.numSquares, row['numSquares'], reason: '$at: квадратов');
      expect(l.jitterPx, row['jitterPx'], reason: '$at: разброс по вертикали');
      expect(l.lifeBonus, row['lifeBonus'], reason: '$at: жизней за уровень');
      expect(l.condition, (row['condition'] as Map).cast<String, Object?>(),
          reason: '$at: условие, при котором снята мера');
    }
  });

  test('🔴 третья ось — разброс: до L4 нуля, дальше растёт и упирается в 26', () {
    // Две оси не тянут пятнадцать ступеней: число квадратов даёт всего ЧЕТЫРЕ
    // разных значения (2·2·2·2·3·3·3·3·4·4·4·4·5·5·5).
    final squares = [for (var l = 1; l <= 15; l++) TargetsLevel.of(l).numSquares];
    expect(squares.toSet().length, 4, reason: 'замер оси «число квадратов» протух');
    for (var l = 1; l <= 4; l++) {
      expect(TargetsLevel.of(l).jitterPx, 0, reason: 'L$l: разброс раньше пятого уровня');
    }
    expect(TargetsLevel.of(5).jitterPx, 8);
    for (var l = 6; l <= 15; l++) {
      final a = TargetsLevel.of(l - 1).jitterPx;
      final b = TargetsLevel.of(l).jitterPx;
      expect(b >= a, isTrue, reason: 'L$l: разброс упал');
    }
    expect(TargetsLevel.of(14).jitterPx, 26, reason: 'потолок разброса');
    expect(TargetsLevel.of(15).jitterPx, 26);
    // ⚠️ L14 и L15 по разбросу совпадают — их различает ТОЛЬКО темп.
    expect(TargetsLevel.of(14).delayMs, isNot(TargetsLevel.of(15).delayMs));
  });

  test('🔴 пол окна держится и за потолком лестницы', () {
    // Формула 2100 − L·110 упирается в 450 ровно на L15, а выше уходит в минус:
    // без пола уровень с карты или из пресета дал бы отрицательное окно.
    expect(2100 - 15 * 110, 450, reason: 'пол достигается ровно на потолке');
    expect(2100 - 25 * 110, lessThan(0));
    expect(TargetsLevel.of(25).delayMs, 450);
    expect(TargetsLevel.of(40).delayMs, 450);
  });

  test('🔴 разброс раздаётся ОДИНАКОВО мишеням и не-мишеням — не намекает на ответ', () {
    var now = 0;
    final g = TargetsGame(startLevel: 15, rnd: Random(42), nowMs: () => now);
    var tSum = 0, tN = 0, nSum = 0, nN = 0;
    for (var i = 0; i < 600; i++) {
      g.nextRound();
      final r = g.current!;
      expect(r.dy.length, r.squares.length + 1, reason: 'смещение не у каждой фигуры');
      final sum = r.dy.map((d) => d.abs()).reduce((a, b) => a + b);
      if (r.isTarget) {
        tSum += sum;
        tN += r.dy.length;
      } else {
        nSum += sum;
        nN += r.dy.length;
      }
      now += 100;
      // Отвечаем безупречно, чтобы партия не оборвалась на жизнях. Уровень при
      // этом НЕ двигаем: на L15 десятый раунд закрыл бы партию, и замер вышел бы
      // по десяти раундам вместо шестисот — как и случилось при первой редакции.
      if (r.isTarget) {
        g.tap();
      } else {
        g.timeout();
      }
    }
    expect(tN, greaterThan(100));
    expect(nN, greaterThan(100));
    final tMean = tSum / tN, nMean = nSum / nN;
    // Среднее |смещение| при равномерном разбросе ±26 — около 13.
    expect(tMean, closeTo(13, 2));
    expect((tMean - nMean).abs() / tMean, lessThan(0.12),
        reason: 'мишени $tMean против не-мишеней $nMean — разброс намекает на ответ');
  });

  test('🔴 на первых уровнях разброса нет вовсе', () {
    final g = TargetsGame(startLevel: 1, rnd: Random(8), nowMs: () => 0);
    for (var i = 0; i < 9; i++) {
      g.nextRound();
      expect(g.current!.dy.every((d) => d == 0), isTrue, reason: 'L1 сдвинул фигуры');
      g.timeout();
      g.advance();
    }
  });

  test('🔴 уровней-дублей НЕТ: все пятнадцать окон разные', () {
    final delays = [for (var l = 1; l <= targetsMaxLevel; l++) TargetsLevel.of(l).delayMs];
    expect(delays.toSet().length, targetsMaxLevel, reason: 'ступень без нового условия');
    expect(delays.first, 1990);
    expect(delays.last, 450, reason: 'пол окна на L15');
    // ⚠️ Шаг 120 дал бы пол уже на L14 — и два последних уровня совпали бы.
    expect(max(450, 2100 - 14 * 120), 450);
    expect(TargetsLevel.of(14).numSquares, TargetsLevel.of(15).numSquares,
        reason: 'квадраты сами по себе L14 и L15 не различают — различает окно');
  });

  test('🔴 квадратов не больше, чем позволяет палитра', () {
    for (var l = 1; l <= 40; l++) {
      expect(TargetsLevel.of(l).numSquares, lessThanOrEqualTo(targetColors.length - 1),
          reason: 'L$l: «не мишень» стала непостроимой');
    }
    // На L21 «хотелось» бы 7 квадратов: круг плюс семь не влезают в семь цветов.
    expect(2 + ((21 - 1) ~/ 4), 7);
    expect(TargetsLevel.of(21).numSquares, 6);
  });

  test('🔴 раунд строится ПОД задуманный исход — инварианты как в живом TS', () {
    final rnd = Random(20260923);
    for (final row in (ref['инварианты'] as List).cast<Map<String, dynamic>>()) {
      final mode = row['mode'] == 'joker' ? TargetsMode.joker : TargetsMode.field;
      final want = row['wantTarget'] as bool;
      final ns = row['numSquares'] as int;
      final n = row['n'] as int;
      var okTarget = 0, okInv = 0;
      for (var i = 0; i < n; i++) {
        final prev = mode == TargetsMode.joker ? targetColors[i % targetColors.length] : null;
        final r = buildRoundColors(
          numSquares: ns, mode: mode, wantTarget: want, prevColor: prev, rnd: rnd.nextDouble);
        expect(r.squares.length, ns, reason: 'не то число квадратов');
        if (r.isTarget == (want && (mode == TargetsMode.field || prev != null))) okTarget++;
        final all = [r.circle, ...r.squares];
        final dup = all.length - all.toSet().length;
        if (mode == TargetsMode.joker) {
          if (r.squares.contains(prev) == r.isTarget) okInv++;
        } else {
          if (r.isTarget ? dup >= 1 : dup == 0) okInv++;
        }
      }
      final at = '${row['mode']}/want=$want/кв=$ns';
      expect(okTarget, row['isTargetOk'], reason: '$at: исход разошёлся с задуманным');
      expect(okInv, row['invariantOk'], reason: '$at: инвариант совпадений нарушен');
    }
  });

  test('🔴 первый раунд «джокера» мишенью быть не может — сличать не с чем', () {
    final rnd = Random(1);
    for (var i = 0; i < 200; i++) {
      final r = buildRoundColors(
        numSquares: 3, mode: TargetsMode.joker, wantTarget: true, prevColor: null, rnd: rnd.nextDouble);
      expect(r.isTarget, isFalse, reason: 'мишень без предыдущего цвета');
    }
  });

  test('🔴 тасовка честная: перекос веб-версии 2,4× здесь не воспроизводится', () {
    // Замер веб-версии (120 000 прогонов): 18,87 … 7,81 % при равномерных 14,29 %.
    final web = (ref['перекос тасовки']['доли_%'] as List).cast<num>();
    expect(web.first / web.last, greaterThan(2.0), reason: 'эталон перекоса протух');
    final rnd = Random(7);
    const n = 60000;
    final pos = List.filled(targetColors.length, 0);
    for (var i = 0; i < n; i++) {
      pos[shufflePalette(targetColors, rnd.nextDouble).indexOf(targetColors[0])] += 1;
    }
    final share = pos.map((c) => c / n * 100).toList();
    final spread = share.reduce(max) / share.reduce(min);
    expect(spread, lessThan(1.1), reason: 'перекос $share');
  });

  test('🔴 нажатие на мишень — попадание с очками, на не-мишень — ошибка торможения', () {
    var now = 0;
    final g = TargetsGame(startLevel: 1, rnd: Random(3), nowMs: () => now);
    expect(g.lives, 4, reason: '3 + бонус первого уровня');
    g.nextRound();
    now += 400;
    final first = g.current!.isTarget;
    final out = g.tap();
    if (first) {
      expect(out, TargetsOutcome.hit);
      expect(g.rts.single, 400);
      // Очки: уровень в квадрате × остаток окна / 100.
      expect(g.score, 1 * 1 * (1990 - 400) ~/ 100);
      expect(g.lives, 4, reason: 'попадание отняло жизнь');
    } else {
      expect(out, TargetsOutcome.commission);
      expect(g.commissions, 1);
      expect(g.lives, 3, reason: 'ошибка торможения не отняла жизнь');
    }
  });

  test('🔴 просрочка на мишени — пропуск, на не-мишени — верное торможение', () {
    var now = 0;
    // Сид подобран так, чтобы в партии встретились оба исхода.
    final g = TargetsGame(startLevel: 1, rnd: Random(11), nowMs: () => now);
    var omissions = 0, rejects = 0;
    for (var i = 0; i < 12 && !g.over; i++) {
      g.nextRound();
      now += 2000;
      final out = g.timeout();
      if (out == TargetsOutcome.omission) omissions++;
      if (out == TargetsOutcome.correctReject) rejects++;
      // ⚠️ Уровень НЕ двигаем: десятый раунд принёс бы бонус жизней, и проверка
      // «жизней осталось ровно столько» сравнивала бы с другим числом.
    }
    expect(omissions, greaterThan(0), reason: 'ни одного пропуска за 12 раундов');
    expect(rejects, greaterThan(0), reason: 'ни одного верного торможения');
    expect(g.omissions, omissions);
    expect(g.errors, omissions, reason: 'верное торможение записано ошибкой');
    // Каждый пропуск стоит жизни, верное торможение — нет.
    expect(g.lives, max(0, 3 + TargetsLevel.of(1).lifeBonus - omissions),
        reason: 'пропусков $omissions, а жизней осталось ${g.lives}');
    expect(omissions, lessThan(4), reason: 'жизни кончились раньше замера');
    expect(g.rts, isEmpty, reason: 'в времена попало что-то без нажатия');
  });

  test('🔴 тап вне живого раунда не засчитывается', () {
    var now = 0;
    final g = TargetsGame(startLevel: 1, rnd: Random(5), nowMs: () => now);
    expect(g.tap(), isNull, reason: 'тап до первого раунда');
    g.nextRound();
    now += 300;
    g.tap();
    final lives = g.lives, score = g.score, errors = g.errors;
    // Второй тап по тому же раунду — уже в паузе перед следующим.
    expect(g.tap(), isNull);
    expect(g.timeout(), isNull, reason: 'просрочка после ответа');
    expect(g.lives, lives);
    expect(g.score, score);
    expect(g.errors, errors);
  });

  test('🔴 уровень растёт каждые 10 раундов и приносит жизни', () {
    var now = 0;
    final g = TargetsGame(startLevel: 3, rnd: Random(9), nowMs: () => now);
    expect(g.lives, 4, reason: '3 + бонус L3');
    for (var i = 1; i <= 9; i++) {
      expect(g.advance(), isFalse, reason: 'уровень шагнул на раунде $i');
    }
    expect(g.advance(), isTrue, reason: 'десятый раунд не поднял уровень');
    expect(g.level, 4);
    expect(g.round, 0);
    expect(g.lives, 4 + 3, reason: 'бонус L4 = 3 не начислен');
  });

  test('🔴 партия кончается на потолке лестницы, а не крутится вечно', () {
    final g = TargetsGame(startLevel: targetsMaxLevel, rnd: Random(2), nowMs: () => 0);
    for (var i = 0; i < 9; i++) {
      expect(g.advance(), isFalse);
    }
    expect(g.advance(), isFalse);
    expect(g.over, isTrue, reason: 'за L15 партия продолжилась');
    expect(g.level, targetsMaxLevel);
  });

  test('🔴 кончились жизни — партия кончилась, и новые раунды не идут', () {
    var now = 0;
    final g = TargetsGame(startLevel: 1, rnd: Random(4), nowMs: () => now);
    var guard = 0;
    while (!g.over && guard++ < 400) {
      g.nextRound();
      now += 100;
      // Жмём ВСЕГДА: на не-мишенях это ошибка торможения, жизни кончатся.
      g.tap();
      g.advance();
    }
    expect(g.over, isTrue, reason: 'жизни не кончились за 400 раундов «жать всегда»');
    expect(g.lives, 0);
    expect(g.nextRound(), isFalse, reason: 'после конца партии выдался новый раунд');
    expect(g.tap(), isNull);
  });

  test('🔴 один сид — одна партия: раскладка повторима', () {
    // ⚠️ Без этого пробы экрана держались бы на неспящем Random: одна и та же
    // проба то краснела, то зеленела, и мутация на ней ничего не значит.
    List<String> play(int seed) {
      final g = TargetsGame(startLevel: 6, rnd: Random(seed), nowMs: () => 0);
      final out = <String>[];
      for (var i = 0; i < 30; i++) {
        g.nextRound();
        final r = g.current!;
        out.add('${r.isTarget}|${r.circle}|${r.squares.join(',')}|${r.dy.join(',')}');
        g.timeout();
        g.advance();
      }
      return out;
    }

    expect(play(101), play(101), reason: 'один сид дал две разные партии');
    expect(play(101), isNot(play(102)), reason: 'разные сиды дали одну партию');
  });

  test('🔴 доля ошибок торможения считается от ПОКАЗАННЫХ не-мишеней', () {
    expect(commissionRate(2, 8), 0.25);
    expect(commissionRate(0, 8), 0.0);
    // Нуля не-мишеней доли НЕТ, и это не «не ошибался».
    expect(commissionRate(0, 0), isNull);
    expect(commissionRate(1, 3), 0.333, reason: 'округление до трёх знаков, как в TS');
  });

  test('🔴 разброс времени считается делителем n, как в веб-версии', () {
    var now = 0;
    final g = TargetsGame(startLevel: 1, rnd: Random(3), nowMs: () => now);
    expect(g.stdRtMs, isNull, reason: 'разброс без проб');
    g.rts.addAll([400, 600]);
    expect(g.meanRtMs, 500);
    // n: sqrt(((100²)+(100²))/2) = 100. При n−1 вышло бы 141.
    expect(g.stdRtMs, 100);
  });

  test('🔴 доля мишеней ОДНА на всех уровнях — она не ось сложности', () {
    // Замер: 3000 раундов на L1 и столько же на L15, без ответов (раунды только
    // рождаются). Ручка, двигающая долю, здесь двигала бы саму меру: ошибок
    // торможения стало бы больше просто потому, что не-мишеней меньше.
    // ⚠️ Играем БЕЗУПРЕЧНО и не двигаем уровень. Первая редакция этого замера
    // просто ждала просрочки — и партия умирала на восьмом пропуске, после чего
    // `nextRound` возвращал false, `current` замирал на последней (мишенной)
    // пробе, а счётчик крутился дальше: «доля мишеней 0,999». Замер, переживший
    // конец партии, меряет не партию.
    double rateAt(int level, int seed) {
      var t = 0, n = 0;
      final g = TargetsGame(startLevel: level, rnd: Random(seed), nowMs: () => 0);
      for (var i = 0; i < 3000; i++) {
        expect(g.nextRound(), isTrue, reason: 'партия оборвалась на раунде ${i + 1}');
        final r = g.current!;
        if (r.isTarget) {
          t++;
          g.tap();
        } else {
          g.timeout();
        }
        n++;
      }
      expect(n, 3000);
      return t / n;
    }

    final low = rateAt(1, 77);
    final high = rateAt(15, 77);
    expect(low, closeTo(targetRate, 0.03), reason: 'L1 доля $low');
    expect(high, closeTo(targetRate, 0.03), reason: 'L15 доля $high');
    expect((high - low).abs(), lessThan(0.03), reason: 'L1 $low против L15 $high — доля поехала с уровнем');
  });

  test('🔴 фактическая доля мишеней считается по показанным, а не по заданной', () {
    var now = 0;
    final g = TargetsGame(startLevel: 1, rnd: Random(6), nowMs: () => now);
    expect(g.targetRateActual, isNull, reason: 'доля без раундов');
    // Играем БЕЗУПРЕЧНО: на мишени жмём, на не-мишени ждём. Иначе жизни кончатся
    // на четвёртом пропуске, партия оборвётся, и доля посчитается по семи
    // раундам вместо двадцати — как и вышло при первой редакции этой пробы.
    for (var i = 0; i < 20; i++) {
      expect(g.nextRound(), isTrue, reason: 'партия оборвалась на раунде ${i + 1}');
      now += 300;
      if (g.current!.isTarget) {
        expect(g.tap(), TargetsOutcome.hit);
      } else {
        expect(g.timeout(), TargetsOutcome.correctReject);
      }
      g.advance();
    }
    expect(g.errors, 0, reason: 'безупречная игра дала ошибки');
    final n = g.shownTargets + g.shownNonTargets;
    expect(n, 20);
    expect(g.targetRateActual, double.parse((g.shownTargets / n).toStringAsFixed(3)));
    // ⚠️ Одной партии мало: если расклад вышел ровно 0,5, подмена «вернуть
    // заданную долю» неотличима. Поэтому рядом вторая партия с другим раскладом —
    // постоянная величина не может совпасть с обеими.
    var m = 0;
    final other = TargetsGame(startLevel: 1, rnd: Random(1), nowMs: () => m);
    for (var i = 0; i < 20; i++) {
      other.nextRound();
      m += 300;
      if (other.current!.isTarget) {
        other.tap();
      } else {
        other.timeout();
      }
    }
    expect(other.targetRateActual, double.parse((other.shownTargets / 20).toStringAsFixed(3)));
    expect(other.targetRateActual, isNot(g.targetRateActual),
        reason: 'обе партии дали одну долю — проба не отличит постоянную');
    // На двадцати раундах 0,5 — ожидание, а не обязательство; проверяем, что
    // доля не выродилась в край.
    expect(g.shownTargets, greaterThan(0));
    expect(g.shownNonTargets, greaterThan(0));
  });
}

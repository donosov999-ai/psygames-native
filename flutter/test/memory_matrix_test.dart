import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/memory_matrix/model.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS.
///
/// Значения выгружены прогоном самих функций `levelParams` (L1…L40) и
/// `cellsNeeded` (7 уровней × 3 круга × 2 режима) в
/// `test/fixtures/mm-reference.json`. Проверять перенос той же формулой,
/// которой переносил, смысла нет — такая проба зелёная всегда.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/mm-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 пороги совпадают с живым кодом', () {
    expect(mmVolumeTop, ref['volumeTop']);
    expect(decoyRoom, ref['decoyRoom']);
  });

  test('🔴 уровень задаёт то же самое на всех 40 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 40);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.gridSize, e['gridSize'], reason: '$at сторона поля');
      expect(p.baseFlashes, e['baseFlashes'], reason: '$at клеток запомнить');
      expect(p.flashMs, e['flashMs'], reason: '$at показ');
      expect(p.seriesCount, e['seriesCount'], reason: '$at серий');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка');
      expect(p.decoys, e['decoys'], reason: '$at ложных вспышек');
    }
  });

  test('🔴 сколько клеток показать — совпадает по кругам и режимам', () {
    for (final raw in ref['cells'] as List) {
      final e = raw as Map<String, dynamic>;
      final got = cellsNeeded(e['level'] as int, e['round'] as int, e['mode'] as String);
      final at = 'L${e['level']} круг ${e['round']} ${e['mode']}';
      expect(got.need, e['need'], reason: '$at нужных');
      expect(got.decoys, e['decoys'], reason: '$at ложных');
      expect(got.free, e['free'], reason: '$at свободных');
    }
  });

  test('🔴 выше потолка объёма растут помехи, а не поле', () {
    final a = LevelParams.of(mmVolumeTop);
    final b = LevelParams.of(mmVolumeTop + 5);
    expect(a.gridSize, b.gridSize, reason: 'поле уже максимальное');
    expect(a.flashMs, b.flashMs, reason: 'показ уже на дне');
    expect(b.decoys, greaterThan(a.decoys), reason: 'растут ложные вспышки');
    expect(b.holdMs, greaterThan(a.holdMs), reason: 'растёт задержка');
  });

  test('🔴 хвост лестницы L41…L60 и правила уровня — как в вебе', () {
    for (final raw in ref['levelsTail'] as List) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      expect('${p.gridSize} ${p.baseFlashes} ${p.flashMs} ${p.seriesCount} ${p.holdMs} ${p.decoys}',
          '${e['gridSize']} ${e['baseFlashes']} ${e['flashMs']} ${e['seriesCount']} ${e['holdMs']} ${e['decoys']}',
          reason: 'L${e['level']}');
    }
    expect(mmTotalRounds, ref['totalRounds']);
    final rules = (ref['rules'] as List).cast<Map<String, dynamic>>();
    expect(rules.map((r) => '${r['key']}@${r['fromLevel']}').toList(),
        ['grid6@4', 'fast@8', 'two_series@11', 'decoys@${mmVolumeTop + 1}']);
  });

  test('🔴 клеток по всем десяти раундам, обоим режимам и шагу зарядки — как в вебе', () {
    final bad = <String>[];
    for (final raw in ref['rounds'] as List) {
      final e = raw as Map<String, dynamic>;
      final got = cellsNeeded(e['level'] as int, e['round'] as int, e['mode'] as String, preset: e['preset'] as bool);
      if (got.need != e['need'] || got.decoys != e['decoys'] || got.free != e['free']) {
        bad.add('L${e['level']} р${e['round']} ${e['mode']} ${e['preset'] ? 'шаг' : ''}');
      }
    }
    expect((ref['rounds'] as List).length, 1200);
    expect(bad, isEmpty);
  });

  test('пауза на чтение подписи — то же число, что в вебе', () {
    for (final raw in ref['pauses'] as List) {
      final e = raw as Map<String, dynamic>;
      expect(mmReadPauseMs(e['caption'] as String, e['prev'] as String), e['ms'], reason: '«${e['caption']}»');
    }
  });

  test('🔴 раздача раунда — те же серии, порядок и ложные на том же потоке случайных чисел', () {
    final bad = <String>[];
    for (final raw in ref['deals'] as List) {
      final e = raw as Map<String, dynamic>;
      final randoms = (e['randoms'] as List).map((x) => (x as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final d = mmDealRound(e['gs'] as int, e['need'] as int, e['two'] as bool, e['decoysWanted'] as int, rng);
      final tag = '${e['gs']}×${e['gs']} need ${e['need']} two ${e['two']} ложных ${e['decoysWanted']}';
      for (final k in ['set1', 'seq', 'set2', 'decoys']) {
        final got = switch (k) { 'set1' => d.set1, 'seq' => d.seq, 'set2' => d.set2, _ => d.decoys };
        if (got.join(',') != (e[k] as List).join(',')) bad.add('$tag: $k');
      }
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
    }
    expect((ref['deals'] as List).length, greaterThan(10));
    expect(bad, isEmpty);
  });

  group('ввод раунда — как веб handleCellPress', () {
    MatrixRound round({String mode = 'static', bool two = false}) => MatrixRound(
          mode: mode,
          two: two,
          set1: const [0, 4, 8],
          seq: const [0, 4, 8],
          set2: two ? const [2, 6] : const [],
          decoys: const [5],
        );

    test('все клетки серии — раунд собран; повторное нажатие не считается', () {
      final r = round();
      expect(r.tap(4), MmPress.hit);
      expect(r.tap(4), MmPress.ignored, reason: 'отмеченную клетку не снимают и не считают дважды');
      expect(r.tap(0), MmPress.hit);
      expect(r.tap(8), MmPress.roundWon);
      expect(r.tap(1), MmPress.ignored, reason: 'раунд кончился');
    });

    test('🔴 не та клетка — раунд кончается сразу; ложная вспышка — тоже не та', () {
      expect(round().tap(5), MmPress.roundLost, reason: 'ложную не запоминают');
      final r = round()..tap(0);
      expect(r.tap(3), MmPress.roundLost);
      expect(r.over, isTrue);
    });

    test('🔴 две серии: сначала первая целиком, потом вторая с чистого листа', () {
      final r = round(two: true);
      expect(r.tap(2), MmPress.roundLost, reason: 'вторая серия не в свой черёд');
      final s = round(two: true);
      for (final c in [0, 4]) {
        expect(s.tap(c), MmPress.hit);
      }
      expect(s.tap(8), MmPress.seriesDone);
      expect(s.inputSeries, 1);
      expect(s.picked, isEmpty, reason: 'отметки второй серии считаются заново');
      expect(s.tap(6), MmPress.hit);
      expect(s.tap(2), MmPress.roundWon);
    });

    test('🔴 «по порядку»: верная клетка не в свой черёд — промах', () {
      final r = round(mode: 'sequential');
      expect(r.tap(4), MmPress.roundLost, reason: 'первой загорелась 0, а не 4');
      final s = round(mode: 'sequential');
      expect(s.tap(0), MmPress.hit);
      expect(s.tap(4), MmPress.hit);
      expect(s.tap(8), MmPress.roundWon);
    });
  });

  group('уровень', () {
    test('десять раундов; очки +10 / −5 (не ниже нуля); серия рвётся на ошибке; зачёт — не больше одной ошибки', () {
      var x = 0.31;
      double rng() => x = (x * 9301 + 49297) % 233280 / 233280;
      final g = MatrixLevel(level: 3, mode: 'static', gridSize: LevelParams.of(3).gridSize);
      final first = g.nextRound(rng);
      expect(first.set1.length, cellsNeeded(3, 1, 'static').need);
      final miss = List.generate(g.gridSize * g.gridSize, (i) => i).firstWhere((c) => !first.set1.contains(c));
      expect(g.tap(miss), MmPress.roundLost);
      expect('${g.score} ${g.errors} ${g.streak}', '0 1 0', reason: 'очки не уходят ниже нуля');
      for (var r = 2; r <= mmTotalRounds; r++) {
        final round = g.nextRound(rng);
        for (final c in round.set1) {
          g.tap(c);
        }
      }
      expect(g.round, mmTotalRounds);
      expect(g.lastRound, isTrue);
      expect(g.passed, isTrue, reason: 'одна ошибка за уровень — зачёт');
      expect(g.streak, greaterThan(10));
    });

    test('шаг зарядки — три клетки, 1,5 с показа, одна серия, без задержки и ложных; не зачёт', () {
      final g = MatrixLevel(level: 30, mode: 'static', gridSize: 4, preset: true);
      expect('${g.flashMs} ${g.holdMs} ${g.decoysWanted} ${g.two}', '1500 0 0 false');
      expect(g.nextRound(Random(1).nextDouble).set1.length, 3);
      expect(g.passed, isFalse);
    });
  });
}

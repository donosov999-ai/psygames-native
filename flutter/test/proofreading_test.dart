import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/proofreading/model.dart';

/// СВЕРКА «КОРРЕКТУРЫ» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон выгружен прогоном `frontend/app/games/proofreading.tsx` (VER 7) в
/// `test/fixtures/proofreading-reference.json`: лестница L1…L15, алфавиты
/// письменностей и границы уровня.
void main() {
  late Map<String, dynamic> ref;

  late Map<String, String> scripts;
  late String digits;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/proofreading-reference.json').readAsStringSync()) as Map<String, dynamic>;
    // ⚠️ Алфавиты берутся из ЭТАЛОНА, снятого с живого TS, а не из константы в
    // коде: иначе проба сверяла бы перенос сам с собой.
    scripts = (ref['scripts'] as Map).map((k, v) => MapEntry('$k', '$v'));
    digits = '${ref['digits']}';
    ProofScripts.useForTest(scripts, digits);
  });

  test('🔴 лестница совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = ProofLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.rows, row['rows'], reason: '$at: строк');
      expect(l.cols, row['cols'], reason: '$at: столбцов');
      expect(l.timeLimitSec, row['timeLimitSec'], reason: '$at: лимит времени');
      expect(l.minFoundPct, closeTo((row['minFoundPct'] as num).toDouble(), 1e-12), reason: '$at: порог доли');
      expect(l.cells, row['cells'], reason: '$at: клеток');
      // Условие партии сверяется ЦЕЛИКОМ: потеряй оно поле — разбор старых
      // партий станет нечитаемым, а гейт раздела этого не увидит.
      final want = (row['condition'] as Map).cast<String, Object?>();
      expect(l.condition.keys.toSet(), want.keys.toSet(), reason: '$at: набор полей условия');
      for (final k in want.keys) {
        final got = l.condition[k];
        if (got is double) {
          expect(got, closeTo((want[k]! as num).toDouble(), 1e-12), reason: '$at: условие, поле $k');
        } else {
          expect(got, want[k], reason: '$at: условие, поле $k');
        }
      }
    }
    expect(proofMaxLevel, ref['maxLevel']);
  });

  test('🔴 алфавиты письменностей перенесены ВЕРБАТИМ и в том же порядке', () {
    final want = (ref['scripts'] as Map).cast<String, dynamic>();
    for (final e in want.entries) {
      expect(ProofScripts.current.byId[e.key], e.value, reason: 'письменность ${e.key}');
    }
    expect(ProofScripts.current.digits, ref['digits']);
    // ⚠️ Порядок канонический: у соседнего экрана (Шульте) то же поле служит
    // заучиванием алфавита, и перетасовать его нельзя.
    expect(scripts['latin']!.substring(0, 3), 'ABC');
    expect(scripts['cyrillic']!.substring(0, 3), 'АБВ');
    expect(scripts['hanzi']!.substring(0, 3), '一二三');
  });

  test('🔴 мёртвых переходов НЕТ и лимит времени СЧИТАЕТСЯ, а не задан', () {
    expect((ref['мёртвые переходы'] as List), isEmpty, reason: 'эталон уже содержит дубли');
    for (var l = 2; l <= proofMaxLevel; l++) {
      expect(ProofLevel.of(l - 1).condition.toString(), isNot(ProofLevel.of(l).condition.toString()),
          reason: 'L$l не отличается от L${l - 1}');
    }
    // Время = клетки × темп сканирования; темп растёт 1,0 → 0,45 с на клетку.
    for (var l = 1; l <= proofMaxLevel; l++) {
      final p = ProofLevel.of(l);
      final perCell = p.timeLimitSec / p.cells;
      expect(perCell, lessThanOrEqualTo(1.01), reason: 'L$l: темп $perCell');
      expect(perCell, greaterThanOrEqualTo(0.44), reason: 'L$l: темп $perCell');
    }
    // ⚠️ Поле растёт вчетверо (64 → 192 клетки), а времени прибавляется всего
    // треть: 64 → 86 секунд. В этом и состоит рост трудности.
    expect(ProofLevel.of(1).cells, 64);
    expect(ProofLevel.of(15).cells, 192);
    expect(ProofLevel.of(1).timeLimitSec, 64);
    expect(ProofLevel.of(15).timeLimitSec, 86);
  });

  test('🔴 порог доли растёт ступенями и упирается в единицу', () {
    for (var l = 1; l <= 5; l++) {
      expect(ProofLevel.of(l).minFoundPct, 0.8, reason: 'L$l');
    }
    for (var l = 6; l <= 10; l++) {
      expect(ProofLevel.of(l).minFoundPct, 0.9, reason: 'L$l');
    }
    for (var l = 11; l <= 15; l++) {
      expect(ProofLevel.of(l).minFoundPct, 1.0, reason: 'L$l');
    }
    final edge = (ref['граничные уровни'] as Map).cast<String, dynamic>();
    expect(ProofLevel.of(30).rows, (edge['30'] as Map)['rows']);
    expect(ProofLevel.of(30).rows, 16, reason: 'потолок поля держится за лестницей');
  });

  test('🔴 цели ВСЕГДА две и РАЗНЫЕ — одна и та же дважды означала бы одну', () {
    final rnd = Random(3);
    for (final script in scripts.keys) {
      for (var i = 0; i < 300; i++) {
        final g = buildGrid(rows: 8, cols: 8, alphabet: scripts[script]!, rnd: rnd.nextDouble);
        expect(g.targets.length, 2, reason: '$script: целей не две');
        expect(g.targets[0], isNot(g.targets[1]), reason: '$script: цели совпали');
      }
    }
  });

  test('🔴 минимум целей ГАРАНТИРОВАН на любом алфавите, включая 46-знаковые', () {
    // На иероглифах и кане цели выпадали 0–2 раза: критерий «найти ≥N %» терял
    // смысл, а при нуле раунд не завершался вовсе.
    final rnd = Random(5);
    for (final script in ['latin', 'hanzi', 'hiragana', 'devanagari']) {
      for (final size in [[8, 8], [12, 10], [16, 12]]) {
        final cells = size[0] * size[1];
        var minSeen = 1 << 30;
        for (var i = 0; i < 200; i++) {
          final g = buildGrid(rows: size[0], cols: size[1], alphabet: scripts[script]!, rnd: rnd.nextDouble);
          if (g.total < minSeen) minSeen = g.total;
        }
        expect(minSeen, greaterThanOrEqualTo(minTargetsFor(cells)),
            reason: '$script ${size[0]}×${size[1]}: минимум целей $minSeen против ${minTargetsFor(cells)}');
      }
    }
    expect(minTargetsFor(64), 4);
    expect(minTargetsFor(192), 12);
  });

  test('🔴 места целей совпадают с самими знаками поля', () {
    final rnd = Random(7);
    for (var i = 0; i < 200; i++) {
      final g = buildGrid(rows: 8, cols: 8, alphabet: scripts['cyrillic']!, rnd: rnd.nextDouble);
      for (var k = 0; k < g.letters.length; k++) {
        expect(g.targetIndices.contains(k), g.targets.contains(g.letters[k]),
            reason: 'клетка $k: знак ${g.letters[k]}, цели ${g.targets}');
      }
    }
  });

  test('🔴 партия на цифрах берёт цифровой набор, а не письменность', () {
    final g = ProofGame(level: 1, digits: true, rnd: Random(2), nowMs: () => 0);
    g.begin();
    expect(g.alphabet, digits);
    for (final ch in g.grid.letters) {
      expect(digits.contains(ch), isTrue, reason: 'в цифровом поле знак $ch');
    }
  });

  test('🔴 попадание, ошибка и повтор считаются порознь', () {
    var now = 0;
    final g = ProofGame(level: 1, rnd: Random(11), nowMs: () => now);
    g.begin();
    final target = g.grid.targetIndices.first;
    final empty = List.generate(g.params.cells, (i) => i).firstWhere((i) => !g.grid.targetIndices.contains(i));

    expect(g.tap(target), ProofTap.hit);
    expect(g.found.length, 1);
    expect(g.errors, 0);
    // ⚠️ Повтор по НАЙДЕННОЙ клетке — ни попадание, ни ошибка: человек просто
    // попал по тому же знаку дважды.
    expect(g.tap(target), ProofTap.ignored);
    expect(g.found.length, 1);
    expect(g.errors, 0);
    expect(g.tap(empty), ProofTap.wrong);
    expect(g.errors, 1);
    // А вот ошибка по одной и той же пустой клетке считается каждый раз: это
    // отдельное неверное действие.
    expect(g.tap(empty), ProofTap.wrong);
    expect(g.errors, 2);
  });

  test('🔴 партия кончается досрочно, когда найдены ВСЕ цели', () {
    var now = 0;
    final g = ProofGame(level: 1, rnd: Random(4), nowMs: () => now);
    g.begin();
    final all = g.grid.targetIndices.toList();
    for (var i = 0; i < all.length - 1; i++) {
      expect(g.tap(all[i]), ProofTap.hit);
      expect(g.finished, isFalse, reason: 'партия кончилась на ${i + 1} из ${all.length}');
    }
    expect(g.tap(all.last), ProofTap.hit);
    expect(g.finished, isTrue, reason: 'все цели найдены, а партия идёт');
    expect(g.missed, 0);
    expect(g.omissionPct, 0);
    expect(g.accuracyPct, 100);
    expect(g.passed, isTrue);
    // После конца нажатия не проходят.
    expect(g.tap(0), ProofTap.ignored);
  });

  test('🔴 мера прохода — ДОЛЯ, а не счёт пропусков', () {
    // На L1 поле 64 клетки, на L15 — 192. При одинаковой ДОЛЕ найденных число
    // пропусков на большом поле втрое больше, и счёт наказывал бы за размер.
    var now = 0;
    final small = ProofGame(level: 1, rnd: Random(8), nowMs: () => now);
    small.begin();
    final big = ProofGame(level: 15, rnd: Random(8), nowMs: () => now);
    big.begin();
    // Находим ровно половину целей в каждой.
    void half(ProofGame g) {
      final all = g.grid.targetIndices.toList();
      for (var i = 0; i < all.length ~/ 2; i++) {
        g.tap(all[i]);
      }
    }

    half(small);
    half(big);
    expect(small.omissionPct, closeTo(big.omissionPct, 6), reason: 'доля пропусков поехала от размера поля');
    expect(big.missed, greaterThan(small.missed), reason: 'на большом поле пропусков в счёте больше');
    expect(big.grid.total, greaterThan(small.grid.total));
  });

  test('🔴 доля пропусков нормирована на ЦЕЛИ, а не на клетки', () {
    // ⚠️ Сравнение двух партий между собой подмену не ловит: обе доли поедут
    // одинаково. Нужен расклад с ИЗВЕСТНЫМ числом — тогда видно, на что делят.
    var now = 0;
    final g = ProofGame(level: 1, rnd: Random(21), nowMs: () => now);
    g.begin();
    // Подставляем поле руками: 64 клетки, ровно 8 целей, найдено 2.
    g.grid = ProofGrid(
      letters: List.generate(64, (i) => i < 8 ? 'А' : 'Б'),
      targets: const ['А', 'В'],
      targetIndices: {for (var i = 0; i < 8; i++) i},
    );
    g.tap(0);
    g.tap(1);
    expect(g.found.length, 2);
    expect(g.missed, 6);
    // 6 из 8 = 75 %. Дели на клетки — вышло бы 6/64 ≈ 9 %.
    expect(g.omissionPct, 75, reason: 'доля пропусков считается не от целей');
    expect(g.accuracyPct, 25);
  });

  test('🔴 время вышло РОВНО на лимите уровня, ни раньше, ни позже', () {
    // Мутация «срок вдвое короче» проходила незамеченной: партия всё равно
    // кончалась, просто раньше. Проверяем обе границы.
    var now = 0;
    final g = ProofGame(level: 1, rnd: Random(22), nowMs: () => now);
    g.begin();
    final limit = ProofLevel.of(1).timeLimitSec;
    expect(limit, 64);
    now += (limit - 1) * 1000;
    expect(g.timeUp, isFalse, reason: 'время вышло за секунду до лимита');
    now += 1000;
    expect(g.timeUp, isTrue, reason: 'на лимите время не вышло');
  });

  test('🔴 порог прохода уровня: на L1 хватает 80 %, на L15 нужны все', () {
    var now = 0;
    for (final entry in [[1, 0.8], [8, 0.9], [15, 1.0]]) {
      final level = entry[0] as int;
      final pct = entry[1] as double;
      final g = ProofGame(level: level, rnd: Random(6), nowMs: () => now);
      g.begin();
      final total = g.grid.total;
      final need = (total * pct).ceil();
      final all = g.grid.targetIndices.toList();
      // На один меньше порога — уровень НЕ взят.
      for (var i = 0; i < need - 1; i++) {
        g.tap(all[i]);
      }
      expect(g.passed, isFalse, reason: 'L$level: ${need - 1} из $total засчитано');
      g.tap(all[need - 1]);
      expect(g.passed, isTrue, reason: 'L$level: ровно порог $need из $total не засчитан');
    }
  });

  test('🔴 время вышло — партия кончилась, найденное засчитано как есть', () {
    var now = 0;
    final g = ProofGame(level: 1, rnd: Random(9), nowMs: () => now);
    g.begin();
    expect(g.timeUp, isFalse);
    g.tap(g.grid.targetIndices.first);
    now += g.params.timeLimitSec * 1000;
    expect(g.timeUp, isTrue);
    g.stopByTime();
    expect(g.finished, isTrue);
    expect(g.found.length, 1);
    expect(g.missed, g.grid.total - 1);
    expect(g.tap(g.grid.targetIndices.last), ProofTap.ignored, reason: 'нажатие после конца времени');
  });

  test('🔴 пустое поле не делит на ноль', () {
    final g = ProofGame(level: 1, rnd: Random(1), nowMs: () => 0);
    g.begin();
    // Подменяем поле на заведомо пустое: целей нет вовсе.
    g.grid = const ProofGrid(letters: ['А'], targets: ['Б', 'В'], targetIndices: {});
    expect(g.omissionPct, 0);
    expect(g.accuracyPct, 100);
    expect(g.passed, isFalse, reason: 'поле без целей засчитано проходом');
  });
}

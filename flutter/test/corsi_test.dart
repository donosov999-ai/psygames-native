import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/corsi/model.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS, а не с собственной формулой.
///
/// Правила «Кубиков Корси» живут в экране `app/games/corsi.tsx`, и перенос легко
/// «проверить» тем же выражением, которым переносил, — такая проба зелёная всегда.
/// Поэтому значения ВЫГРУЖЕНЫ прогоном самой TS-функции `levelParams` на L1…L60
/// (временная jest-проба, удалена после выгрузки) и лежат в
/// `test/fixtures/corsi-reference.json`. Dart обязан совпасть с ними.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/corsi-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  test('🔴 потолок объёма и размер доски совпадают с живым кодом', () {
    expect(corsiVolumeTop, ref['volumeTop']);
    expect(corsiBlocks, ref['blocks']);
    expect(corsiErrorsToStop, ref['errorsToStop']);
    expect(corsiPositions.length, corsiBlocks, reason: 'блоков на доске столько же, сколько в правиле');
  });

  test('🔴 уровень задаёт то же самое на всех 60 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.startSpan, e['startSpan'], reason: '$at длина ряда');
      expect(p.tickMs, e['tickMs'], reason: '$at шаг показа');
      expect(p.flashMs, e['flashMs'], reason: '$at вспышка');
      expect(p.reverse, e['reverse'], reason: '$at обратный порядок');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка перед вводом');
    }
  });

  test('🔴 сложность выше потолка объёма растёт не длиной', () {
    // Та самая починка 12.09.2026: до неё с L14 не менялось ничего, и 46 уровней
    // из 59 были копиями соседа. Проба держит ось задержки на месте.
    final a = LevelParams.of(corsiVolumeTop + 1);
    final b = LevelParams.of(corsiVolumeTop + 5);
    expect(a.startSpan, b.startSpan, reason: 'длина выше потолка не растёт');
    expect(a.tickMs, b.tickMs, reason: 'темп показа уже на дне');
    expect(a.flashMs, b.flashMs, reason: 'вспышка уже на дне');
    expect(b.holdMs, greaterThan(a.holdMs), reason: 'растёт задержка');
  });

  test('🔴 ни одного уровня-клона на L1…L60', () {
    String fingerprint(int l) {
      final p = LevelParams.of(l);
      return '${p.startSpan}|${p.tickMs}|${p.flashMs}|${p.reverse}|${p.holdMs}';
    }

    final clones = <String>[];
    for (var l = 2; l <= 60; l++) {
      if (fingerprint(l) == fingerprint(l - 1)) clones.add('L$l=L${l - 1}');
    }
    expect('клонов: ${clones.length}', 'клонов: 0');
  });

  test('🔴 ряд повторяется задом наперёд ровно с L10', () {
    final forward = CorsiGame(level: 9, sequence: [4, 1, 7], rnd: Random(1));
    expect(forward.expected, [4, 1, 7], reason: 'до L10 порядок тот же');
    final backward = CorsiGame(level: 10, sequence: [4, 1, 7], rnd: Random(1));
    expect(backward.expected, [7, 1, 4], reason: 'с L10 порядок обратный');
  });

  test('🔴 круг берётся целиком, и длина ряда растёт', () {
    final g = CorsiGame(level: 1, sequence: [2, 5, 8], rnd: Random(1));
    expect(g.params.startSpan, 3);
    expect(g.tap(2), TapOutcome.progress);
    expect(g.tap(5), TapOutcome.progress);
    expect(g.tap(8), TapOutcome.roundWon);
    expect(g.span, 3, reason: 'взятая длина запомнена');
    expect(g.passed, isTrue, reason: 'длина уровня повторена — уровень пройден');
    g.nextRound([2, 5, 8, 1]);
    expect(g.sequence.length, 4, reason: 'следующий круг на блок длиннее');
    expect(g.answer, isEmpty, reason: 'ответ прошлого круга не тянется в новый');
  });

  test('🔴 промах — ошибка, вторая ошибка заканчивает партию', () {
    final g = CorsiGame(level: 1, sequence: [2, 5, 8], rnd: Random(1));
    expect(g.tap(5), TapOutcome.roundLost, reason: 'не тот блок на первом месте');
    expect(g.errors, 1);
    expect(g.finished, isFalse, reason: 'после первой ошибки даётся вторая попытка');
    g.retryRound([3, 6, 0]);
    expect(g.tap(6), TapOutcome.roundLost);
    expect(g.errors, 2);
    expect(g.finished, isTrue, reason: 'две ошибки — конец партии, как в классическом Корси');
    expect(g.tap(3), TapOutcome.ignored, reason: 'после конца нажатия не в счёт');
  });

  test('🔴 ряд собирается из РАЗНЫХ блоков и не длиннее доски', () {
    final g = CorsiGame(level: 20, rnd: Random(7));
    for (var len = 1; len <= 12; len++) {
      final seq = g.drawSequence(len);
      expect(seq.length, len > corsiBlocks ? corsiBlocks : len, reason: 'длина $len');
      expect(seq.toSet().length, seq.length, reason: 'блоки в ряду не повторяются (длина $len)');
      expect(seq.every((b) => b >= 0 && b < corsiBlocks), isTrue);
    }
  });

  test('счёт партии считается длиной ряда, а не числом нажатий', () {
    final g = CorsiGame(level: 1, sequence: [2, 5, 8], rnd: Random(1));
    g.tap(2);
    g.tap(5);
    g.tap(8);
    expect(g.score, 3 * 200);
    g.nextRound([2, 5, 8, 1]);
    g.tap(5);
    expect(g.score, 3 * 200 - 50, reason: 'ошибка снимает 50');
  });
}

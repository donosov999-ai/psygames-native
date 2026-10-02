import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/digit_span/model.dart';
import 'package:psygames_flutter/shell/preset_cap.dart';
import 'package:psygames_flutter/shell/voice.dart';

/// СВЕРКА С ЭТАЛОНАМИ ИЗ ЖИВОГО TS, а не с собственной формулой.
///
/// Правила «Цифрового ряда» живут прямо в экране `app/games/digit-span.tsx`, и перенос легко
/// «проверить» тем же выражением, которое и переносил — такая проба зелёная всегда и не стоит
/// ничего. Поэтому значения ВЫГРУЖЕНЫ прогоном самих TS-функций экспортёром в репо
/// (`frontend/src/games/digit-span/tools/record-flutter-reference.gen.ts`) и лежат в
/// `test/fixtures/digit-span-reference.json`. Dart обязан совпасть с ними.
void main() {
  late Map<String, dynamic> ref;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/digit-span-reference.json').readAsStringSync())
        as Map<String, dynamic>;
  });

  Direction dirOf(Object? s) => Direction.values.firstWhere((d) => d.name == s);
  Delivery deliveryOf(Object? s) => Delivery.values.firstWhere((d) => d.name == s);
  VoiceBlock? blockOf(Object? s) => switch (s) {
        'sound-off' => VoiceBlock.soundOff,
        'no-voice' => VoiceBlock.noVoice,
        _ => null,
      };

  test('🔴 потолок объёма совпадает с живым кодом', () {
    expect(dsVolumeTop, ref['volumeTop']);
  });

  test('🔴 уровень задаёт то же самое на всех 60 ступенях', () {
    final levels = ref['levels'] as List;
    expect(levels.length, 60);
    for (final raw in levels) {
      final e = raw as Map<String, dynamic>;
      final p = LevelParams.of(e['level'] as int);
      final at = 'L${e['level']}';
      expect(p.startLen, e['startLen'], reason: '$at длина ряда');
      expect(p.showMs, e['showMs'], reason: '$at показ');
      expect(p.gapMs, e['gapMs'], reason: '$at пауза');
      expect(p.reverse, e['reverse'], reason: '$at обратный ввод');
      expect(p.holdMs, e['holdMs'], reason: '$at задержка');
      expect(p.surpriseDir, e['surpriseDir'], reason: '$at направление после показа');
    }
  });

  test('🔴 ожидаемый ответ совпадает по всем трём направлениям', () {
    for (final raw in ref['seqs'] as List) {
      final c = raw as Map<String, dynamic>;
      final got = expectedDigits((c['seq'] as List).cast<int>(), dirOf(c['dir']));
      expect(got, (c['expected'] as List).cast<int>(), reason: 'ряд ${c['seq']} направление ${c['dir']}');
    }
  });

  test('🔴 сложность выше потолка объёма растёт не длиной', () {
    final a = LevelParams.of(dsVolumeTop + 1);
    final b = LevelParams.of(dsVolumeTop + 5);
    expect(a.startLen, b.startLen, reason: 'длина выше потолка не растёт');
    expect(a.showMs, b.showMs, reason: 'показ уже на дне');
    expect(b.holdMs, greaterThan(a.holdMs), reason: 'растёт задержка');
    expect(a.surpriseDir && b.surpriseDir, isTrue, reason: 'направление объявляется после показа');
  });

  test('списки режимов — те же и в том же порядке, что у веба', () {
    expect(Delivery.values.map((d) => d.name).toList(), ref['deliveries']);
    expect(Direction.values.map((d) => d.name).toList(), ref['directions'], reason: 'порядок важен: по нему разыгрывается ось 9');
    expect(Pace.values.map((p) => p.name).toList(), ref['paceSteps']);
  });

  test('🔴 правила уровня объявлены с тех же ступеней, что исполняются', () {
    final rules = {for (final r in ref['rules'] as List) (r as Map)['key']: r['fromLevel']};
    expect(rules, {'reverse': 11, 'surprise_dir': dsVolumeTop + 1});
    expect(LevelParams.of(10).reverse || !LevelParams.of(11).reverse, isFalse);
    expect(LevelParams.of(dsVolumeTop).surpriseDir || !LevelParams.of(dsVolumeTop + 1).surpriseDir, isFalse);
  });

  test('«весь ряд разом» держится столько же, сколько шёл бы показ по одной', () {
    for (final raw in ref['allAtOnce'] as List) {
      final c = raw as Map<String, dynamic>;
      expect(allAtOnceMs(c['len'] as int, c['gapMs'] as int), c['ms'], reason: '$c');
    }
  });

  test('🔴 темп: уровень в личной игре, ступень — только в шаге зарядки', () {
    for (final raw in ref['timing'] as List) {
      final c = raw as Map<String, dynamic>;
      final t = showTiming(
          isPreset: c['isPreset'] as bool, level: c['level'] as int, pace: Pace.values.byName(c['pace'] as String));
      expect('${t.showMs}/${t.gapMs}', '${c['showMs']}/${c['gapMs']}', reason: '$c');
    }
  });

  test('🔴 подача и лестница: голос без голоса идёт экраном и двигает экранную лестницу', () {
    final table = ref['deliveryTable'] as List;
    expect(table.length, 9);
    for (final raw in table) {
      final c = raw as Map<String, dynamic>;
      final chosen = deliveryOf(c['chosen']);
      final block = blockOf(c['block']);
      expect(effectiveDelivery(chosen, block).name, c['effective'], reason: '$c');
      expect(ladderIdFor(chosen, block), c['ladderId'], reason: '$c');
    }
  });

  test('рекорд в шапке: незачётная партия его не двигает даже на экране', () {
    for (final raw in ref['records'] as List) {
      final c = raw as Map<String, dynamic>;
      expect(hudRecord(c['stored'] as int?, c['span'] as int, c['counts'] as bool), c['shown'], reason: '$c');
    }
  });

  test('🔴 шаг лесенки длин — 160 случаев живого spanStep', () {
    final steps = ref['steps'] as List;
    expect(steps.length, 160);
    for (final raw in steps) {
      final c = raw as Map<String, dynamic>;
      final s = spanStep(
        seqLen: c['seqLen'] as int,
        round: c['round'] as int,
        atLenErrors: c['atLenErrorsBefore'] as int,
        correct: c['correct'] as bool,
      );
      expect('${s.nextLen} ${s.cont} ${s.atLenErrors} ${spanFinished(s)}',
          '${c['nextLen']} ${c['cont']} ${c['atLenErrors']} ${c['finished']}', reason: '$c');
    }
  });

  test('🔴 метки отчёта: шаг «Оценки» — свои, личная игра — направление и последняя длина', () {
    for (final raw in ref['labels'] as List) {
      final c = raw as Map<String, dynamic>;
      final l = sessionLabels(
        isPreset: c['isPreset'] as bool,
        diff: c['diff'] as String,
        direction: dirOf(c['direction']),
        finalLength: c['finalLength'] as int,
      );
      expect('${l.difficulty} / ${l.mode}', '${c['difficulty']} / ${c['mode']}', reason: '$c');
    }
  });

  test('ось 9: розыгрыш направления на тех же числах даёт то же направление', () {
    for (final raw in ref['draws'] as List) {
      final c = raw as Map<String, dynamic>;
      final r = (c['random'] as num).toDouble();
      expect(drawDirection(() => r).name, c['dir'], reason: 'random $r');
    }
  });

  test('🔴 12 целых партий на записанном потоке: те же ряды, длины, конец, счёт и метки', () {
    final sessions = ref['sessions'] as List;
    expect(sessions.length, 12);
    for (final raw in sessions) {
      final c = raw as Map<String, dynamic>;
      final randoms = [for (final r in c['randoms'] as List) (r as num).toDouble()];
      var used = 0;
      double rng() => randoms[used++];
      final isPreset = c['isPreset'] as bool;
      final effLevel = isPreset ? 1 : c['level'] as int;
      expect(effLevel, c['effLevel']);
      final p = LevelParams.of(effLevel);
      final surprise = !isPreset && p.surpriseDir;
      final dir = surprise
          ? drawDirection(rng)
          : (isPreset ? dirOf(c['dir']) : (p.reverse ? Direction.backward : Direction.forward));
      final startLen = isPreset
          ? capPresetByLevel(want: c['want'] as int, atLevel: p.startLen, atTop: p.startLen >= 9)
          : p.startLen;
      final at = 'партия L${c['level']} шаг=$isPreset seed=${c['seed']}';
      expect('${dir.name} $startLen', '${c['dir']} ${c['startLen']}', reason: at);
      final s = DigitSpanSession(level: effLevel, isPreset: isPreset, direction: dir, startLen: startLen);
      final rows = c['rows'] as List;
      for (var i = 0; i < rows.length; i++) {
        final row = rows[i] as Map<String, dynamic>;
        expect(s.finished, isFalse, reason: '$at: партия кончилась раньше ряда ${i + 1}');
        s.deal(rng);
        expect(s.sequence, (row['seq'] as List).cast<int>(), reason: '$at, ряд ${i + 1}');
        expect(s.expected, (row['expected'] as List).cast<int>(), reason: '$at, ряд ${i + 1}');
        final typed = [...s.expected];
        if (!(row['correct'] as bool)) typed[0] = (typed[0] + 1) % 10;
        for (final d in typed) {
          expect(s.enter(d), isTrue);
        }
        expect(s.enter(0), isFalse, reason: 'лишнее нажатие не набирается');
        s.submit();
      }
      expect(s.finished, isTrue, reason: '$at: партия не кончилась там, где кончилась в вебе');
      expect(used, randoms.length, reason: '$at: обращений к случайности столько же, сколько у веба');
      expect(
        'длина ${s.seqLen} раунд ${s.round} верных ${s.correctRounds} охват ${s.maxSpan} ошибок ${s.errors} '
        'счёт ${s.score} зачёт ${s.passed}',
        'длина ${c['finalLength']} раунд ${c['rounds']} верных ${c['correctRounds']} охват ${c['maxSpan']} '
        'ошибок ${c['errors']} счёт ${c['score']} зачёт ${c['passed']}',
        reason: at,
      );
      final l = sessionLabels(isPreset: isPreset, diff: (c['diff'] ?? 'medium') as String, direction: dir, finalLength: s.seqLen);
      expect('${l.difficulty} / ${l.mode}', '${c['labels']['difficulty']} / ${c['labels']['mode']}', reason: at);
    }
  });

  group('ввод ряда', () {
    DigitSpanSession session(List<int> seq, Direction dir) =>
        DigitSpanSession(level: 1, isPreset: false, direction: dir, startLen: seq.length)..sequence = seq;

    test('🔴 обратный ввод проверяется по обратному ряду, а не по показанному', () {
      final s = session([1, 2, 5, 5, 9], Direction.backward);
      for (final d in [9, 5, 5, 2, 1]) {
        s.enter(d);
      }
      expect(s.rowCorrect, isTrue);
    });

    test('неполный ряд не верен, даже если начало верное; шаг назад стирает последнюю цифру', () {
      final s = session([7, 1, 3], Direction.forward);
      s.enter(7);
      s.enter(9);
      s.undo();
      s.enter(1);
      expect(s.entered, [7, 1]);
      expect(s.rowCorrect, isFalse);
    });
  });
}

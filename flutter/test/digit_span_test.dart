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

  test('🔴 шаг лесенки длин — 320 случаев живого spanStep (с серией верных подряд)', () {
    final steps = ref['steps'] as List;
    expect(steps.length, 320);
    for (final raw in steps) {
      final c = raw as Map<String, dynamic>;
      final s = spanStep(
        seqLen: c['seqLen'] as int,
        round: c['round'] as int,
        atLenErrors: c['atLenErrorsBefore'] as int,
        correct: c['correct'] as bool,
        streak: c['streakBefore'] as int,
      );
      expect('${s.nextLen} ${s.cont} ${s.atLenErrors} ${s.streak} ${spanFinished(s)}',
          '${c['nextLen']} ${c['cont']} ${c['atLenErrors']} ${c['streak']} ${c['finished']}', reason: '$c');
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

  // ── 13.11.2026, Денис: «сложность слишком быстрая», «по умолчанию — весь ряд сразу» ──────────────
  test('🔴 кривая L1…L30: +1 к старту раз в два уровня до 9 (пара уровней различается мягким темпом), дальше — прежние оси', () {
    // (уровень, старт, показ мс, пауза мс, обратный, удержание мс, направление после показа)
    const curve = [
      (1, 4, 820, 1350, false, 0, false), (2, 4, 796, 1300, false, 0, false),
      (3, 5, 772, 1250, false, 0, false), (4, 5, 748, 1200, false, 0, false),
      (5, 6, 724, 1150, false, 0, false), (6, 6, 700, 1100, false, 0, false),
      (7, 7, 655, 1030, false, 0, false), (8, 7, 610, 960, false, 0, false),
      (9, 8, 565, 890, false, 0, false), (10, 8, 520, 820, false, 0, false),
      (11, 9, 475, 750, true, 0, false), (12, 9, 430, 680, true, 0, false),
      (13, 9, 385, 610, true, 0, false), (14, 9, 350, 550, true, 0, false),
      (15, 9, 350, 550, true, 700, true), (16, 9, 350, 550, true, 1400, true),
      (17, 9, 350, 550, true, 2100, true), (18, 9, 350, 550, true, 2800, true),
      (19, 9, 350, 550, true, 3500, true), (20, 9, 350, 550, true, 4200, true),
      (21, 9, 350, 550, true, 4900, true), (22, 9, 350, 550, true, 5600, true),
      (23, 9, 350, 550, true, 6300, true), (24, 9, 350, 550, true, 7000, true),
      (25, 9, 350, 550, true, 7700, true), (26, 9, 350, 550, true, 8400, true),
      (27, 9, 350, 550, true, 9100, true), (28, 9, 350, 550, true, 9800, true),
      (29, 9, 350, 550, true, 10500, true), (30, 9, 350, 550, true, 11200, true),
    ];
    final keys = <String>{};
    for (final (l, start, show, gap, rev, hold, sur) in curve) {
      final p = LevelParams.of(l);
      expect('${p.startLen} ${p.showMs} ${p.gapMs} ${p.reverse} ${p.holdMs} ${p.surpriseDir}', '$start $show $gap $rev $hold $sur',
          reason: 'L$l');
      expect(keys.add('${p.startLen} ${p.showMs} ${p.gapMs} ${p.reverse} ${p.holdMs} ${p.surpriseDir}'), isTrue,
          reason: 'L$l — клон предыдущих: правило раздела «соседние уровни различаются»');
    }
  });

  test('🔴 длина внутри уровня растёт после ДВУХ верных рядов подряд; ошибка обнуляет серию', () {
    ({int nextLen, bool cont, int atLenErrors, int streak}) step(int len, bool ok, {int streak = 0, int errs = 0, int round = 1}) =>
        spanStep(seqLen: len, round: round, atLenErrors: errs, correct: ok, streak: streak);
    final first = step(5, true);
    expect('${first.nextLen} ${first.streak} ${first.cont}', '5 1 true', reason: 'один верный — длина та же');
    final second = step(5, true, streak: 1);
    expect('${second.nextLen} ${second.streak} ${second.atLenErrors}', '6 0 0', reason: 'два верных подряд — на цифру длиннее');
    final wrong = step(5, false, streak: 1);
    expect('${wrong.nextLen} ${wrong.streak} ${wrong.atLenErrors}', '5 0 1', reason: 'ошибка снимает серию');
    expect(step(5, true, streak: 1, errs: 1).atLenErrors, 0, reason: 'взятая длина обнуляет ошибки на длине');
    expect(step(5, true, errs: 1).atLenErrors, 1, reason: 'первый верный из двух ошибок на длине не прощает');
    expect(spanFinished(step(12, true, streak: 1)), isTrue, reason: 'потолок 12 — как прежде');
    expect(spanFinished(step(12, true)), isFalse, reason: 'на двенадцати первый верный ещё не конец');
  });

  test('🔴 партия: 4, 4, 5, 5, 6 — длина и серия по ходу; ошибка посреди пары не засчитывает рост', () {
    final s = DigitSpanSession(level: 1, isPreset: false, direction: Direction.forward, startLen: 4);
    double rng() => 0.5;
    final lens = <int>[];
    for (final ok in [true, true, true, false, true, true]) {
      s.deal(rng);
      lens.add(s.seqLen);
      for (final d in (ok ? s.expected : [for (final d in s.expected) (d + 1) % 10])) {
        s.enter(d);
      }
      s.submit();
    }
    expect(lens, [4, 4, 5, 5, 5, 5], reason: '4,4 → 5; 5 верно, 5 ошибка (серия сброшена), 5 верно, 5 верно → 6');
    expect(s.seqLen, 6);
    expect(s.streak, 0);
  });

  test('🔴 способ подачи при открытии: без выбора — весь ряд сразу; явный выбор сохраняется; шаг зарядки — по-старому', () {
    Delivery d({bool warm = false, String param = '', String? stored}) => initialDelivery(isWarmup: warm, param: param, stored: stored);
    expect(d(), Delivery.all, reason: 'выбора нет — весь ряд сразу');
    expect(d(stored: ''), Delivery.all);
    expect(d(stored: 'screen'), Delivery.screen, reason: 'явный выбор «по одной» сохранён');
    expect(d(stored: 'voice'), Delivery.voice);
    expect(d(stored: 'мусор'), Delivery.all, reason: 'битое значение — умолчание');
    expect(d(param: 'screen', stored: 'all'), Delivery.screen, reason: 'параметр адреса сильнее');
    expect(d(warm: true), Delivery.screen, reason: 'шаг зарядки без параметра — по одной цифре, как было');
    expect(d(warm: true, param: 'all', stored: 'voice'), Delivery.all, reason: 'шаг зарядки — по своему параметру, а не по выбору игрока');
  });
}

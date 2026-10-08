import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fillwords/core/fillwords.dart';
import 'package:psygames_flutter/games/proofreading/series/series_blocks.dart';
import 'package:psygames_flutter/games/proofreading/series/series_data.dart';
import 'package:psygames_flutter/games/proofreading/series/series_field.dart';
import 'package:psygames_flutter/shell/series_core.dart';

/// СЕРИЯ «КОРРЕКТУРЫ»: DART ПРОТИВ ЖИВОГО TS, ЧИСЛО В ЧИСЛО.
///
/// Эталон пишет выгрузчик `frontend/src/games/proofreading/tools/record-flutter-series.gen.ts`
/// прогоном веб-ядра: 168 полей (7 языков × стороны 5…8 × 6 зёрен), по записанной серии на
/// язык (три блока, ответ ядра на каждое нажатие), исходы прогресса и разбор хранилища.
/// Одно зерно обязано давать одно поле в обеих половинах — иначе разности блоков натива
/// мерили бы другое поле, чем у веба.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late ProofSeriesData data;
  late Map<String, dynamic> ref;
  final pools = <String, FillwordsPool>{};

  setUpAll(() async {
    data = ProofSeriesData.parse(File('assets/proofreading/series.json').readAsStringSync());
    ref = jsonDecode(File('test/fixtures/proofreading-series-reference.json').readAsStringSync()) as Map<String, dynamic>;
    for (final l in data.locales) {
      pools[l] = await loadWordPool(l);
    }
  });

  Object? norm(Object? v) => jsonDecode(jsonEncode(v));

  test('эталон не пуст: языки серии, поля и партии на месте', () {
    expect(data.locales, isNotEmpty);
    expect((ref['fields'] as List).length, data.locales.length * 4 * 6);
    expect((ref['plays'] as List).length, data.locales.length);
  });

  test('🔴 поля серии — число в число с вебом', () {
    var n = 0;
    for (final e in ref['fields'] as List) {
      final req = e['request'] as Map<String, dynamic>;
      final want = e['field'] as Map<String, dynamic>;
      final loc = req['locale'] as String;
      final f = buildProofField(data, pools[loc]!, loc, req['size'] as int, req['seed'] as int);
      final tag = '$loc ${req['size']} #${req['seed']}';
      expect(f.size, want['size'], reason: tag);
      expect(f.puzzle.letters, want['letters'], reason: '$tag: буквы');
      expect([for (final w in f.puzzle.words) {'word': w.word, 'path': w.path}], norm(want['words']),
          reason: '$tag: слова');
      expect(f.signs, want['signs'], reason: '$tag: знаки');
      expect(f.signCells, want['signCells'], reason: '$tag: клетки знаков');
      expect(f.category, want['category'], reason: '$tag: категория');
      expect(f.senseWords, want['senseWords'], reason: '$tag: слова категории');
      n++;
    }
    expect(n, 168);
  });

  test('сторона вне 5…8 зажимается, а не роняет сборку', () {
    for (final c in ref['clamp'] as List) {
      final loc = data.locales.first;
      expect(buildProofField(data, pools[loc]!, loc, c['size'] as int, 7).size, c['got'], reason: '${c['size']}');
    }
  });

  test('🔴 записанные серии: ответ ядра на каждое нажатие, ошибки и конец блока', () {
    for (final p in ref['plays'] as List) {
      final req = p['request'] as Map<String, dynamic>;
      final loc = req['locale'] as String;
      final field = buildProofField(data, pools[loc]!, loc, req['size'] as int, req['seed'] as int);
      var state = openBlock(field, 0);
      final blocks = p['blocks'] as List;
      for (var b = 0; b < blocks.length; b++) {
        final blk = blocks[b] as Map<String, dynamic>;
        expect(blockKeyAt(state.blockIndex), blk['key']);
        for (final s in blk['steps'] as List) {
          final input = s['input'] as Map<String, dynamic>;
          final r = input.containsKey('cell')
              ? pressSignCell(state, input['cell'] as int)
              : pressWordTrace(state, [for (final c in input['path'] as List) c as int]);
          expect(r.result.name, s['result'], reason: '$loc ${blk['key']}: ${jsonEncode(input)}');
          state = r.state;
          // Повтор по взятой клетке — «ignored», и состояние ядро не меняет.
          expect(blockStep(state), s['step'], reason: '$loc ${blk['key']}: шаг');
        }
        expect(state.errors, blk['errors'], reason: '$loc ${blk['key']}: ошибки');
        expect(blockDone(state), blk['done'], reason: '$loc ${blk['key']}: конец блока');
        if (b < blocks.length - 1) state = nextBlock(state);
      }
    }
  });

  test('🔴 прогресс серии: вход, исход прогона и запись партии — как у веба', () {
    for (final c in ref['progress'] as List) {
      final name = c['name'] as String;
      final pj = c['progress'] as Map<String, dynamic>;
      final progress = ProofSeriesProgress(
        sizes: (pj['sizes'] as Map).map((k, v) => MapEntry('$k', v as int)),
        streaks: (pj['streaks'] as Map).map((k, v) => MapEntry('$k', v as int)),
      );
      final rj = c['run'] as Map<String, dynamic>;
      var run = startSeries(proofSeriesGameType, rj['level'] as int, proofSeriesPlan, 0);
      for (final b in rj['blocks'] as List) {
        run = recordBlock(run,
            SeriesBlock(key: b['key'] as String, timeMs: b['timeMs'] as int, errors: b['errors'] as int, done: b['done'] as bool));
      }
      final ladder = c['ladder'] as int;
      final entry = proofSeriesEntry(progress, ladder);
      expect({'level': entry.level, 'perBlock': entry.perBlock}, norm(c['entryBefore']), reason: '$name: вход');
      final out = afterProofSeries(progress, run, ladder);
      expect({
        'progress': {'sizes': out.progress.sizes, 'streaks': out.progress.streaks},
        'raised': out.raised,
        'weakest': out.weakest,
        'nextLevel': out.nextLevel,
        'runsLeft': out.runsLeft,
      }, norm(c['outcome']), reason: '$name: исход');
      final s = seriesSession(run);
      expect({
        'game_type': s.gameType,
        'score': s.score,
        'time_seconds': s.timeSeconds,
        'errors': s.errors,
        'mode': s.mode,
        'details': s.details,
      }, norm(c['session']), reason: '$name: запись партии');
    }
  });

  test('разбор хранилища: битое — пустой прогресс, чужие числа зажаты', () {
    for (final c in ref['parse'] as List) {
      final got = parseProofProgress(c['raw'] as String?);
      expect({'sizes': got.sizes, 'streaks': got.streaks}, norm(c['got']), reason: '${c['raw']}');
    }
  });

  test('подписи серии есть на 12 языках; чужой язык — английские', () {
    for (final l in ['ru', 'en', 'de', 'es', 'pt', 'fr', 'it', 'zh', 'ja', 'ko', 'hi', 'ar']) {
      expect(data.strings(l).entry.trim(), isNotEmpty, reason: l);
    }
    expect(data.strings('xx').entry, data.strings('en').entry);
  });
}

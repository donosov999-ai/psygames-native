import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/schulte/series.dart';

/// 🔴 СЕРИЯ БЛОКОВ «ШУЛЬТЕ» — ПЕРЕНОС, А НЕ ПЕРЕСКАЗ (задача 1b6338c1, 07.10.2026).
///
/// Эталон снят прогоном ЖИВОГО ядра веба (`core/blocks.ts`, `core/progress.ts`,
/// `services/series.ts`) выгрузчиком `frontend/src/games/schulte/tools/record-series-reference.gen.ts`.
/// Здесь Dart-порт (`lib/games/schulte/series.dart`) гонит те же сценарии и сверяет число в число:
/// цели блоков, поле по зерну, каждое нажатие трёх блоков, вход в серию, ход уровня по цепочке из
/// десяти прогонов и сессию.
///
/// Генератор случайности — общий линейный конгруэнтный, 32 бита (тот же, что в выгрузчике).
void main() {
  final ref = jsonDecode(File('test/fixtures/schulte-series-reference.json').readAsStringSync()) as Map<String, dynamic>;

  SeriesRandom lcg(int seed) {
    var s = seed & 0xFFFFFFFF;
    return () {
      s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
      return s / 4294967296;
    };
  }

  Map<String, Object?> summary(SchulteSeriesState st) => {
        'block': st.blockIndex,
        'step': st.step,
        'pending': st.pending,
        'errors': st.errors,
        'taken': st.taken.where((t) => t).length,
        'target': blockTarget(st),
        'done': blockDone(st),
      };

  SchulteSeriesProgress progressOf(Map<String, dynamic> p) => SchulteSeriesProgress(
        (p['sizes'] as Map).map((k, v) => MapEntry(k as String, v as int)),
        (p['streaks'] as Map).map((k, v) => MapEntry(k as String, v as int)),
      );

  SeriesRun runOf(Map<String, dynamic> session) {
    final details = session['details'] as Map<String, dynamic>;
    var run = startSeries(session['game_type'] as String, details['level'] as int, schulteSeriesPlan);
    for (final b in (details['blocks'] as List).cast<Map<String, dynamic>>()) {
      run = recordBlock(run, SeriesBlock(
          key: b['key'] as String, timeMs: b['time_ms'] as int, errors: b['errors'] as int, done: b['done'] as bool));
    }
    return run;
  }

  test('план блоков тот же и в том же порядке', () {
    expect(schulteSeriesPlan, ref['plan']);
  });

  test('цели блоков: по порядку, чередование, сумма пары', () {
    for (final t in (ref['targets'] as List).cast<Map<String, dynamic>>()) {
      final total = t['total'] as int;
      expect(orderTargets(total), t['order'], reason: '$total: по порядку');
      expect(alternateTargets(total), t['alternate'], reason: '$total: чередование');
      expect(pairSum(total), t['pairSum']);
      expect(sumPairsTotal(total), t['pairs']);
    }
  });

  test('поле по зерну — та же перестановка, размер зажат в 5…8', () {
    for (final f in (ref['fields'] as List).cast<Map<String, dynamic>>()) {
      final field = buildSchulteField(f['size'] as int, lcg(f['seed'] as int));
      expect(field.cells, f['cells'], reason: 'размер ${f['size']}');
    }
    expect(buildSchulteField(5, lcg(7)).cells, ref['field']);
  });

  test('🔴 каждое нажатие трёх блоков — тот же исход и то же состояние', () {
    final field = buildSchulteField(5, lcg(7));
    for (final play in (ref['plays'] as List).cast<Map<String, dynamic>>()) {
      var st = openBlock(field, play['block'] as int);
      expect(blockKeyAt(play['block'] as int), play['key']);
      expect(summary(st), play['start'], reason: '${play['name']}: старт блока');
      var i = 0;
      for (final step in (play['steps'] as List).cast<Map<String, dynamic>>()) {
        final r = pressSeriesCell(st, step['index'] as int);
        st = r.state;
        expect(seriesPressName(r.result), step['result'], reason: '${play['name']} нажатие ${i + 1}');
        final want = Map<String, Object?>.from(step)
          ..remove('index')
          ..remove('result');
        expect(summary(st), want, reason: '${play['name']} нажатие ${i + 1}');
        i += 1;
      }
    }
    final moved = ref['moved'] as Map<String, dynamic>;
    final one = field.cells.indexOf(1);
    final next = nextBlock(pressSeriesCell(openBlock(field, 0), one).state);
    expect(next.blockIndex, moved['block']);
    expect(next.step, moved['step']);
    expect(next.errors, moved['errors']);
    expect(identical(next.field, field), isTrue, reason: 'переход блока несёт ТО ЖЕ поле, а не копию');
    expect(next.field.cells, moved['sameCells']);
  });

  test('разбор сохранённого прогресса и вход в серию', () {
    for (final p in (ref['parsed'] as List).cast<Map<String, dynamic>>()) {
      final got = SchulteSeriesProgress.parse(p['raw'] as String);
      final want = progressOf(p['progress'] as Map<String, dynamic>);
      expect(got.sizes, want.sizes, reason: 'размеры: «${p['raw']}»');
      expect(got.streaks, want.streaks, reason: 'серии удач: «${p['raw']}»');
    }
    for (final e in (ref['entries'] as List).cast<Map<String, dynamic>>()) {
      final got = seriesEntry(SchulteSeriesProgress.parse(e['raw'] as String), e['ladder'] as int);
      final want = e['entry'] as Map<String, dynamic>;
      expect(got.level, want['level'], reason: '«${e['raw']}», лестница ${e['ladder']}');
      expect(got.perBlock, want['perBlock'], reason: '«${e['raw']}», лестница ${e['ladder']}');
    }
  });

  test('🔴 ход уровня по цепочке из десяти прогонов — как у веба', () {
    final sessions = ref['sessions'] as Map<String, dynamic>;
    var progress = SchulteSeriesProgress.empty;
    for (final c in (ref['chain'] as List).cast<Map<String, dynamic>>()) {
      final run = runOf((sessions[c['run']] as Map<String, dynamic>)['session'] as Map<String, dynamic>);
      final got = afterSeriesRun(progress, run, c['ladder'] as int);
      final want = c['outcome'] as Map<String, dynamic>;
      final wantProgress = progressOf(want['progress'] as Map<String, dynamic>);
      final why = '${c['run']} на лестнице ${c['ladder']}';
      expect(got.raised, want['raised'], reason: why);
      expect(got.weakest, want['weakest'], reason: why);
      expect(got.nextLevel, want['nextLevel'], reason: why);
      expect(got.runsLeft, want['runsLeft'], reason: why);
      expect(got.progress.sizes, wantProgress.sizes, reason: why);
      expect(got.progress.streaks, wantProgress.streaks, reason: why);
      progress = got.progress;
    }
  });

  test('🔴 сессия серии: одна на всю серию, у неполной нет разностей', () {
    final sessions = ref['sessions'] as Map<String, dynamic>;
    for (final entry in sessions.entries) {
      final want = entry.value as Map<String, dynamic>;
      final run = runOf(want['session'] as Map<String, dynamic>);
      expect(seriesComplete(run), want['complete'], reason: entry.key);
      expect(seriesDiffs(run), want['diffs'], reason: entry.key);
      final s = seriesSession(run);
      final ws = want['session'] as Map<String, dynamic>;
      expect(s.gameType, ws['game_type']);
      expect(s.score, ws['score'], reason: '${entry.key}: очки');
      expect(s.timeSeconds, ws['time_seconds'], reason: '${entry.key}: время');
      expect(s.errors, ws['errors']);
      expect(s.mode, ws['mode']);
      expect(jsonDecode(jsonEncode(s.details)), ws['details'], reason: '${entry.key}: подробности');
    }
  });
}

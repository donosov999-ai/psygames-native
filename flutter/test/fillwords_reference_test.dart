import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/fillwords/core/fillwords.dart';

/// 🔴 ЯДРО ФИЛВОРДОВ НА DART = ЖИВОЙ TS, ЧИСЛО В ЧИСЛО.
///
/// Эталон снят прогоном веба: `frontend/src/games/fillwords/tools/record-flutter-reference.gen.ts`.
/// Сверяется всё, на чём стоит партия:
///   · поток ГПСЧ (mulberry32 на Math.imul);
///   · лестница L1–320 (все шесть осей, включая скорость с 95-го, подсказки с 143-го,
///     порядок с 203-го);
///   · ширина поля под экран;
///   · ~160 полей: 7 языков × 7 уровней × 2 сида, без диагоналей, отступление пола на 20×9;
///   · сценарии партий: записанные жесты (тап, повтор, прыжок, не-слово, слова прямо и
///     обратно, повторная сдача) в трёх порядках сдачи, подсказки до конца поля, ведение линии.
/// Одно зерно обязано давать одно поле в обеих половинах — иначе серия «Корректуры» в
/// приложении и в вебе раздаёт разные партии.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final ref = jsonDecode(File('test/fixtures/fillwords-reference.json').readAsStringSync()) as Map<String, dynamic>;

  SubmitOrder orderOf(String code) => SubmitOrder.values.firstWhere((o) => o.code == code);
  List<int> ints(Object? raw) => [for (final x in raw as List) x as int];

  FillwordsRequest requestOf(Map<String, dynamic> r) => FillwordsRequest(
        rows: r['rows'] as int,
        cols: r['cols'] as int,
        locale: r['locale'] as String,
        seed: r['seed'] as int,
        maxWordLen: r['maxWordLen'] as int?,
        minWordLen: r['minWordLen'] as int?,
        diagonals: r['diagonals'] as bool? ?? true,
      );

  Future<FillwordsPuzzle> puzzleOf(Map<String, dynamic> request) async {
    final req = requestOf(request);
    return generateFillwords(req, await loadWordPool(req.locale));
  }

  void expectTrace(FillwordsTrace t, Map<String, dynamic> want, String where) {
    expect(t.ok, want['ok'], reason: '$where: ok');
    expect(t.wordIndex, want['wordIndex'], reason: '$where: слово');
    expect(t.reason?.code, want['reason'], reason: '$where: причина');
  }

  test('языки режима и пол длины — те же, что считает веб', () async {
    expect(fillwordsLocales, ref['locales']);
    (ref['minLen'] as Map<String, dynamic>).forEach((loc, n) => expect(minWordLenOfLocale(loc), n, reason: loc));
    for (final e in (ref['poolSizes'] as Map<String, dynamic>).entries) {
      final pool = await loadWordPool(e.key);
      expect(pool.all.length, e.value, reason: 'пул ${e.key}');
      expect(isFillwordsLocale(e.key), isTrue);
    }
    expect(isFillwordsLocale('ko'), isFalse, reason: 'чамо в клетках — не корейское письмо (веб отсекает)');
  });

  test('🔴 поток ГПСЧ — бит в бит', () {
    for (final r in ref['rng'] as List) {
      final m = r as Map<String, dynamic>;
      expect(normalizeSeed(m['seed'] as int), m['normalized'], reason: 'зерно ${m['seed']}');
      final rng = createRng(m['seed'] as int);
      expect([for (var i = 0; i < 12; i++) rng.next()], [for (final x in m['next'] as List) (x as num).toDouble()],
          reason: 'next() при зерне ${m['seed']}');
      expect([for (var i = 0; i < 12; i++) rng.nextInt(i + 1)], ints(m['ints']), reason: 'int() при зерне ${m['seed']}');
    }
  });

  test('🔴 лестница L1–320: все оси, включая скорость, подсказки и порядок', () {
    final levels = ref['levels'] as List;
    for (var i = 0; i < levels.length; i++) {
      final want = levels[i] as Map<String, dynamic>;
      final got = fillwordsLevel(i + 1);
      final where = 'L${i + 1}';
      expect(got.rows, want['rows'], reason: '$where rows');
      expect(got.cols, want['cols'], reason: '$where cols');
      expect(got.maxWordLen, want['maxWordLen'], reason: '$where maxWordLen');
      expect(got.minWordLen, want['minWordLen'], reason: '$where minWordLen');
      expect(got.timeLimitSec, want['timeLimitSec'], reason: '$where timeLimitSec');
      expect(got.hints, want['hints'], reason: '$where hints');
      expect(got.order.code, want['order'], reason: '$where order');
    }
  });

  test('ширина поля под экран и порядок для партии', () {
    for (final w in ref['widths'] as List) {
      final m = w as Map<String, dynamic>;
      expect(widthForField((m['width'] as num).toDouble(), m['aside'] as bool), (m['field'] as num).toDouble(),
          reason: 'ширина ${m['width']}, список сбоку: ${m['aside']}');
    }
    for (final o in ref['orderForGame'] as List) {
      final m = o as Map<String, dynamic>;
      expect(orderForGame(orderOf(m['level'] as String), m['visible'] as bool).code, m['game']);
    }
  });

  test('🔴 поля: одно зерно — одно поле, буква в букву и клетка в клетку', () async {
    for (final e in ref['puzzles'] as List) {
      final m = e as Map<String, dynamic>;
      final want = m['puzzle'] as Map<String, dynamic>;
      final req = m['request'] as Map<String, dynamic>;
      final where = '${req['locale']} ${req['rows']}×${req['cols']} сид ${req['seed']}';
      final p = await puzzleOf(req);
      expect([p.rows, p.cols, p.seed, p.diagonals], [want['rows'], want['cols'], want['seed'], want['diagonals']],
          reason: where);
      expect(p.letters.join(), want['letters'], reason: '$where: буквы');
      final words = want['words'] as List;
      expect(p.words.length, words.length, reason: '$where: число слов');
      for (var i = 0; i < words.length; i++) {
        final w = words[i] as Map<String, dynamic>;
        expect(p.words[i].word, w['word'], reason: '$where: слово $i');
        expect(p.words[i].path, ints(w['path']), reason: '$where: путь слова $i');
      }
      assertFullCoverage(p);
    }
  });

  test('🔴 партии: каждый записанный жест получает тот же ответ, что в вебе', () async {
    var gestures = 0;
    for (final e in ref['scripted'] as List) {
      final m = e as Map<String, dynamic>;
      final p = await puzzleOf(m['request'] as Map<String, dynamic>);
      for (final g in m['games'] as List) {
        final game = g as Map<String, dynamic>;
        var s = createFillwordsSession(p, orderOf(game['order'] as String));
        for (final st in game['steps'] as List) {
          final step = st as Map<String, dynamic>;
          final path = ints(step['path']);
          final where = '${p.locale} ${p.rows}×${p.cols} ${game['order']} жест $path';
          expectTrace(resolveTrace(s, path), step['resolve'] as Map<String, dynamic>, '$where resolve');
          final r = applyTrace(s, path);
          s = r.session;
          expectTrace(r.trace, step['trace'] as Map<String, dynamic>, '$where apply');
          expect(s.mistakes, step['mistakes'], reason: '$where: промахи');
          expect(s.found, ints(step['found']), reason: '$where: найденные');
          expect(lettersLeft(s), step['lettersLeft'], reason: '$where: буквы на поле');
          expect(isCleared(s), step['cleared'], reason: '$where: поле разобрано');
          gestures++;
        }
      }

      var s = createFillwordsSession(p);
      for (final h in m['hints'] as List) {
        final r = takeHint(s);
        s = r.session;
        if (h == null) {
          expect(r.hint, isNull);
          continue;
        }
        final want = h as Map<String, dynamic>;
        expect(r.hint!.wordIndex, want['wordIndex'], reason: 'подсказка: слово');
        expect(r.hint!.cells, ints(want['cells']), reason: 'подсказка: клетки');
        expect(s.hints, want['hints'], reason: 'подсказка: счёт');
        s = applyTrace(s, r.hint!.cells).session;
      }

      var line = createFillwordsSession(p);
      line = applyTrace(line, p.words.first.path).session;
      var path = <int>[];
      for (final st in m['steps'] as List) {
        final step = st as Map<String, dynamic>;
        path = stepTrace(line, path, step['cell'] as int);
        expect(path, ints(step['path']), reason: 'ведение линии: клетка ${step['cell']}');
      }
    }
    expect(gestures, greaterThan(200), reason: 'сценариев мало — сверять было бы нечего');
  });

  test('подписи модуля: 12 языков, незнакомый язык → английский, подстановки целы', () async {
    final en = await loadFillwordsStrings('en');
    final ru = await loadFillwordsStrings('ru');
    expect(fillwordsUiLocales.length, 12);
    expect(ru.modeName, isNot(en.modeName));
    expect((await loadFillwordsStrings('xx')).modeName, en.modeName);
    for (final loc in fillwordsUiLocales) {
      final s = await loadFillwordsStrings(loc);
      for (final m in ['{rows}', '{cols}', '{words}', '{sec}']) {
        expect(s.levelLine, contains(m), reason: '$loc: в строке уровня потеряна $m');
      }
      expect(s.noDictionary, contains('{langs}'), reason: '$loc: нет {langs}');
    }
    expect(interpolate('{a}×{b} {c}', {'a': 5, 'b': 6}), '5×6 {c}');
  });
}

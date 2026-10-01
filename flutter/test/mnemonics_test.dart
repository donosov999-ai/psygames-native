/// «МНЕМОНИКА»: DART-ЯДРО ПРОТИВ ЭТАЛОНА ЖИВОГО TS.
///
/// Эталон снят `frontend/src/games/mnemonics/tools/record-flutter-reference.gen.ts`. Случайное
/// сверяется ПОТОКОМ: экспортёр записал каждое число, которое выдал генератор, а здесь тот же
/// поток проигрывается. Совпасть обязаны результат И число съеденных чисел — иначе порядок
/// обращений к `rnd` разошёлся, и на другом потоке разойдётся уже результат.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/mnemonics/lesson.dart';
import 'package:psygames_flutter/games/mnemonics/model.dart';

class _Replay {
  _Replay(List<dynamic> stream) : _stream = [for (final v in stream) (v as num).toDouble()];
  final List<double> _stream;
  int used = 0;
  bool get exhausted => used == _stream.length;
  double call() {
    if (used >= _stream.length) {
      throw StateError('поток исчерпан: Dart берёт больше случайных чисел, чем TS');
    }
    return _stream[used++];
  }
}

void main() {
  final ref = jsonDecode(File('test/fixtures/mnemonics-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final content = MnemonicsContent.fromJsonString(File('assets/mnemonics.json').readAsStringSync());

  test('лестница levelParams совпадает с TS на всех уровнях, включая края', () {
    for (final e in ref['levelParams'] as List) {
      final p = levelParams(e['level'] as int);
      expect([p.itemCount, p.gapMs, p.mathTrials], [e['itemCount'], e['gapMs'], e['mathTrials']],
          reason: 'уровень ${e['level']}');
    }
  });

  test('пример окна удержания: тот же поток — те же числа и варианты', () {
    for (final e in ref['examples'] as List) {
      final r = _Replay(e['stream'] as List);
      final x = newExample(r.call);
      expect([x.a, x.b, x.answer, x.options], [e['a'], e['b'], e['answer'], e['options']]);
      expect(r.exhausted, isTrue, reason: 'съедено ${r.used} чисел из ${(e['stream'] as List).length}');
    }
  });

  test('раздача ряда (слова и числа, ru/en/de): тот же поток — тот же ряд', () {
    for (final e in ref['rows'] as List) {
      final r = _Replay(e['stream'] as List);
      final items = dealRow(e['mode'] as String, e['count'] as int, content.wordsFor(e['lang'] as String), r.call);
      expect(items, e['items'], reason: '${e['mode']} ${e['lang']} ${e['count']}');
      expect(r.exhausted, isTrue);
    }
  });

  test('лестница «Опор» pegQuizParams совпадает с TS на уровнях 0–41', () {
    for (final e in ref['pegQuizParams'] as List) {
      final p = pegQuizParams(e['level'] as int);
      expect([p.range, p.bothWays, p.count, p.limitMs, p.options],
          [e['range'], e['bothWays'], e['count'], e['limitMs'], e['options']],
          reason: 'уровень ${e['level']}');
    }
  });

  test('🔴 партия «Опор» целиком: вопрос за вопросом, с тем же списком «уже спрошено»', () {
    for (final run in ref['pegRuns'] as List) {
      final r = _Replay(run['stream'] as List);
      final table = content.pegsFor(run['lang'] as String)!;
      final asked = <int>[];
      for (final q in run['questions'] as List) {
        final mine = makePegQuestion(run['level'] as int, table, r.call, [...asked]);
        expect(
          [mine.n, mine.direction.name, mine.prompt, mine.options, mine.answer],
          [q['n'], q['direction'], q['prompt'], q['options'], q['answer']],
          reason: 'уровень ${run['level']} ${run['lang']}, вопрос ${asked.length + 1}',
        );
        asked.add(mine.n);
      }
      expect(r.exhausted, isTrue, reason: 'уровень ${run['level']} ${run['lang']}');
    }
  });

  test('код 00–99 в ассете = pegFor/pegHint веба; у немецкого таблицы нет', () {
    for (final t in ref['pegTable'] as List) {
      final lang = t['lang'] as String;
      final table = content.pegsFor(lang);
      expect(table != null, t['has'], reason: lang);
      if (table == null) continue;
      expect(table.words, t['words']);
      expect(table.hints, t['hints']);
      expect(table.rule, hasLength(10));
    }
  });

  test('карточки разбора совпадают с веб-учителем (ключ, подстановки, подсветка)', () {
    for (final e in ref['lessons'] as List) {
      final cards = mnemonicsLessonCards(
        items: [for (final x in e['items'] as List) x as String],
        mode: e['mode'] as String,
        locale: e['lang'] as String,
        content: content,
      );
      final want = e['cards'] as List;
      expect(cards, hasLength(want.length), reason: '${e['mode']} ${e['lang']} ${e['items']}');
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect([cards[i].kind, cards[i].key, cards[i].item], [w['kind'], w['key'], w['item']]);
        expect(cards[i].fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')));
      }
    }
  });
}

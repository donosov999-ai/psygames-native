import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/reading_span/model.dart';

/// 🔴 «ОБЪЁМ ПРИ ЧТЕНИИ»: ПЕРЕНОС СВЕРЯЕТСЯ С ЭТАЛОНОМ ЖИВОГО TS, А НЕ С САМИМ СОБОЙ.
///
/// Эталон `test/fixtures/reading-span-reference.json` и предложения `assets/reading_span/sentences.json`
/// снимает экспортёр `frontend/src/games/reading-span/tools/record-flutter-reference.gen.ts`.
/// Проверка воспоминания сверяется на вводах, как их набирает человек: запятые, точки с
/// запятой, лишние и неразрывные пробелы, регистр, «ё». Раздачи — на записанном потоке.
void main() {
  final ref = jsonDecode(File('test/fixtures/reading-span-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final sentences = [
    for (final e in jsonDecode(File('assets/reading_span/sentences.json').readAsStringSync()) as List)
      RspanSentence.fromJson((e as Map).cast<String, Object?>()),
  ];
  List<String> strings(Object? l) => (l as List).cast<String>();

  test('предложения в ассете — весь словарь веба; правило уровня — с того же порога', () {
    expect(sentences.length, ref['poolSize']);
    expect(sentences.where((s) => s.ok).length, greaterThan(20));
    expect(sentences.where((s) => !s.ok).length, greaterThan(20), reason: 'бессмыслицы не меньше, чем смысла');
    final rules = (ref['rules'] as List).cast<Map<String, dynamic>>();
    expect(rules.map((r) => '${r['key']}@${r['fromLevel']}').toList(), ['load@$rspanLoadFromLevel']);
  });

  test('правила уровней — как в вебе, на трёх размерах словаря', () {
    final bad = <String>[];
    for (final l in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final p = RspanLevelParams.of(l['level'] as int, l['poolSize'] as int);
      if (p.setSize != l['setSize'] || p.holdMs != l['holdMs']) {
        bad.add('L${l['level']}/${l['poolSize']}: ${p.setSize} ${p.holdMs} ≠ ${l['setSize']} ${l['holdMs']}');
      }
    }
    expect((ref['levels'] as List).length, 240);
    expect(bad, isEmpty);
  });

  test('🔴 проверка воспоминания — те же попадания и ошибки на тех же вводах', () {
    final bad = <String>[];
    final cases = (ref['recall'] as List).cast<Map<String, dynamic>>();
    for (final c in cases) {
      final from = c['from'] as int, size = c['size'] as int;
      final r = rspanRecallScore(sentences.sublist(from, from + size), c['language'] as String, c['input'] as String);
      final tag = '${c['language']} «${c['input']}»';
      if (r.hits != c['hits'] || r.errors != c['errors']) bad.add('$tag: ${r.hits}/${r.errors} ≠ ${c['hits']}/${c['errors']}');
      if (r.expected.join('|') != strings(c['expected']).join('|')) bad.add('$tag: ожидаемые слова');
    }
    expect(cases.length, greaterThan(100));
    expect(bad, isEmpty);
  });

  test('метка трудности и счёт партии — как в отчёте веба', () {
    for (final d in (ref['difficulty'] as List).cast<Map<String, dynamic>>()) {
      expect(rspanDifficulty(d['setSize'] as int), d['d'], reason: 'набор ${d['setSize']}');
    }
    for (final s in (ref['scores'] as List).cast<Map<String, dynamic>>()) {
      expect(rspanScore(s['hits'] as int, s['judgeHits'] as int, s['errors'] as int), s['score']);
    }
  });

  test('🔴 раздача набора — те же предложения на том же потоке случайных чисел', () {
    final bad = <String>[];
    for (final c in (ref['deals'] as List).cast<Map<String, dynamic>>()) {
      final randoms = (c['randoms'] as List).map((e) => (e as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final d = rspanDeal(sentences, c['size'] as int, strings(c['seenIn']), rng);
      final tag = 'набор ${c['size']}, видено ${(c['seenIn'] as List).length}';
      if (d.picked.map((s) => s.en).join('|') != strings(c['picked']).join('|')) bad.add('$tag: предложения');
      if (d.seen.join('|') != strings(c['seenOut']).join('|')) bad.add('$tag: запас виденного');
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
    }
    expect(bad, isEmpty);
  });

  group('партия', () {
    ReadingSpanGame game() => ReadingSpanGame(level: 1, seq: sentences.sublist(0, 3));

    test('суждения по порядку; верные считаются; после последнего — ввод', () {
      final g = game();
      expect(g.judge(g.current.ok), isTrue);
      expect(g.judge(!g.current.ok), isFalse);
      expect(g.judged, isFalse);
      expect(g.judge(g.current.ok), isTrue);
      expect(g.judged, isTrue);
      expect(g.judgeHits, 2);
      expect(g.judge(true), isFalse, reason: 'после набора суждения не принимаются');
    });

    test('все слова на местах — уровень взят; одно не на месте — нет', () {
      final g = game()..check('ru', sentences.sublist(0, 3).map((s) => s.lastRu).join(' '));
      expect(g.passed, isTrue);
      final h = game()..check('ru', sentences.sublist(0, 3).map((s) => s.lastRu).toList().reversed.join(' '));
      expect(h.passed, isFalse);
      expect(h.errors, 2, reason: 'средний на месте, крайние переставлены');
    });
  });
}

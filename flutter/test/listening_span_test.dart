import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/listening_span/model.dart';

/// 🔴 «ОБЪЁМ НА СЛУХ»: ПЕРЕНОС СВЕРЯЕТСЯ С ЭТАЛОНОМ ЖИВОГО TS, А НЕ С САМИМ СОБОЙ.
///
/// Эталон `test/fixtures/listening-span-reference.json` снимает экспортёр
/// `frontend/src/games/listening-span/tools/record-flutter-reference.gen.ts` прогоном веб-кода.
/// Раздачи сверяются на ЗАПИСАННОМ потоке случайных чисел: Dart обязан дать те же слова,
/// ту же сетку и съесть ровно столько же чисел — иначе порядок обращений к ГПСЧ разошёлся.
void main() {
  final ref = jsonDecode(File('test/fixtures/listening-span-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final vocab = (jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List)
      .map((e) => (e as Map).cast<String, Object?>())
      .toList();
  final index = jsonDecode(File('assets/voice/voice-index.json').readAsStringSync()) as Map<String, dynamic>;
  bool voiced(String lang, String w) =>
      (index['live'] as Map)[lang]?[w] != null || (index['samples'] as Map)[lang]?[w] != null;
  List<String> strings(Object? l) => (l as List).cast<String>();

  test('правила уровней L1…L60 и пороги правил — как в вебе', () {
    expect(lspanVolumeTop, ref['volumeTop']);
    expect(lspanRounds, ref['rounds']);
    final bad = <String>[];
    for (final l in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final p = LspanLevelParams.of(l['level'] as int);
      final got = '${p.span} ${p.gapMs} ${p.holdMs} ${p.similarShare}';
      final want = '${l['span']} ${l['gapMs']} ${l['holdMs']} ${(l['similarShare'] as num).toDouble()}';
      if (got != want) bad.add('L${l['level']}: $got ≠ $want');
    }
    expect(bad, isEmpty);
    final rules = (ref['rules'] as List).cast<Map<String, dynamic>>();
    expect(rules.map((r) => '${r['key']}@${r['fromLevel']}').toList(), ['span8@6', 'similar@${lspanVolumeTop + 1}'],
        reason: 'пороги правил уровня — от тех же осей, что и механика');
  });

  test('сходство слов — то же число, что в вебе, включая CJK, хинди и пустую строку', () {
    final bad = <String>[];
    for (final e in (ref['similarity'] as List).cast<Map<String, dynamic>>()) {
      final v = lspanSimilarity(e['a'] as String, e['b'] as String);
      if (v != (e['v'] as num).toDouble()) bad.add('«${e['a']}»/«${e['b']}»: $v ≠ ${e['v']}');
    }
    expect((ref['similarity'] as List).length, greaterThan(100));
    expect(bad, isEmpty);
  });

  test('языки словаря и мешки слов по 12 языкам — с учётом записей голоса', () {
    expect(lspanVocabLangs(vocab).toSet(), strings(ref['langs']).toSet());
    final bad = <String>[];
    for (final lang in strings(ref['langs'])) {
      final pool = lspanWordPool(vocab, lang, (w) => voiced(lang, w));
      final want = strings((ref['pools'] as Map)[lang]);
      if (pool.join('|') != want.join('|')) bad.add('$lang: ${pool.length} слов ≠ ${want.length} в вебе');
    }
    expect(bad, isEmpty);
  });

  test('🔴 отвлекающие — те же слова на том же потоке случайных чисел', () {
    final bad = <String>[];
    for (final c in (ref['distractors'] as List).cast<Map<String, dynamic>>()) {
      final randoms = (c['randoms'] as List).map((e) => (e as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final got = lspanPickDistractors(strings(c['pool']), strings(c['spoken']), c['need'] as int,
          (c['share'] as num).toDouble(), rng);
      final tag = '${c['lang']} need ${c['need']} share ${c['share']}';
      if (got.join('|') != strings(c['picked']).join('|')) bad.add('$tag: слова');
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
    }
    expect(bad, isEmpty);
  });

  test('🔴 раздача раунда — те же услышанные, та же сетка, тот же запас виденного', () {
    final bad = <String>[];
    final cases = (ref['deals'] as List).cast<Map<String, dynamic>>();
    for (final c in cases) {
      final randoms = (c['randoms'] as List).map((e) => (e as num).toDouble()).toList();
      var used = 0;
      double rng() => randoms[used++];
      final lang = c['lang'] as String;
      final pool = c['pool'] == 'full' ? lspanWordPool(vocab, lang, (w) => voiced(lang, w)) : strings(c['pool']);
      final d = lspanDealRound(pool, strings(c['seenIn']), c['span'] as int, (c['share'] as num).toDouble(), rng);
      final tag = '$lang span ${c['span']} share ${c['share']} seen ${(c['seenIn'] as List).length}';
      if (d.spoken.join('|') != strings(c['spoken']).join('|')) bad.add('$tag: услышанные');
      if (d.grid.join('|') != strings(c['grid']).join('|')) bad.add('$tag: сетка');
      if (d.seen.join('|') != strings(c['seenOut']).join('|')) bad.add('$tag: запас виденного');
      if (used != randoms.length) bad.add('$tag: съедено ${randoms.length} чисел в вебе, $used здесь');
    }
    expect(cases.length, greaterThan(100));
    expect(bad, isEmpty);
  });

  group('партия', () {
    ListeningSpanGame game() => ListeningSpanGame(level: 1, params: LspanLevelParams.of(1))
      ..deal(['a', 'b', 'c'], ['c', 'x', 'a', 'y', 'b', 'z']);

    test('услышанные в том же порядке — раунд взят; повторное нажатие не считается', () {
      final g = game();
      expect(g.tap(2), LspanTap.progress);
      expect(g.tap(2), LspanTap.ignored);
      expect(g.tap(4), LspanTap.progress);
      expect(g.tap(0), LspanTap.roundWon);
      expect(g.errors, 0);
      expect(g.tap(1), LspanTap.ignored, reason: 'раунд кончился — нажатия не принимаются');
    });

    test('не тот порядок — ошибка раунда, и раунд кончается', () {
      final g = game();
      expect(g.tap(4), LspanTap.roundLost, reason: '«b» услышано вторым, а нажато первым');
      expect(g.errors, 1);
      expect(g.wrongIdx, 4);
      expect(g.tap(2), LspanTap.ignored);
    });

    test('зачёт — не больше одной ошибки за партию', () {
      final g = game()..errors = 1;
      expect(g.passed, isTrue);
      g.errors = 2;
      expect(g.passed, isFalse);
      expect(g.score, LspanLevelParams.of(1).span * 250 - 100);
    });
  });
}

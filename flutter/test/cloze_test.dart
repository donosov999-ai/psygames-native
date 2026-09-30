import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cloze/model.dart';

/// СВЕРКА CLOZE С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): лестница раундов сдвинута; лимит времени
/// без пола 4,5 с; хвост без перетасовки; отвлекающие не из категории;
/// перетасовка четвёрки убрана; в билингво всё на первом языке.
void main() {
  final ref = jsonDecode(File('test/fixtures/cloze-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final queue = [for (final v in (ref['очередь'] as List)) (v as num).toDouble()];
  final shift = (ref['сдвигРаундов'] as num).toInt();
  final phrasesRaw = jsonDecode(File('assets/vocab/cloze-phrases.json').readAsStringSync()) as Map<String, dynamic>;
  final phrases = <String, List<ClozePhrase>>{
    for (final e in phrasesRaw.entries)
      e.key: [for (final f in (e.value as List)) ClozePhrase('${(f as Map)['text']}', '${f['answerEn']}')],
  };
  final vocab = <Map<String, String>>[
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List<dynamic>)
      (e as Map).map((k, v) => MapEntry('$k', '$v')),
  ];
  double Function() rng([int from = 0]) {
    var i = from;
    return () => queue[i++ % queue.length];
  }

  test('лестница уровней и порог прохода', () {
    for (final raw in (ref['уровни'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = clozeLevelParams((l['level'] as num).toInt());
      expect(p.rounds, l['rounds'], reason: 'раундов на уровне ${l['level']}');
      expect(p.timeLimitMs, l['timeLimitMs'], reason: 'лимит на уровне ${l['level']}');
    }
    expect(clozePassAccuracy, ref['проходТочностью']);
  });

  test('фразы доехали целиком: по 60 на язык', () {
    (ref['фраз'] as Map).forEach((k, v) => expect(phrases['$k']!.length, v, reason: 'язык $k'));
  });

  for (final raw in (ref['порядки'] as List)) {
    final c = raw as Map<String, dynamic>;
    test('порядок фраз: ${c['имя']}', () {
      final r = clozeOrderPhrases(phrases[c['lang']]!, [for (final s in (c['seen'] as List)) '$s'],
          (c['rounds'] as num).toInt(), rng());
      expect([for (final f in r.ordered) f.text], [for (final t in (c['ordered'] as List)) '$t']);
      expect(r.seen, [for (final t in (c['seenAfter'] as List)) '$t']);
    });
  }

  for (final raw in (ref['партии'] as List)) {
    final c = raw as Map<String, dynamic>;
    test('раунды: ${c['имя']}', () {
      final pair = [for (final l in (c['пара'] as List)) '$l'];
      final bi = c['билингво'] as bool;
      final rounds = (c['rounds'] as num).toInt();
      final byLang = <String, List<ClozePhrase>>{
        for (final l in bi ? pair : [pair.first]) l: clozeOrderPhrases(phrases[l]!, const [], rounds, rng()).ordered,
      };
      (c['поЯзыку'] as Map).forEach((l, texts) =>
          expect([for (final f in byLang['$l']!) f.text], [for (final t in (texts as List)) '$t'], reason: 'порядок $l'));
      final got = buildClozeRounds(byLang: byLang, rounds: rounds, bilingual: bi, pair: pair, vocab: vocab, rng: rng(shift));
      final want = c['раунды'] as List;
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].text, w['text'], reason: 'фраза $i');
        expect(got[i].answer, w['answer'], reason: 'ответ $i');
        expect(got[i].options, [for (final o in (w['options'] as List)) '$o'], reason: 'варианты $i');
        expect(got[i].lang, w['язык'], reason: 'язык $i');
      }
    });
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/lexical_decision/model.dart';
import 'package:psygames_flutter/games/pseudoword_echo/model.dart';
import 'package:psygames_flutter/shell/noise.dart';

/// СВЕРКА «ЭХА» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): доля трудных без округления; шум с
/// девятого уровня; стечение рвётся мягким знаком; перестановка соседних не
/// проверяет одинаковые буквы; трудные не идут вперёд; громкость шума без потолка.
void main() {
  final ref = jsonDecode(File('test/fixtures/pseudoword-echo-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final queue = [for (final v in (ref['queue'] as List)) (v as num).toDouble()];
  final vocab = <Map<String, String>>[
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List<dynamic>)
      (e as Map).map((k, v) => MapEntry('$k', '$v')),
  ];
  final letters = LdLetters.fromJson(
      jsonDecode(File('assets/vocab/pseudoword-letters.json').readAsStringSync()) as Map<String, dynamic>);
  double Function() rng([int from = 0]) {
    var i = from;
    return () => queue[i++ % queue.length];
  }

  test('лестница: четыре оси по уровням, как в вебе', () {
    for (final raw in (ref['levels'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = echoLevelParams((l['level'] as num).toInt());
      final at = 'уровень ${l['level']}';
      expect(p.lenMin, l['lenMin'], reason: at);
      expect(p.lenMax, l['lenMax'], reason: at);
      expect(p.trials, l['trials'], reason: at);
      expect(p.hardShare, closeTo((l['hardShare'] as num).toDouble(), 1e-12), reason: at);
      expect(p.rate, closeTo((l['rate'] as num).toDouble(), 1e-12), reason: at);
      expect(p.snrDb, l['snrDb'] == null ? isNull : closeTo((l['snrDb'] as num).toDouble(), 1e-12), reason: at);
    }
  });

  test('стечение согласных — как в вебе, включая буквы вне таблиц', () {
    for (final raw in (ref['clusters'] as List)) {
      final c = raw as Map<String, dynamic>;
      expect(maxConsonantCluster('${c['word']}', '${c['lang']}', letters), c['cluster'], reason: '${c['word']}');
    }
  });

  test('громкость шума по SNR — как в вебе', () {
    for (final raw in (ref['noise'] as List)) {
      final n = raw as Map<String, dynamic>;
      if (n['snr'] == null) continue;
      expect(noiseGainFor((n['snr'] as num).toDouble()), closeTo((n['gain'] as num).toDouble(), 1e-12), reason: 'SNR ${n['snr']}');
    }
  });

  for (final raw in (ref['games'] as List)) {
    final g = raw as Map<String, dynamic>;
    test('раунды: ${g['lang']}, уровень ${g['level']}', () {
      final p = echoLevelParams((g['level'] as num).toInt());
      final got = buildEchoRounds(
        vocab: vocab,
        letters: letters,
        lang: '${g['lang']}',
        count: p.trials,
        lenMin: p.lenMin,
        lenMax: p.lenMax,
        hardShare: p.hardShare,
        rng: rng((g['shift'] as num).toInt()),
      );
      final want = g['rounds'] as List;
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].word, w['word'], reason: 'слово $i');
        expect(got[i].options, [for (final o in (w['options'] as List)) '$o'], reason: 'варианты $i');
      }
    });
  }

  test('проход и очки — как в вебе', () {
    expect(echoPassed(1), isTrue);
    expect(echoPassed(2), isFalse);
    expect(echoScore(8, 1), 8 * 120 - 40);
    expect(echoScore(0, 5), 0);
  });
}

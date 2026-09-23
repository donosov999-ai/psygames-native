import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/stroop_emotional/model.dart';

/// СВЕРКА «ЭМОЦИОНАЛЬНОГО СТРУПА» С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Эталон и сами СЛОВА выгружены прогоном `frontend/app/games/stroop-emotional.tsx`:
/// `test/fixtures/emostroop-reference.json` и `assets/l10n/stroop-emotional-words.json`.
void main() {
  late Map<String, dynamic> ref;
  late Map<Valence, List<String>> words;

  setUpAll(() {
    ref = jsonDecode(File('test/fixtures/emostroop-reference.json').readAsStringSync()) as Map<String, dynamic>;
    final raw = jsonDecode(File('assets/l10n/stroop-emotional-words.json').readAsStringSync()) as Map<String, dynamic>;
    final ru = raw['ru'] as Map<String, dynamic>;
    words = {
      for (final v in Valence.values) v: (ru[v.name] as List).map((e) => '$e').toList(),
    };
  });

  test('🔴 доли валентностей — те же константы, что в живом коде', () {
    expect(emotionalRatio, ref['emotionalRatio']);
    expect(threatWithinEmotional, ref['threatWithinEmotional']);
    expect(emoLangs, (ref['emoLangs'] as List).cast<String>());
  });

  test('🔴 наборы слов на месте: три валентности по двенадцать слов на двух языках', () {
    final raw = jsonDecode(File('assets/l10n/stroop-emotional-words.json').readAsStringSync()) as Map<String, dynamic>;
    for (final lang in emoLangs) {
      final one = raw[lang] as Map<String, dynamic>;
      for (final v in Valence.values) {
        final list = (one[v.name] as List).cast<String>();
        expect(list.length, 12, reason: '$lang/${v.name}: слов не двенадцать');
        expect(list.toSet().length, 12, reason: '$lang/${v.name}: есть повторы');
      }
    }
  });

  test('🔴 незнакомый язык падает на английский, а не роняет игру', () {
    for (final row in (ref['языки'] as List).cast<Map<String, dynamic>>()) {
      expect(emoLangFor(row['вход'] as String), row['итог'], reason: 'язык ${row['вход']}');
    }
  });

  test('🔴 лестница уровней совпадает с эталоном по всем полям', () {
    for (final row in (ref['levels'] as List).cast<Map<String, dynamic>>()) {
      final l = EmoLevel.of(row['level'] as int);
      final at = 'L${row['level']}';
      expect(l.trials, row['trials'], reason: '$at: объём');
      expect(l.answerWindowMs, row['answerWindowMs'], reason: '$at: окно ответа');
      expect(l.isiBaseMs, row['isiBaseMs'], reason: '$at: пауза');
      expect(l.isiJitterMs, row['isiJitterMs'], reason: '$at: разброс паузы');
    }
    // Объём растёт: обе меры — РАЗНОСТИ относительно нейтральных, и база крепнет.
    expect(EmoLevel.of(1).trials, 18);
    expect(EmoLevel.of(15).trials, 30);
  });

  test('🔴 пробы рождаются те же, и число взятых розыгрышей совпадает', () {
    // ⚠️ На нейтральной пробе розыгрышей ТРИ, на заряженной ЧЕТЫРЕ.
    for (final row in (ref['trials'] as List).cast<Map<String, dynamic>>()) {
      final taken = (row['взятые'] as List).cast<num>().map((e) => e.toDouble()).toList();
      var i = 0;
      final got = makeTrial(words, () => taken[i++]);
      expect(i, taken.length, reason: 'розыгрышей взято ${taken.length}, а функция взяла $i');
      expect(got.valence.name, row['valence'], reason: 'окраска при $taken');
      expect(got.word, row['word'], reason: 'слово при $taken');
      expect(got.color, row['color'], reason: 'цвет чернил при $taken');
    }
  });

  test('🔴 граница заряженных — ровно две трети, сравнение строгое', () {
    expect(makeTrial(words, _queue([0.6666, 0.99, 0.5, 0.5])).valence, Valence.positive);
    expect(makeTrial(words, _queue([0.6667, 0.1, 0.2])).valence, Valence.neutral);
    // Внутри заряженных — поровну: ровно 0,5 даёт позитив.
    expect(makeTrial(words, _queue([0.1, 0.5, 0.1, 0.1])).valence, Valence.positive);
    expect(makeTrial(words, _queue([0.1, 0.4999, 0.1, 0.1])).valence, Valence.threat);
  });

  test('🔴 ответ — ЦВЕТ ЧЕРНИЛ, и время копится по валентности слова', () {
    var clock = 0;
    final g = EmoStroopGame(level: 1, words: words, rnd: _Queue([0.0, 0.0, 0.0, 0.0, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial();
    expect(g.trial!.valence, Valence.threat);
    g.showStimulus();
    clock += 620;
    expect(g.answer(g.trial!.color), EmoOutcome.hit);
    expect(g.rts[Valence.threat]!.single, 620);
    expect(g.meanRtMs, 620);
  });

  test('🔴 обе помехи — разности относительно НЕЙТРАЛЬНЫХ, и считаются порознь', () {
    var clock = 0;
    // угроза · позитив · нейтральная
    final g = EmoStroopGame(
      level: 1,
      words: words,
      rnd: _Queue([0.1, 0.1, 0.1, 0.1, 0.5,  0.1, 0.9, 0.1, 0.1, 0.5,  0.9, 0.1, 0.1, 0.5]),
      nowMs: () => clock,
    );
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(g.trial!.color);   // угроза
    g.nextTrial(); g.showStimulus(); clock += 620; g.answer(g.trial!.color);   // позитив
    g.nextTrial(); g.showStimulus(); clock += 500; g.answer(g.trial!.color);   // нейтральная
    expect(g.interferenceThreatMs, 200, reason: '700 − 500');
    expect(g.interferencePositiveMs, 120, reason: '620 − 500');
  });

  test('🔴 без нейтральных проб помеха пустая, а не ноль', () {
    var clock = 0;
    final g = EmoStroopGame(level: 1, words: words, rnd: _Queue([0.1, 0.1, 0.1, 0.1, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 700; g.answer(g.trial!.color);
    expect(g.interferenceThreatMs, isNull, reason: 'ноль означал бы «заряд не мешает»');
    expect(g.interferencePositiveMs, isNull);
  });

  test('🔴 ошибка и просрочка считаются одинаково, время с них не копится', () {
    var clock = 0;
    final g = EmoStroopGame(level: 1, words: words, rnd: _Queue([0.0, 0.0, 0.0, 0.0, 0.5]), nowMs: () => clock,
        trialsOverride: 2);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 400;
    final wrong = emoColors.firstWhere((c) => c != g.trial!.color);
    expect(g.answer(wrong), EmoOutcome.wrong);
    g.nextTrial(); g.showStimulus();
    expect(g.timeout(), EmoOutcome.miss);
    expect(g.errors, 2);
    expect(g.meanRtMs, isNull);
    expect(g.accuracy, 0);
  });

  test('🔴 очки — формулой веб-версии', () {
    var clock = 0;
    final g = EmoStroopGame(level: 1, words: words, rnd: _Queue([0.0, 0.0, 0.0, 0.0, 0.5]), nowMs: () => clock);
    g.begin();
    g.nextTrial(); g.showStimulus(); clock += 600; g.answer(g.trial!.color);
    expect(g.score, max(0, (1 * 80 - 0 * 60 - 600 * 0.05).round()));
    expect(g.score, 50);
  });
}

double Function() _queue(List<double> values) {
  var i = 0;
  return () => values[i++ % values.length];
}

class _Queue implements Random {
  _Queue(this.values);
  final List<double> values;
  int i = 0;

  @override
  double nextDouble() => values[i++ % values.length];

  @override
  int nextInt(int max) => (nextDouble() * max).floor();

  @override
  bool nextBool() => nextDouble() < 0.5;
}

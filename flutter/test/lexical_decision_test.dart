import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/lexical_decision/model.dart';

/// СВЕРКА «СЛОВО ИЛИ НЕТ?» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): окно без пола 1,1 с; ступени проб сдвинуты;
/// у длинных слов всегда одна замена; гласная меняется на согласную; хинди без
/// своего пути; в пул китайского пускаются одиночные иероглифы; настоящие слова
/// без перетасовки; в билингво пробы не по ряду, а блоками.
///
/// 📍 Мутация защиты `chars.length < 2` внутри `_swapHanzi` ВЫЖИВАЕТ — и это замер,
/// а не слабость пробы: пул китайского уже отфильтрован до слов из 2+ иероглифов,
/// ветка не исполняется ни в вебе, ни здесь. Правило держит фильтр пула.
void main() {
  final ref = jsonDecode(File('test/fixtures/lexical-decision-reference.json').readAsStringSync()) as Map<String, dynamic>;
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

  test('лестница уровней и порог прохода', () {
    for (final raw in (ref['levels'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = ldLevelParams((l['level'] as num).toInt());
      expect(p.trials, l['trials'], reason: 'проб на уровне ${l['level']}');
      expect(p.windowMs, l['windowMs'], reason: 'окно на уровне ${l['level']}');
    }
    expect(ldPassAccuracy, ref['passAccuracy']);
  });

  test('языки с псевдословами — те же, что в вебе, и выведены из результата', () {
    final want = [for (final l in (ref['pseudowordLangs'] as List)) '$l'];
    final langs = <String>{for (final w in vocab) ...w.keys};
    expect({for (final l in langs) if (ldProducesPseudowords(vocab, letters, l)) l}, want.toSet());
  });

  for (final raw in (ref['generator'] as List)) {
    final g = raw as Map<String, dynamic>;
    final lang = '${g['lang']}';
    final shift = (g['shift'] as num).toInt();
    test('генератор: $lang', () {
      expect(ldPseudowords(vocab, letters, lang, 12, rng(shift)), [for (final w in (g['pseudo'] as List)) '$w'], reason: 'псевдослова');
      expect(ldSampleRealWords(vocab, lang, 8, rng(shift + 5)), [for (final w in (g['real'] as List)) '$w'],
          reason: 'настоящие слова');
      final real = {for (final w in ldRealWords(vocab, lang)) w.toLowerCase()};
      for (final pw in (g['pseudo'] as List)) {
        expect(real.contains('$pw'.toLowerCase()), isFalse, reason: 'псевдослово «$pw» — настоящее слово');
      }
    });
  }

  for (final raw in (ref['games'] as List)) {
    final g = raw as Map<String, dynamic>;
    test('партия: ${g['name']}', () {
      final got = buildLexicalTrials(
        vocab: vocab,
        letters: letters,
        target: '${g['target']}',
        second: '${g['second']}',
        bilingual: g['bilingual'] as bool,
        count: (g['count'] as num).toInt(),
        rng: rng((g['shift'] as num).toInt()),
      );
      final want = g['trials'] as List;
      expect(got.length, want.length, reason: 'число проб');
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].text, w['text'], reason: 'проба $i');
        expect(got[i].isWord, w['isWord'], reason: 'слово ли $i');
        expect(got[i].lang, w['lang'], reason: 'язык $i');
      }
    });
  }

  // ── «По норме?» (d0ad03d9): данные — выгрузка веба, партия — исполнение `buildNormTrials`.
  final ns = nsFormsFromJson(jsonDecode(File('assets/vocab/nonstandard-forms.json').readAsStringSync()) as Map);

  test('«По норме?»: ступени по уровню — как в вебе', () {
    for (final raw in (ref['normLevels'] as List)) {
      final l = raw as Map<String, dynamic>;
      expect(ldNormTiers((l['level'] as num).toInt()), [for (final t in (l['tiers'] as List)) (t as num).toInt()],
          reason: 'ступени уровня ${l['level']}');
    }
  });

  for (final raw in (ref['normGames'] as List)) {
    final g = raw as Map<String, dynamic>;
    test('«По норме?»: ${g['name']}', () {
      final got = ldBuildNormTrials(ns,
          target: '${g['target']}',
          level: (g['level'] as num).toInt(),
          count: (g['count'] as num).toInt(),
          rng: rng((g['shift'] as num).toInt()));
      final want = g['trials'] as List;
      expect(got.length, want.length, reason: 'число проб');
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].text, w['text'], reason: 'проба $i');
        expect(got[i].isNorm, w['isNorm'], reason: 'норма ли $i');
        expect(got[i].item.form, w['form'], reason: 'пара $i');
      }
    });
  }
}

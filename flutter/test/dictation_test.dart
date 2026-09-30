import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/cloze/model.dart';
import 'package:psygames_flutter/games/dictation/model.dart';

/// СВЕРКА «ДИКТАНТА» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): длина в единицах UTF-16 вместо знаков;
/// порог второй ступени 36; пауза перед вводом с 7-го; шум без шага 1,8; подсказка
/// открывает слово целиком.
void main() {
  final ref = jsonDecode(File('test/fixtures/dictation-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final clozeRaw = jsonDecode(File('assets/vocab/cloze-phrases.json').readAsStringSync()) as Map<String, dynamic>;
  final cloze = <String, List<ClozePhrase>>{
    for (final e in clozeRaw.entries)
      e.key: [for (final f in (e.value as List)) ClozePhrase('${(f as Map)['text']}', '${f['answerEn']}')],
  };
  final vocab = <Map<String, String>>[
    for (final e in jsonDecode(File('assets/vocab/translation-vocab.json').readAsStringSync()) as List<dynamic>)
      (e as Map).map((k, v) => MapEntry('$k', '$v')),
  ];
  final vowels = {
    for (final v in (jsonDecode(File('assets/vocab/dictation.json').readAsStringSync()) as Map)['vowels'] as List) '$v',
  };

  test('языки и фразы — те же, что собирает веб', () {
    expect(dictationLangs(cloze, vocab), ref['langs']);
    (ref['phrases'] as Map).forEach((lang, list) {
      final got = buildDictationPhrases(cloze, vocab, '$lang');
      final want = list as List;
      expect(got.length, want.length, reason: 'фраз на $lang');
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].text, w['text'], reason: '$lang $i');
        expect(got[i].answer, w['answer'], reason: '$lang $i');
        expect(got[i].length, w['length'], reason: 'длина $lang $i');
      }
    });
  });

  test('лестница: число фраз, темп, шум, пауза и годные фразы по уровням', () {
    for (final raw in (ref['byLevel'] as List)) {
      final b = raw as Map<String, dynamic>;
      final level = (b['level'] as num).toInt();
      final p = dictationLevelParams(level);
      final want = b['params'] as Map<String, dynamic>;
      expect(dictationLevelCount(level), b['count'], reason: 'уровень $level');
      expect(p.count, want['count'], reason: 'уровень $level');
      expect(p.rate, closeTo((want['rate'] as num).toDouble(), 1e-12), reason: 'темп $level');
      expect(p.snrDb, want['snrDb'] == null ? isNull : closeTo((want['snrDb'] as num).toDouble(), 1e-12), reason: 'шум $level');
      expect(p.delayMs, want['delayMs'], reason: 'пауза $level');
      (b['fit'] as Map).forEach((lang, texts) {
        final got = levelPhrases(buildDictationPhrases(cloze, vocab, '$lang'), level);
        expect([for (final f in got) f.text], texts, reason: 'годные $lang на $level');
      });
    }
  });

  test('подсказка по слогу — как в вебе', () {
    expect(dictationErrorsBeforeHint, ref['errorsBeforeHint']);
    for (final raw in (ref['hints'] as List)) {
      final h = raw as Map<String, dynamic>;
      expect(syllableEnd('${h['text']}', (h['pos'] as num).toInt(), vowels), h['to'], reason: '«${h['text']}» с ${h['pos']}');
    }
  });

  /// 📍 Длина «в знаках, а не в единицах UTF-16» в живом корпусе СПИТ: все фразы
  /// семи языков лежат в BMP, где эти длины совпадают (мутация выживала). Поэтому —
  /// фраза со знаком вне BMP, где правило работает.
  test('длина фразы — в знаках, как `[...текст].length` веба', () {
    final got = buildDictationPhrases({
      'en': [const ClozePhrase('Play 𝄞 ___', 'to sleep')],
    }, const [{'en': 'to sleep'}], 'en');
    expect(got.single.text, 'Play 𝄞 to sleep');
    expect(got.single.length, 'Play 𝄞 to sleep'.runes.length);
  });

  test('итог: знаков в минуту, точность, проход от 90 %', () {
    final s = dictationSummary(180, 10, 60);
    expect(s.cpm, 180);
    expect(s.accuracy, 95);
    expect(s.passed, isTrue);
    expect(dictationSummary(80, 20, 60).passed, isFalse);
    expect(dictationSummary(0, 0, 0).accuracy, 100);
  });
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/phonemic_fluency/model.dart';

/// СВЕРКА «БЕГЛОСТИ РЕЧИ» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): порог длины 2 вместо 3; буква сравнивается
/// без верхнего регистра; гласные не проверяются; «пара трижды» не ловится;
/// половина времени считается от нуля, а не от старта; повтор не отсекается.
///
/// 📍 «Половина от нуля» сперва ВЫЖИЛА: в эталоне не было слова между 30 и 31 с,
/// где старт в 1 с меняет ответ. Слово «кран» стоит на 30,5 с — правило работает.
void main() {
  final ref = jsonDecode(File('test/fixtures/phonemic-fluency-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final data = PhonemicData.fromJson(
      jsonDecode(File('assets/vocab/phonemic-fluency.json').readAsStringSync()) as Map<String, dynamic>);

  test('пулы букв и языки слов — те же, что в вебе', () {
    expect(data.scripts['ru']!.letters, ref['ruLetters']);
    expect(data.scripts['en']!.letters, ref['enLetters']);
    expect(data.wordLangs, ref['wordLangs']);
  });

  test('язык интерфейса → язык слов, письменность и пул букв', () {
    for (final raw in (ref['byUi'] as List)) {
      final b = raw as Map<String, dynamic>;
      final ui = '${b['ui']}';
      expect(phonemicDefaultWordLang(ui, data.wordLangs), b['defaultWordLang'], reason: 'язык слов для $ui');
      expect(phonemicScriptFor(ui), b['script'], reason: 'письменность для $ui');
      expect(data.poolFor(ui), b['pool'], reason: 'пул для $ui');
    }
  });

  test('проверка слова: все случаи эталона', () {
    for (final raw in (ref['checks'] as List)) {
      final c = raw as Map<String, dynamic>;
      final v = phonemicCheck('${c['raw']}', '${c['letter']}', data.scripts['${c['script']}']!);
      expect(v.valid, c['valid'], reason: '«${c['raw']}» на ${c['letter']} (${c['script']})');
      expect(v.reason, c['reason'], reason: 'причина для «${c['raw']}»');
    }
  });

  test('итог подхода: темп, половины, причины', () {
    final input = ref['summaryInput'] as Map<String, dynamic>;
    final said = [
      for (final w in (input['said'] as List))
        PhonemicSaid('${(w as Map)['word']}', (w['ts'] as num).toInt(), w['valid'] as bool, w['reason'] as String?),
    ];
    final s = phonemicSummary(said, (input['startTs'] as num).toInt(), (input['duration'] as num).toInt());
    final want = ref['summary'] as Map<String, dynamic>;
    expect([for (final w in s.validWords) w.word], want['validWords']);
    expect(s.repetitions, want['repetitions']);
    expect(s.wrongLetter, want['wrongLetter']);
    expect(s.tooShort, want['tooShort']);
    expect(s.meanInter, closeTo((want['meanInter'] as num).toDouble(), 1e-9));
    expect(s.firstHalf, want['firstHalf']);
    expect(s.secondHalf, want['secondHalf']);
  });

  test('верное слово второй раз — повтор, неверное повтором не считается', () {
    final ru = data.scripts['ru']!;
    final said = [const PhonemicSaid('кот', 0, true), const PhonemicSaid('ко', 0, false, 'too_short')];
    expect(phonemicJudge('кот', 'К', ru, said).reason, 'repetition');
    expect(phonemicJudge('ко', 'К', ru, said).reason, 'too_short');
    expect(phonemicJudge('кит', 'К', ru, said).valid, isTrue);
  });
}

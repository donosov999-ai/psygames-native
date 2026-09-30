import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/languages/bilingual.dart';

/// СВЕРКА РЕЖИМА БИЛИНГВО С ЭТАЛОНОМ ИЗ ЖИВОГО TS.
///
/// Числа выгружены прогоном самих `bilingualMode.ts` и `languageFlow.ts`
/// прибором `frontend/scripts/flutter-vocab-srs-reference.test.ts`, раздел `билингво`.
///
/// ⚠️ ЧЕМ ДОКАЗАНА (мутации, каждая обязана краснеть):
///   · узор без повторов (чистое чередование) → «ряд пары» и «поровну»;
///   · добор из другого языка убран            → «неровно» (партия обрывается);
///   · смены считаются по флагу, а не по факту → «неровно» (3 смены, не 7);
///   · запасной язык не тот                    → «пара для интерфейса» en/es;
///   · второй язык может совпасть с первым     → «второй» ru/es/es.
void main() {
  final ref = jsonDecode(File('test/fixtures/vocab-srs-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final bi = ref['билингво'] as Map<String, dynamic>;

  test('узор потока совпадает с веб-версией', () {
    final flow = bi['поток'] as Map<String, dynamic>;
    expect(flowSequence, [for (final l in (flow['последовательность'] as List)) '$l']);
    expect(flowLangs, [for (final l in (flow['языки'] as List)) '$l']);
    expect(flowSpare, flow['запасной']);
  });

  test('пара для каждого из двенадцати интерфейсов', () {
    final m = bi['параДляИнтерфейса'] as Map<String, dynamic>;
    expect(m.length, 12);
    m.forEach((lang, pair) {
      expect(pairFor(lang), [for (final l in (pair as List)) '$l'], reason: 'интерфейс $lang');
    });
  });

  test('ряд на явной паре', () {
    for (final raw in (bi['рядПары'] as List)) {
      final c = raw as Map<String, dynamic>;
      expect(rowForPair((c['сколько'] as num).toInt(), c['первый'] as String, c['второй'] as String),
          [for (final l in (c['ряд'] as List)) '$l'],
          reason: '${c['первый']}+${c['второй']} × ${c['сколько']}');
    }
  });

  for (final raw in (bi['разложить'] as List)) {
    final c = raw as Map<String, dynamic>;
    test('разложить: ${c['имя']}', () {
      final byLang = <String, List<String>>{
        for (final e in (c['поЯзыку'] as Map<String, dynamic>).entries)
          e.key: [for (final x in (e.value as List)) '$x'],
      };
      final got = spreadByRow(byLang, (c['сколько'] as num).toInt(), [for (final l in (c['пара'] as List)) '$l']);
      final want = c['итог'] as Map<String, dynamic>;
      final wantItems = want['элементы'] as List;
      expect([for (final x in got.items) x.item], [for (final x in wantItems) '${(x as Map)['элемент']}']);
      expect([for (final x in got.items) x.lang], [for (final x in wantItems) '${(x as Map)['язык']}']);
      expect(got.switches, want['сколькоСмен']);
    });
  }

  test('пилюля языка в шапке', () {
    for (final raw in (bi['пилюля'] as List)) {
      final c = raw as Map<String, dynamic>;
      expect(pairPill(c['текущий'] as String, [for (final l in (c['пара'] as List)) '$l']), c['итог'],
          reason: '${c['текущий']} при паре ${c['пара']}');
    }
  });

  test('второй язык не совпадает ни с первым, ни с родным', () {
    for (final raw in (bi['второй'] as List)) {
      final c = raw as Map<String, dynamic>;
      final got = secondNotFirst(c['родной'] as String, c['первый'] as String, c['желаемый'] as String);
      expect(got, c['итог'], reason: '${c['родной']}/${c['первый']}/${c['желаемый']}');
      expect(got, isNot(c['первый']));
      expect(got, isNot(c['родной']));
    }
  });
}

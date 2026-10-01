import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chinese_tones/model.dart';

/// СВЕРКА «ТОНОВ» С ЭТАЛОНОМ, СНЯТЫМ ИСПОЛНЕНИЕМ ВЕБ-ФУНКЦИЙ.
///
/// ⚠️ Мутации (каждая обязана краснеть): знак всегда на последнюю гласную; `ou` без
/// исключения; режим пиньиня с 10-го; варианты не перемешиваются; темп без шага 0,01.
void main() {
  final ref = jsonDecode(File('test/fixtures/chinese-tones-reference.json').readAsStringSync()) as Map<String, dynamic>;
  final queue = [for (final v in (ref['queue'] as List)) (v as num).toDouble()];
  final bank = zhBankFromJson(jsonDecode(File('assets/vocab/zh-tone-bank.json').readAsStringSync()) as Map);
  double Function() rng([int from = 0]) {
    var i = from;
    return () => queue[i++ % queue.length];
  }

  test('ядро пиньиня: тон, снятие и постановка знака — как в вебе', () {
    for (final raw in (ref['syllables'] as List)) {
      final s = raw as Map<String, dynamic>;
      final p = '${s['pinyin']}';
      expect(toneOf(p), s['tone'], reason: p);
      expect(stripTone(p), s['bare'], reason: p);
      expect(allTones(p), s['all'], reason: p);
      expect(applyTone(stripTone(p), toneOf(p)), s['back'], reason: p);
    }
  });

  test('🔴 круговой прогон по ВСЕМУ банку: снять знак и поставить обратно — то же написание', () {
    final bad = <String>[];
    for (final list in bank.values) {
      for (final s in list) {
        if (applyTone(stripTone(s.pinyin), toneOf(s.pinyin)) != s.pinyin) bad.add(s.pinyin);
      }
    }
    // 424: из банка выброшены слова, чей записанный тон расходится с обычным чтением знака — голос
    // прочёл бы другой тон (`ZH_TONE_BANK_DROPPED`, «Память и слух» 30.09.2026).
    expect(bank.values.fold<int>(0, (a, l) => a + l.length), 424);
    expect(bad, isEmpty);
  });

  test('лестница по уровням, как в вебе', () {
    for (final raw in (ref['levels'] as List)) {
      final l = raw as Map<String, dynamic>;
      final p = ctLevelParams((l['level'] as num).toInt());
      final at = 'уровень ${l['level']}';
      expect(p.trials, l['trials'], reason: at);
      expect(p.showAfter, l['showAfter'], reason: at);
      expect(p.pinyinMode, l['pinyinMode'], reason: at);
      expect(p.rate, closeTo((l['rate'] as num).toDouble(), 1e-12), reason: at);
      expect(p.snrDb, l['snrDb'] == null ? isNull : closeTo((l['snrDb'] as num).toDouble(), 1e-12), reason: at);
      expect(p.maxErrors, l['maxErrors'], reason: at);
    }
  });

  for (final raw in (ref['games'] as List)) {
    final g = raw as Map<String, dynamic>;
    test('пробы: уровень ${g['level']}', () {
      final p = ctLevelParams((g['level'] as num).toInt());
      final got = buildCtTrials(bank, p.trials, p.pinyinMode, rng((g['shift'] as num).toInt()));
      final want = g['trials'] as List;
      expect(got.length, want.length);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map<String, dynamic>;
        expect(got[i].syll.zh, w['zh'], reason: 'слог $i');
        expect(got[i].tone, w['tone'], reason: 'тон $i');
        expect(got[i].options, w['options'], reason: 'варианты $i');
        expect(got[i].correctIdx, w['correctIdx'], reason: 'верный $i');
      }
    });
  }
}

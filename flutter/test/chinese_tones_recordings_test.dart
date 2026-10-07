import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chinese_tones/model.dart';
import 'package:psygames_flutter/shell/voice.dart';

/// ЗАПИСИ СЛОГОВ «ТОНОВ» (задача f52e2046, 02.10.2026). До правки запись была у 99 слогов
/// банка из 422, и та — синтез; на Android без китайского голоса остальные молчали.
/// Живые записи Викисклада, сверенные по высоте звука (`scripts/check_zh_tone_pitch.py`),
/// подняли покрытие до 327. Проба держит покрытие и то, что живая запись идёт первой.
void main() {
  final index = jsonDecode(File('assets/voice/voice-index.json').readAsStringSync()) as Map;
  Map<String, Map<String, String>> part(String key) => {
        for (final e in (index[key] as Map).entries)
          '${e.key}': {for (final w in (e.value as Map).entries) '${w.key}': '${w.value}'},
      };
  final voice = VoiceLayer(backend: _Silent(), soundOn: () => true, live: part('live'), samples: part('samples'));
  final bank = zhBankFromJson(jsonDecode(File('assets/vocab/zh-tone-bank.json').readAsStringSync()) as Map);
  final syllables = {for (final l in bank.values) for (final s in l) s.zh};

  test('🔴 записью звучат не меньше 327 слогов банка из 422 (было 99)', () {
    final recorded = syllables.where((zh) => voice.sampleUrl(zh, 'zh') != null).length;
    expect(syllables.length, 422);
    expect(recorded, greaterThanOrEqualTo(327), reason: 'записью звучат $recorded');
  });

  test('живая запись слога — первой, с /voice-live/zh/', () {
    final live = part('live')['zh']!;
    expect(live.length, greaterThanOrEqualTo(228));
    for (final zh in live.keys) {
      expect(syllables, contains(zh), reason: '«$zh» — не слог банка');
      expect(voice.sampleUrl(zh, 'zh'), startsWith('$voiceLiveBase/zh/'));
    }
  });

  test('у каждого из 4 тонов есть слоги с живой записью', () {
    for (final tone in [1, 2, 3, 4]) {
      final withLive = bank[tone]!.where((s) => part('live')['zh']!.containsKey(s.zh)).length;
      expect(withLive, greaterThan(20), reason: 'тон $tone: живых $withLive');
    }
  });
}

class _Silent implements VoiceBackend {
  @override
  Future<bool> playUrl(String url, double rate) async => true;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async => true;
  @override
  Future<bool> hasSystemVoice(String bcp47) async => false;
  @override
  Future<void> cancel() async {}
}

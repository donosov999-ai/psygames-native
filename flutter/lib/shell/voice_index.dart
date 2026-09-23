/// Указатель записей для нативных экранов: слово → имя файла на psy-games.pro.
///
/// Собирается из веб-стороны скриптом `flutter/tools/embed-voice-index.mjs` в
/// `assets/voice/voice-index.json` — второго источника правды не заводим.
///
/// ⚠️ ЧИТАЕТСЯ ОДИН РАЗ ЗА СЕАНС. Указатель — 81 КБ на семь langов; перечитывать
/// его на каждое слово значит разбирать JSON посреди партии, где человек слушает
/// и отвечает на время.
library;

import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

typedef VoiceMaps = Map<String, Map<String, String>>;

class VoiceIndex {
  VoiceIndex({required this.live, required this.samples, this.letters = const {}});

  final VoiceMaps live;
  final VoiceMaps samples;

  /// Имена букв: «B» → файл. Своё пространство имён, см. voice.dart.
  final Map<String, String> letters;

  static VoiceIndex? _cache;

  /// Пустой указатель: ни одной записи. Нужен, когда ассета нет вовсе —
  /// слой в этом случае обязан работать на системном голосе, а не падать.
  static VoiceIndex get empty =>
      VoiceIndex(live: const {}, samples: const {}, letters: const {});

  static VoiceMaps _asMap(Object? raw) {
    if (raw is! Map) return const {};
    return raw.map(
      (lang, words) => MapEntry(
        lang.toString(),
        (words as Map).map((w, f) => MapEntry(w.toString(), f.toString())),
      ),
    );
  }

  /// Прочитать указатель из ассета. Ошибка чтения — не падение: озвучка
  /// останется на системном голосе, и это честнее, чем белый экран.
  static Future<VoiceIndex> load() async {
    if (_cache != null) return _cache!;
    try {
      final raw = jsonDecode(
        await rootBundle.loadString('assets/voice/voice-index.json'),
      ) as Map<String, dynamic>;
      final rawLetters = raw['letters'];
      _cache = VoiceIndex(
        live: _asMap(raw['live']),
        samples: _asMap(raw['samples']),
        letters: rawLetters is Map
            ? rawLetters.map((k, v) => MapEntry(k.toString(), v.toString()))
            : const {},
      );
    } catch (_) {
      _cache = empty;
    }
    return _cache!;
  }
}

/// Настоящее устройство голосового слоя: системный синтез ОС + запись по сети.
///
/// Правила живут в `voice.dart` и проверяются пробами без сети и без ОС. Здесь —
/// только руки: сказать через системный голос и проиграть файл по ссылке.
///
/// ⚠️ СВОЙ SWIFT/KOTLIN-ХОСТ НЕ ПИШЕМ. `flutter_tts` (MIT, проверено файлом
/// ~/.pub-cache/hosted/pub.dev/flutter_tts-4.2.5/LICENSE) закрывает ровно то, что
/// в вебе делал Web Speech API: голоса ОС, список языков, скорость, прерывание.
/// `just_audio` (MIT, LICENSE там же) играет запись по ссылке.
///
/// 🔴 СКОРОСТЬ У ПЛАТФОРМ РАЗНАЯ, И ЭТО НЕ МЕЛОЧЬ. У Android шкала 0.5…2.0, где
/// 1.0 — обычная речь; у iOS 0.0…1.0, где обычная примерно 0.5. Отдать iOS нашу
/// единицу значит включить скороговорку вдвое быстрее нормы — на упражнении, где
/// человек СЛУШАЕТ и повторяет, это ломает само задание. Поэтому пересчёт вынесен
/// отдельной чистой функцией и проверяется пробой.
library;

import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter_tts/flutter_tts.dart';
import 'package:just_audio/just_audio.dart';

import 'voice.dart';

/// Наша скорость (0.6…1.6, где 1.0 — норма) → скорость платформы.
///
/// Чистая функция ровно затем, чтобы пересчёт можно было проверить пробой:
/// поймать эту ошибку на слух можно только на устройстве и только если знаешь,
/// как звучит норма.
double platformTtsRate(double rate, {required bool ios}) {
  final our = clampVoiceRate(rate);
  return ios ? our * 0.5 : our;
}

class SystemVoiceBackend implements VoiceBackend {
  SystemVoiceBackend({FlutterTts? tts, AudioPlayer? player})
      : _tts = tts ?? FlutterTts(),
        _player = player ?? AudioPlayer();

  final FlutterTts _tts;
  final AudioPlayer _player;

  bool get _ios =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  @override
  Future<bool> playUrl(String url, double rate) async {
    try {
      await _player.setUrl(url);
      await _player.setSpeed(clampVoiceRate(rate));
      await _player.play();
      return true;
    } catch (_) {
      // Нет сети, битый файл, чужой формат — это не повод молчать: наверху
      // останется синтез вторым шансом. Здесь просто честное «не прозвучало».
      return false;
    }
  }

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    try {
      await _tts.setLanguage(bcp47);
      await _tts.setSpeechRate(platformTtsRate(rate, ios: _ios));
      // awaitSpeakCompletion нужен последовательностям («слуховой охват»):
      // без него слова накладываются друг на друга.
      await _tts.awaitSpeakCompletion(true);
      final code = await _tts.speak(text);
      return code == 1;
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async {
    try {
      final languages = await _tts.getLanguages as List<dynamic>?;
      if (languages == null || languages.isEmpty) {
        // Часть платформ отдаёт пустой список до первого произнесения. В вебе
        // мы в этом случае считали «синтез есть, попробуем» — сохраняем.
        return true;
      }
      final target = bcp47.split('-').first.toLowerCase();
      return languages.any(
        (l) => l.toString().toLowerCase().startsWith(target),
      );
    } catch (_) {
      return false;
    }
  }

  @override
  Future<void> cancel() async {
    try {
      await _tts.stop();
    } catch (_) {/* синтезатор мог не стартовать — прерывать нечего */}
    try {
      await _player.stop();
    } catch (_) {/* то же самое для записи */}
  }
}

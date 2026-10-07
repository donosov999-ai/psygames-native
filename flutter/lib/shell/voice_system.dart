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

// `StreamAudioSource` у just_audio помечен экспериментальным — см. `noise.dart`.
// ignore_for_file: experimental_member_use

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;
import 'package:flutter_tts/flutter_tts.dart';
import 'package:just_audio/just_audio.dart';

import 'noise.dart' show BytesAudioSource;
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

/// Плеер одной записи — то, что `RecordingClips` умеет попросить у устройства.
/// Подменяется в пробах: правило «качать один раз» проверяется без сети и без ОС.
abstract class ClipPlayer {
  /// Загрузить байты записи. Медленное — здесь, до пуска.
  Future<void> load(Uint8List bytes);

  /// Та же запись ещё раз — с начала, без новой загрузки.
  Future<void> restart();

  /// Пустить; будущее завершается, когда доиграло или остановлено.
  Future<void> play(double speed);
  Future<void> stop();
}

/// 🔴 ЗАПИСЬ КАЧАЕТСЯ ОДИН РАЗ, А ПОВТОР ИГРАЕТ ИЗ ПАМЯТИ.
///
/// Отчёт «Полиглота» (Android 2.53.8): «кнопку нажимаешь и ни фига, не проговаривает;
/// на айфоне нормально». Разбор 01.10.2026 по исходникам: каждое «Ещё раз» звало
/// `setUrl` — то есть КАЧАЛО запись заново (файл 2 КБ с psy-games.pro, ответ
/// 0,42–0,59 с даже с проводной сети, CDN-кэша нет). Сеть мигнула — или новое нажатие
/// прервало загрузку прежнего (`PlayerInterruptedException`) — и слой честно уходил в
/// системный голос. На iPhone китайский голос встроен, поэтому там «нормально»; на
/// Android его обычно нет — отсюда тишина «иногда».
///
/// Теперь: байты записи держатся в памяти (файлы по 2–30 КБ, сотни штук — копейки);
/// повтор той же записи — с начала, без загрузки; нажатие, перебитое следующим, не
/// уходит в системный голос — звук всё равно даст следующая просьба.
class RecordingClips {
  RecordingClips({required this.player, Future<Uint8List> Function(Uri url)? fetch})
      : _fetch = fetch ?? fetchRecording;

  final ClipPlayer player;
  final Future<Uint8List> Function(Uri url) _fetch;
  final Map<String, Future<Uint8List>> _bytes = {};
  String? _loaded;
  int _ticket = 0;

  /// Байты записи: одна загрузка на ссылку; неудачная не запоминается.
  Future<Uint8List> bytesOf(String url) => _bytes.putIfAbsent(url, () {
        final f = _fetch(Uri.parse(url));
        f.catchError((Object _) {
          _bytes.remove(url);
          return Uint8List(0);
        });
        return f;
      });

  /// `true` — прозвучало (или прозвучит у следующей просьбы); `false` — записи нет.
  Future<bool> play(String url, double speed) async {
    final ticket = ++_ticket;
    try {
      final bytes = await bytesOf(url);
      if (ticket != _ticket) return true; // перебито следующим нажатием — оно и прозвучит
      if (_loaded == url) {
        await player.restart();
      } else {
        _loaded = null;
        await player.load(bytes);
        _loaded = url;
      }
      if (ticket != _ticket) return true;
      await player.play(speed);
      return true;
    } on PlayerInterruptedException {
      return true; // загрузку прервала следующая просьба — звук даст она
    } catch (_) {
      _loaded = null;
      return false;
    }
  }

  Future<void> stop() async {
    _ticket += 1;
    _loaded = null; // после остановки — загрузить из памяти заново, а не перематывать
    await player.stop();
  }
}

/// Скачать запись. Таймаут короткий: человек ждёт звук после нажатия, и лучше
/// честно уйти в системный голос, чем молчать полминуты.
Future<Uint8List> fetchRecording(Uri url) async {
  final client = HttpClient()..connectionTimeout = const Duration(seconds: 6);
  try {
    final res = await (await client.getUrl(url)).close().timeout(const Duration(seconds: 8));
    if (res.statusCode != 200) throw HttpException('HTTP ${res.statusCode}', uri: url);
    final b = BytesBuilder(copy: false);
    await for (final chunk in res.timeout(const Duration(seconds: 8))) {
      b.add(chunk);
    }
    return b.takeBytes();
  } finally {
    client.close(force: true);
  }
}

/// Настоящий плеер записи на just_audio, из байтов в памяти (Ogg Opus).
class JustAudioClipPlayer implements ClipPlayer {
  JustAudioClipPlayer([AudioPlayer? player]) : _p = player ?? AudioPlayer();
  final AudioPlayer _p;

  // 🔴 just_audio: `play()` возвращается СРАЗУ, если плеер уже «играет», а «играет» он и после
  // конца записи — до pause/stop. Без паузы конца ждала только первая запись подряд: со второй
  // `play()` возвращался сразу после загрузки (или перемотки — звук шёл сам), пауза между
  // словами шла от начала слова, а следующее слово обрывало звучащее («Объём на слух», сверка
  // 02.10.2026). Пауза — ДО загрузки и перемотки: тогда звук не стартует сам, и `play()` честно
  // ждёт конца, как обещает [ClipPlayer.play].
  @override
  Future<void> load(Uint8List bytes) async {
    if (_p.playing) await _p.pause();
    await _p.setAudioSource(BytesAudioSource(bytes, contentType: 'audio/ogg'));
  }

  @override
  Future<void> restart() async {
    if (_p.playing) await _p.pause();
    await _p.seek(Duration.zero);
  }

  @override
  Future<void> play(double speed) async {
    await _p.setSpeed(speed);
    await _p.play();
  }

  @override
  Future<void> stop() => _p.stop();
}

class SystemVoiceBackend implements VoiceBackend {
  SystemVoiceBackend({FlutterTts? tts, AudioPlayer? player, RecordingClips? clips})
      : _tts = tts ?? FlutterTts(),
        _clips = clips ?? RecordingClips(player: JustAudioClipPlayer(player));

  final FlutterTts _tts;
  final RecordingClips _clips;

  bool get _ios =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  // Нет сети, битый файл, чужой формат — это не повод молчать: наверху останется
  // синтез вторым шансом. Здесь просто честное «не прозвучало».
  @override
  Future<bool> playUrl(String url, double rate) => _clips.play(url, clampVoiceRate(rate));

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
      // 🔴 На Android список языков синтезатора включает и НЕскачанные голоса: язык «есть»,
      // а произнести нечем. Точный ответ — isLanguageInstalled (флаг NOT_INSTALLED у голоса).
      if (defaultTargetPlatform == TargetPlatform.android) {
        return await _tts.isLanguageInstalled(bcp47) == true;
      }
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
      await _clips.stop();
    } catch (_) {/* то же самое для записи */}
  }
}

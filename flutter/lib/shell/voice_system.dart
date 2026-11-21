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

abstract interface class AssetClipPlayer {
  Future<void> loadAsset(String path);
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
  RecordingClips({
    required this.player,
    Future<Uint8List> Function(Uri url)? fetch,
    this.prepareLimit = const Duration(milliseconds: 1700),
    this.playLimit = const Duration(seconds: 5),
  })
      : _fetch = fetch ?? fetchRecording;

  final ClipPlayer player;
  final Duration prepareLimit;
  final Duration playLimit;
  final Future<Uint8List> Function(Uri url) _fetch;
  final Map<String, Future<Uint8List>> _bytes = {};
  String? _loaded;
  int _ticket = 0;

  /// Байты записи: одна загрузка на ссылку; неудачная не запоминается.
  Future<Uint8List> bytesOf(String url) => _bytes.putIfAbsent(url, () {
        final f = _fetch(Uri.parse(url));
        f.catchError((Object _) {
          if (identical(_bytes[url], f)) _bytes.remove(url);
          return Uint8List(0);
        });
        return f;
      });

  /// `false` hands a failed clip to system speech. A stale request must never
  /// start speech after a later card or manual replay has taken over.
  Future<bool> play(String url, double speed) async {
    final ticket = ++_ticket;
    var preparingPlayer = false;
    Future<Uint8List>? pending;
    try {
      pending = bytesOf(url);
      final bytes = await pending.timeout(prepareLimit);
      if (ticket != _ticket) return true; // перебито следующим нажатием — оно и прозвучит
      if (bytes.isEmpty) {
        if (identical(_bytes[url], pending)) _bytes.remove(url);
        return false;
      }
      preparingPlayer = true;
      if (_loaded == url) {
        await player.restart().timeout(prepareLimit);
      } else {
        _loaded = null;
        await player.load(bytes).timeout(prepareLimit);
      }
      if (ticket != _ticket) return true;
      _loaded = url;
      await player.play(speed).timeout(playLimit);
      return true;
    } catch (error) {
      if (ticket != _ticket) return true;
      if (!preparingPlayer && identical(_bytes[url], pending)) _bytes.remove(url);
      _loaded = null;
      if (preparingPlayer && error is TimeoutException) {
        try {
          await player.stop().timeout(const Duration(milliseconds: 350));
        } catch (_) {
          // A broken clip player must not block the fallback voice.
        }
      }
      return false;
    }
  }

  Future<bool> playAsset(String path, double speed) async {
    final assetPlayer = player;
    if (assetPlayer is! AssetClipPlayer) return false;
    final ticket = ++_ticket;
    try {
      if (_loaded == path) {
        await player.restart().timeout(prepareLimit);
      } else {
        _loaded = null;
        await (assetPlayer as AssetClipPlayer).loadAsset(path).timeout(prepareLimit);
      }
      if (ticket != _ticket) return true;
      _loaded = path;
      await player.play(speed).timeout(playLimit);
      return true;
    } catch (error) {
      if (ticket != _ticket) return true;
      _loaded = null;
      if (error is TimeoutException) {
        try {
          await player.stop().timeout(const Duration(milliseconds: 350));
        } catch (_) {
          // Fall back to the existing voice path.
        }
      }
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
class JustAudioClipPlayer implements ClipPlayer, AssetClipPlayer {
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
  Future<void> loadAsset(String path) async {
    if (_p.playing) await _p.pause();
    await _p.setAudioSource(AudioSource.asset(path));
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
    if (_p.processingState != ProcessingState.completed) {
      throw StateError('Voice clip did not complete');
    }
  }

  @override
  Future<void> stop() => _p.stop();
}

class SystemVoiceBackend implements VoiceBackend, AssetVoiceBackend {
  SystemVoiceBackend({FlutterTts? tts, AudioPlayer? player, RecordingClips? clips})
      : _tts = tts ?? FlutterTts(),
        _clips = clips ?? RecordingClips(player: JustAudioClipPlayer(player));

  final FlutterTts _tts;
  final RecordingClips _clips;
  _AppleUtterance? _appleUtterance;
  int _speechTicket = 0;
  int? _nativeSpeechTicket;
  Future<void>? _appleEvents;
  Future<List<dynamic>>? _appleVoices;

  bool get _ios =>
      defaultTargetPlatform == TargetPlatform.iOS ||
      defaultTargetPlatform == TargetPlatform.macOS;

  Future<void> _listenForAppleSpeech() async {
    // flutter_tts forwards didCancel, but it does not resolve a speak()
    // waiting for native completion on iOS. Own the wait in Dart instead.
    _tts.setStartHandler(() => _appleUtterance?.started = true);
    _tts.setCompletionHandler(() => _finishAppleSpeech(true));
    _tts.setCancelHandler(() => _finishAppleSpeech(false));
    _tts.setErrorHandler((_) => _appleUtterance?.finish(false));
    await _tts.awaitSpeakCompletion(false).timeout(const Duration(seconds: 2));
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await _tts.autoStopSharedSession(false).timeout(const Duration(seconds: 2));
    }
  }

  Future<bool> _activateIPhoneSpeech(int ticket) async {
    if (defaultTargetPlatform != TargetPlatform.iOS) return true;
    // Clips, voice notes and interruptions can change the shared audio
    // session between words. Reclaim it only for an actual speak request.
    final category = await _tts.setIosAudioCategory(
      IosTextToSpeechAudioCategory.playback,
      const [IosTextToSpeechAudioCategoryOptions.mixWithOthers],
    ).timeout(const Duration(seconds: 2));
    if (category != 1 || ticket != _speechTicket) return false;
    return await _tts.setSharedInstance(true).timeout(const Duration(seconds: 2)) == 1;
  }

  void _finishAppleSpeech(bool spoken) {
    final speech = _appleUtterance;
    if (speech != null && speech.started) speech.finish(spoken);
  }

  Future<List<dynamic>> _readAppleVoices() async {
    try {
      final voices = await _tts.getVoices.timeout(const Duration(seconds: 1));
      return voices is List<dynamic> ? voices : const [];
    } catch (_) {
      return const [];
    }
  }

  Future<void> _preferAppleVoice(String locale, int ticket) async {
    final language = locale.split('-').first;
    if (language != 'en' && language != 'es') return;
    final voices = await (_appleVoices ??= _readAppleVoices());
    Map<String, String>? best;
    var rank = 0;
    for (final raw in voices.whereType<Map>()) {
      if (raw['locale'] != locale) continue;
      final score = switch (raw['quality']?.toString().toLowerCase()) {
        'premium' => 2,
        'enhanced' => 1,
        _ => 0,
      };
      if (score <= rank || raw['identifier'] is! String) continue;
      rank = score;
      best = {'identifier': raw['identifier'] as String};
    }
    if (best != null && ticket == _speechTicket) {
      try {
        await _tts.setVoice(best);
      } catch (_) {
        // setLanguage already selected a functional default.
      }
    }
  }

  // Нет сети, битый файл, чужой формат — это не повод молчать: наверху останется
  // синтез вторым шансом. Здесь просто честное «не прозвучало».
  @override
  Future<bool> playUrl(String url, double rate) => _clips.play(url, clampVoiceRate(rate));

  @override
  Future<bool> playAsset(String path, double rate) async {
    final ticket = _speechTicket;
    try {
      if (!await _activateIPhoneSpeech(ticket) || ticket != _speechTicket) {
        return false;
      }
      return await _clips.playAsset(path, clampVoiceRate(rate));
    } catch (_) {
      return false;
    }
  }

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    final ticket = ++_speechTicket;
    _AppleUtterance? speech;
    try {
      if (_ios && _appleUtterance != null) await _stopTts();
      if (ticket != _speechTicket) return false;
      var locale = bcp47;
      final selected = await _tts.setLanguage(locale);
      if (_ios) {
        if (selected != 1) {
          // Don't read Spanish in the previous English voice if the requested
          // region is missing but another region of the same language exists.
          final language = locale.split('-').first.toLowerCase();
          final voices = await (_appleVoices ??= _readAppleVoices());
          final fallback = voices.whereType<Map>()
              .map((voice) => voice['locale'])
              .whereType<String>()
              .where((tag) => tag.split('-').first.toLowerCase() == language)
              .firstOrNull;
          if (fallback == null || ticket != _speechTicket ||
              await _tts.setLanguage(fallback) != 1) {
            return false;
          }
          locale = fallback;
        }
        await _preferAppleVoice(locale, ticket);
      }
      await _tts.setSpeechRate(platformTtsRate(rate, ios: _ios));
      if (_ios) {
        final events = _appleEvents ??= _listenForAppleSpeech();
        try {
          await events;
        } catch (_) {
          if (identical(_appleEvents, events)) _appleEvents = null;
          rethrow;
        }
        if (ticket != _speechTicket || !await _activateIPhoneSpeech(ticket) ||
            ticket != _speechTicket) {
          return false;
        }
        speech = _AppleUtterance();
        _appleUtterance = speech;
        _nativeSpeechTicket = ticket;
        if (await _tts.speak(text).timeout(const Duration(seconds: 2)) != 1) {
          return false;
        }
        final limit = (text.length * 180).clamp(5000, 120000);
        return await speech.result.future.timeout(
          Duration(milliseconds: limit),
          onTimeout: () async {
            if (identical(_appleUtterance, speech)) await _stopTts();
            return false;
          },
        );
      }
      await _tts.awaitSpeakCompletion(true);
      if (ticket != _speechTicket) return false;
      _nativeSpeechTicket = ticket;
      return await _tts.speak(text) == 1;
    } catch (_) {
      if (speech != null && identical(_appleUtterance, speech)) {
        await _stopTts();
      }
      return false;
    } finally {
      if (identical(_appleUtterance, speech)) _appleUtterance = null;
      if (_nativeSpeechTicket == ticket) _nativeSpeechTicket = null;
    }
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async {
    try {
      // 🔴 На Android список языков синтезатора включает и НЕскачанные голоса: язык «есть»,
      // а произнести нечем. Точный ответ — isLanguageInstalled (флаг NOT_INSTALLED у голоса).
      if (defaultTargetPlatform == TargetPlatform.android) {
        return await _tts.isLanguageInstalled(bcp47)
                .timeout(const Duration(seconds: 2)) == true;
      }
      final languages = await _tts.getLanguages
          .timeout(const Duration(seconds: 2)) as List<dynamic>?;
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
    _speechTicket++;
    await Future.wait([_stopTts(), _stopClips()]);
  }

  Future<void> _stopTts() async {
    final pending = _appleUtterance;
    final wasSpeaking = pending != null || _nativeSpeechTicket != null;
    _appleUtterance = null;
    _nativeSpeechTicket = null;
    pending?.finish(false);
    if (!wasSpeaking) return;
    try {
      await _tts.stop().timeout(const Duration(milliseconds: 700));
    } catch (_) {/* синтезатор мог не стартовать — прерывать нечего */}
  }

  Future<void> _stopClips() async {
    try {
      await _clips.stop();
    } catch (_) {/* то же самое для записи */}
  }
}

class _AppleUtterance {
  final result = Completer<bool>();
  bool started = false;

  void finish(bool spoken) {
    if (!result.isCompleted) result.complete(spoken);
  }
}

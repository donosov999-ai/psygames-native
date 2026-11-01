import 'dart:async';

import 'package:flame_audio/flame_audio.dart' as flame;
import 'package:flutter_soloud/flutter_soloud.dart' as so;

/// An explicit comparison build opts in. Normal builds initialize neither engine.
const gameSfxEngine = String.fromEnvironment('PSYGAMES_SFX_ENGINE', defaultValue: 'off');
enum GameSound { selection, transfer, landing, group, victory }
const _files = <GameSound, String>{
  GameSound.selection: 'click_001.ogg',
  GameSound.transfer: 'glass_001.ogg',
  GameSound.landing: 'drop_001.ogg',
  GameSound.group: 'confirmation_001.ogg',
  GameSound.victory: 'bong_001.ogg',
};

abstract class GameSoundBackend {
  Future<void> play(GameSound sound, double volume, bool Function() current);
  Future<void> stop();
  Future<void> dispose();
}

/// Deduplication and lifecycle belong here, not in either audio engine.
/// No music/voice/practice audio APIs or global stopAll are used.
class GameEffectAudio {
  GameEffectAudio({this.backend, required this.enabled});
  final GameSoundBackend? backend;
  final bool Function() enabled;
  double volume = .3;
  bool _suspended = false, _closed = false;
  int _epoch = 0;
  Future<void> _work = Future.value();
  final _seen = <String>{};
  String? lastError;

  void emit(GameSound sound, String token) {
    if (_closed || _suspended || !enabled() || backend == null) return;
    if (!_seen.add('$token:${sound.name}')) return;
    final epoch = _epoch;
    bool current() => !_closed && !_suspended && epoch == _epoch && enabled();
    _work = _work.then((_) async {
      if (!current()) return;
      try { await backend!.play(sound, volume.clamp(0, 1), current); }
      catch (e) { lastError = e.runtimeType.toString(); } // sound can never fail a game
    });
  }

  Future<void> suspend(bool value) async {
    _suspended = value;
    if (value) await stop();
  }

  Future<void> stop() async {
    _epoch++;
    try { await backend?.stop(); } catch (e) { lastError = e.runtimeType.toString(); }
  }

  void reset() { _seen.clear(); unawaited(stop()); }
  Future<void> get settled => _work;
  Future<void> dispose() async {
    _closed = true;
    await stop();
    await _work;
    try { await backend?.dispose(); } catch (e) { lastError = e.runtimeType.toString(); }
  }
}

GameSoundBackend? pilotSoundBackend() => switch (gameSfxEngine) {
  'flame' => FlameSoundBackend(),
  'soloud' => SoloudSoundBackend(),
  _ => null,
};

class FlameSoundBackend implements GameSoundBackend {
  final _players = <flame.AudioPlayer>{};
  final _cache = flame.AudioCache(prefix: 'assets/game_sfx_pilot/');
  @override
  Future<void> play(GameSound sound, double volume, bool Function() current) async {
    if (!current()) return;
    final player = flame.AudioPlayer()..audioCache = _cache;
    _players.add(player); // stop/dispose can reach it even during preparation
    try {
      await player.setAudioContext(flame.AudioContext(
        iOS: flame.AudioContextIOS(category: flame.AVAudioSessionCategory.ambient),
        android: const flame.AudioContextAndroid(audioFocus: flame.AndroidAudioFocus.none),
      ));
      await player.setReleaseMode(flame.ReleaseMode.stop);
      await player.setSource(flame.AssetSource(_files[sound]!));
      await player.setVolume(volume);
      if (!current() || !_players.contains(player)) return;
      player.onPlayerComplete.listen((_) { unawaited(_release(player)); });
      await player.resume();
      if (!current()) await _release(player);
    } catch (_) { await _release(player); rethrow; }
  }
  Future<void> _release(flame.AudioPlayer p) async {
    if (_players.remove(p)) await p.dispose();
  }
  @override
  Future<void> stop() async {
    for (final p in _players.toList()) { await _release(p); }
  }
  @override
  Future<void> dispose() async { await stop(); _cache.clearAll(); }
}

class SoloudSoundBackend implements GameSoundBackend {
  static Future<void>? _initializing;
  final _sources = <GameSound, so.AudioSource>{};
  final _handles = <so.SoundHandle>{};
  @override
  Future<void> play(GameSound sound, double volume, bool Function() current) async {
    final engine = so.SoLoud.instance;
    if (!engine.isInitialized) {
      try { await (_initializing ??= engine.init()); }
      catch (_) { _initializing = null; rethrow; }
    }
    if (!current()) return;
    final source = _sources[sound] ??= await engine.loadAsset('assets/game_sfx_pilot/${_files[sound]}');
    if (!current()) return;
    _handles.removeWhere((h) => !engine.getIsValidVoiceHandle(h));
    _handles.add(engine.play(source, volume: volume));
  }
  @override
  Future<void> stop() async {
    if (!so.SoLoud.instance.isInitialized) return;
    for (final h in _handles.toList()) {
      if (so.SoLoud.instance.getIsValidVoiceHandle(h)) await so.SoLoud.instance.stop(h);
    }
    _handles.clear();
  }
  @override
  Future<void> dispose() async {
    await stop();
    if (so.SoLoud.instance.isInitialized) {
      for (final source in _sources.values) { await so.SoLoud.instance.disposeSource(source); }
    }
    _sources.clear();
    // The engine is a process singleton: never deinit another screen's owner.
  }
}

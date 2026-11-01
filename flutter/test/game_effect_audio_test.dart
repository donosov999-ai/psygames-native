import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/game_effect_audio.dart';

class FakeSound implements GameSoundBackend {
  final played = <GameSound>[];
  int stops = 0, disposals = 0;
  Completer<void>? gate;
  bool fail = false;
  @override
  Future<void> play(GameSound s, double volume, bool Function() current) async {
    await gate?.future;
    if (fail) throw StateError('test backend failure');
    if (current()) played.add(s);
  }
  @override
  Future<void> stop() async { stops++; }
  @override
  Future<void> dispose() async { disposals++; }
}

void main() {
  test('default factory is off; mute does not initialize/play anything', () async {
    expect(gameSfxEngine, 'off');
    expect(pilotSoundBackend(), isNull);
    final b = FakeSound();
    final a = GameEffectAudio(backend: b, enabled: () => false);
    a.emit(GameSound.selection, '1');
    await a.settled;
    expect(b.played, isEmpty);
    await a.dispose();
  });
  test('five real event types deduplicate per move, next attempt can emit again', () async {
    final b = FakeSound();
    final a = GameEffectAudio(backend: b, enabled: () => true);
    for (final s in GameSound.values) { a.emit(s, 'move1'); a.emit(s, 'move1'); }
    await a.settled;
    expect(b.played, GameSound.values);
    a.reset();
    a.emit(GameSound.victory, 'move1');
    await a.settled;
    expect(b.played.length, 6);
    await a.dispose();
  });
  test('hold/mute/exit invalidate commands still loading; resume does not replay', () async {
    final b = FakeSound()..gate = Completer<void>();
    var enabled = true;
    final a = GameEffectAudio(backend: b, enabled: () => enabled);
    a.emit(GameSound.transfer, 'm');
    await Future<void>.delayed(Duration.zero);
    await a.suspend(true);
    b.gate!.complete();
    await a.settled;
    expect(b.played, isEmpty);
    await a.suspend(false);
    a.emit(GameSound.transfer, 'm');
    await a.settled;
    expect(b.played, isEmpty);
    enabled = false;
    a.emit(GameSound.landing, 'm');
    await a.dispose();
    a.emit(GameSound.victory, 'late');
    expect(b.played, isEmpty);
    expect(b.disposals, 1);
  });
  test('backend error never escapes into gameplay', () async {
    final b = FakeSound()..fail = true;
    final a = GameEffectAudio(backend: b, enabled: () => true);
    a.emit(GameSound.group, 'g');
    await a.settled;
    expect(a.lastError, 'StateError');
    await a.dispose();
  });
}

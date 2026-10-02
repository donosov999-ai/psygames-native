import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart' show PlayerInterruptedException;
import 'package:psygames_flutter/shell/voice_system.dart';

/// ЗАПИСЬ КАЧАЕТСЯ ОДИН РАЗ, ПОВТОР ИГРАЕТ ИЗ ПАМЯТИ, ПЕРЕБИТОЕ НАЖАТИЕ НЕ УХОДИТ В
/// СИСТЕМНЫЙ ГОЛОС — правило `RecordingClips` на подставном плеере и подставной сети.
/// Повод — отчёт «Полиглота» (Android): «кнопку нажимаешь и ни фига», разбор в шапке класса.
class FakeClipPlayer implements ClipPlayer {
  final log = <String>[];
  Object? failLoad;
  @override
  Future<void> load(Uint8List bytes) async {
    log.add('load ${bytes.length}');
    if (failLoad != null) throw failLoad!;
  }

  @override
  Future<void> restart() async => log.add('restart');
  @override
  Future<void> play(double speed) async => log.add('play');
  @override
  Future<void> stop() async => log.add('stop');
}

void main() {
  const a = 'https://psy-games.pro/voice/zh/a.opus';
  const b = 'https://psy-games.pro/voice/zh/b.opus';

  test('🔴 повтор той же записи — без новой загрузки: сеть один раз, дальше с начала', () async {
    var fetches = 0;
    final p = FakeClipPlayer();
    final c = RecordingClips(player: p, fetch: (u) async {
      fetches += 1;
      return Uint8List(2165);
    });
    expect(await c.play(a, 1), isTrue);
    for (var i = 0; i < 5; i++) {
      expect(await c.play(a, 1), isTrue);
    }
    expect(fetches, 1, reason: 'шесть нажатий — одна загрузка');
    expect(p.log, ['load 2165', 'play', for (var i = 0; i < 5; i++) ...['restart', 'play']]);
    expect(await c.play(b, 1), isTrue);
    expect(fetches, 2, reason: 'другая запись — своя загрузка');
    expect(p.log.sublist(p.log.length - 2), ['load 2165', 'play']);
  });

  test('🔴 нажатие, перебитое следующим, не молчит и не уходит в системный голос', () async {
    final slow = Completer<Uint8List>();
    final p = FakeClipPlayer();
    var calls = 0;
    final c = RecordingClips(player: p, fetch: (u) {
      calls += 1;
      return slow.future;
    });
    final first = c.play(a, 1);
    final second = c.play(a, 1);
    slow.complete(Uint8List(10));
    expect(await first, isTrue, reason: 'true — звук даст следующая просьба, синтез не нужен');
    expect(await second, isTrue);
    expect(calls, 1, reason: 'одна загрузка на две просьбы');
    expect(p.log.where((e) => e == 'play'), hasLength(1), reason: 'звучит один раз, а не дважды внахлёст');
  });

  test('прерванная загрузка плеера (PlayerInterruptedException) — тоже «прозвучит»', () async {
    final p = FakeClipPlayer()..failLoad = PlayerInterruptedException('Loading interrupted');
    final c = RecordingClips(player: p, fetch: (u) async => Uint8List(5));
    expect(await c.play(a, 1), isTrue);
  });

  test('🔴 сеть упала — честное «нет записи» (наверху синтез), и следующая попытка качает заново', () async {
    var fetches = 0;
    final p = FakeClipPlayer();
    final c = RecordingClips(player: p, fetch: (u) async {
      fetches += 1;
      if (fetches == 1) throw Exception('нет сети');
      return Uint8List(7);
    });
    expect(await c.play(a, 1), isFalse);
    expect(p.log, isEmpty);
    expect(await c.play(a, 1), isTrue, reason: 'неудачная загрузка не запоминается');
    expect(fetches, 2);
    expect(p.log, ['load 7', 'play']);
  });

  test('остановка во время загрузки — звук после неё не начинается; дальше грузится заново', () async {
    final slow = Completer<Uint8List>();
    final p = FakeClipPlayer();
    final c = RecordingClips(player: p, fetch: (u) => slow.future);
    final f = c.play(a, 1);
    await c.stop();
    slow.complete(Uint8List(3));
    await f;
    expect(p.log, ['stop'], reason: 'отменённое не звучит');
    expect(await c.play(a, 1), isTrue);
    expect(p.log, ['stop', 'load 3', 'play'], reason: 'после остановки — из памяти заново, без сети');
  });

  test('доиграла → остановка → повтор: грузится из памяти заново, а не перематывается остановленный плеер', () async {
    var fetches = 0;
    final p = FakeClipPlayer();
    final c = RecordingClips(player: p, fetch: (u) async {
      fetches += 1;
      return Uint8List(4);
    });
    await c.play(a, 1);
    await c.stop();
    await c.play(a, 1);
    expect(p.log, ['load 4', 'play', 'stop', 'load 4', 'play']);
    expect(fetches, 1, reason: 'сеть не нужна — байты в памяти');
  });
}

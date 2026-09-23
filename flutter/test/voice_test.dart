/// Правила голосового слоя — пробой, а не на слух.
///
/// 🔴 ЧТО ИМЕННО СТОРОЖИМ. Слой переносит четыре правила веб-стороны, и каждое
/// из них когда-то стоило нам отчёта тестировщика:
/// 1. запись живого человека звучит ВПЕРЕДИ синтеза («даже английский очень
///    криво произносит машинным голосом»);
/// 2. молчать беззвучно нельзя — нет голоса, значит `speak` честно говорит
///    «не прозвучало», и экран показывает заглушку;
/// 3. выключенный звук — отдельная причина: чинится одним движением человека,
///    и подменять её на «голоса нет» значит врать;
/// 4. ряд слов, прозвучавший наполовину, — не успех, поэтому наружу уходит ЧИСЛО.
///
/// ⚠️ Устройство подставное. Проба, которая ходит в сеть и в системный
/// синтезатор, меряет погоду на машине, а не правила.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:psygames_flutter/shell/voice_system.dart';

class FakeBackend implements VoiceBackend {
  FakeBackend({
    this.samplePlays = true,
    this.systemSpeaks = true,
    this.systemHasVoice = true,
  });

  bool samplePlays;
  bool systemSpeaks;
  bool systemHasVoice;

  final List<String> steps = [];

  @override
  Future<bool> playUrl(String url, double rate) async {
    steps.add('запись $url @$rate');
    return samplePlays;
  }

  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    steps.add('синтез $text/$bcp47 @$rate');
    return systemSpeaks;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async {
    steps.add('есть голос $bcp47');
    return systemHasVoice;
  }

  @override
  Future<void> cancel() async => steps.add('отмена');
}

VoiceLayer layer(
  FakeBackend b, {
  bool sound = true,
  Map<String, Map<String, String>> live = const {},
  Map<String, Map<String, String>> samples = const {},
}) =>
    VoiceLayer(
      backend: b,
      soundOn: () => sound,
      live: live,
      samples: samples,
    );

void main() {
  test('есть что мерить: без записей слой всё равно собирается и говорит', () async {
    final b = FakeBackend();
    expect(await layer(b).speak('Haus', 'de'), isTrue);
    expect(b.steps, ['синтез Haus/de-DE @0.9']);
  });

  test('🔴 живая запись человека звучит ВПЕРЕДИ синтеза', () async {
    final b = FakeBackend();
    final l = layer(b, live: {'de': {'Haus': 'a1.opus'}});
    expect(await l.speak('Haus', 'de'), isTrue);
    expect(b.steps.single, 'запись https://psy-games.pro/voice-live/de/a1.opus @0.9');
    expect(l.isLive('Haus', 'de'), isTrue, reason: 'чтеца надо показать на экране источников');
  });

  test('🔴 синтезированная запись — вторая, живой корпус первым', () async {
    final b = FakeBackend();
    final l = layer(b, live: {'de': {'Haus': 'a1.opus'}}, samples: {'de': {'Haus': 'x.opus', 'Wasser': 'b2.opus'}});
    await l.speak('Haus', 'de');
    await l.speak('Wasser', 'de');
    expect(b.steps, [
      'запись https://psy-games.pro/voice-live/de/a1.opus @0.9',
      'запись https://psy-games.pro/voice/de/b2.opus @0.9',
    ]);
    expect(l.isLive('Wasser', 'de'), isFalse);
  });

  test('🔴 запись не проигралась — синтез остаётся вторым шансом, а не тишиной', () async {
    final b = FakeBackend(samplePlays: false);
    expect(await layer(b, samples: {'ru': {'дом': 'c3.opus'}}).speak('дом', 'ru'), isTrue);
    expect(b.steps, [
      'запись https://psy-games.pro/voice/ru/c3.opus @0.9',
      'синтез дом/ru-RU @0.9',
    ]);
  });

  test('🔴 не молчать беззвучно: нечем сказать — честное «не прозвучало»', () async {
    final b = FakeBackend(systemSpeaks: false, systemHasVoice: false);
    final l = layer(b);
    expect(await l.speak('дом', 'ru'), isFalse);
    expect(await l.blockedReason('ru'), VoiceBlock.noVoice);
  });

  test('🔴 выключенный звук — своя причина, а не «голоса нет»', () async {
    final b = FakeBackend();
    final l = layer(b, sound: false);
    expect(await l.blockedReason('ru'), VoiceBlock.soundOff);
    expect(await l.speak('дом', 'ru'), isFalse);
    expect(b.steps, isEmpty, reason: 'при выключенном звуке устройство не трогаем вовсе');
  });

  test('язык с записями звучит даже без системного голоса', () async {
    final b = FakeBackend(systemHasVoice: false);
    final l = layer(b, live: {'zh': {'水': 'd4.opus'}});
    expect(await l.hasVoice('zh'), isTrue);
    expect(await l.blockedReason('zh'), isNull);
  });

  test('скорость зажата по краям: слово не разваливается и не тараторит', () async {
    final b = FakeBackend();
    final l = layer(b);
    await l.speak('дом', 'ru', rate: 0.1);
    await l.speak('дом', 'ru', rate: 9);
    expect(b.steps, ['синтез дом/ru-RU @0.6', 'синтез дом/ru-RU @1.6']);
    expect(clampVoiceRate(0.9), 0.9);
  });

  test('🔴 ряд наружу отдаёт ЧИСЛО прозвучавших, а не «получилось»', () async {
    final b = FakeBackend(systemSpeaks: false, samplePlays: true);
    final l = layer(b, samples: {'ru': {'один': 'e5.opus', 'три': 'f6.opus'}});
    final spoken = await l.speakSequence(
      ['один', 'два', 'три'],
      'ru',
      gap: Duration.zero,
    );
    expect(spoken, 2, reason: 'второе слово нечем было сказать');
  });

  test('неизвестный язык уходит в систему как есть, а не подменяется английским', () async {
    final b = FakeBackend();
    await layer(b).speak('bonjour', 'fr');
    expect(b.steps.single, 'синтез bonjour/fr @0.9');
  });

  test('🔴 скорость пересчитывается под платформу: iOS вдвое медленнее шкалой', () {
    // Android: шкала 0.5…2.0, единица — норма; отдаём как есть.
    expect(platformTtsRate(1.0, ios: false), 1.0);
    expect(platformTtsRate(0.8, ios: false), closeTo(0.8, 1e-9));
    // iOS: шкала 0.0…1.0, норма около 0.5 — наша единица обязана стать половиной,
    // иначе упражнение на слух превращается в скороговорку вдвое быстрее нормы.
    expect(platformTtsRate(1.0, ios: true), 0.5);
    expect(platformTtsRate(0.8, ios: true), closeTo(0.4, 1e-9));
    // Края зажимаются ДО пересчёта — иначе 9.0 у Android уехало бы за шкалу.
    expect(platformTtsRate(9.0, ios: false), 1.6);
    expect(platformTtsRate(0.1, ios: true), closeTo(0.3, 1e-9));
  });
}

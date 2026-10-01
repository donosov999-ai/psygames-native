/// «ДИКТАНТ» НА FLUTTER: РАЗБОР ПО ШАГАМ ВМЕСТО ДЕМО-КАРТОЧКИ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/dictation/tools/record-flutter-lesson.gen.ts`):
/// нарезка каждой фразы банка на каждом языке и карточки на записанных потоках случайных чисел.
/// Экран — нажатиями на подставном голосе: карточка «послушайте» произносит фразу, карточка куска —
/// кусок; разбор посреди партии делает её незачётной.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/dictation/lesson.dart';
import 'package:psygames_flutter/games/dictation/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/noise.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/voice.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Voice implements VoiceBackend {
  final said = <String>[];
  @override
  Future<bool> playUrl(String url, double rate) async => false;
  @override
  Future<bool> speakSystem(String text, String bcp47, double rate) async {
    said.add(text);
    return true;
  }

  @override
  Future<bool> hasSystemVoice(String bcp47) async => true;
  @override
  Future<void> cancel() async {}
}

class _Noise implements NoiseBackend {
  @override
  Future<void> start(double gain) async {}
  @override
  Future<void> stop() async {}
}

class _Replay {
  _Replay(List<dynamic> s) : _s = [for (final v in s) (v as num).toDouble()];
  final List<double> _s;
  int used = 0;
  double call() {
    if (used >= _s.length) throw StateError('Dart берёт больше случайных чисел, чем TS');
    return _s[used++];
  }
}

void main() {
  final ref = jsonDecode(File('test/fixtures/dictation-lesson-reference.json').readAsStringSync()) as Map;

  test('🔴 нарезка каждой фразы банка совпадает с вебом, и склейка даёт фразу знак в знак', () {
    final all = (ref['chunks'] as List).cast<Map>();
    expect(all.length, greaterThan(100));
    for (final c in all) {
      final lang = c['lang'] as String;
      final text = c['text'] as String;
      final mine = dictationChunks(text, lang);
      expect(mine, c['chunks'], reason: '$lang: «$text»');
      expect(dictationJoin(mine, lang), text, reason: 'склейка обязана дать ровно ту фразу, которую примет игра');
      if (lang != 'zh') {
        expect(mine.every((k) => k.split(' ').length <= dictationWordsInChunk), isTrue);
      }
    }
  });

  test('🔴 карточки на том же потоке — те же, что у веба; текущая фраза в разбор не берётся', () {
    for (final l in (ref['lessons'] as List).cast<Map>()) {
      final r = _Replay(l['stream'] as List);
      final got = dictationLessonCards(
        pool: [for (final p in l['pool'] as List) p as String],
        lang: l['lang'] as String,
        exclude: l['exclude'] as String?,
        rnd: r.call,
      )!;
      expect(got.phrase, l['phrase']);
      expect(got.phrase, isNot(l['exclude']), reason: 'разбор показал бы ответ текущей фразы');
      expect(got.chunks, l['chunks']);
      final want = (l['cards'] as List).cast<Map>();
      expect(got.cards, hasLength(want.length));
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i];
        final c = got.cards[i];
        expect([c.kind, c.key, c.typed, c.chunk, c.speak], [w['kind'], w['key'], w['typed'], w['chunk'], w['speak']]);
        expect(c.fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')));
      }
      expect(r.used, (l['stream'] as List).length);
    }
  });

  group('экран', () {
    late SharedState state;
    setUp(() async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
      state = await SharedState.open();
      await L.load('ru');
    });
    tearDown(LessonUsed.reset);

    Future<_Voice> boot(WidgetTester tester) async {
      final v = _Voice();
      await tester.pumpWidget(MaterialApp(
        home: DictationScreen(
          state: state,
          random: Random(3).nextDouble,
          keyboard: true,
          voice: VoiceLayer(backend: v, soundOn: () => true),
          noise: NoiseLayer(backend: _Noise(), soundOn: () => true),
        ),
      ));
      for (var i = 0; i < 25; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      return v;
    }

    testWidgets('🔴 кнопка «Разбор» открывает шаги, карточки говорят фразу и куски', (tester) async {
      final v = await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isFalse, reason: 'до партии разбор её не метит');
      await tester.tap(find.byKey(const Key('lesson-play')));   // автопрокрутку на паузу
      await tester.pump();
      final texts = <String>[tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? ''];
      v.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next')));   // «послушайте»
      await tester.pump(const Duration(milliseconds: 100));
      texts.add(tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '');
      expect(v.said, isNotEmpty, reason: 'карточка «послушайте» обязана произнести фразу');
      final phrase = v.said.last;
      await tester.tap(find.byKey(const Key('lesson-next')));   // первый кусок
      await tester.pump(const Duration(milliseconds: 100));
      texts.add(tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '');
      expect(phrase.startsWith(v.said.last), isTrue, reason: 'первый кусок — начало фразы');
      expect(find.byKey(const ValueKey('dict-lesson-chunk-0')), findsOneWidget);
      expect(texts.where((t) => t.contains('teachDict') || t.contains('{')), isEmpty, reason: 'ключ или подстановка вместо текста');
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
    });

    testWidgets('🔴 разбор посреди партии делает её незачётной', (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('dict-start')));
      for (var i = 0; i < 25; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(LessonUsed.inRound, isTrue);
      await tester.tap(find.byKey(const Key('lesson-play')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
    });
  });
}

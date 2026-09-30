/// «ЭХО ПСЕВДОСЛОВ» НА FLUTTER: РАЗБОР ПО ШАГАМ ВМЕСТО ДЕМО-КАРТОЧКИ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/pseudoword-echo/tools/record-flutter-lesson.gen.ts`):
/// карточки на 120 раундах живого генератора (5 языков × 4 ступени длины) и ручные случаи, где вид
/// ловушки не распознаётся. Гласные — из ассета генератора (`assets/vocab/pseudoword-letters.json`),
/// которым пользуется экран; проба сверяет их с веб-таблицей `VOWELS`, по которой учит веб.
/// Экран — нажатиями на подставном голосе: «послушайте» произносит слово, ловушки отсеиваются по
/// одной; разбор посреди партии делает её незачётной и не берёт текущее слово.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/lexical_decision/model.dart';
import 'package:psygames_flutter/games/pseudoword_echo/lesson.dart';
import 'package:psygames_flutter/games/pseudoword_echo/screen.dart';
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

Map<String, Object?>? _trap(EchoTrap? t) =>
    t == null ? null : {'variant': t.variant, 'kind': t.kind, 'at': [t.at.$1, t.at.$2], 'was': t.was, 'now': t.now};

void main() {
  final ref = jsonDecode(File('test/fixtures/pseudoword-echo-lesson-reference.json').readAsStringSync()) as Map;
  final letters = LdLetters.fromJson(jsonDecode(File('assets/vocab/pseudoword-letters.json').readAsStringSync()) as Map);
  String vowels(String lang) => letters.vowels[lang] ?? letters.vowels['en'] ?? '';

  test('гласные ассета приложения = веб-таблица VOWELS, по которой учит веб', () {
    for (final e in (ref['vowels'] as Map).entries) {
      expect(vowels('${e.key}'), e.value, reason: '${e.key}');
    }
  });

  test('🔴 карточки на раундах живого генератора — те же, что у веба; каждая ловушка распознана', () {
    final lessons = (ref['lessons'] as List).cast<Map>();
    expect(lessons.length, greaterThan(100));
    var traps = 0;
    for (final l in lessons) {
      final options = [for (final o in l['options'] as List) '$o'];
      final got = echoLessonCards(word: l['word'] as String, options: options, vowels: vowels(l['lang'] as String));
      final why = '${l['lang']} L${l['level']}: ${l['word']} ← $options';
      expect([for (final t in got.traps) _trap(t)], l['traps'], reason: why);
      expect(got.traps, hasLength(options.length - 1), reason: 'ловушка без названия — разбор промолчит о ней: $why');
      traps += got.traps.length;
      final want = (l['cards'] as List).cast<Map>();
      expect(got.cards, hasLength(want.length), reason: why);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i];
        final c = got.cards[i];
        expect([c.kind, c.key, c.variant, c.dropped, c.speak], [w['kind'], w['key'], w['variant'], w['dropped'], w['speak']],
            reason: '$why #$i');
        expect(c.fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')), reason: '$why #$i');
        expect(c.at == null ? null : [c.at!.$1, c.at!.$2], w['at'], reason: '$why #$i');
      }
    }
    expect(traps, greaterThanOrEqualTo(300));
  });

  test('🔴 ручные случаи: удвоение, перестановка и всё, что генератор не даёт (null)', () {
    for (final m in (ref['manual'] as List).cast<Map>()) {
      expect(_trap(echoTrap(m['word'] as String, m['variant'] as String, vowels(m['lang'] as String))), m['trap'],
          reason: '${m['word']} → ${m['variant']}');
    }
  });

  test('🔴 пример разбора — не слово текущей партии; не вышло за шесть попыток — разбора нет', () {
    var n = 0;
    final seq = ['tamo', 'tamo', 'bilu'];
    final got = echoLessonExample(() => (word: seq[min(n++, seq.length - 1)], options: const <String>[]), 'tamo');
    expect(got?.word, 'bilu');
    n = 0;
    expect(echoLessonExample(() {
      n += 1;
      return (word: 'tamo', options: const <String>[]);
    }, 'tamo'), isNull);
    expect(n, 6, reason: 'как в вебе: первая попытка и пять повторов');
    expect(echoLessonExample(() => (word: 'tamo', options: const <String>[]), null)?.word, 'tamo',
        reason: 'до партии исключать нечего');
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
        home: PseudowordEchoScreen(
          state: state,
          random: Random(4).nextDouble,
          voice: VoiceLayer(backend: v, soundOn: () => true),
          noise: NoiseLayer(backend: _Noise(), soundOn: () => true),
        ),
      ));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      return v;
    }

    String text(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '';

    testWidgets('🔴 кнопка «Разбор» открывает шаги: слово звучит, ловушки отсеиваются по одной', (tester) async {
      final voice = await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isFalse, reason: 'до партии разбор её не метит');
      await tester.tap(find.byKey(const Key('lesson-play'))); // автопрокрутку на паузу
      await tester.pump();
      expect(text(tester), L.t('teachEchoIntro'));
      expect(find.byKey(const ValueKey('echo-lesson-option-3')), findsOneWidget, reason: 'четыре написания на поле');

      voice.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next'))); // послушайте
      await tester.pump();
      for (var i = 0; i < 3; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(voice.said, hasLength(1), reason: 'карточка «послушайте» произносит слово');
      final word = voice.said.single;

      await tester.tap(find.byKey(const Key('lesson-next'))); // первая ловушка
      await tester.pump(const Duration(milliseconds: 400));
      expect(text(tester), isNot(contains('{')), reason: 'подстановки не остались сырыми');
      final marked = <String>[];
      for (var k = 0; k < 4; k += 1) {
        final span = tester.widget<Text>(find.byKey(ValueKey('echo-lesson-text-$k'))).textSpan! as TextSpan;
        for (final c in span.children ?? const <InlineSpan>[]) {
          if (c is TextSpan && c.style?.decoration == TextDecoration.underline) marked.add(c.text ?? '');
        }
      }
      expect(marked.single, isNotEmpty, reason: 'у разбираемой ловушки подчёркнуто место отличия');
      final options = [
        for (var k = 0; k < 4; k += 1)
          (tester.widget<Text>(find.byKey(ValueKey('echo-lesson-text-$k'))).textSpan! as TextSpan).toPlainText(),
      ];
      expect(options, contains(word), reason: 'прозвучавшее слово — одно из четырёх написаний');

      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
      expect(find.byType(LessonPlayerScreen), findsNothing);
    });

    testWidgets('🔴 разбор посреди партии делает её незачётной и не берёт текущее слово', (tester) async {
      final voice = await boot(tester);
      await tester.tap(find.byKey(const Key('echo-start')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      final current = voice.said.last;
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(LessonUsed.inRound, isTrue);
      await tester.tap(find.byKey(const Key('lesson-play')));
      await tester.pump();
      voice.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next')));
      await tester.pump();
      for (var i = 0; i < 3; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(voice.said.single, isNot(current), reason: 'текущее слово партии назвало бы ответ');
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
    });
  });
}

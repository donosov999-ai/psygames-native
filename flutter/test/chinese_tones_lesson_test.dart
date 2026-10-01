/// «ТОНЫ КИТАЙСКОГО» НА FLUTTER: РАЗБОР ПО ШАГАМ ВМЕСТО ДЕМО-КАРТОЧКИ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/chinese-tones/tools/record-flutter-lesson.gen.ts`):
/// основы банка во всех четырёх тонах и с парой «второй — третий» и карточки на записанных потоках
/// случайных чисел при разных текущих заданиях. Банк — тот же ассет, что у экрана
/// (`assets/vocab/zh-tone-bank.json`); проба сверяет его размер с банком веба.
/// Экран — нажатиями на подставном голосе: карточка тона произносит свой знак, линия этого тона горит;
/// разбор посреди партии делает её незачётной.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/chinese_tones/lesson.dart';
import 'package:psygames_flutter/games/chinese_tones/model.dart';
import 'package:psygames_flutter/games/chinese_tones/screen.dart';
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
  final ref = jsonDecode(File('test/fixtures/chinese-tones-lesson-reference.json').readAsStringSync()) as Map;
  final bank = zhBankFromJson(jsonDecode(File('assets/vocab/zh-tone-bank.json').readAsStringSync()) as Map);

  test('🔴 ассет банка снят с того же банка, что учит веб; основы совпадают', () {
    expect(bank.values.fold<int>(0, (n, v) => n + v.length), ref['bankCount'],
        reason: 'ассет приложения отстал от банка веба — голос прочтёт не тот тон, что засчитает игра');
    expect(ctBasesAllTones(bank), ref['full']);
    expect(ctBasesPair23(bank), ref['pair23']);
  });

  test('🔴 карточки на том же потоке — те же, что у веба; слог текущего задания не берётся', () {
    final lessons = (ref['lessons'] as List).cast<Map>();
    expect(lessons.length, greaterThan(40));
    for (final l in lessons) {
      final r = _Replay(l['stream'] as List);
      final exclude = l['exclude'] as String?;
      final got = ctLessonCards(bank: bank, exclude: exclude, rnd: r.call);
      final why = 'текущее ${l['exclude']}';
      expect(got.base, l['base'], reason: why);
      final want = (l['cards'] as List).cast<Map>();
      expect(got.cards, hasLength(want.length), reason: why);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i];
        final c = got.cards[i];
        expect([c.kind, c.key, c.tone, c.speak], [w['kind'], w['key'], w['tone'], w['speak']], reason: '$why #$i');
        expect(c.fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')), reason: '$why #$i');
        expect([for (final s in c.sylls) {'zh': s.zh, 'pinyin': s.pinyin, 'tone': s.tone}], w['sylls'], reason: '$why #$i');
        if (exclude != null) {
          expect(c.sylls.any((s) => s.pinyin == exclude), isFalse, reason: 'разбор назвал бы ответ: $why #$i');
        }
      }
      expect(r.used, (l['stream'] as List).length, reason: 'Dart берёт меньше случайных чисел, чем TS: $why');
    }
  });

  test('🔴 линии тонов по смыслу шкалы Чжао: ровная высокая · вверх · яма · резко вниз', () {
    final c = ctToneContours;
    expect(c[1]!.toSet(), {5}, reason: 'первый — ровный и высокий');
    expect(c[2]!.last, greaterThan(c[2]!.first), reason: 'второй — вверх');
    final dip = c[3]!.sublist(1, c[3]!.length - 1);
    expect(dip, isNotEmpty, reason: 'у третьего есть середина — яма');
    expect(dip.reduce(min), lessThan(min(c[3]!.first, c[3]!.last)), reason: 'третий сперва уходит вниз');
    expect(c[4]!.last, lessThan(c[4]!.first), reason: 'четвёртый — вниз');
    expect([c[2]!.last, c[3]!.last].every((v) => v >= 4), isTrue, reason: 'второй и третий кончаются вверху — разница в начале');
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
        home: ChineseTonesScreen(
          state: state,
          random: Random(6).nextDouble,
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

    testWidgets('🔴 кнопка «Разбор» открывает шаги: четыре линии, карточка тона звучит и зажигает свою', (tester) async {
      final voice = await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isFalse, reason: 'до партии разбор её не метит');
      await tester.tap(find.byKey(const Key('lesson-play'))); // автопрокрутку на паузу
      await tester.pump();
      expect(text(tester), L.t('teachZhIntro'));
      for (var t = 1; t <= 4; t += 1) {
        expect(find.byKey(ValueKey('ct-lesson-syll-$t')), findsOneWidget, reason: 'слог в тоне $t на поле');
      }

      voice.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next'))); // первый тон
      await tester.pump();
      for (var i = 0; i < 3; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(voice.said, hasLength(1), reason: 'карточка тона произносит свой знак');
      expect(find.byKey(const ValueKey('ct-lesson-line-1-lit')), findsOneWidget, reason: 'горит линия первого тона');
      expect(find.byKey(const ValueKey('ct-lesson-line-2-lit')), findsNothing);
      expect(text(tester), isNot(contains('{')), reason: 'подстановки не остались сырыми');

      for (var k = 0; k < 4; k += 1) {
        await tester.tap(find.byKey(const Key('lesson-next')));
        await tester.pump(const Duration(milliseconds: 100));
      }
      voice.said.clear();
      for (var i = 0; i < 4; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(text(tester), startsWith(L.t('teachZhPair23').split('{').first), reason: 'шаг «второй против третьего»');
      expect(find.byKey(const ValueKey('ct-lesson-line-2-lit')), findsOneWidget);
      expect(find.byKey(const ValueKey('ct-lesson-line-3-lit')), findsOneWidget);
      expect(voice.said, hasLength(2), reason: 'пара звучит двумя словами');

      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
      expect(find.byType(LessonPlayerScreen), findsNothing);
    });

    testWidgets('🔴 разбор посреди партии делает её незачётной', (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('ct-start')));
      await tester.pump(const Duration(milliseconds: 450));
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

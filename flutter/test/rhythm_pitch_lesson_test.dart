/// «РИТМ И ВЫСОТА» НА FLUTTER: РАЗБОР ПО ШАГАМ ВМЕСТО ДЕМО-КАРТОЧКИ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/rhythm-pitch/tools/record-flutter-lesson.gen.ts`):
/// на уровнях 1–6 по 30 зёрен — режим раунда, «ровный ли ряд» и карточки (или их отсутствие).
/// Раунд Dart строит своим генератором (перенос «Языков», сверен их эталоном) на тех же зёрнах, так
/// что проба заодно ловит расхождение генератора в том, что видит разбор.
/// Экран — нажатиями на подставном плеере: карточка «послушайте» проигрывает пример на движке партии;
/// разбор посреди партии делает её незачётной.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/rhythm_pitch/core.dart';
import 'package:psygames_flutter/games/rhythm_pitch/lesson.dart';
import 'package:psygames_flutter/games/rhythm_pitch/screen.dart';
import 'package:psygames_flutter/games/rhythm_pitch/tones.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Tones implements RpToneBackend {
  int starts = 0;
  Completer<void>? _playing;

  void _finish() {
    final p = _playing;
    _playing = null;
    if (p != null && !p.isCompleted) p.complete();
  }

  @override
  Future<void> load(Uint8List wav, double volume) async {}
  @override
  Future<void> start() {
    starts += 1;
    return (_playing = Completer<void>()).future;
  }

  @override
  Future<void> stop() async => _finish();
  @override
  Future<void> dispose() async => _finish();
}

void main() {
  final ref = jsonDecode(File('test/fixtures/rhythm-pitch-lesson-reference.json').readAsStringSync()) as Map;

  test('🔴 режим, ровность ряда и карточки на тех же зёрнах — те же, что у веба', () {
    final lessons = (ref['lessons'] as List).cast<Map>();
    expect(lessons, hasLength(180));
    var withCards = 0;
    for (final l in lessons) {
      final level = l['level'] as int;
      final round = generateRhythmPitchRound(l['seed'] as String, level);
      final why = 'L$level ${l['seed']}';
      expect(round.mode, l['mode'], reason: why);
      expect(rpEvenRow(round), l['even'], reason: why);
      final got = rpLessonCards(round);
      final want = l['cards'] as List?;
      if (want == null) {
        expect(got, isNull, reason: 'веб молчит — разбор сказал бы неправду: $why');
        continue;
      }
      withCards += 1;
      expect(got, isNotNull, reason: why);
      expect(got, hasLength(want.length), reason: why);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i] as Map;
        final c = got![i];
        expect([c.kind, c.key, c.sound], [w['kind'], w['key'], w['sound']], reason: '$why #$i');
        expect(c.fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')), reason: '$why #$i');
      }
    }
    expect(withCards, 90, reason: 'уровни 1–3: разбор есть на каждом зерне');
  });

  test('🔴 «ровный ряд» = промежутки равны И акцентов нет: каждое условие отдельно', () {
    final forced = (ref['forced'] as List).cast<Map>();
    expect(forced.where((f) => f['equalGaps'] == false && f['accents'] == 0), isNotEmpty,
        reason: 'в эталоне есть неровные ряды без акцента — иначе условие «промежутки» не проверено');
    for (final f in forced) {
      final r = generateRhythmPitchRound(f['seed'] as String, f['level'] as int, 'rhythm-echo');
      expect(rpEvenRow(r), f['even'], reason: '${f['seed']}');
    }
    // Равных шагов с акцентом генератор не даёт (0 из 360) — ряд собран руками: разбор сказал бы
    // «ровно, держите темп», а ряд с ударением ровным не слышится.
    RhythmEchoRound row(List<double> at, List<bool> accent) => RhythmEchoRound(
          id: 't',
          seed: 't',
          level: 5,
          difficulty: 1,
          tutorialReplay: false,
          beatCount: at.length,
          bpm: 60,
          unitMs: 500,
          beats: [for (var i = 0; i < at.length; i += 1) RhythmBeat(at[i], accent[i])],
          pauseCount: 0,
          syncopationCount: 0,
          accentCount: accent.where((a) => a).length,
        );
    expect(rpEvenRow(row([0, 500, 1000, 1500], [false, false, false, false])), isTrue);
    expect(rpEvenRow(row([0, 500, 1000, 1500], [true, false, false, false])), isFalse, reason: 'акцент');
    expect(rpEvenRow(row([0, 500, 1500, 2000], [false, false, false, false])), isFalse, reason: 'пауза');
    expect(rpLessonCards(row([0, 500, 1000, 1500], [true, false, false, false])), isNull);
  });

  test('🔴 уровень примера: на 1–3 — свой, выше — вводный уровень того же режима, и разбор там есть', () {
    expect([for (var l = 1; l <= 3; l += 1) rpLessonLevel(l, rhythmPitchModeForLevel(l))], [1, 2, 3]);
    for (var l = 4; l <= 31; l += 1) {
      final mode = rhythmPitchModeForLevel(l);
      final ll = rpLessonLevel(l, mode);
      expect(ll, lessThanOrEqualTo(3), reason: 'L$l');
      expect(rhythmPitchModeForLevel(ll), mode, reason: 'L$l: разбор учит режиму этого уровня');
      expect(rpLessonExample(l, mode, 'probe'), isNotNull, reason: 'L$l: разбору есть что сказать');
    }
    // Режим задан шагом зарядки поперёк чередования — разбор всё равно про этот режим.
    expect(rpLessonExample(1, 'pitch-path', 'probe')!.round.mode, 'pitch-path');
    expect(rpLessonExample(2, 'rhythm-echo', 'probe')!.round.mode, 'rhythm-echo');
  });

  group('экран', () {
    late SharedState state;
    setUp(() async {
      SharedPreferences.setMockInitialValues({'language': 'ru', 'psygames_active_profile': 'nzt48'});
      state = await SharedState.open();
      await L.load('ru');
    });
    tearDown(LessonUsed.reset);

    Future<_Tones> boot(WidgetTester tester) async {
      final tones = _Tones();
      await tester.pumpWidget(MaterialApp(home: RhythmPitchScreen(state: state, clock: () => 0, backend: tones)));
      for (var i = 0; i < 20; i++) {
        await tester.pump(const Duration(milliseconds: 20));
      }
      return tones;
    }

    String text(WidgetTester tester) => tester.widget<Text>(find.byKey(const Key('lesson-text'))).data ?? '';

    testWidgets('🔴 кнопка «Разбор» открывает шаги ритма: «послушайте» звучит на движке партии', (tester) async {
      final tones = await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isFalse, reason: 'до партии разбор её не метит');
      await tester.tap(find.byKey(const Key('lesson-play'))); // автопрокрутку на паузу
      await tester.pump();
      expect(text(tester), L.t('teachRpRhythmIntro'), reason: 'уровень 1 — ритм');
      expect(find.byKey(const ValueKey('rp-lesson-board-rhythm-echo')), findsOneWidget);
      final before = tones.starts;
      await tester.tap(find.byKey(const Key('lesson-next'))); // послушайте
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(tones.starts, before + 1, reason: 'пример проигран');
      expect(text(tester), isNot(contains('{')), reason: 'подстановки не остались сырыми');
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
      expect(find.byType(LessonPlayerScreen), findsNothing);
    });

    testWidgets('уровень 2 — разбор высоты: «выше» или «ниже» из самого раунда', (tester) async {
      await state.set(SharedState.levelKey('rhythm_pitch', 'nzt48'), '2');
      await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('lesson-play')));
      await tester.pump();
      expect(text(tester), L.t('teachRpPitchIntro'));
      expect(find.byKey(const ValueKey('rp-lesson-board-pitch-path')), findsOneWidget);
      await tester.tap(find.byKey(const Key('lesson-next')));
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('lesson-next')));
      await tester.pump(const Duration(milliseconds: 400));
      expect([L.t('teachRpHigher'), L.t('teachRpLower')], contains(text(tester)));
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
    });

    testWidgets('🔴 разбор посреди партии делает её незачётной', (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('rp-start')));
      await tester.pump();
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

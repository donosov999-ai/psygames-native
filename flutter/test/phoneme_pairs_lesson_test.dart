/// «ФОНЕМНЫЕ ПАРЫ» НА FLUTTER: РАЗБОР ПО ШАГАМ ВМЕСТО ДЕМО-КАРТОЧКИ.
///
/// Эталон снят прогоном живого TS (`frontend/src/games/phoneme-pairs/tools/record-flutter-lesson.gen.ts`):
/// место расхождения каждой пары каждого языка и карточки на записанных потоках случайных чисел.
/// Пиньинь берётся из того же ассета, что у экрана (`assets/vocab/phoneme-pairs.json`), — так сверка
/// заодно ловит расхождение ассета со словарём HSK, которым пользуется веб-учитель.
/// Экран — нажатиями на подставном голосе: карточка пары произносит оба слова, проба — одно;
/// разбор посреди партии делает её незачётной и не берёт текущую пару.
library;

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/phoneme_pairs/lesson.dart';
import 'package:psygames_flutter/games/phoneme_pairs/screen.dart';
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

(String, String) _pair(dynamic p) => ('${(p as List)[0]}', '${p[1]}');
List<int>? _span(dynamic d, String side) => d == null ? null : [for (final v in (d as Map)[side] as List) v as int];

void main() {
  final ref = jsonDecode(File('test/fixtures/phoneme-pairs-lesson-reference.json').readAsStringSync()) as Map;
  final asset = jsonDecode(File('assets/vocab/phoneme-pairs.json').readAsStringSync()) as Map;
  final pinyin = {for (final e in (asset['pinyin'] as Map).entries) '${e.key}': '${e.value}'};

  test('🔴 место расхождения каждой пары совпадает с вебом', () {
    final all = (ref['where'] as List).cast<Map>();
    expect(all.length, greaterThan(70));
    for (final w in all) {
      final lang = w['lang'] as String;
      final a = w['a'] as String;
      final b = w['b'] as String;
      expect(phDiffKind(lang), w['kind'], reason: lang);
      final PhDiff? mine = switch (phDiffKind(lang)) {
        'vowel' => null,
        'pinyin' => phWhereDiffer(pinyin[a] ?? a, pinyin[b] ?? b),
        _ => phWhereDiffer(a, b),
      };
      expect(mine == null ? null : [mine.a.$1, mine.a.$2], _span(w['diff'], 'a'), reason: '$lang: $a / $b');
      expect(mine == null ? null : [mine.b.$1, mine.b.$2], _span(w['diff'], 'b'), reason: '$lang: $a / $b');
    }
  });

  test('🔴 карточки на том же потоке — те же, что у веба; текущая пара в разбор не берётся', () {
    for (final l in (ref['lessons'] as List).cast<Map>()) {
      final r = _Replay(l['stream'] as List);
      final exclude = l['exclude'] == null ? null : _pair(l['exclude']);
      final got = phLessonCards(
        pool: [for (final p in l['pool'] as List) _pair(p)],
        lang: l['lang'] as String,
        exclude: exclude,
        pinyin: pinyin,
        rnd: r.call,
      );
      final why = '${l['lang']} · ${l['note']}';
      expect(got.examples, [for (final p in l['examples'] as List) _pair(p)], reason: why);
      if (exclude != null) {
        expect(got.examples.any((p) => {p.$1, p.$2}.containsAll({exclude.$1, exclude.$2})), isFalse,
            reason: 'разбор показал бы ответ текущей пары: $why');
      }
      final want = (l['cards'] as List).cast<Map>();
      expect(got.cards, hasLength(want.length), reason: why);
      for (var i = 0; i < want.length; i += 1) {
        final w = want[i];
        final c = got.cards[i];
        expect([c.kind, c.key, c.sounding, c.speak], [w['kind'], w['key'], w['sounding'], w['speak']], reason: '$why #$i');
        expect(c.pair, w['pair'] == null ? null : _pair(w['pair']), reason: '$why #$i');
        expect(c.fields, (w['fields'] as Map).map((k, v) => MapEntry(k as String, '$v')), reason: '$why #$i');
        expect(c.diff == null ? null : [c.diff!.a.$1, c.diff!.a.$2], _span(w['diff'], 'a'), reason: '$why #$i');
        expect(c.diff == null ? null : [c.diff!.b.$1, c.diff!.b.$2], _span(w['diff'], 'b'), reason: '$why #$i');
      }
      expect(r.used, (l['stream'] as List).length, reason: 'Dart берёт меньше случайных чисел, чем TS: $why');
    }
  });

  test('отличие на пустом месте расширяется влево: pero/perro — «r» против «rr», а не «» против «r»', () {
    final d = phWhereDiffer('pero', 'perro');
    expect([phPiece('pero', d.a), phPiece('perro', d.b)], ['r', 'rr']);
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
        home: PhonemePairsScreen(
          state: state,
          random: Random(2).nextDouble,
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

    testWidgets('🔴 кнопка «Разбор» открывает шаги: пара звучит двумя словами, проба — одним', (tester) async {
      final voice = await boot(tester);
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(LessonPlayerScreen), findsOneWidget);
      expect(LessonUsed.inRound, isFalse, reason: 'до партии разбор её не метит');
      await tester.tap(find.byKey(const Key('lesson-play'))); // автопрокрутку на паузу
      await tester.pump();
      expect(text(tester), L.t('teachPhIntro'));
      expect(text(tester), isNot(contains('{')), reason: 'подстановки не остались сырыми');

      voice.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next'))); // пара
      await tester.pump();
      for (var i = 0; i < 6; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(find.byKey(const ValueKey('ph-lesson-word-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('ph-lesson-word-1')), findsOneWidget);
      expect(voice.said, hasLength(2), reason: 'карточка пары произносит оба слова');
      expect(text(tester), isNot(contains('{')));

      voice.said.clear();
      await tester.tap(find.byKey(const Key('lesson-next'))); // проба
      await tester.pump();
      for (var i = 0; i < 4; i += 1) {
        await tester.pump(const Duration(milliseconds: 400));
      }
      expect(find.byKey(const ValueKey('ph-lesson-probe')), findsOneWidget);
      expect(voice.said, hasLength(1), reason: 'на пробе звучит одно слово');
      expect(text(tester), L.t('teachPhProbe'));

      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
      expect(find.byType(LessonPlayerScreen), findsNothing);
    });

    testWidgets('🔴 разбор посреди партии делает её незачётной', (tester) async {
      await boot(tester);
      await tester.tap(find.byKey(const Key('ph-start')));
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

    testWidgets('китайский: место расхождения подчёркнуто в пиньине, иероглиф целиком', (tester) async {
      await boot(tester);
      // Язык выбирается выпадающей строкой (общий LangDropdown): открыть, выбрать пункт.
      await tester.tap(find.byKey(const Key('ph-lang')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('ph-lang-zh')).last);
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('game-lesson')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('lesson-play')));
      await tester.pump();
      await tester.tap(find.byKey(const Key('lesson-next')));
      await tester.pump(const Duration(milliseconds: 400));
      final py = tester.widget<Text>(find.byKey(const ValueKey('ph-lesson-pinyin-0'))).textSpan! as TextSpan;
      final marked = [
        for (final c in py.children ?? const <InlineSpan>[])
          if (c is TextSpan && c.style?.decoration == TextDecoration.underline) c.text,
      ];
      expect(marked.single, isNotEmpty, reason: 'в пиньине подчёркнуто место различия');
      final hz = tester.widget<Text>(find.byKey(const ValueKey('ph-lesson-text-0'))).textSpan! as TextSpan;
      expect(hz.children, isNull, reason: 'иероглиф не режется на части');
      await tester.tap(find.byKey(const Key('lesson-close')));
      await tester.pumpAndSettle();
    });
  });
}

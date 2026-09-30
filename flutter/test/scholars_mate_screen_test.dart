import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart';
import 'package:psygames_flutter/games/scholars_mate/deck.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';
import 'package:psygames_flutter/games/scholars_mate/motifs.dart';
import 'package:psygames_flutter/games/scholars_mate/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН «ДЕТСКОГО МАТА» — ПАРТИЯ НАЖАТИЯМИ (шаг 5 переезда, 30.09.2026).
///
/// Корпус подаётся с диска, часы поддельные, колода повторимая: проба знает,
/// какие позиции придут, и играет их касаниями клеток — как человек.
void main() {
  final corpus = ScholarsCorpus.fromJson(
    jsonDecode(File('assets/scholars_mate/puzzles.json').readAsStringSync())
        as Map<String, dynamic>,
  );
  var clock = 0;

  setUp(() async {
    // Названия и вопросы — ключи словаря; без него на экране были бы ключи.
    await L.load('ru');
    SharedPreferences.setMockInitialValues({});
    clock = 0;
  });

  Future<void> open(
    WidgetTester tester, {
    int seed = 1,
    Map<String, Object> prefs = const {},
  }) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    if (prefs.isNotEmpty) SharedPreferences.setMockInitialValues(prefs);
    final state = await SharedState.open();
    await tester.pumpWidget(
      MaterialApp(
        home: ScholarsMateScreen(
          state: state,
          corpus: corpus,
          clock: () => clock,
          seed: seed,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
  }

  /// Тик экрана — раз в 100 мс; двигаем и поддельные часы, и таймеры.
  Future<void> wait(WidgetTester tester, int ms) async {
    clock += ms;
    await tester.pump(const Duration(milliseconds: 250));
  }

  Future<void> play(WidgetTester tester, ScholarsPuzzle p, String uci) async {
    final white = sideToMove(p) == 'w';
    for (final sq in [uci.substring(0, 2), uci.substring(2, 4)]) {
      await tester.tap(
        find.byKey(Key('sm-${scholarsSquareIndex(sq, whiteBottom: white)}')),
      );
      await tester.pump();
    }
  }

  String text(WidgetTester tester, String key) =>
      tester.widget<Text>(find.byKey(Key(key))).data ?? '';

  testWidgets(
    'настройка → «Начать» → верный ход касаниями → следующая позиция',
    (tester) async {
      await open(tester);
      expect(find.byKey(const Key('sm-mode')), findsOneWidget);
      expect(
        text(tester, 'sm-bank'),
        contains('31350'),
        reason: 'все пять видов, как в вебе',
      );
      await tester.tap(find.byKey(const Key('sm-start')));
      await tester.pump();
      final deck = buildDeck(corpus, 1, seed: 1);
      expect(text(tester, 'sm-count'), endsWith('1/${deck.length}'));
      await wait(tester, 800);
      await play(tester, deck.first, deck.first.solutions.first);
      expect(text(tester, 'sm-verdict'), contains('✓'));
      await wait(tester, 600);
      expect(text(tester, 'sm-count'), endsWith('2/${deck.length}'));
      expect(text(tester, 'sm-verdict').trim(), isEmpty);
    },
  );

  testWidgets('🔴 подход целиком: итог с медианой, ступень выросла', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('sm-start')));
    await tester.pump();
    final deck = buildDeck(corpus, 1, seed: 1);
    for (final p in deck) {
      await wait(tester, 900);
      await play(tester, p, p.solutions.first);
      await wait(tester, 600);
    }
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byKey(const Key('sm-stars')), findsOneWidget);
    expect(
      text(tester, 'sm-median'),
      contains('0.9'),
      reason: 'медиана времени первого касания',
    );
    expect(
      text(tester, 'sm-solved'),
      endsWith('${deck.length}/${deck.length}'),
    );
    final next = find.descendant(
      of: find.byKey(const Key('sm-next')),
      matching: find.byType(Text),
    );
    expect(
      tester.widget<Text>(next).data,
      contains('2'),
      reason: 'дальше — вторая ступень',
    );
  });

  testWidgets('🔴 пауза останавливает игровые часы', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('sm-start')));
    await tester.pump();
    await wait(tester, 1000);
    await tester.tap(find.byIcon(Icons.pause));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    // Минута в паузе — время позиции стоять обязано.
    for (var i = 0; i < 5; i++) {
      await wait(tester, 12000);
    }
    await tester.tap(find.byKey(const Key('pause-resume')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await wait(tester, 0);
    final left = double.parse(text(tester, 'sm-count').split(' ').first);
    expect(
      left,
      closeTo(levelParams(1).seconds - 1.0, 0.3),
      reason: 'минута паузы не съела время',
    );
    expect(
      text(tester, 'sm-verdict').trim(),
      isEmpty,
      reason: 'и промаха по времени нет',
    );
  });

  testWidgets('подсказка появляется на половине времени', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('sm-start')));
    await tester.pump();
    await wait(tester, 500);
    expect(find.byKey(const Key('sm-hint')), findsNothing);
    await wait(tester, levelParams(1).seconds * 500);
    expect(find.byKey(const Key('sm-hint')), findsOneWidget);
    await tester.tap(find.byKey(const Key('sm-hint')));
    await tester.pump();
    expect(find.byKey(const Key('sm-hint-used')), findsOneWidget);
  });

  testWidgets('без единого касания подход не считается — назад в настройку', (
    tester,
  ) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('sm-start')));
    await tester.pump();
    final deck = buildDeck(corpus, 1, seed: 1);
    for (var i = 0; i < deck.length; i++) {
      await wait(tester, levelParams(1).seconds * 1000 + 50);
      await wait(tester, 1500);
    }
    await wait(tester, 100);
    expect(find.byKey(const Key('sm-start')), findsOneWidget);
    expect(find.byKey(const Key('sm-stars')), findsNothing);
  });

  testWidgets('режим «узор»: вопрос — мат из партий, имя узора названо', (
    tester,
  ) async {
    await open(tester);
    final motif = corpus.namedMotifs.first;
    await tester.tap(find.byKey(const Key('sm-mode')));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining(L.t(motifKey[motif]!)).last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('sm-start')));
    await tester.pump();
    expect(text(tester, 'sm-question'), L.t('scholarsMateAsk'));
    final first = buildNamedDeck(corpus, motif, 1, seed: 1).first;
    expect(first.motif, isNotNull, reason: 'у позиции пула записан узор');
    expect(text(tester, 'sm-motif'), L.t(motifKey[first.motif]!));
  });

  testWidgets(
    '«обычно»: медиана пяти последних подходов ступени, в ключе веба',
    (tester) async {
      await open(
        tester,
        prefs: {'psygames_scholars_medians_1': '[1000,1200,1100]'},
      );
      await tester.tap(find.byKey(const Key('sm-start')));
      await tester.pump();
      final deck = buildDeck(corpus, 1, seed: 1);
      for (final p in deck) {
        await wait(tester, 900);
        await play(tester, p, p.solutions.first);
        await wait(tester, 600);
      }
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      // Прошлые 1000, 1200, 1100 и этот 900 → медиана 1050 → «1.1», как в вебе.
      expect(
        text(tester, 'sm-median'),
        contains(L.f('scholarsUsually', {'n': '4'})),
      );
      expect(text(tester, 'sm-median'), endsWith('1.1 ${L.t('secShort')}'));
    },
  );

  testWidgets('на ступени, где открывается узор, он назван на карточке', (
    tester,
  ) async {
    await open(tester, prefs: {'psygames_scholars_mate_level_nzt48': '6'});
    expect(find.byKey(const Key('sm-new-motif')), findsOneWidget);
    expect(
      text(tester, 'sm-new-motif'),
      contains(L.t(motifKey['queenKnight']!)),
    );
  });
}

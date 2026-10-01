import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/game_clock_fake.dart';

import 'package:psygames_flutter/games/chess_blind/game.dart';
import 'package:psygames_flutter/games/chess_blind/ladder.dart';
import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_blind/screen.dart';
import 'package:psygames_flutter/shell/hybrid_app.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// ЭКРАН «ДОСКИ В УМЕ» — ПАРТИЯ НАЖАТИЯМИ НА ИГРОВЫХ ЧАСАХ.
///
/// Каждая проба стоит на одной фазе веба (`startGame` → `beginMask` →
/// `beginQuiz` → `finishGame`) и мерит то, что видит человек: где фишка после
/// хода, сколько кнопок-вариантов, что открылось после ответа, куда ушла
/// ступень. Перенос 24.09 зеленел пробами правил при заглушке экрана, —
/// поэтому здесь только поведение экрана.
///
/// ⚠️ Ответы проба знает из ДВОЙНИКА партии: экран собирает её из `Random(seed)`
/// ровно одним вызовом, и `ChessBlindGame.start` с тем же сидом даёт ту же
/// позицию, те же ходы и те же вопросы.
void main() {
  late PositionCorpus corpus;
  var clock = 0;

  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
  });

  setUp(() async {
    await L.load('ru');
    clock = 0;
  });

  Future<SharedState> open(
    WidgetTester tester, {
    int level = 1,
    int seed = 4,
  }) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues({
      'psygames_chess_blind_level_nzt48': '$level',
    });
    final state = await SharedState.open();
    useFakeGameClock(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: ChessBlindScreen(
          state: state,
          corpus: corpus,
          random: Random(seed),
          clock: () => clock,
        ),
      ),
    );
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return state;
  }

  ChessBlindGame twin(int level, int seed) =>
      ChessBlindGame.start(level: level, corpus: corpus, random: Random(seed));

  /// Двигаем игровые часы и таймер тика вместе.
  Future<void> wait(WidgetTester tester, int ms) async {
    const step = 50;
    for (var t = 0; t < ms; t += step) {
      clock += step;
      await tester.pump(const Duration(milliseconds: step));
    }
  }

  /// До вопросов: показ, ходы, хвост.
  int untilQuiz(PuzzleLevelParams p, int moves) =>
      p.exposeSec * 1000 +
      (moves == 0
          ? blindNoMovesMs
          : blindFirstMs + moves * blindStepMs + blindTailMs) +
      150;

  /// Клетки, где стоит фишка маски, — по ключу `cb-sq-disc-<клетка>-<сторона>`.
  Set<int> discs(WidgetTester tester) => {
    for (final e
        in find
            .byWidgetPredicate(
              (w) =>
                  w.key is ValueKey<String> &&
                  (w.key! as ValueKey<String>).value.startsWith('cb-sq-disc-'),
            )
            .evaluate())
      int.parse((e.widget.key! as ValueKey<String>).value.split('-')[3]),
  };

  Finder options() => find.byWidgetPredicate(
    (w) =>
        w.key is ValueKey<String> &&
        (w.key! as ValueKey<String>).value.startsWith('cb-opt-'),
  );

  Future<void> start(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('cb-start')));
    await tester.pump();
  }

  testWidgets(
    '🔴 настройка называет участок и полосу фигур ступени из общей памяти',
    (tester) async {
      await open(tester, level: 7);
      expect(
        tester.widget<Text>(find.byKey(const Key('cb-stage'))).data,
        contains('7'),
      );
      final band = puzzlePiecesBand(puzzleLevelParams(7).pieces);
      expect(
        tester.widget<Text>(find.byKey(const Key('cb-level-bits'))).data,
        contains('${band.min}–${band.max}'),
      );
      expect(find.byKey(const Key('cb-mode-series')), findsOneWidget);
    },
  );

  testWidgets('🔴 показ идёт секунды ступени, потом маска и ходы ПО ОДНОМУ', (
    tester,
  ) async {
    const level = 16;
    const seed = 8;
    await open(tester, level: level, seed: seed);
    final game = twin(level, seed);
    await start(tester);
    final p = puzzleLevelParams(level);
    expect(
      discs(tester),
      isEmpty,
      reason: 'на показе видны фигуры, а не фишки',
    );
    await wait(tester, p.exposeSec * 1000 - 200);
    expect(discs(tester), isEmpty, reason: 'маска раньше срока');
    await wait(tester, 300);
    expect(
      discs(tester),
      game.start.map((x) => x.sq).toSet(),
      reason: 'фишки стоят там, где показали фигуры',
    );
    // Первый ход: подсветка с 600 мс, фишка переезжает на 1050-й.
    await wait(tester, 800);
    expect(
      discs(tester),
      game.start.map((x) => x.sq).toSet(),
      reason: 'фишка уехала раньше, чем показали, откуда и куда',
    );
    await wait(tester, 400);
    expect(
      discs(tester),
      game.piecesAfter(1).map((x) => x.sq).toSet(),
      reason: 'после первого хода — ровно первый ход',
    );
    expect(
      tester.widget<Text>(find.byKey(const Key('cb-hint'))).data,
      contains('1/${game.moves.length}'),
    );
    await wait(tester, blindStepMs);
    expect(
      discs(tester),
      game.piecesAfter(2).map((x) => x.sq).toSet(),
      reason: 'второй ход — через шаг',
    );
  });

  testWidgets(
    '🔴 «что стоит на поле»: варианты по ступени, после ответа фишка открывается',
    (tester) async {
      const level = 6;
      const seed = 3;
      await open(tester, level: level, seed: seed);
      final game = twin(level, seed);
      await start(tester);
      final p = puzzleLevelParams(level);
      await wait(tester, untilQuiz(p, game.moves.length));
      expect(
        options(),
        findsNWidgets(p.optionCount),
        reason: 'вариантов столько, сколько велит ступень',
      );
      expect(
        find.byKey(const Key('cb-ask-square')),
        findsOneWidget,
        reason: 'клетка названа словами',
      );
      final masked = discs(tester).length;
      final q = game.questions.first;
      // Неверный вариант: фишка открывается, промах виден.
      final wrong = q.options.firstWhere(
        (k) => k != '${q.type}${q.white ? 'w' : 'b'}',
      );
      await tester.tap(find.byKey(Key('cb-opt-$wrong')));
      await tester.pump();
      expect(
        discs(tester).length,
        masked - 1,
        reason: 'после ответа фишка перевернулась в фигуру',
      );
      expect(
        discs(tester).contains(q.sq),
        isFalse,
        reason: 'открылась не та клетка',
      );
      await wait(tester, revealPickWrongMs + 100);
      expect(
        discs(tester).length,
        masked,
        reason: 'следующий вопрос — снова под маской',
      );
    },
  );

  testWidgets('🔴 все ответы верные → ступень растёт в общей памяти', (
    tester,
  ) async {
    const level = 3;
    const seed = 12;
    final state = await open(tester, level: level, seed: seed);
    final game = twin(level, seed);
    await start(tester);
    await wait(tester, untilQuiz(game.params, game.moves.length));
    for (final q in game.questions) {
      await tester.tap(
        find.byKey(Key('cb-opt-${q.type}${q.white ? 'w' : 'b'}')),
      );
      await tester.pump();
      await wait(tester, revealPickRightMs + 100);
    }
    await wait(tester, 200);
    expect(
      find.byKey(const Key('cb-stars')),
      findsOneWidget,
      reason: 'партия дошла до итога',
    );
    expect(tester.widget<Text>(find.byKey(const Key('cb-stars'))).data, '★★★');
    expect(
      state.get('psygames_chess_blind_level_nzt48'),
      '${level + 1}',
      reason: 'ступень не выросла',
    );
  });

  testWidgets(
    '🔴 с 11-й: помеха-счёт без доски, затем «розыск» касанием; два промаха — ступень не растёт',
    (tester) async {
      const level = 11;
      const seed = 6;
      final state = await open(tester, level: level, seed: seed);
      final game = twin(level, seed);
      await start(tester);
      await wait(tester, untilQuiz(game.params, game.moves.length));
      expect(
        find.byKey(const Key('cb-interf-example')),
        findsOneWidget,
        reason: 'на 11-й — счёт между ходами и вопросами',
      );
      expect(
        find.byKey(const Key('cb-sq-0')),
        findsNothing,
        reason: 'во время помехи доски нет',
      );
      await tester.tap(find.byKey(const Key('cb-interf-no')));
      await tester.pump();
      expect(find.byKey(const Key('cb-interf-example')), findsNothing);
      var i = 0;
      for (final q in game.questions) {
        final target = i < 2 ? (q.sq + 9) % 64 : q.sq;
        await tester.tap(find.byKey(Key('cb-sq-$target')));
        await tester.pump();
        await wait(tester, revealLocateWrongMs + 100);
        i++;
      }
      await wait(tester, 200);
      expect(find.byKey(const Key('cb-stars')), findsOneWidget);
      expect(
        state.get('psygames_chess_blind_level_nzt48'),
        '$level',
        reason: 'два промаха — ступень та же',
      );
    },
  );

  testWidgets(
    '🔴 на экране нет сырых ключей словаря — ни в настройке, ни в опросе',
    (tester) async {
      // Сборщик словаря видит только литералы `L.t('…')`: собранный ключ имени
      // фигуры или вызов, разорванный переносом строки, показался бы как есть.
      final raw = RegExp(
        r'\b(chess|lvl|label_|hud_)[A-Za-z_]*[A-Z_][A-Za-z]*\b',
      );
      List<String> shown() => [
        for (final e in find.byType(Text).evaluate()) ...[
          (e.widget as Text).data ?? '',
        ],
        for (final e in find.byType(Semantics).evaluate())
          (e.widget as Semantics).properties.label ?? '',
      ].where(raw.hasMatch).toList();
      const level = 6;
      const seed = 3;
      await open(tester, level: level, seed: seed);
      expect(shown(), isEmpty, reason: 'настройка');
      final game = twin(level, seed);
      await start(tester);
      await wait(tester, untilQuiz(game.params, game.moves.length));
      expect(shown(), isEmpty, reason: 'опрос');
    },
  );

  testWidgets('🔴 пауза останавливает показ: поверх экрана время не идёт', (
    tester,
  ) async {
    await open(tester, level: 1);
    await start(tester);
    final nav = tester.state<NavigatorState>(find.byType(Navigator));
    nav.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('пауза')),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await wait(tester, 20000);
    nav.pop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    await wait(tester, 100);
    expect(
      discs(tester),
      isEmpty,
      reason: 'показ кончился, пока партия стояла под паузой',
    );
  });

  test('🔴 /games/chess-blind открывается нативно — партия и серия перенесены целиком', () {
    // Сторож стоял обратным с 30.09 (перехват снимали, пока экран был заглушкой).
    // Снят тем же коммитом, что включил маршрут: партию и серию держат пробы выше
    // и chess_blind_series_screen_test.dart.
    expect(HybridApp.native.containsKey('/games/chess-blind'), isTrue);
  });
}

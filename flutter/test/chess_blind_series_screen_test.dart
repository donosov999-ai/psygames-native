import 'dart:io';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/game_clock_fake.dart';

import 'package:psygames_flutter/games/chess_blind/positions.dart';
import 'package:psygames_flutter/games/chess_common/board.dart';
import 'package:psygames_flutter/games/chess_blind/series.dart';
import 'package:psygames_flutter/games/chess_blind/series_run.dart';
import 'package:psygames_flutter/games/chess_blind/series_screen.dart';
import 'package:psygames_flutter/games/chess_blind/series_strings.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// СЕРИЯ «ДОСКИ В УМЕ» — ЗАМЕР, РАДИ КОТОРОГО ОНА ЕСТЬ.
///
/// Перенос 24.09 показывал вопросы без часов и без доски — серия не мерила
/// ничего, а проба зеленела на строке `seriesDone`, выведенной сырым ключом.
/// Здесь часы поддельные: время каждого блока задаёт проба, и разности на итоге
/// обязаны совпасть с ним до десятой секунды. Ответы проба знает из той же
/// сборки вопросов (`buildBlockQuestions` с тем же зерном), что у экрана.
void main() {
  late PositionCorpus corpus;
  late ChessBlindText text;
  var clock = 0;
  const seed = 42;

  setUpAll(() {
    corpus = PositionCorpus.parse(
      File('assets/chess_blind/positions.json').readAsStringSync(),
    );
    text = ChessBlindText.parse(
      File('assets/chess_blind/strings.json').readAsStringSync(),
      'ru',
    );
  });

  setUp(() async {
    await L.load('ru');
    clock = 0;
  });

  Future<SharedState> open(
    WidgetTester tester, {
    Map<String, Object> prefs = const {},
  }) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    SharedPreferences.setMockInitialValues(prefs);
    final state = await SharedState.open();
    // Пустой кадр: иначе второй вызов переиспользует состояние прежнего экрана.
    await tester.pumpWidget(const SizedBox());
    useFakeGameClock(tester);
    await tester.pumpWidget(
      MaterialApp(
        home: ChessBlindSeriesScreen(
          state: state,
          corpus: corpus,
          text: text,
          seed: seed,
          clock: () => clock,
        ),
      ),
    );
    for (var i = 0; i < 4; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    return state;
  }

  Future<void> wait(WidgetTester tester, int ms) async {
    const step = 100;
    for (var t = 0; t < ms; t += step) {
      clock += step;
      await tester.pump(const Duration(milliseconds: step));
    }
  }

  /// Вопросы блока — той же сборкой, что у экрана.
  List<SeriesQuestion> questions(ChessSeriesProgress p, int block) {
    final entry = seriesEntry(p);
    final squares = coreSquaresFromFen(
      corpus.pickRandom(entry.band, Random(seed)).fen,
    );
    return buildBlockQuestions(
      squares: squares,
      level: entry.level,
      blockIndex: block,
      random: lcg(seed + block * 7919),
    );
  }

  /// Ответить на весь блок за [ms] игрового времени: [wrong] первых — неверно.
  Future<void> playBlock(
    WidgetTester tester,
    List<SeriesQuestion> qs,
    int ms, {
    int wrong = 0,
  }) async {
    final per = ms ~/ qs.length;
    for (var i = 0; i < qs.length; i++) {
      await wait(tester, per);
      final say = i < wrong ? !qs[i].answer : qs[i].answer;
      await tester.tap(find.byKey(Key(say ? 'cbs-yes' : 'cbs-no')));
      await tester.pump();
    }
  }

  Future<void> throughInterlude(WidgetTester tester) async {
    expect(
      find.byKey(const Key('cbs-interlude')),
      findsOneWidget,
      reason: 'между блоками — врезка',
    );
    expect(
      find.byKey(const Key('cbs-sq-0')),
      findsOneWidget,
      reason: 'во врезке показана та же позиция',
    );
    // Ровно срок врезки: лишнее ожидание честно ушло бы в часы блока.
    await wait(tester, seriesInterludeMs);
  }

  testWidgets(
    '🔴 во время вопросов доски НЕТ: цвет поля мерится в уме, а не глазами',
    (tester) async {
      await open(tester);
      expect(find.byKey(const Key('cbs-question')), findsOneWidget);
      expect(
        find.byKey(const Key('cbs-sq-0')),
        findsNothing,
        reason: 'доска выдала бы ответ',
      );
      // Подсказка «пустая доска» рисует клетки, но не фигуры.
      await open(
        tester,
        prefs: {'psygames_chess_assist_nzt48': '{"board":true,"coords":true}'},
      );
      expect(find.byKey(const Key('cbs-sq-0')), findsOneWidget);
      expect(
        find.byType(ChessPieceImage),
        findsNothing,
        reason: 'на подсказке клетки без фигур',
      );
    },
  );

  testWidgets(
    '🔴 полная серия: разности T₂−T₁ и T₃−T₁ равны заданному времени; врезка и показ вне часов',
    (tester) async {
      final state = await open(tester);
      final p = ChessSeriesProgress.empty;
      await playBlock(tester, questions(p, 0), 3200);
      await throughInterlude(tester);
      await playBlock(tester, questions(p, 1), 5600);
      await throughInterlude(tester);
      // «Память»: сперва человек сам начинает показ, потом 8 с позиции — вне часов.
      expect(find.byKey(const Key('cbs-memorize-start')), findsOneWidget);
      await wait(tester, 3000); // раздумье перед «Начать» в замер не идёт
      await tester.tap(find.byKey(const Key('cbs-memorize-start')));
      await tester.pump();
      expect(find.byKey(const Key('cbs-memorize')), findsOneWidget);
      expect(
        find.byKey(const Key('cbs-sq-0')),
        findsOneWidget,
        reason: 'позицию показывают перед вопросами',
      );
      await wait(tester, seriesRecallExposeMs);
      await playBlock(tester, questions(p, 2), 4000, wrong: 1);

      expect(find.byKey(const Key('cbs-result')), findsOneWidget);
      String line(String key) =>
          tester.widget<Text>(find.byKey(Key(key))).data!;
      expect(line('cbs-t1'), contains('3.2'));
      expect(
        line('cbs-knight-cost'),
        contains('+2.4'),
        reason: 'цена правила хода = T₂ − T₁',
      );
      expect(
        line('cbs-hold-cost'),
        contains('+0.8'),
        reason: 'цена удержания = T₃ − T₁',
      );
      final saved = ChessSeriesProgress.parse(
        state.get('psygames_chess_blind_series_nzt48'),
      );
      expect(saved.streaks, {
        'square': 1,
        'knight': 1,
        'recall': 1,
      }, reason: 'взятые блоки копят серию');
      expect(
        saved.levels['square'],
        1,
        reason: 'одна серия уровень не поднимает',
      );
    },
  );

  testWidgets(
    '🔴 вторая устойчивая серия поднимает полосу; ошибок больше допуска — блок держит',
    (tester) async {
      final state = await open(
        tester,
        prefs: {
          'psygames_chess_blind_series_nzt48': '{"levels":{"square":1,"knight":1,"recall":1},"streaks":{"square":1,"knight":1,"recall":1}}',
        },
      );
      final p = ChessSeriesProgress.parse(
        state.get('psygames_chess_blind_series_nzt48'),
      );
      await playBlock(tester, questions(p, 0), 2000);
      await throughInterlude(tester);
      await playBlock(tester, questions(p, 1), 2000);
      await throughInterlude(tester);
      await tester.tap(find.byKey(const Key('cbs-memorize-start')));
      await tester.pump();
      await wait(tester, seriesRecallExposeMs);
      await playBlock(tester, questions(p, 2), 2000);
      final saved = ChessSeriesProgress.parse(
        state.get('psygames_chess_blind_series_nzt48'),
      );
      expect(saved.levels, {
        'square': 2,
        'knight': 2,
        'recall': 2,
      }, reason: 'две устойчивые серии — полоса вверх');
      expect(
        tester.widget<Text>(find.byKey(const Key('cbs-level-move'))).data,
        text.t('levelUp', {'min': 9, 'max': 14}),
      );
    },
  );

  testWidgets(
    '🔴 выход посреди серии: итог без разностей, прогресс не трогается',
    (tester) async {
      final state = await open(tester);
      final p = ChessSeriesProgress.empty;
      await playBlock(tester, questions(p, 0), 2000);
      await throughInterlude(tester);
      // Уход через меню паузы.
      // Тикающие часы не дают кадрам «успокоиться» — поэтому pump, а не pumpAndSettle.
      await tester.tap(find.byIcon(Icons.pause));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.text(L.t('exitConfirmLeave')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await wait(tester, 200);
      expect(
        find.byKey(const Key('cbs-not-finished')),
        findsOneWidget,
        reason: 'неполная серия — без разностей',
      );
      expect(find.byKey(const Key('cbs-knight-cost')), findsNothing);
      expect(
        state.get('psygames_chess_blind_series_nzt48'),
        ChessSeriesProgress.empty.encode(),
      );
    },
  );

  testWidgets('на экране серии нет сырых ключей словаря', (tester) async {
    await open(tester);
    final raw = RegExp(r'^(block|rule|ask|series|memorize|answer)[A-Z]\w*$');
    final shown = [
      for (final e in find.byType(Text).evaluate())
        (e.widget as Text).data ?? '',
    ].where((s) => raw.hasMatch(s) || s.contains('{')).toList();
    expect(shown, isEmpty);
  });
}

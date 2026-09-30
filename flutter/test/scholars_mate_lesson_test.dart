import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/scholars_mate/check.dart';
import 'package:psygames_flutter/games/scholars_mate/deck.dart';
import 'package:psygames_flutter/games/scholars_mate/ladder.dart';
import 'package:psygames_flutter/games/scholars_mate/lesson.dart';
import 'package:psygames_flutter/games/scholars_mate/screen.dart';
import 'package:psygames_flutter/shell/l10n.dart';
import 'package:psygames_flutter/shell/lesson.dart';
import 'package:psygames_flutter/shell/lesson_player.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// РАЗБОР «ДЕТСКОГО МАТА» — ЧЕМ МЕРИТСЯ, ЧТО ОН УЧИТ ДЕЛУ (задача 7120f6d8).
///
/// Три вопроса, и ни один не «есть ли шаги»:
///   1. НАЗВАН ЛИ КАЖДЫЙ ШАГ ПРИЁМОМ — числом «названных из всех»: разбор,
///      показывающий ответ по ходам, выглядит так же, как учащий, и не учит.
///   2. ЗАСЧИТЫВАЕТ ЛИ ИГРА КАЖДЫЙ ХОД РАЗБОРА — той же функцией, что ответ
///      человека: мат — `check(...).mated`, защита — `check(...).correct`,
///      угроза — `threatAnswer`. Разбор не вправе учить ходу, за который игра
///      ставит «мимо».
///   3. ДОХОДИТ ЛИ СЛОВО ДО ЭКРАНА — строка шага не ключ и без `{…}`: ключ,
///      не попавший в словарь приложения, плеер показал бы как есть.
void main() {
  final corpus = ScholarsCorpus.fromJson(
    jsonDecode(File('assets/scholars_mate/puzzles.json').readAsStringSync())
        as Map<String, dynamic>,
  );

  setUp(() async {
    await L.load('ru');
    SharedPreferences.setMockInitialValues({});
    LessonUsed.reset();
  });

  /// Сколько позиций каждого вида прогоняется.
  const perKind = 60;

  /// 🔴 РАВНОМЕРНО ПО ВСЕМУ НАБОРУ, А НЕ ПЕРВЫЕ. Корпус упорядочен: первые 60
  /// «угроз» — все с ответом «да», и проба на обе ветки краснела не от разбора,
  /// а от выборки (замер 30.09.2026).
  List<ScholarsPuzzle> sample(ScholarsKind kind) {
    final all = corpus.of(kind);
    final n = all.length < perKind ? all.length : perKind;
    return [for (var i = 0; i < n; i++) all[i * all.length ~/ n]];
  }

  test('🔴 каждый шаг назван приёмом, и строка дошла из словаря', () {
    var named = 0;
    var total = 0;
    final raw = <String>[];
    for (final kind in ScholarsKind.values) {
      for (final p in sample(kind)) {
        for (final s in scholarsLessonSteps(p)) {
          total++;
          final key = s.techniqueKey;
          final text = s.text ?? '';
          if (key != null && scholarsLessonKeys.contains(key)) named++;
          // Ключ, не попавший в словарь, `L.f` вернул бы как есть.
          if (text.isEmpty || text.contains('{') || text.contains('teachScholars')) {
            raw.add('${kind.name}: $text');
          }
        }
      }
    }
    expect(total, greaterThan(0));
    expect(named, total, reason: 'названо приёмом $named из $total шагов');
    expect(raw, isEmpty, reason: 'строки не из словаря: ${raw.take(5).join(' | ')}');
  });

  test('🔴 мат в разборе — мат по проверке игры, и каждый вид разбирается', () {
    final covered = <ScholarsKind, int>{};
    for (final kind in [ScholarsKind.mate, ScholarsKind.fromGames, ScholarsKind.sacrifice]) {
      for (final p in sample(kind)) {
        final steps = scholarsLessonSteps(p);
        if (steps.isEmpty) continue;
        covered[kind] = (covered[kind] ?? 0) + 1;
        final last = steps.last.payload as ScholarsLessonFrame;
        expect(steps.last.techniqueKey, 'teachScholarsMate');
        if (p.line.length > 1) {
          // Связку доигрываем той же функцией, что экран: ход, ответ, ход — до мата.
          var fen = shownFen(p);
          var mated = false;
          for (final uci in p.line) {
            final r = playLineStep(fen, uci, null);
            fen = r.fen;
            mated = r.mated;
          }
          expect(mated, isTrue, reason: '${kind.name}: связка не матует');
          expect(last.fen, fen);
        } else {
          final move = '${last.from}${last.to}';
          final accepted = p.solutions.any((s) => s.startsWith(move) && check(p, s).mated);
          expect(accepted, isTrue, reason: '${kind.name}: ход разбора $move игра матом не засчитывает');
        }
      }
    }
    for (final kind in [ScholarsKind.mate, ScholarsKind.fromGames, ScholarsKind.sacrifice]) {
      // Пропуск позиции — только если её запись битая; массово — это провал разбора.
      expect(covered[kind] ?? 0, greaterThanOrEqualTo(perKind * 9 ~/ 10),
          reason: '${kind.name}: разобрано ${covered[kind] ?? 0} из $perKind');
    }
  });

  test('🔴 угроза: вывод разбора совпадает с ответом, который засчитает игра', () {
    var yes = 0;
    var no = 0;
    for (final p in sample(ScholarsKind.threat)) {
      final steps = scholarsLessonSteps(p);
      if (steps.isEmpty) continue;
      final verdict = steps.last.techniqueKey;
      expect(verdict, threatAnswer(p) ? 'teachScholarsThreatYes' : 'teachScholarsThreatNo');
      if (verdict == 'teachScholarsThreatYes') {
        yes++;
        // Показанный ход угрозы — действительно мат с нулевого хода.
        final f = steps.last.payload as ScholarsLessonFrame;
        final mate = mateInOne(passTurn(shownFen(p)));
        expect('${f.from}${f.to}', mate!.uci.substring(0, 4));
      } else {
        no++;
      }
    }
    // Разбор обязан показывать ОБА исхода: одна ветка — это подсказка ответа.
    expect(yes, greaterThan(0), reason: 'ни одного «да»');
    expect(no, greaterThan(0), reason: 'ни одного «нет»');
  });

  test('🔴 защита: ход разбора игра засчитывает как спасающий', () {
    var shown = 0;
    for (final p in sample(ScholarsKind.defend)) {
      final steps = scholarsLessonSteps(p);
      if (steps.isEmpty) continue;
      shown++;
      expect(steps.map((s) => s.techniqueKey), ['teachScholarsDefendThreat', 'teachScholarsDefend']);
      final f = steps.last.payload as ScholarsLessonFrame;
      final uci = '${f.from}${f.to}';
      final full = completeMove(shownFen(p), uci);
      expect(check(p, full).correct, isTrue, reason: 'защита $uci не спасает по проверке игры');
    }
    expect(shown, greaterThanOrEqualTo(perKind * 9 ~/ 10), reason: 'защита разобрана в $shown из $perKind');
  });

  test('разбор колоды: по примеру каждого вида ступени, не больше трёх', () {
    for (final level in [1, 5, 12, 20, 30, 40]) {
      final deck = buildDeck(corpus, level, seed: 7);
      final steps = scholarsLessonFromDeck(deck);
      expect(steps, isNotEmpty, reason: 'ступень $level: разбора нет');
      final kinds = levelParams(level).kinds.toSet();
      final starts = steps.where((s) => s.techniqueKey == 'teachScholarsKing' ||
          s.techniqueKey == 'teachScholarsThreatAsk' ||
          s.techniqueKey == 'teachScholarsDefendThreat');
      expect(starts.length, kinds.length < 3 ? kinds.length : 3,
          reason: 'ступень $level: примеров ${starts.length} при видах $kinds');
    }
  });

  testWidgets('🔴 кнопка разбора стоит ДО партии и открывает шаги на доске игры', (tester) async {
    tester.view.physicalSize = const Size(780, 1688);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final state = await SharedState.open();
    await tester.pumpWidget(MaterialApp(
      home: ScholarsMateScreen(state: state, corpus: corpus, clock: () => 0, seed: 3),
    ));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 50));
    }
    // Партия не начата: на экране настройка, а разбор уже есть.
    expect(find.byKey(const Key('sm-start')), findsOneWidget);
    expect(find.byKey(const Key('game-lesson')), findsOneWidget);

    await tester.tap(find.byKey(const Key('game-lesson')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(LessonPlayerScreen), findsOneWidget);
    expect(LessonUsed.inRound, isTrue, reason: 'партия после разбора не должна засчитываться');
    final first = tester.widget<Text>(find.byKey(const Key('lesson-text'))).data!;
    expect(first, isNot(contains('teach')), reason: 'на экране ключ вместо приёма: $first');
    // Доска шага — доска игры, с полем, куда смотреть.
    expect(find.byKey(const Key('sml-0')), findsOneWidget);

    await tester.tap(find.byKey(const Key('lesson-next')));
    await tester.pump(const Duration(milliseconds: 100));
    final second = tester.widget<Text>(find.byKey(const Key('lesson-text'))).data!;
    expect(second, isNot(first), reason: 'следующий шаг не сменил объяснение');

    await tester.tap(find.byKey(const Key('lesson-close')));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byKey(const Key('sm-start')), findsOneWidget, reason: 'после разбора — назад к настройке');
  });
}

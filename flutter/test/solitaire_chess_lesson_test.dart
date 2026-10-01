import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/solitaire_chess/ladder.dart';
import 'package:psygames_flutter/games/solitaire_chess/lesson.dart';
import 'package:psygames_flutter/games/solitaire_chess/puzzle.dart';
import 'package:psygames_flutter/shell/l10n.dart';

/// РАЗБОР «ШАХМАТНОГО ПАСЬЯНСА»: каждый ход — из решения, у шага есть имя приёма,
/// и доля безымянных шагов («решение ещё есть») — числом, а не на глаз.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final corpus = SolitaireCorpus.parse(
    File('assets/solitaire_chess/puzzles.json').readAsStringSync(),
  );
  setUp(() async => L.load('ru'));

  test('все 720 досок: путь разбора решает доску, выживший назван верно', () {
    final unnamed = <int, int>{};
    final total = <int, int>{};
    for (final p in corpus.puzzles) {
      final (path, keys) = solitaireExplainedSolution(p.board);
      expect(path.length, p.pieces - 1, reason: p.code);
      var x = p.board;
      for (final (f, t) in path) {
        expect(
          x.capturesFrom(f),
          contains(t),
          reason: '${p.code}: ход не по правилам',
        );
        x = x.play(f, t);
      }
      expect(x.solved, isTrue, reason: p.code);
      expect(keys.last, 'teachSolLast');
      total[p.pieces] = (total[p.pieces] ?? 0) + keys.length;
      unnamed[p.pieces] =
          (unnamed[p.pieces] ?? 0) +
          keys.where((k) => k == 'teachSolSafe').length;
    }
    final all = total.values.fold(0, (a, b) => a + b);
    final none = unnamed.values.fold(0, (a, b) => a + b);
    // ignore: avoid_print
    print(
      'безымянных шагов: $none из $all · по фигурам: ${[for (final k in total.keys.toList()..sort()) '$k: ${unnamed[k]}/${total[k]}'].join(', ')}',
    );
    expect(
      none / all,
      lessThan(0.15),
      reason: 'разбор без имени приёма — показ ответа',
    );
  });

  test('шаги разбора: правило, план с выжившей фигурой, ходы словами', () {
    final p = corpus.puzzles.firstWhere((p) => p.pieces == 6 && p.band == 2);
    final steps = solitaireLessonSteps(p);
    expect(steps.length, 2 + p.pieces - 1);
    expect(steps[0].techniqueKey, 'teachSolRule');
    expect(steps[1].techniqueKey, 'teachSolPlan');
    final (path, _) = solitaireExplainedSolution(p.board);
    var x = p.board;
    for (final m in path) {
      x = x.play(m.$1, m.$2);
    }
    final lastLetter = x.cells.values.single;
    expect(
      steps[1].text,
      contains(L.t(solitairePieceKeys[lastLetter]!)),
      reason: 'план называет ту фигуру, что останется',
    );
    expect(steps[2].text, startsWith('Ход 1: '));
    expect(steps[2].text, matches(RegExp(r'[a-d][1-4]×[a-d][1-4]')));
    expect(
      steps.every((s) => !s.text!.contains('{')),
      isTrue,
      reason: 'подстановки заполнены',
    );
  });

  test(
    'приём «до цели достаёт только эта фигура» — по правилам, не по слову',
    () {
      // Ладья a4 достаёт d4 одна, остальное — для проверки.
      final b = SolitaireBoard.parse('R..N........P..B');
      final key = solitaireMoveKey(b, (0, 3), survivorFrom: -1);
      final into = b.captures.where((c) => c.$2 == 3).length;
      expect(into, 1);
      expect([
        'teachSolLoneTarget',
        'teachSolOnlySafe',
        'teachSolOnlyCapture',
      ], contains(key));
    },
  );

  test('разбор ступени — доски того же подхода, что «Начать»', () {
    final steps = solitaireLessonForLevel(corpus, 9, seed: 5);
    final deck = solitaireDeckFor(
      corpus,
      9,
      seed: 5,
      count: solitaireLessonExamples,
    );
    expect(steps.length, deck.fold(0, (s, p) => s + 2 + p.pieces - 1));
    expect((steps.first.payload as SolitaireLessonFrame).code, deck.first.code);
  });
}

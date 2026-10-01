import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/go_capture/game.dart';
import 'package:psygames_flutter/games/go_capture/ladder.dart';
import 'package:psygames_flutter/games/go_capture/lesson.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';

/// «ГО: ЗАХВАТ» — ПРОБЫ КОРПУСА, ПОДХОДА И РАЗБОРА (задача 66dee70c).
void main() {
  final corpus = GoCaptureCorpus.parse(
    File('assets/go_capture/puzzles.json').readAsStringSync(),
  );

  test('корпус: 8 групп × 3 трети, в каждой ступени хватает на колоду', () {
    expect(corpus.puzzles.length, 240);
    for (var g = 0; g < 8; g++) {
      for (var b = 0; b < 3; b++) {
        expect(
          corpus.puzzles.where((p) => p.group == g && p.band == b).length,
          greaterThanOrEqualTo(goCaptureDeck),
          reason: 'группа $g, треть $b',
        );
      }
    }
    expect(goCaptureStep(24), (group: 7, band: 2));
    // Русские строки «за {n} хода» верны только для 2–4: шире корпус — меняй словарь.
    expect({for (final p in corpus.puzzles) p.moves}, {2, 3, 4});
  });

  test('🔴 каждая задача доказана заново: захват за N, за N−1 — нет, ключ единственный', () {
    var proved = 0;
    for (final p in corpus.puzzles) {
      final s = CaptureSolver(nodeLimit: 400000);
      final pos = p.position;
      expect(pos.at(p.target), goWhite, reason: 'задача ${p.id}');
      expect(s.captures(pos, p.target, p.moves), GoVerdict.yes, reason: 'задача ${p.id}');
      expect(s.captures(pos, p.target, p.moves - 1), GoVerdict.no, reason: 'задача ${p.id}');
      expect(s.winningMoves(pos, p.target, p.moves), [p.key], reason: 'задача ${p.id}');
      proved++;
    }
    expect(proved, 240);
  });

  GoCaptureRun runOf(GoCapturePuzzle p, int Function() now) =>
      GoCaptureRun(level: 1, deck: [p], now: now);

  /// Сыграть линию решателя касаниями: чёрные — касанием, белые — сами через 550 мс.
  void playLine(GoCaptureRun run, GoCapturePuzzle p, void Function(int) wait) {
    final line = goCaptureLine(p);
    for (var i = 0; i < line.length; i += 2) {
      run.tap(line[i]);
      expect(run.verdict, anyOf(isNull, GoCaptureVerdict.solved), reason: 'задача ${p.id}, ход $i');
      if (run.verdict == GoCaptureVerdict.solved) return;
      wait(GoCaptureRun.replyMs + 10);
      run.tick();
      if (i + 1 < line.length) {
        expect(run.lastMove, line[i + 1] < 0 ? null : line[i + 1], reason: 'ответ белых — тот же, что в линии');
      }
    }
  }

  test('🔴 подход: линия решателя касаниями снимает группу во всех 240 задачах', () {
    for (final p in corpus.puzzles) {
      var t = 0;
      final run = runOf(p, () => t);
      playLine(run, p, (ms) => t += ms);
      expect(run.verdict, GoCaptureVerdict.solved, reason: 'задача ${p.id}');
      expect(run.made, lessThanOrEqualTo(p.moves));
      t += 2000;
      run.tick();
      expect(run.finished, isTrue);
      expect(run.result!.clean, 1);
    }
  });

  test('🔴 ход, после которого захват не вынужден, — «так не взять»; «Заново» — исходная позиция', () {
    var checked = 0;
    for (final p in corpus.puzzles.where((x) => x.group <= 3)) {
      final pos = p.position;
      // Законный ход рядом с целью, кроме ключа: ключ у задачи единственный —
      // значит любой другой ход «так не взять».
      final bad = CaptureSolver()
          .candidates(pos, p.target)
          .where((m) => m != p.key && pos.play(m) != null)
          .firstOrNull;
      if (bad == null) continue;
      var t = 0;
      final run = runOf(p, () => t);
      run.tap(bad);
      expect(run.verdict, GoCaptureVerdict.wrong, reason: 'задача ${p.id}, ход $bad');
      run.tap(p.key);
      expect(run.made, 1, reason: 'после «так не взять» доска не принимает ходы');
      run.restart();
      expect(run.verdict, isNull);
      expect(run.made, 0);
      expect(run.position.points, pos.points);
      expect(run.retries, 1);
      checked++;
    }
    expect(checked, greaterThan(50));
  });

  test('«Дальше» после «так не взять» закрывает задачу нерешённой', () {
    final p = corpus.puzzles.first;
    var t = 0;
    final run = runOf(p, () => t);
    final bad = CaptureSolver()
        .candidates(p.position, p.target)
        .firstWhere((m) => m != p.key && p.position.play(m) != null);
    run.tap(bad);
    run.giveUp();
    t += 2000;
    run.tick();
    expect(run.finished, isTrue);
    expect(run.result!.solved, 0);
  });

  test('самоубийство и ко — касание не становится ходом и называет причину', () {
    // 5×5: чёрный в угол 0 между белыми 1 и 5 — самоубийство.
    final suicide = GoCapturePuzzle(
      id: -1,
      size: 5,
      board: '.O...O...........OO......',
      target: 17,
      moves: 2,
      key: 22,
      group: 0,
      band: 0,
    );
    var t = 0;
    final run = runOf(suicide, () => t);
    run.tap(0);
    expect(run.refusal, 'suicide');
    expect(run.made, 0);
    expect(run.position.at(0), goEmpty);
    // Ко: чёрные берут белый на 7 ходом 8; белые сразу отбить не могут, а чёрные
    // — вернуть позицию после ответа белых.
    final ko = GoPosition(4, [
      0, 1, 2, 0,
      1, 2, 0, 2,
      0, 1, 2, 0,
      0, 0, 0, 0,
    ]);
    final took = ko.play(6)!;
    expect(took.play(5), isNull);
    expect(
      GoPosition(4, took.points, toMove: goWhite).play(5),
      isNotNull,
      reason: 'без памяти о прошлой доске ход законен — значит запрет именно ко',
    );
  });

  test('подсказка: только с половины времени, пункт — доказанный ход', () {
    final p = corpus.puzzles.firstWhere((x) => x.group == 1);
    var t = 0;
    final run = runOf(p, () => t);
    expect(run.canHint, isFalse);
    run.takeHint();
    expect(run.hintPoint, isNull);
    t = goCaptureSeconds * 500 + 1;
    expect(run.canHint, isTrue);
    run.takeHint();
    expect(run.hintPoint, p.key);
    expect(run.hinted, isTrue);
    run.tap(p.key);
    expect(run.hintPoint, isNull);
  });

  test('время вышло — задача закрыта нерешённой', () {
    final p = corpus.puzzles.first;
    var t = 0;
    final run = runOf(p, () => t);
    t = goCaptureSeconds * 1000 + 1;
    run.tick();
    expect(run.verdict, GoCaptureVerdict.timeout);
    t += 2000;
    run.tick();
    expect(run.result!.solved, 0);
  });

  test('разбор: каждый шаг назван приёмом; запасных — меньшинство', () {
    var steps = 0, plain = 0;
    final used = <String, int>{};
    for (final p in corpus.puzzles) {
      final keys = goCaptureLineKeys(p);
      expect(keys.length, goCaptureLine(p).length);
      expect(keys.last, 'teachGcCapture', reason: 'задача ${p.id}: линия кончается взятием');
      steps += keys.length;
      plain += keys.where(gcFallbackKeys.contains).length;
      for (final k in keys) {
        used[k] = (used[k] ?? 0) + 1;
      }
    }
    // ignore: avoid_print
    print('шагов $steps, запасных $plain (${(100 * plain / steps).toStringAsFixed(1)} %), приёмы $used');
    expect(plain / steps, lessThan(0.25));
    expect(used.keys, containsAll(['teachGcAtari', 'teachGcCapture']));
    expect(used.keys.every(gcLessonKeys.contains), isTrue);
  });
}

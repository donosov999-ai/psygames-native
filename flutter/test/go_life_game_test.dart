import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/go_capture/game.dart';
import 'package:psygames_flutter/games/go_capture/ladder.dart';
import 'package:psygames_flutter/games/go_capture/lesson.dart';
import 'package:psygames_flutter/games/go_capture/life.dart';
import 'package:psygames_flutter/games/go_capture/rules.dart';

/// «ГО: ЖИЗНЬ» — ПРОБЫ КОРПУСА, ПОДХОДА И РАЗБОРА (задача 66dee70c, часть 2).
void main() {
  final corpus = GoCaptureCorpus.parse(
    File('assets/go_capture/life.json').readAsStringSync(),
  );

  test('корпус: 8 групп × 3 трети, ходов 1–3', () {
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
    // Русские строки «за {n} хода» верны для 2–4, для 1 — «за 1 ход» (отдельный ключ).
    expect({for (final p in corpus.puzzles) p.moves}, {1, 2, 3});
  });

  test('🔴 каждая задача доказана заново: жизнь за N, за N−1 — нет, ключ единственный', () {
    for (final p in corpus.puzzles) {
      final s = LifeSolver(nodeLimit: 300000);
      final pos = p.position;
      expect(pos.at(p.target), goBlack, reason: 'задача ${p.id}');
      expect(LifeSolver.alive(pos, p.target), isFalse, reason: 'задача ${p.id}: уже жива');
      expect(s.lives(pos, p.target, p.moves), GoVerdict.yes, reason: 'задача ${p.id}');
      if (p.moves > 1) {
        expect(s.lives(pos, p.target, p.moves - 1), GoVerdict.no, reason: 'задача ${p.id}');
      }
      expect(s.winningMoves(pos, p.target, p.moves), [p.key], reason: 'задача ${p.id}');
    }
  });

  GoCaptureRun runOf(GoCapturePuzzle p, int Function() now) =>
      GoCaptureRun(level: 1, deck: [p], now: now, mode: GcMode.life);

  test('🔴 подход: линия решателя касаниями делает группу живой во всех 240 задачах', () {
    for (final p in corpus.puzzles) {
      var t = 0;
      final run = runOf(p, () => t);
      final line = goLifeLine(p);
      for (var i = 0; i < line.length; i += 2) {
        run.tap(line[i]);
        if (run.verdict == GoCaptureVerdict.solved) break;
        expect(run.verdict, isNull, reason: 'задача ${p.id}, ход $i');
        t += GoCaptureRun.replyMs + 10;
        run.tick();
      }
      expect(run.verdict, GoCaptureVerdict.solved, reason: 'задача ${p.id}');
      expect(LifeSolver.alive(run.position, p.target), isTrue);
      t += 2000;
      run.tick();
      expect(run.result!.clean, 1);
    }
  });

  test('🔴 ход мимо ключа — «так не жить»; «Заново» — исходная позиция', () {
    var checked = 0;
    for (final p in corpus.puzzles.where((x) => x.group <= 4)) {
      final pos = p.position;
      final bad = LifeSolver()
          .candidates(pos, p.target)
          .where((m) => m != p.key && pos.play(m) != null)
          .firstOrNull;
      if (bad == null) continue;
      var t = 0;
      final run = runOf(p, () => t);
      run.tap(bad);
      expect(run.verdict, GoCaptureVerdict.wrong, reason: 'задача ${p.id}, ход $bad');
      run.restart();
      expect(run.verdict, isNull);
      expect(run.position.points, pos.points);
      checked++;
    }
    expect(checked, greaterThan(80));
  });

  test('подсказка в «Жизни» — ключ задачи', () {
    final p = corpus.puzzles.firstWhere((x) => x.group == 2);
    var t = 0;
    final run = runOf(p, () => t);
    run.takeHint();
    expect(run.hintPoint, isNull, reason: 'до половины времени подсказки нет');
    t = goCaptureSeconds * 500 + 1;
    run.takeHint();
    expect(run.hintPoint, p.key);
  });

  test('разбор «Жизни»: каждый шаг назван приёмом; последний — «два глаза»', () {
    var steps = 0, plain = 0;
    final used = <String, int>{};
    for (final p in corpus.puzzles) {
      final keys = goLifeLineKeys(p);
      expect(keys.last, 'teachGlTwoEyes', reason: 'задача ${p.id}');
      steps += keys.length;
      plain += keys.where(glFallbackKeys.contains).length;
      for (final k in keys) {
        used[k] = (used[k] ?? 0) + 1;
      }
    }
    // ignore: avoid_print
    print('шагов $steps, запасных $plain (${(100 * plain / steps).toStringAsFixed(1)} %), приёмы $used');
    expect(plain / steps, lessThan(0.25));
    expect(used.keys.every(glLessonKeys.contains), isTrue);
  });
}

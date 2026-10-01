import 'dart:io';

import 'package:bishop/bishop.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/find_move/corpus.dart';

/// КОРПУС «НАЙДИ ХОД» ПРОВЕРЯЕТСЯ ПРАВИЛАМИ САМОГО ПРИЛОЖЕНИЯ.
///
/// Генератор отбирал задачи правилами python-chess; здесь те же задачи проходят
/// через `bishop` — правила, которыми судит экран. Разойдись они молча, человек
/// получил бы задачу, где верный ход экран называет ошибкой.
void main() {
  final corpus = FindMoveCorpus.parse(
    File('assets/find_move/puzzles.json').readAsStringSync(),
  );

  test('список приёмов генератора = список приложения', () {
    expect(corpus.themes, findMoveThemes);
  });

  test(
    'у каждого из двенадцати приёмов есть задачи, у каждой полосы — тоже',
    () {
      for (var t = 0; t < findMoveThemes.length; t++) {
        expect(
          corpus.puzzles.where((p) => p.theme == t),
          isNotEmpty,
          reason: findMoveThemes[t],
        );
      }
      for (var b = 0; b < corpus.bands.length; b++) {
        expect(
          corpus.puzzles.where((p) => p.band == b),
          isNotEmpty,
          reason: 'полоса $b',
        );
      }
    },
  );

  test(
    'каждая задача разыгрывается правилами приложения, матовые кончаются матом',
    () {
      final broken = <String>[];
      for (final p in corpus.puzzles) {
        final g = findMoveBoard(p.fen);
        var ok = findMovePlay(g, p.opponent);
        for (final m in p.line) {
          if (!ok) break;
          ok = findMovePlay(g, m);
        }
        if (ok && findMoveMateThemes.contains(p.themeName)) ok = g.checkmate;
        if (!ok) broken.add(p.id);
      }
      expect(
        broken,
        isEmpty,
        reason: 'задачи, которые экран не смог бы засчитать',
      );
      expect(corpus.puzzles.length, greaterThan(3000));
    },
  );

  test('судья: ход записи — да, чужой ход — нет, второй мат на последнем ходе — да', () {
    // Задача мата в один, где матов больше одного: ищется в самом корпусе.
    FindMovePuzzle? twoMates;
    String? other;
    for (final p in corpus.puzzles.where((p) => p.themeName == 'mateIn1')) {
      final g = findMovePosition(p, 0);
      for (final m in g.generateLegalMoves()) {
        final uci = g.toAlgebraic(m);
        if (uci == p.line.first) continue;
        final t = findMovePosition(p, 0);
        if (findMovePlay(t, uci) && t.checkmate) {
          twoMates = p;
          other = uci;
          break;
        }
      }
      if (twoMates != null) break;
    }
    expect(
      twoMates,
      isNotNull,
      reason: 'в корпусе есть мат в один с двумя матами',
    );
    expect(findMoveAccepts(twoMates!, 0, twoMates.line.first), isTrue);
    expect(
      findMoveAccepts(twoMates, 0, other!),
      isTrue,
      reason: 'второй мат — не ошибка',
    );

    // Вилка в два хода: любой другой законный ход первого шага — ошибка.
    final fork = corpus.puzzles.firstWhere(
      (p) => p.themeName == 'fork' && p.playerMoves == 2,
    );
    final g = findMovePosition(fork, 0);
    final wrong = g
        .generateLegalMoves()
        .map((m) => g.toAlgebraic(m))
        .firstWhere((u) => u != fork.line.first);
    expect(findMoveAccepts(fork, 0, fork.line.first), isTrue);
    expect(findMoveAccepts(fork, 0, wrong), isFalse);
    // Второй ход вилки засчитывается по записи.
    expect(findMoveAccepts(fork, 1, fork.line[2]), isTrue);
  });
}

/// «НАЙДИ ХОД»: ЗАДАЧИ И СУДЬЯ ХОДА.
///
/// Задачи — выборка из базы Lichess (CC0), генератор `tools/find_move_corpus.py`,
/// порядок выборки описан в нём. Схема игры — `~/dev/psygames/chess-chat/FIND_MOVE_SCHEME.md`.
///
/// 🔴 ПЕРВЫЙ ХОД ЗАПИСИ — ХОД СОПЕРНИКА. `fen` — позиция ДО него, человек видит
/// позицию ПОСЛЕ. Показать `fen` как есть значит спросить ход в чужой позиции
/// (тот же капкан описан в `scholars_mate/check.dart`).
///
/// ⚠️ ЧТО ЗАСЧИТЫВАЕТСЯ. Ход записи — всегда. На ПОСЛЕДНЕМ ходе человека, если
/// запись кончается матом, — ЛЮБОЙ мат: так судит сам Lichess, и второй мат
/// ошибкой не бывает. Прочие ходы не засчитываются: задачи Lichess отобраны так,
/// что выигрывающий ход единственный.
library;

import 'dart:convert';

import 'package:bishop/bishop.dart' as bishop;
import 'package:flutter/services.dart';

/// Двенадцать приёмов в порядке открытия на лестнице. Номер приёма задачи —
/// индекс здесь; генератор пишет тот же список в поле `themes`, проба сверяет.
const findMoveThemes = <String>[
  'hangingPiece',
  'mateIn1',
  'backRankMate',
  'fork',
  'pin',
  'skewer',
  'discoveredAttack',
  'doubleCheck',
  'trappedPiece',
  'deflection',
  'attraction',
  'mateIn2',
];

/// Приёмы, у которых запись обязана кончаться матом.
const findMoveMateThemes = {'mateIn1', 'mateIn2', 'backRankMate'};

class FindMovePuzzle {
  const FindMovePuzzle({
    required this.id,
    required this.fen,
    required this.opponent,
    required this.line,
    required this.rating,
    required this.theme,
    required this.band,
  });

  /// Номер задачи на Lichess — для отчёта о дефекте.
  final String id;

  /// Позиция ДО хода соперника.
  final String fen;

  /// Ход соперника, после которого ходит человек.
  final String opponent;

  /// Решение: ход человека, ответ соперника, ход человека…
  final List<String> line;
  final int rating;

  /// Номер приёма в [findMoveThemes].
  final int theme;

  /// Номер полосы рейтинга (0 — ниже 1000).
  final int band;

  String get themeName => findMoveThemes[theme];

  /// Сколько ходов делает человек: 1, 2 или 3.
  int get playerMoves => (line.length + 1) ~/ 2;

  factory FindMovePuzzle.fromJson(Map<String, dynamic> j) => FindMovePuzzle(
    id: j['id'] as String,
    fen: j['f'] as String,
    opponent: j['o'] as String,
    line: (j['s'] as List).cast<String>(),
    rating: (j['r'] as num).toInt(),
    theme: (j['t'] as num).toInt(),
    band: (j['b'] as num).toInt(),
  );
}

class FindMoveCorpus {
  const FindMoveCorpus({
    required this.themes,
    required this.bands,
    required this.puzzles,
  });

  final List<String> themes;

  /// Нижние границы полос рейтинга.
  final List<int> bands;
  final List<FindMovePuzzle> puzzles;

  static FindMoveCorpus parse(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return FindMoveCorpus(
      themes: (j['themes'] as List).cast<String>(),
      bands: (j['bands'] as List).cast<num>().map((n) => n.toInt()).toList(),
      puzzles: [
        for (final p in j['puzzles'] as List)
          FindMovePuzzle.fromJson(p as Map<String, dynamic>),
      ],
    );
  }

  /// 🔴 БАЙТАМИ, А НЕ `loadString`: файл 430 КБ, а `loadString` ≥ 50 КБ уходит
  /// в compute, и его кэш вешает вторую пробу того же файла на 10 минут.
  static Future<FindMoveCorpus> load() async {
    final data = await rootBundle.load('assets/find_move/puzzles.json');
    return parse(
      utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      ),
    );
  }
}

bishop.Game findMoveBoard(String fen) =>
    bishop.Game(variant: bishop.Variant.standard(), fen: fen);

/// Сыграть ход uci; false — ход незаконен.
bool findMovePlay(bishop.Game g, String uci) {
  try {
    return g.makeMoveString(uci);
  } catch (_) {
    return false;
  }
}

/// Позиция, в которой человек делает ход номер [step] (0 — первый):
/// ход соперника и все ходы решения до [step]-го хода человека сыграны.
bishop.Game findMovePosition(FindMovePuzzle p, int step) {
  final g = findMoveBoard(p.fen);
  findMovePlay(g, p.opponent);
  for (var i = 0; i < step * 2; i++) {
    findMovePlay(g, p.line[i]);
  }
  return g;
}

/// Засчитан ли ход [uci] человека на его ходе номер [step].
bool findMoveAccepts(FindMovePuzzle p, int step, String uci) {
  final expected = p.line[step * 2];
  if (uci == expected) return true;
  final last = step == p.playerMoves - 1;
  if (!last) return false;
  // Последний ход: любой мат засчитывается, если запись сама кончается матом.
  final byRecord = findMovePosition(p, step);
  if (!findMovePlay(byRecord, expected) || !byRecord.checkmate) return false;
  final mine = findMovePosition(p, step);
  return findMovePlay(mine, uci) && mine.checkmate;
}

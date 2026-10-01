/// ЛЕСТНИЦА «ГО: ЗАХВАТ»: доска, число ходов — и треть по числу кандидатов.
///
/// Корпус — `assets/go_capture/puzzles.json` из `tools/go_capture_corpus.dart`.
/// 24 ступени = 8 групп × 3 трети. Группа (доска, ходов чёрных): (5,2) → (5,3) →
/// (6,2) → (6,3) → (7,3) → (7,4) → (9,3) → (9,4). Треть — по числу ходов-кандидатов
/// у чёрных около цели: чем их больше, тем труднее найти ключ. Ключ у каждой задачи
/// единственный и число ходов минимально — доказано решателем генератора.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import 'rules.dart';

const int goCaptureLevels = 24;
const int goCaptureDeck = 5;
const int goCaptureSeconds = 120;
const int goCapturePassClean = 4;
const int goCaptureFailAtMost = 2;

class GoCapturePuzzle {
  GoCapturePuzzle({
    required this.id,
    required this.size,
    required this.board,
    required this.target,
    required this.moves,
    required this.key,
    required this.group,
    required this.band,
  });
  final int id;
  final int size;

  /// Пункты сверху вниз: «.» пусто, «X» чёрные, «O» белые.
  final String board;

  /// Любой камень группы-цели.
  final int target;

  /// За сколько своих ходов чёрные снимают цель.
  final int moves;

  /// Единственный первый ход, доказанный решателем.
  final int key;
  final int group;
  final int band;

  late final GoPosition position = GoPosition(size, [
    for (final ch in board.split(''))
      ch == 'X'
          ? goBlack
          : ch == 'O'
          ? goWhite
          : goEmpty,
  ]);
}

class GoCaptureCorpus {
  const GoCaptureCorpus(this.puzzles);
  final List<GoCapturePuzzle> puzzles;

  static GoCaptureCorpus parse(String raw) {
    final rows = (jsonDecode(raw) as Map<String, dynamic>)['puzzles'] as List;
    return GoCaptureCorpus([
      for (var i = 0; i < rows.length; i++)
        GoCapturePuzzle(
          id: i,
          size: (rows[i] as List)[0] as int,
          board: (rows[i] as List)[1] as String,
          target: (rows[i] as List)[2] as int,
          moves: (rows[i] as List)[3] as int,
          key: (rows[i] as List)[4] as int,
          group: (rows[i] as List)[5] as int,
          band: (rows[i] as List)[6] as int,
        ),
    ]);
  }

  static Future<GoCaptureCorpus> load() async {
    final data = await rootBundle.load('assets/go_capture/puzzles.json');
    return parse(
      utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      ),
    );
  }
}

({int group, int band}) goCaptureStep(int level) {
  final l = level.clamp(1, goCaptureLevels);
  return (group: (l - 1) ~/ 3, band: (l - 1) % 3);
}

List<GoCapturePuzzle> goCaptureDeckFor(
  GoCaptureCorpus corpus,
  int level, {
  required int seed,
  int count = goCaptureDeck,
}) {
  final s = goCaptureStep(level);
  final fit =
      corpus.puzzles
          .where((p) => p.group == s.group && p.band == s.band)
          .toList()
        ..shuffle(Random(seed));
  return fit.take(count).toList();
}

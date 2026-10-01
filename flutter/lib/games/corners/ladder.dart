/// ЛЕСТНИЦА «УГОЛКОВ»: доска, число фишек, камни — и запас ходов над минимумом.
///
/// Корпус — `assets/corners/puzzles.json` из `tools/corners_corpus.dart`.
/// 24 ступени = 8 групп × 3 трети. Группа: (4×4, 3 фишки) → (5×5, 3) → (5×5, 4) →
/// (6×6, 4) → (5×5, 6) → (7×7, 4) → (6×6, 4, три-пять камней) → (6×6, 6). Треть —
/// запас: перевести за минимум+2, минимум+1, ровно минимум ходов. Минимум каждой
/// задачи доказан перебором генератора.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import 'rules.dart';

const int cornersLevels = 24;
const int cornersDeck = 5;
const int cornersSeconds = 180;
const int cornersPassClean = 4;
const int cornersFailAtMost = 2;

/// Запас ходов над минимумом по трети ступени.
const List<int> cornersSlack = [2, 1, 0];

/// Форма угла из k клеток (ряд 0 — верх угла): 3 — треугольник 2+1, 4 — квадрат
/// 2×2, 6 — треугольник 3+2+1.
List<(int, int)> cornerShape(int k) => switch (k) {
  3 => const [(0, 0), (0, 1), (1, 0)],
  4 => const [(0, 0), (0, 1), (1, 0), (1, 1)],
  6 => const [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (2, 0)],
  _ => throw ArgumentError('no corner shape of $k cells'),
};

class CornersPuzzle {
  CornersPuzzle({
    required this.id,
    required this.size,
    required this.count,
    required this.stones,
    required this.minimum,
    required this.line,
    required this.group,
  });
  final int id;
  final int size;
  final int count;
  final List<int> stones;
  final int minimum;

  /// Линия решателя генератора: ходы «откуда-куда» из начальной позиции.
  final List<(int, int)> line;
  final int group;

  /// Свои фишки в начале — нижний левый угол.
  late final Set<int> startCells = {
    for (final (r, c) in cornerShape(count)) (size - 1 - r) * size + c,
  };

  /// Клетки цели — верхний правый угол.
  late final Set<int> targetCells = {
    for (final (r, c) in cornerShape(count)) r * size + (size - 1 - c),
  };

  late final CornersBoard board = CornersBoard(
    size: size,
    stones: stones.toSet(),
    target: targetCells,
  );

  int get startMask => startCells.fold(0, (m, c) => m | (1 << c));
}

class CornersCorpus {
  const CornersCorpus(this.puzzles);
  final List<CornersPuzzle> puzzles;

  static CornersCorpus parse(String raw) {
    final rows = (jsonDecode(raw) as Map<String, dynamic>)['puzzles'] as List;
    return CornersCorpus([
      for (var i = 0; i < rows.length; i++)
        () {
          final row = rows[i] as List;
          final line = (row[4] as String).trim();
          return CornersPuzzle(
            id: i,
            size: row[0] as int,
            count: row[1] as int,
            stones: (row[2] as List).cast<int>(),
            minimum: row[3] as int,
            line: [
              if (line.isNotEmpty)
                for (final m in line.split(' '))
                  (int.parse(m.split('-')[0]), int.parse(m.split('-')[1])),
            ],
            group: row[5] as int,
          );
        }(),
    ]);
  }

  static Future<CornersCorpus> load() async {
    final data = await rootBundle.load('assets/corners/puzzles.json');
    return parse(
      utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      ),
    );
  }
}

({int group, int band}) cornersStep(int level) {
  final l = level.clamp(1, cornersLevels);
  return (group: (l - 1) ~/ 3, band: (l - 1) % 3);
}

/// Сколько ходов дано на задачу на этой ступени.
int cornersLimit(CornersPuzzle p, int level) =>
    p.minimum + cornersSlack[cornersStep(level).band];

List<CornersPuzzle> cornersDeckFor(
  CornersCorpus corpus,
  int level, {
  required int seed,
  int count = cornersDeck,
}) {
  final s = cornersStep(level);
  final fit = corpus.puzzles.where((p) => p.group == s.group).toList()
    ..shuffle(Random(seed));
  return fit.take(count).toList();
}

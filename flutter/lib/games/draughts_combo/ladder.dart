/// ЛЕСТНИЦА «ШАШЕК»: длина комбинации, выигрыш, дамочный удар — и треть по числу
/// первых ходов.
///
/// Корпус — `assets/draughts_combo/puzzles.json` из `tools/draughts_corpus.dart`.
/// 24 ступени = 8 групп × 3 трети. Группа растёт по длине комбинации (ходов белых
/// 1 → 3), по выигрышу (одна шашка → больше) и по «дамочному удару» (в главной линии
/// шашка проходит в дамки или бьёт дамка); треть — по числу законных первых ходов:
/// чем их больше, тем труднее заметить ключ.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import '../draughts_common/rules.dart';

const int comboLevels = 24;
const int comboDeck = 5;
const int comboSeconds = 120;
const int comboPassClean = 4;
const int comboFailAtMost = 2;

class ComboPuzzle {
  const ComboPuzzle({
    required this.id,
    required this.code,
    required this.whiteMoves,
    required this.gain,
    required this.legal,
    required this.key,
    required this.group,
    required this.band,
  });
  final int id;
  final String code;
  final int whiteMoves;
  final int gain;
  final int legal;

  /// Ключевой ход генератора в записи «c3-d4».
  final String key;
  final int group;
  final int band;

  DraughtsPosition get position => DraughtsPosition.parse(code);
}

class ComboCorpus {
  const ComboCorpus(this.puzzles);
  final List<ComboPuzzle> puzzles;

  static ComboCorpus parse(String raw) {
    final rows = (jsonDecode(raw) as Map<String, dynamic>)['puzzles'] as List;
    return ComboCorpus([
      for (var i = 0; i < rows.length; i++)
        ComboPuzzle(
          id: i,
          code: (rows[i] as List)[0] as String,
          whiteMoves: (rows[i] as List)[1] as int,
          gain: (rows[i] as List)[2] as int,
          legal: (rows[i] as List)[3] as int,
          key: (rows[i] as List)[4] as String,
          group: (rows[i] as List)[5] as int,
          band: (rows[i] as List)[6] as int,
        ),
    ]);
  }

  static Future<ComboCorpus> load() async {
    final data = await rootBundle.load('assets/draughts_combo/puzzles.json');
    return parse(
      utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      ),
    );
  }
}

({int group, int band}) comboStep(int level) {
  final l = level.clamp(1, comboLevels);
  return (group: (l - 1) ~/ 3, band: (l - 1) % 3);
}

List<ComboPuzzle> comboDeckFor(
  ComboCorpus corpus,
  int level, {
  required int seed,
  int count = comboDeck,
}) {
  final s = comboStep(level);
  final fit = corpus.puzzles
      .where((p) => p.group == s.group && p.band == s.band)
      .toList()
    ..shuffle(Random(seed));
  return fit.take(count).toList();
}

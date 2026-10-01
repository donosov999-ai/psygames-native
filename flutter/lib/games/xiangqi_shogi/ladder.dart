/// ЛЕСТНИЦЫ «СЯНЦИ И СЁГИ»: два режима, у каждого свой корпус «мат в N» и 24 ступени.
///
/// Корпуса — `assets/xiangqi_shogi/{xiangqi,shogi}.json` из `tools/{xiangqi,shogi}_corpus.dart`.
/// 8 групп × 3 трети. Группы 0–1 учат фигуры: мат в 1 ходом фигуры одного вида, треть =
/// вид (сянци: колесница, конь, пушка, затем солдат; сёги: золото, серебро, конь, затем
/// копьё, ладья, слон). Дальше — мат в 1, 2, 3, трети по числу ходов-кандидатов.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

const int xsLevels = 24;
const int xsDeck = 5;
const int xsSeconds = 120;
const int xsPassClean = 4;
const int xsFailAtMost = 2;

enum XsMode { xiangqi, shogi }

class XsPuzzle {
  XsPuzzle({
    required this.id,
    required this.mode,
    required this.fen,
    required this.moves,
    required this.key,
    required this.group,
    required this.band,
  });
  final int id;
  final XsMode mode;

  /// FEN в записи Fairy-Stockfish; ход атакующего (красные / сэнтэ).
  final String fen;

  /// Мат не позже стольких своих ходов.
  final int moves;

  /// Единственный первый ход, доказанный решателем.
  final String key;
  final int group;
  final int band;
}

class XsCorpus {
  const XsCorpus(this.puzzles);
  final List<XsPuzzle> puzzles;

  static XsCorpus parse(String raw, XsMode mode) {
    final rows = (jsonDecode(raw) as Map<String, dynamic>)['puzzles'] as List;
    return XsCorpus([
      for (var i = 0; i < rows.length; i++)
        XsPuzzle(
          id: i,
          mode: mode,
          fen: (rows[i] as List)[0] as String,
          moves: (rows[i] as List)[1] as int,
          key: (rows[i] as List)[2] as String,
          group: (rows[i] as List)[3] as int,
          band: (rows[i] as List)[4] as int,
        ),
    ]);
  }

  static Future<XsCorpus> load(XsMode mode) async {
    final data = await rootBundle.load(
      'assets/xiangqi_shogi/${mode == XsMode.xiangqi ? 'xiangqi' : 'shogi'}.json',
    );
    return parse(
      utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)),
      mode,
    );
  }
}

({int group, int band}) xsStep(int level) {
  final l = level.clamp(1, xsLevels);
  return (group: (l - 1) ~/ 3, band: (l - 1) % 3);
}

List<XsPuzzle> xsDeckFor(
  XsCorpus corpus,
  int level, {
  required int seed,
  int count = xsDeck,
}) {
  final s = xsStep(level);
  final fit =
      corpus.puzzles.where((p) => p.group == s.group && p.band == s.band).toList()
        ..shuffle(Random(seed));
  return fit.take(count).toList();
}

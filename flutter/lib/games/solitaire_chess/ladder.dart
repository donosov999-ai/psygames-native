/// ЛЕСТНИЦА «ШАХМАТНОГО ПАСЬЯНСА»: ЧИСЛО ФИГУР И ТРЕТЬ ПО ТРУДНОСТИ.
///
/// Корпус — `assets/solitaire_chess/puzzles.json` из `tools/solitaire_chess_corpus.py`:
/// 720 досок 4×4, по 30 на клетку «фигур (3–10) × треть (лёгкая, средняя, трудная)».
/// Трудность внутри числа фигур — P, вероятность расчистить доску случайными
/// взятиями (меньше P — больше тупиков). Число фигур само трудностью не является:
/// у случайной доски из девяти фигур медиана — 1 160 решений (замер 01.10.2026).
///
/// 24 ступени: каждые три — новое число фигур, внутри — лёгкая, средняя, трудная
/// треть. ⚠️ Потолок 24-й ступени — граница КОРОБКИ (10 фигур на 4×4), а не игры:
/// следующие оси уже видны — доска 5×5, правило «король доживает до конца»,
/// «каждая фигура бьёт не больше двух раз» (как в Solo Chess) — и добавляются
/// ступенями сверху, не трогая эти.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart';

import 'puzzle.dart';

const int solitaireLevels = 24;

/// Досок в подходе.
const int solitaireDeck = 5;

/// Секунд на доску — одно число на всю лестницу: трудность растёт доской, а не
/// спешкой; подсказка — с половины.
const int solitaireSeconds = 90;

/// Решённых с первой попытки и без подсказки, чтобы подняться; столько и меньше
/// решённых вообще — спуск.
const int solitairePassClean = 4;
const int solitaireFailAtMost = 2;

class SolitairePuzzle {
  const SolitairePuzzle({
    required this.id,
    required this.code,
    required this.randomSuccess,
    required this.solutions,
    required this.band,
  });

  /// Номер в корпусе — для записи подхода.
  final int id;
  final String code;
  final double randomSuccess;
  final int solutions;

  /// 0 — лёгкая треть, 1 — средняя, 2 — трудная.
  final int band;

  SolitaireBoard get board => SolitaireBoard.parse(code);
  int get pieces => code.replaceAll('.', '').length;
}

class SolitaireCorpus {
  const SolitaireCorpus(this.puzzles);
  final List<SolitairePuzzle> puzzles;

  static SolitaireCorpus parse(String raw) {
    final data = jsonDecode(raw) as Map<String, dynamic>;
    final rows = data['puzzles'] as List<dynamic>;
    return SolitaireCorpus([
      for (var i = 0; i < rows.length; i++)
        SolitairePuzzle(
          id: i,
          code: (rows[i] as List)[0] as String,
          randomSuccess: ((rows[i] as List)[1] as num).toDouble(),
          solutions: (rows[i] as List)[2] as int,
          band: (rows[i] as List)[3] as int,
        ),
    ]);
  }

  /// Байтами, как у «Найди ход»: так проба не зависит от порога `loadString`.
  static Future<SolitaireCorpus> load() async {
    final data = await rootBundle.load('assets/solitaire_chess/puzzles.json');
    return parse(
      utf8.decode(
        data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      ),
    );
  }
}

/// Ступень: сколько фигур и какая треть.
({int pieces, int band}) solitaireStep(int level) {
  final l = level.clamp(1, solitaireLevels);
  return (pieces: 3 + (l - 1) ~/ 3, band: (l - 1) % 3);
}

/// Подход ступени: доски нужной клетки без повторов, порядок — от зерна.
List<SolitairePuzzle> solitaireDeckFor(
  SolitaireCorpus corpus,
  int level, {
  required int seed,
  int count = solitaireDeck,
}) {
  final step = solitaireStep(level);
  final fit = corpus.puzzles
      .where((p) => p.pieces == step.pieces && p.band == step.band)
      .toList();
  fit.shuffle(Random(seed));
  return fit.take(count).toList();
}

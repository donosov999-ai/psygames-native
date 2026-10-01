/// КОРПУС ПОЗИЦИЙ «ДОСКИ В УМЕ» — данными, а не кодом.
///
/// 2000 задач Lichess (CC0, общественное достояние), тот же файл, что везёт
/// веб-половина. Позиция выбирается ПОЛОСОЙ по числу фигур: полоса — это и есть
/// ступень серии.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show rootBundle;

import 'bands.dart';
import 'questions.dart';

/// Одна задача корпуса.
class CorpusEntry {
  const CorpusEntry({
    required this.fen,
    required this.rating,
    required this.pieces,
  });

  final String fen;
  final int rating;

  /// Сколько фигур на доске — посчитано при наборе корпуса.
  final int pieces;
}

/// Корпус целиком плюс его происхождение: откуда взят и по какому правилу.
class PositionCorpus {
  const PositionCorpus({
    required this.entries,
    required this.source,
    required this.license,
    required this.method,
  });

  final List<CorpusEntry> entries;
  final String source;
  final String license;
  final String method;

  int get size => entries.length;

  static PositionCorpus? _cached;

  /// Читается один раз: 177 КБ разбирать на каждую партию незачем.
  static Future<PositionCorpus> load() async {
    final cached = _cached;
    if (cached != null) return cached;
    final raw = await rootBundle.loadString(
      'assets/chess_blind/positions.json',
    );
    return _cached = parse(raw);
  }

  static PositionCorpus parse(String raw) {
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final list = (json['positions'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    return PositionCorpus(
      entries: [
        for (final e in list)
          CorpusEntry(
            fen: e['fen'] as String,
            rating: (e['rating'] as num).toInt(),
            pieces: (e['pieces'] as num).toInt(),
          ),
      ],
      source: json['_source'] as String? ?? '',
      license: json['_license'] as String? ?? '',
      method: json['_method'] as String? ?? '',
    );
  }

  /// Позиции этой полосы. Пусто — значит полоса не набрана, и это видно числом.
  List<CorpusEntry> inBand(PieceBand band) => entries
      .where((e) => e.pieces >= band.min && e.pieces <= band.max)
      .toList();

  /// Позиция из полосы. `roll` — то же число 0..1, что и в вебе: выбор должен
  /// совпадать при одинаковом броске, иначе у веба и телефона разные доски.
  CorpusEntry pick(PieceBand band, double roll) {
    final list = inBand(band);
    if (list.isEmpty) {
      throw StateError('В полосе ${band.min}–${band.max} нет позиций');
    }
    final i = (roll * list.length).floor().clamp(0, list.length - 1);
    return list[i];
  }

  CorpusEntry pickRandom(PieceBand band, [Random? random]) =>
      pick(band, (random ?? Random()).nextDouble());
}

/// Фигуры позиции в координатах ЭКРАНА (0 = a8, сверху вниз).
///
/// 🔴 FEN ЧИТАЕТСЯ СВЕРХУ ВНИЗ, И ЭКРАН ТОЖЕ — поэтому здесь нет переворота.
/// Ядро веб-версии считает снизу вверх и переворачивает отдельно (`screenIndex`);
/// повторить оба шага значило бы перевернуть доску дважды.
List<PuzzlePiece> piecesFromFen(String fen) {
  final rows = fen.trim().split(' ').first.split('/');
  if (rows.length != 8) {
    throw FormatException('В позиции должно быть 8 рядов: $fen');
  }
  final out = <PuzzlePiece>[];
  for (var row = 0; row < 8; row++) {
    var file = 0;
    for (final ch in rows[row].split('')) {
      final empty = int.tryParse(ch);
      if (empty != null) {
        file += empty;
        continue;
      }
      if (file > 7) {
        throw FormatException('Ряд длиннее восьми клеток: ${rows[row]}');
      }
      out.add(
        PuzzlePiece(
          sq: row * 8 + file,
          type: ch.toUpperCase(),
          white: ch.toUpperCase() == ch,
        ),
      );
      file++;
    }
    if (file != 8) {
      throw FormatException('В ряду должно быть 8 клеток: ${rows[row]}');
    }
  }
  return out;
}

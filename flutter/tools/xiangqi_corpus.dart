// Корпус «Сянци»: мат в N за красных. Задача c33fb91b (игра 7). Из flutter/:
//     dart run tools/xiangqi_corpus.dart [группа]   →   assets/xiangqi_shogi/xiangqi.json
//
// Свои задачи: случайная редкая позиция — чёрный генерал во дворце, при нём 0–2 советника
// и слона, иногда защитник; красный генерал в своём дворце и 1–4 атакующие фигуры.
// Позиция законна (никто не под шахом, генералы не смотрят друг на друга). Задача годится,
// если решатель (`lib/games/xiangqi_shogi/mate.dart`, тот же, что судит игру) доказывает
// мат ровно за N (за N−1 — нет) и первый ход единственный. Движок — bishop (MIT).
// Группы 0–1 учат фигуры: мат в 1 одной фигурой, треть = вид фигуры.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:bishop/bishop.dart' as bishop;
import 'package:psygames_flutter/games/xiangqi_shogi/mate.dart';

/// Группа: ходов, атакующих фигур (от–до), защитников (от–до), виды по третям или null.
typedef Group = ({int moves, int minA, int maxA, int minD, int maxD, List<String?>? kinds});

const List<Group> groups = [
  (moves: 1, minA: 1, maxA: 1, minD: 0, maxD: 2, kinds: ['R', 'N', 'C']),
  (moves: 1, minA: 1, maxA: 2, minD: 1, maxD: 3, kinds: ['P', null, null]),
  (moves: 1, minA: 2, maxA: 3, minD: 1, maxD: 4, kinds: null),
  (moves: 2, minA: 2, maxA: 2, minD: 0, maxD: 3, kinds: null),
  (moves: 2, minA: 2, maxA: 3, minD: 1, maxD: 4, kinds: null),
  (moves: 2, minA: 3, maxA: 4, minD: 2, maxD: 5, kinds: null),
  (moves: 3, minA: 2, maxA: 3, minD: 1, maxD: 4, kinds: null),
  (moves: 3, minA: 3, maxA: 4, minD: 2, maxD: 5, kinds: null),
];
const perBand = 10;
const poolCap = 60;

const blackPalace = ['d10', 'e10', 'f10', 'd9', 'e9', 'f9', 'd8', 'e8', 'f8'];
const redPalace = ['d1', 'e1', 'f1', 'd2', 'e2', 'f2', 'd3', 'e3', 'f3'];
const advisorPts = ['d10', 'f10', 'e9', 'd8', 'f8'];
const elephantPts = ['c10', 'g10', 'a8', 'e8', 'i8', 'c6', 'g6'];

int sq(String name) =>
    (10 - int.parse(name.substring(1))) * 9 + name.codeUnitAt(0) - 97;

String fenOf(Map<int, String> cells, String side) {
  final rows = <String>[];
  for (var r = 0; r < 10; r++) {
    var row = '';
    var empty = 0;
    for (var c = 0; c < 9; c++) {
      final p = cells[r * 9 + c];
      if (p == null) {
        empty++;
        continue;
      }
      if (empty > 0) row += '$empty';
      empty = 0;
      row += p;
    }
    if (empty > 0) row += '$empty';
    rows.add(row);
  }
  return '${rows.join('/')} $side - - 0 1';
}

bool legalStart(String fenRed) {
  final asBlack = fenRed.replaceFirst(' w ', ' b ');
  final g1 = bishop.Game(variant: xiangqiVariant, fen: asBlack);
  if (g1.inCheck) return false; // чёрные под шахом при ходе красных — незаконно
  final g2 = bishop.Game(variant: xiangqiVariant, fen: fenRed);
  if (g2.inCheck) return false;
  return g2.generateLegalMoves().isNotEmpty;
}

void main(List<String> args) {
  final only = args.isEmpty ? null : int.parse(args.first);
  final rng = Random(20261004);
  final out = <List<Object?>>[];
  for (var g = 0; g < groups.length; g++) {
    if (only != null && g != only) continue;
    final grp = groups[g];
    final bands = <int, List<List<Object?>>>{0: [], 1: [], 2: []};
    final pool = <List<Object?>>[];
    final seen = <String>{};
    final sw = Stopwatch()..start();
    var tried = 0;
    bool full() => grp.kinds == null
        ? pool.length >= poolCap
        : [0, 1, 2].every(
            (b) => (grp.kinds![b] == null ? pool.length : bands[b]!.length) >= (grp.kinds![b] == null ? poolCap : perBand * 2),
          );
    while (!full() && sw.elapsed.inMinutes < 5) {
      tried++;
      final cells = <int, String>{};
      void put(String name, String piece) => cells[sq(name)] = piece;
      String freeIn(List<String> pts) {
        final options = pts.where((n) => !cells.containsKey(sq(n))).toList();
        return options.isEmpty ? '' : options[rng.nextInt(options.length)];
      }

      put(freeIn(blackPalace), 'k');
      put(freeIn(redPalace), 'K');
      final defenders = grp.minD + rng.nextInt(grp.maxD - grp.minD + 1);
      for (var i = 0; i < defenders; i++) {
        final roll = rng.nextInt(10);
        if (roll < 4) {
          final s = freeIn(advisorPts);
          if (s.isNotEmpty) put(s, 'a');
        } else if (roll < 8) {
          final s = freeIn(elephantPts);
          if (s.isNotEmpty) put(s, 'b');
        } else {
          final c = rng.nextInt(9), r = rng.nextInt(5);
          final s = r * 9 + c;
          if (!cells.containsKey(s)) cells[s] = ['r', 'n', 'c', 'p'][rng.nextInt(4)];
        }
      }
      // Вид фигуры в группах обучения: по трети, которой сейчас не хватает.
      String? kind;
      int? wantBand;
      if (grp.kinds != null) {
        final need = [0, 1, 2].where((b) => grp.kinds![b] != null && bands[b]!.length < perBand * 2).toList();
        if (need.isNotEmpty) {
          wantBand = need[rng.nextInt(need.length)];
          kind = grp.kinds![wantBand];
        }
      }
      final attackers = grp.minA + rng.nextInt(grp.maxA - grp.minA + 1);
      for (var i = 0; i < attackers; i++) {
        final k = (i == 0 && kind != null) ? kind : ['R', 'N', 'C', 'P'][rng.nextInt(4)];
        // Атакующие — в лагере чёрных (горизонтали 6–10) или рядом с ним.
        final r = rng.nextInt(k == 'P' ? 4 : 6);
        final c = rng.nextInt(9);
        final s = r * 9 + c;
        if (!cells.containsKey(s)) cells[s] = k;
      }
      if (kind != null && attackers == 1 && cells.values.where((p) => 'RNCP'.contains(p) && p == p.toUpperCase()).length != 1) continue;
      final fen = fenOf(cells, 'w');
      if (!seen.add(fen)) continue;
      if (!legalStart(fen)) continue;
      final board = XiangqiBoard(fen);
      final solver = MateSolver(board, nodeLimit: 200000);
      if (solver.mateIn(grp.moves) != MateVerdict.yes) continue;
      if (grp.moves > 1 && solver.mateIn(grp.moves - 1) != MateVerdict.no) continue;
      final keys = solver.winningMoves(grp.moves);
      if (keys.length != 1) continue;
      final cands = board.moves().length;
      final row = <Object?>[fen, grp.moves, keys.single, g, 0, cands];
      if (kind != null && wantBand != null) {
        // Ключ — ход той самой фигуры: иначе ступень учит не её.
        final from = keys.single.substring(0, keys.single.indexOf(RegExp(r'[a-i]'), 1));
        if (cells[sq(from)] != kind) continue;
        bands[wantBand]!.add(row);
      } else {
        pool.add(row);
      }
    }
    // Трети: по виду фигуры (группы обучения) или по числу ходов-кандидатов.
    final picked = <List<Object?>>[];
    if (grp.kinds != null) {
      pool.sort((a, b) => (a[5] as int).compareTo(b[5] as int));
      for (var b = 0; b < 3; b++) {
        final src = grp.kinds![b] != null
            ? (bands[b]!..shuffle(rng))
            : (b == 1 ? pool.sublist(0, pool.length ~/ 2) : pool.sublist(pool.length ~/ 2))
              ..shuffle(rng);
        for (final row in src.take(perBand)) {
          picked.add([row[0], row[1], row[2], g, b]);
        }
      }
    } else {
      pool.sort((a, b) => (a[5] as int).compareTo(b[5] as int));
      final third = pool.length ~/ 3;
      for (var b = 0; b < 3; b++) {
        final part = pool.sublist(b * third, (b + 1) * third)..shuffle(rng);
        for (final row in part.take(perBand)) {
          picked.add([row[0], row[1], row[2], g, b]);
        }
      }
    }
    final perB = [for (var b = 0; b < 3; b++) picked.where((r) => r[4] == b).length];
    stdout.writeln('группа $g (мат в ${grp.moves}): по третям $perB, перебрано $tried за ${sw.elapsed.inSeconds} с');
    if (perB.any((n) => n < 5)) {
      stderr.writeln('СТОП: группа $g — на треть не хватает');
      if (only == null) exit(1);
    }
    out.addAll(picked);
  }
  if (only != null) return;
  final file = File('assets/xiangqi_shogi/xiangqi.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    jsonEncode({
      'format': 'FEN (ход красных), ходов, ключ, группа, треть',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}

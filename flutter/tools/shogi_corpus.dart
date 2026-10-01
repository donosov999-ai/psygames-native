// Корпус «Сёги»: цумэ — мат в N за сэнтэ, каждый ход атакующего — шах. Задача c33fb91b
// (игра 7). Из flutter/:
//     dart run tools/shogi_corpus.dart [группа]   →   assets/xiangqi_shogi/shogi.json
//
// Свои задачи: король готэ у верхнего края, при нём 0–3 защитника; у сэнтэ 1–3 фигуры на
// доске и 0–2 в руке, своего короля нет (как в цумэ). У готэ в руке — все фигуры
// комплекта, которых нет на доске и в руке сэнтэ (правило жанра). Задача годится, если
// решатель (`lib/games/xiangqi_shogi/mate.dart`, тот же, что судит игру) доказывает мат
// ровно за N (за N−1 — нет) и первый ход единственный. Группы 0–1 учат фигуры: мат в 1
// ходом фигуры этого вида (треть = вид), у неё один помощник. Одинокой фигурой мат в
// цумэ почти не ставится: у защиты полная рука, дальний шах закрывается сбросом, а
// ближний без поддержки бьёт король (замер: 0 задач из 2,9 млн расстановок).
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/xiangqi_shogi/mate.dart';
import 'package:psygames_flutter/games/xiangqi_shogi/shogi_rules.dart';

typedef Group = ({
  int moves,
  int minA,
  int maxA,
  int minH,
  int maxH,
  int minD,
  int maxD,
  List<String?>? kinds,
});

const List<Group> groups = [
  (moves: 1, minA: 2, maxA: 2, minH: 0, maxH: 0, minD: 1, maxD: 3, kinds: ['G', 'S', 'N']),
  (moves: 1, minA: 2, maxA: 2, minH: 0, maxH: 0, minD: 1, maxD: 3, kinds: ['L', 'R', 'B']),
  (moves: 1, minA: 0, maxA: 1, minH: 1, maxH: 1, minD: 1, maxD: 3, kinds: null),
  (moves: 1, minA: 1, maxA: 2, minH: 0, maxH: 2, minD: 1, maxD: 3, kinds: null),
  (moves: 2, minA: 1, maxA: 2, minH: 1, maxH: 2, minD: 0, maxD: 2, kinds: null),
  (moves: 2, minA: 2, maxA: 3, minH: 0, maxH: 2, minD: 1, maxD: 3, kinds: null),
  (moves: 3, minA: 1, maxA: 2, minH: 1, maxH: 2, minD: 0, maxD: 2, kinds: null),
  (moves: 3, minA: 2, maxA: 3, minH: 1, maxH: 2, minD: 1, maxD: 3, kinds: null),
];
const perBand = 10;
const poolCap = 60;

/// Комплект на обе стороны (без королей).
const Map<String, int> fullSet = {'R': 2, 'B': 2, 'G': 4, 'S': 4, 'N': 4, 'L': 4, 'P': 18};
const List<String> pieceKinds = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

void main(List<String> args) {
  final only = args.isEmpty ? null : int.parse(args.first);
  final rng = Random(20261005);
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
        : [0, 1, 2].every((b) => bands[b]!.length >= perBand * 2);
    while (!full() && sw.elapsed.inMinutes < 5) {
      tried++;
      final cells = List<SgPiece?>.filled(81, null);
      final kr = rng.nextInt(3), kc = rng.nextInt(9);
      cells[kr * 9 + kc] = const SgPiece(sgGote, 'K');
      int near(int spread) {
        final r = (kr + rng.nextInt(spread * 2 + 1) - spread).clamp(0, 8);
        final c = (kc + rng.nextInt(spread * 2 + 1) - spread).clamp(0, 8);
        return r * 9 + c;
      }

      final defenders = grp.minD + rng.nextInt(grp.maxD - grp.minD + 1);
      for (var i = 0; i < defenders; i++) {
        final s = near(1 + rng.nextInt(2));
        if (cells[s] == null) {
          cells[s] = SgPiece(sgGote, ['G', 'S', 'P', 'L', 'N'][rng.nextInt(5)]);
        }
      }
      String? kind;
      int? wantBand;
      if (grp.kinds != null) {
        final need = [0, 1, 2].where((b) => bands[b]!.length < perBand * 2).toList();
        if (need.isEmpty) break;
        wantBand = need[rng.nextInt(need.length)];
        kind = grp.kinds![wantBand];
      }
      final attackers = grp.minA + rng.nextInt(grp.maxA - grp.minA + 1);
      for (var i = 0; i < attackers; i++) {
        final k = i == 0 && kind != null ? kind : pieceKinds[rng.nextInt(pieceKinds.length)];
        final promote = kind == null && rng.nextInt(5) == 0 && 'PLNSBR'.contains(k);
        final s = (k == 'R' || k == 'B' || k == 'L') ? rng.nextInt(81) : near(3);
        if (cells[s] == null) cells[s] = SgPiece(sgSente, promote ? '+$k' : k);
      }
      final senteHand = <String, int>{};
      final handN = grp.minH + rng.nextInt(grp.maxH - grp.minH + 1);
      for (var i = 0; i < handN; i++) {
        final k = ['R', 'B', 'G', 'S', 'N', 'L'][rng.nextInt(6)];
        senteHand[k] = (senteHand[k] ?? 0) + 1;
      }
      // Рука готэ — остаток комплекта.
      final used = <String, int>{};
      for (final p in cells) {
        if (p == null || p.kind == 'K') continue;
        used[p.base] = (used[p.base] ?? 0) + 1;
      }
      final goteHand = <String, int>{};
      var over = false;
      for (final k in pieceKinds) {
        final left = fullSet[k]! - (used[k] ?? 0) - (senteHand[k] ?? 0);
        if (left < 0) over = true;
        if (left > 0) goteHand[k] = left;
      }
      if (over) continue;
      final pos = ShogiPosition(cells, [senteHand, goteHand], sgSente);
      // Законность: нифу и мёртвые фигуры (пешка/копьё на последней, конь на двух
      // последних) недопустимы и на доске.
      var bad = false;
      for (var i = 0; i < 81 && !bad; i++) {
        final p = cells[i];
        if (p == null || p.promoted) continue;
        final ahead = p.side == sgSente ? i ~/ 9 : 8 - i ~/ 9;
        if ((p.kind == 'P' || p.kind == 'L') && ahead == 0) bad = true;
        if (p.kind == 'N' && ahead <= 1) bad = true;
        if (p.kind == 'P') {
          for (var r = 0; r < 9; r++) {
            final q = cells[r * 9 + i % 9];
            if (r * 9 + i % 9 != i && q != null && q.side == p.side && q.kind == 'P') bad = true;
          }
        }
      }
      if (bad || pos.inCheck(sgGote)) continue;
      final fen = pos.fen();
      if (!seen.add(fen)) continue;
      final board = ShogiBoard(fen);
      final solver = MateSolver(board, nodeLimit: 150000);
      if (solver.mateIn(grp.moves) != MateVerdict.yes) continue;
      if (grp.moves > 1 && solver.mateIn(grp.moves - 1) != MateVerdict.no) continue;
      final keys = solver.winningMoves(grp.moves);
      if (keys.length != 1) continue;
      final key = keys.single;
      final cands = board.moves().length;
      final row = <Object?>[fen, grp.moves, key, g, 0, cands];
      if (kind != null && wantBand != null) {
        if (key.contains('@')) continue;
        final from = sgIndex(key.substring(0, 2));
        if (cells[from]?.base != kind) continue;
        bands[wantBand]!.add(row);
      } else {
        pool.add(row);
      }
    }
    final picked = <List<Object?>>[];
    if (grp.kinds != null) {
      for (var b = 0; b < 3; b++) {
        final src = bands[b]!..shuffle(rng);
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
  final file = File('assets/xiangqi_shogi/shogi.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    jsonEncode({
      'format': 'FEN Fairy-Stockfish (ход сэнтэ), ходов, ключ, группа, треть',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}

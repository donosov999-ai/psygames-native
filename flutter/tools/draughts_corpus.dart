// Корпус «Шашек»: комбинации «отдай и забери» по русским правилам.
//
// Задача 41ac876c (цепочка «Шахматы: семь новых игр», игра 4). Запуск из flutter/:
//     dart run tools/draughts_corpus.dart   →   assets/draughts_combo/puzzles.json
//
// Задачи генерируются, открытой базы нет (замер 18.09.2026). Случайная редкая
// расстановка (белых 4–8, чёрных 4–9 простых, иногда дамка), ход белых, у белых нет
// взятий. Задача годится, если решатель (`lib/games/draughts_combo/solver.dart` — тот
// же код, что у игры) находит комбинацию длиной W ходов белых: единственный первый ход —
// жертва (соперник обязан бить), выигрыш материала ≥ 1; W — наименьшая такая длина.
//
// Лестница — группы по длине, выигрышу и дамке, внутри — трети по числу законных
// первых ходов (чем больше, тем труднее найти ключ). Зерно постоянное.
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:psygames_flutter/games/draughts_combo/solver.dart';
import 'package:psygames_flutter/games/draughts_common/rules.dart';

/// Сколько задач собирать в корзину (длина × выигрыш × дамка), из них — трети.
const poolCap = 240;
const perBand = 20;

DraughtsPosition randomPosition(Random rng) {
  final cells = List<int>.filled(64, 0);
  final dark = [
    for (var sq = 0; sq < 64; sq++)
      if ((sq ~/ 8 + sq % 8).isOdd) sq,
  ]..shuffle(rng);
  final whites = 4 + rng.nextInt(5);
  final blacks = 4 + rng.nextInt(6);
  var w = 0, b = 0;
  for (final sq in dark) {
    final row = sq ~/ 8;
    if (w < whites && row > 0) {
      cells[sq] = 1;
      w++;
    } else if (b < blacks && row < 7) {
      cells[sq] = -1;
      b++;
    }
    if (w == whites && b == blacks) break;
  }
  // Иногда — дамка у белых или чёрных: ось «дамочный удар».
  if (rng.nextInt(5) == 0) {
    final own = [for (var i = 0; i < 64; i++) if (cells[i] == 1) i];
    cells[own[rng.nextInt(own.length)]] = 2;
  }
  if (rng.nextInt(6) == 0) {
    final own = [for (var i = 0; i < 64; i++) if (cells[i] == -1) i];
    cells[own[rng.nextInt(own.length)]] = -2;
  }
  return DraughtsPosition(cells, turn: 1);
}

/// Группа лестницы: 0–7.
int groupOf(ComboVerdict v, bool king) {
  if (v.whiteMoves == 1) return v.gain >= 2 ? 1 : 0;
  if (v.whiteMoves == 2) return king ? 4 : (v.gain >= 2 ? 3 : 2);
  return king ? 7 : (v.gain >= 2 ? 6 : 5);
}

/// Корзины генератора (0 W1·1, 1 W1·2+, 2 W2·1, 3 W2·2+, 4 W2·дамка, 5 W3·1, 6 W3·2+,
/// 7 W3·дамка) → группы лестницы по трудности: длина, затем дамочный удар, затем
/// больший выигрыш. Замер 01.10.2026 (300 тыс. позиций): «2+ без дамки» при длине 2–3
/// встречается в 30–80 раз реже остальных — потому эти группы и стоят выше.
const ladderOfBucket = [0, 1, 2, 4, 3, 5, 7, 6];

void main(List<String> args) {
  if (args.isNotEmpty && args.first == '--from-raw') {
    final raw = (jsonDecode(File('build/draughts_raw.json').readAsStringSync()) as List)
        .map((x) => (x as List).cast<List<dynamic>>())
        .toList();
    writeCorpus(raw.map((x) => x.map((r) => r.cast<Object>()).toList()).toList(), Random(20261001));
    return;
  }
  final rng = Random(20261001);
  final pools = List.generate(8, (_) => <List<Object>>[]);
  final seen = <String>{};
  final sw = Stopwatch()..start();
  var tried = 0;
  while (pools.any((p) => p.length < poolCap) &&
      sw.elapsed.inMinutes < (args.isEmpty ? 25 : int.parse(args.first))) {
    tried++;
    final p = randomPosition(rng);
    if (!seen.add(p.code)) continue;
    for (var w = 1; w <= 3; w++) {
      final v = comboAt(p, w, budget: 150000);
      if (v == null) continue;
      final line = comboLine(p, w);
      // «Дамочный удар»: в главной линии белая шашка становится дамкой или белая
      // дамка бьёт. Дамка, просто стоящая на доске, осью не считается.
      var king = false;
      var x = p;
      for (final m in line) {
        final piece = x.cells[m.from];
        if (piece > 0 &&
            ((piece == 2 && m.isCapture) || (piece == 1 && m.finalPiece == 2))) {
          king = true;
        }
        x = draughtsApply(x, m);
      }
      final g = groupOf(v, king);
      if (pools[g].length < poolCap) {
        pools[g].add([p.code, w, v.gain, v.legal, v.key.notation]);
      }
      break;
    }
    if (tried % 2000 == 0) {
      stderr.writeln(
        '${sw.elapsed.inSeconds}s, позиций $tried, по группам ${[for (final x in pools) x.length]}',
      );
    }
  }
  // Сырые корзины — в build/ (не в репо): по ним видно, сколько чего нашлось.
  File('build/draughts_raw.json')
    ..parent.createSync(recursive: true)
    ..writeAsStringSync(jsonEncode(pools));
  writeCorpus(pools, rng);
  stdout.writeln('позиций $tried; по корзинам ${[for (final x in pools) x.length]}');
}

void writeCorpus(List<List<List<Object>>> pools, Random rng) {
  final out = <List<Object>>[];
  for (var bucket = 0; bucket < 8; bucket++) {
    final g = ladderOfBucket[bucket];
    final pool = pools[bucket]..sort((a, b) => (a[3] as int).compareTo(b[3] as int));
    if (pool.length < 3) {
      stderr.writeln('СТОП: корзина $bucket — ${pool.length} задач, на трети не хватает');
      exit(1);
    }
    final third = pool.length ~/ 3;
    for (var band = 0; band < 3; band++) {
      final part = pool.sublist(band * third, (band + 1) * third)..shuffle(rng);
      for (final row in part.take(perBand)) {
        out.add([...row, g, band]);
      }
    }
  }
  final file = File('assets/draughts_combo/puzzles.json');
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(
    jsonEncode({
      'format':
          'позиция (32 тёмных поля сверху, w/W/b/B, ход), ходов белых W, выигрыш, законных первых ходов, ключ, группа, треть',
      'puzzles': out,
    }),
  );
  stdout.writeln('задач ${out.length}');
}

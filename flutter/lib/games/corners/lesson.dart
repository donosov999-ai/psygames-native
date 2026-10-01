/// РАЗБОР «УГОЛКОВ» ПО ШАГАМ: каждый ход линии решателя назван приёмом.
///
/// Линия — та, что генератор доказал минимальной (`CornersPuzzle.line`). Приёмы:
///   · «цепочка прыжков» — один ход из двух и больше прыжков подряд;
///   · «через камень» — прыжок через неподвижную фишку соперника;
///   · «прыжок» — один прыжок через свою фишку;
///   · «мост» — фишка встаёт туда, где по ней прыгнет следующая;
///   · «в цель» — шаг на клетку угла-цели.
/// Запасная строка — простой шаг (доля меряется пробой).
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'ladder.dart';
import 'rules.dart';

const cnLessonKeys = <String>[
  'teachCnRule',
  'teachCnChain',
  'teachCnStone',
  'teachCnJump',
  'teachCnBridge',
  'teachCnHome',
  'teachCnStep',
  'teachCnDone',
];

const cnFallbackKeys = {'teachCnStep'};

class CnLessonFrame {
  const CnLessonFrame({required this.pieces, this.move});
  final int pieces;
  final (int, int)? move;
}

/// Имя клетки: столбец буквой, ряд числом снизу («a1» — нижний левый угол).
String cornersCellName(int size, int cell) =>
    '${String.fromCharCode(97 + cell % size)}${size - cell ~/ size}';

/// Через какие клетки прыгнул ход (кратчайшая цепочка); пусто — это шаг.
List<int> cornersJumpOver(CornersBoard board, int pieces, (int, int) move) {
  final (from, to) = move;
  final occupied = (pieces & ~(1 << from)) | board.stoneMask;
  final n = board.size;
  final fr = from ~/ n, fc = from % n, tr = to ~/ n, tc = to % n;
  if ((fr - tr).abs() + (fc - tc).abs() == 1) return const [];
  final prev = <int, (int, int)>{from: (-1, -1)};
  final queue = <int>[from];
  while (queue.isNotEmpty) {
    final at = queue.removeAt(0);
    if (at == to) break;
    final r = at ~/ n, c = at % n;
    for (final (dr, dc) in const [(1, 0), (-1, 0), (0, 1), (0, -1)]) {
      final or = r + dr, oc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (lr < 0 || lr >= n || lc < 0 || lc >= n) continue;
      final over = or * n + oc, land = lr * n + lc;
      if (occupied >> over & 1 == 0 || occupied >> land & 1 == 1) continue;
      if (prev.containsKey(land)) continue;
      prev[land] = (at, over);
      queue.add(land);
    }
  }
  final out = <int>[];
  var at = to;
  while (prev.containsKey(at) && prev[at]!.$1 >= 0) {
    out.insert(0, prev[at]!.$2);
    at = prev[at]!.$1;
  }
  return out;
}

/// Ключ приёма для каждого хода линии.
List<String> cornersLineKeys(CornersPuzzle p) {
  final board = p.board;
  var pieces = p.startMask;
  final overs = <List<int>>[];
  for (final m in p.line) {
    overs.add(cornersJumpOver(board, pieces, m));
    pieces = CornersBoard.apply(pieces, m);
  }
  final keys = <String>[];
  for (var i = 0; i < p.line.length; i++) {
    final (_, to) = p.line[i];
    final over = overs[i];
    if (over.length >= 2) {
      keys.add('teachCnChain');
    } else if (over.length == 1 && board.stones.contains(over.first)) {
      keys.add('teachCnStone');
    } else if (over.length == 1) {
      keys.add('teachCnJump');
    } else if (_isBridge(p.line, overs, i, to)) {
      keys.add('teachCnBridge');
    } else if (board.target.contains(to)) {
      keys.add('teachCnHome');
    } else {
      keys.add('teachCnStep');
    }
  }
  return keys;
}

/// Мост: пока фишка стоит на `cell`, через неё прыгает следующий ход.
bool _isBridge(List<(int, int)> line, List<List<int>> overs, int i, int cell) {
  for (var j = i + 1; j < line.length; j++) {
    if (overs[j].contains(cell)) return true;
    if (line[j].$1 == cell) return false;
  }
  return false;
}

LessonStep _step(
  String key,
  CnLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

List<LessonStep> cornersLessonSteps(CornersPuzzle p) {
  if (p.line.isEmpty) return const [];
  final keys = cornersLineKeys(p);
  final board = p.board;
  var pieces = p.startMask;
  final out = <LessonStep>[
    _step('teachCnRule', CnLessonFrame(pieces: pieces), {
      'k': '${p.count}',
      'n': '${p.minimum}',
    }),
  ];
  for (var i = 0; i < p.line.length; i++) {
    final m = p.line[i];
    final over = cornersJumpOver(board, pieces, m);
    pieces = CornersBoard.apply(pieces, m);
    out.add(
      _step(keys[i], CnLessonFrame(pieces: pieces, move: m), {
        'move':
            '${cornersCellName(p.size, m.$1)}–${cornersCellName(p.size, m.$2)}',
        'n': '${over.length}',
      }),
    );
  }
  out.add(
    _step('teachCnDone', CnLessonFrame(pieces: pieces), {'n': '${p.minimum}'}),
  );
  return out;
}

List<LessonStep> cornersLessonForLevel(
  CornersCorpus corpus,
  int level, {
  required int seed,
}) => [
  for (final p in cornersDeckFor(corpus, level, seed: seed, count: 1))
    ...cornersLessonSteps(p),
];

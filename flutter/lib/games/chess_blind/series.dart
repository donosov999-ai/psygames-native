/// СЕРИЯ ИЗ ТРЁХ БЛОКОВ: цвет поля, маршрут коня, память о позиции.
///
/// Перенос с живого TS (`core/blocks.ts`, `core/knight.ts`) ЧИСЛО В ЧИСЛО:
/// строители берут генератор случайных чисел снаружи, поэтому при одинаковой
/// последовательности выдача обязана совпасть с вебом целиком — это и сверяется.
///
/// 🔴 КООРДИНАТЫ ЗДЕСЬ ЯДЕРНЫЕ (0 = a1, снизу вверх), а не экранные. Блок памяти
/// спрашивает про клетки позиции, и перепутать записи значит спросить про другую
/// клетку доски.
library;

import 'bands.dart';

/// Тот же генератор, что в вебе: линейный конгруэнтный 1664525 / 1013904223
/// по модулю 2^32. Нужен, чтобы выдачу можно было сверить, а не «посмотреть».
double Function() lcg(int seed) {
  var state = seed & 0xFFFFFFFF;
  return () {
    state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return state / 4294967296;
  };
}

const int questionsPerBlock = 8;
const int chessBlockMaxErrors = 2;
const int knightWrongGap = 2;
const List<String> chessSeriesPlan = ['square', 'knight', 'recall'];

String blockKeyAt(int blockIndex) =>
    blockIndex >= 0 && blockIndex < chessSeriesPlan.length
    ? chessSeriesPlan[blockIndex]
    : chessSeriesPlan.last;

/// Ровно половина ответов «да», порядок перемешан.
List<bool> balancedAnswers(int count, double Function() random) {
  final yes = (count / 2).round();
  final out = List<bool>.generate(count, (i) => i < yes);
  for (var i = out.length - 1; i > 0; i--) {
    final j = (random() * (i + 1)).floor() % (i + 1);
    final tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

T _pick<T>(List<T> list, double Function() random) =>
    list[(random() * list.length).floor() % list.length];

const List<List<int>> _jumps = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

List<int> knightMoves(int from) {
  final file = from % 8;
  final rank = from ~/ 8;
  final out = <int>[];
  for (final j in _jumps) {
    final f = file + j[0];
    final r = rank + j[1];
    if (f < 0 || f >= 8 || r < 0 || r >= 8) continue;
    out.add(r * 8 + f);
  }
  return out;
}

/// Расстояния конём по ПУСТОЙ доске: фигуры маршруту не мешают, и это нарочно.
List<int> knightDistances(int from) {
  final dist = List<int>.filled(64, -1);
  dist[from] = 0;
  final queue = <int>[from];
  for (var head = 0; head < queue.length; head++) {
    final square = queue[head];
    for (final next in knightMoves(square)) {
      if (dist[next] >= 0) continue;
      dist[next] = dist[square] + 1;
      queue.add(next);
    }
  }
  return dist;
}

int knightDistance(int from, int to) => knightDistances(from)[to];

List<int> squaresAtDistance(int from, int steps) {
  final dist = knightDistances(from);
  return [
    for (var i = 0; i < 64; i++)
      if (dist[i] == steps) i,
  ];
}

List<int> _shuffledSquares(double Function() random) {
  final all = List<int>.generate(64, (i) => i);
  for (var i = all.length - 1; i > 0; i--) {
    final j = (random() * (i + 1)).floor() % (i + 1);
    final tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }
  return all;
}

({int from, int to})? pairAtDistance(int steps, double Function() random) {
  for (final from in _shuffledSquares(random)) {
    final targets = squaresAtDistance(from, steps);
    if (targets.isEmpty) continue;
    return (
      from: from,
      to: targets[(random() * targets.length).floor() % targets.length],
    );
  }
  return null;
}

/// Вопрос серии. Вид определяется полем `kind`, как в вебе.
class SeriesQuestion {
  const SeriesQuestion({
    required this.kind,
    required this.answer,
    this.a,
    this.b,
    this.from,
    this.to,
    this.moves,
    this.distance,
    this.square,
    this.claim,
    this.truth,
  });

  final String kind;
  final bool answer;
  final int? a;
  final int? b;
  final int? from;
  final int? to;
  final int? moves;
  final int? distance;
  final int? square;

  /// Что утверждают про клетку и что там стояло на самом деле: «цвет+вид».
  final String? claim;
  final String? truth;
}

bool _sameColour(int a, int b) =>
    ((a % 8 + a ~/ 8) % 2) == ((b % 8 + b ~/ 8) % 2);

/// Блок 1: одного ли цвета два поля.
List<SeriesQuestion> buildSquareQuestions(int count, double Function() random) {
  final answers = balancedAnswers(count, random);
  final used = <String>{};
  final out = <SeriesQuestion>[];
  for (final answer in answers) {
    SeriesQuestion? made;
    for (var tries = 0; tries < 200 && made == null; tries++) {
      final a = (random() * 64).floor() % 64;
      final targets = <int>[
        for (var b = 0; b < 64; b++)
          if (b != a && _sameColour(a, b) == answer) b,
      ];
      final b = _pick(targets, random);
      final key = '${a < b ? a : b}-${a < b ? b : a}';
      if (used.contains(key)) continue;
      used.add(key);
      made = SeriesQuestion(kind: 'square', a: a, b: b, answer: answer);
    }
    if (made != null) out.add(made);
  }
  return out;
}

/// Блок 2: дойдёт ли конь за N ходов. Неверный ответ — пара ровно с N + 2.
List<SeriesQuestion> buildKnightQuestions(
  int count,
  int moves,
  double Function() random,
) {
  final answers = balancedAnswers(count, random);
  final used = <String>{};
  final out = <SeriesQuestion>[];
  for (final answer in answers) {
    final distance = answer ? moves : moves + knightWrongGap;
    SeriesQuestion? made;
    for (var tries = 0; tries < 200 && made == null; tries++) {
      final pair = pairAtDistance(distance, random);
      if (pair == null) break;
      final key = '${pair.from}-${pair.to}';
      if (used.contains(key)) continue;
      used.add(key);
      made = SeriesQuestion(
        kind: 'knight',
        from: pair.from,
        to: pair.to,
        moves: moves,
        distance: distance,
        answer: answer,
      );
    }
    if (made != null) out.add(made);
  }
  return out;
}

int _takeSquare(List<int> pool, Set<int> used, double Function() random) {
  final free = [
    for (final s in pool)
      if (!used.contains(s)) s,
  ];
  if (free.isEmpty) return -1;
  final square = _pick(free, random);
  used.add(square);
  return square;
}

/// Блок 3: стояла ли на этой клетке вот эта фигура.
///
/// 🔴 «ПУСТО» НЕ БЫВАЕТ УТВЕРЖДЕНИЕМ. На доске из 20 фигур пусто 44 клетки:
/// «здесь было пусто» верно почти всегда, и отвечать «да» выгоднее, ничего не
/// вспоминая. Поэтому утверждение — всегда фигура.
///
/// 🔴 НАЗВАННАЯ ФИГУРА БЕРЁТСЯ С ДОСКИ, А НЕ ИЗ СПИСКА ВИДОВ: иначе частоты
/// выдают ответ («названа пешка → скорее да»).
List<SeriesQuestion> buildRecallQuestions(
  List<String?> squares,
  int count,
  double Function() random,
) {
  final answers = balancedAnswers(count, random);
  final occupied = <int>[];
  final empty = <int>[];
  for (var i = 0; i < 64; i++) {
    (squares[i] != null ? occupied : empty).add(i);
  }
  final used = <int>{};

  // Занятые поля под верные утверждения резервируются ДО всего остального:
  // на бедной доске неверные вопросы успевали их разобрать.
  final reserved = <int>[];
  for (var i = answers.where((a) => a).length; i > 0; i--) {
    final square = _takeSquare(occupied, used, random);
    if (square < 0) break;
    reserved.add(square);
  }

  final out = <SeriesQuestion>[];
  for (final answer in answers) {
    if (answer) {
      if (reserved.isEmpty) continue;
      final square = reserved.removeLast();
      final truth = squares[square];
      out.add(
        SeriesQuestion(
          kind: 'recall',
          square: square,
          claim: truth,
          truth: truth,
          answer: true,
        ),
      );
      continue;
    }
    final first = random() < 0.5 ? empty : occupied;
    var square = _takeSquare(first, used, random);
    if (square < 0) {
      square = _takeSquare(
        identical(first, empty) ? occupied : empty,
        used,
        random,
      );
    }
    if (square < 0) continue;
    final truth = squares[square];
    final others = [
      for (final sq in occupied)
        if (squares[sq] != truth) sq,
    ];
    if (others.isEmpty) continue;
    out.add(
      SeriesQuestion(
        kind: 'recall',
        square: square,
        claim: squares[_pick(others, random)],
        truth: truth,
        answer: false,
      ),
    );
  }
  return out;
}

/// Вопросы блока по ГОТОВОЙ позиции: саму позицию здесь не выбирают.
List<SeriesQuestion> buildBlockQuestions({
  required List<String?> squares,
  required int level,
  required int blockIndex,
  required double Function() random,
}) {
  final key = blockKeyAt(blockIndex);
  if (key == 'square') return buildSquareQuestions(questionsPerBlock, random);
  if (key == 'knight') {
    return buildKnightQuestions(
      questionsPerBlock,
      knightMovesForLevel(level),
      random,
    );
  }
  return buildRecallQuestions(squares, questionsPerBlock, random);
}

/// Позиция в ЯДЕРНЫХ координатах: «цвет+вид» на каждой из 64 клеток.
List<String?> coreSquaresFromFen(String fen) {
  final rows = fen.trim().split(' ').first.split('/');
  final out = List<String?>.filled(64, null);
  for (var row = 0; row < rows.length; row++) {
    var file = 0;
    for (final ch in rows[row].split('')) {
      final empty = int.tryParse(ch);
      if (empty != null) {
        file += empty;
        continue;
      }
      final white = ch.toUpperCase() == ch;
      out[(7 - row) * 8 + file] = '${white ? 'w' : 'b'}${ch.toLowerCase()}';
      file++;
    }
  }
  return out;
}

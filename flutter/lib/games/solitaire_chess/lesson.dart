/// РАЗБОР «ШАХМАТНОГО ПАСЬЯНСА» ПО ШАГАМ: каждое взятие названо приёмом.
///
/// Материал — доски того же подхода, что раздаст «Начать» (`solitaireDeckFor`).
/// Разбор открывается ДО партии.
///
/// 🔴 ШАГ БЕЗ ИМЕНИ ПРИЁМА — ЭТО ПОКАЗ ОТВЕТА. Поэтому:
///   · из всех решений доски берётся то, где названных шагов БОЛЬШЕ всего;
///   · у каждого взятия — почему оно: единственное взятие на доске · единственное, что
///     не ведёт в тупик · до цели достаёт только эта фигура · берёт та, что останется
///     последней · последнее взятие. Только если ни одно не подходит — «решение
///     ещё есть» (честная запасная строка, доля таких шагов меряется пробой).
library;

import '../../shell/l10n.dart';
import '../../shell/lesson.dart';
import 'ladder.dart';
import 'puzzle.dart';

/// Ключи шагов — списком: сборщик словаря видит только литералы и такие списки.
const solitaireLessonKeys = <String>[
  'teachSolRule',
  'teachSolPlan',
  'teachSolOnlyCapture',
  'teachSolOnlySafe',
  'teachSolLoneTarget',
  'teachSolSurvivor',
  'teachSolSafe',
  'teachSolLast',
];

/// Ключ имени фигуры по букве — готовые ключи «Доски в уме».
const solitairePieceKeys = <String, String>{
  'K': 'chessPcWK',
  'Q': 'chessPcWQ',
  'R': 'chessPcWR',
  'B': 'chessPcWB',
  'N': 'chessPcWN',
  'P': 'chessPcWP',
};

/// Сколько досок показывает разбор.
const int solitaireLessonExamples = 2;

/// Сколько решений самое большее перебирается в поиске самого «объяснимого».
const int _solutionCap = 400;

class SolitaireLessonFrame {
  const SolitaireLessonFrame({required this.code, this.from, this.to});
  final String code;
  final int? from;
  final int? to;
}

/// Почему сделано взятие — ключ шага.
String solitaireMoveKey(
  SolitaireBoard b,
  (int, int) m, {
  required int survivorFrom,
}) {
  final after = b.play(m.$1, m.$2);
  if (after.solved) return 'teachSolLast';
  final all = b.captures;
  if (all.length == 1) return 'teachSolOnlyCapture';
  if (solitaireSafeCaptures(b).length == 1) return 'teachSolOnlySafe';
  if (all.where((c) => c.$2 == m.$2).length == 1) return 'teachSolLoneTarget';
  if (m.$1 == survivorFrom) return 'teachSolSurvivor';
  return 'teachSolSafe';
}

/// Решение с наибольшим числом названных шагов: (ходы, ключи шагов).
(List<(int, int)>, List<String>) solitaireExplainedSolution(
  SolitaireBoard start,
) {
  final solutions = <List<(int, int)>>[];
  final memo = <String, bool>{};
  bool solvable(SolitaireBoard x) =>
      x.solved ||
      (memo[x.code] ??= x.captures.any((m) => solvable(x.play(m.$1, m.$2))));
  void go(SolitaireBoard x, List<(int, int)> path) {
    if (solutions.length >= _solutionCap) return;
    if (x.solved) {
      solutions.add(path);
      return;
    }
    for (final m in x.captures) {
      final y = x.play(m.$1, m.$2);
      if (solvable(y)) go(y, [...path, m]);
    }
  }

  go(start, const []);
  List<(int, int)>? best;
  List<String> bestKeys = const [];
  var bestScore = -1;
  for (final path in solutions) {
    // Где стоит выжившая фигура перед каждым ходом: идём от конца назад.
    final survivorAt = List<int>.filled(path.length, -1);
    var at = path.last.$2;
    for (var i = path.length - 1; i >= 0; i--) {
      // После хода i на клетке «куда» стоит взявшая фигура: до хода она была на «откуда».
      if (path[i].$2 == at) at = path[i].$1;
      survivorAt[i] = at;
    }
    final keys = <String>[];
    var x = start;
    for (var i = 0; i < path.length; i++) {
      keys.add(solitaireMoveKey(x, path[i], survivorFrom: survivorAt[i]));
      x = x.play(path[i].$1, path[i].$2);
    }
    final score = keys.where((k) => k != 'teachSolSafe').length;
    if (score > bestScore) {
      bestScore = score;
      best = path;
      bestKeys = keys;
    }
  }
  return (best ?? const [], bestKeys);
}

String solitaireSquareName(int sq, {int dim = 4}) =>
    '${'abcdefgh'[sq % dim]}${dim - sq ~/ dim}';

LessonStep _step(
  String key,
  SolitaireLessonFrame f, [
  Map<String, String> args = const {},
]) => LessonStep(
  techniqueKey: key,
  text: args.isEmpty ? L.t(key) : L.f(key, args),
  payload: f,
);

/// Шаги разбора одной доски.
List<LessonStep> solitaireLessonSteps(SolitairePuzzle p) {
  final start = p.board;
  final (path, keys) = solitaireExplainedSolution(start);
  if (path.isEmpty) return const [];
  final survivor = start.cells[_survivorStart(path)]!;
  final out = <LessonStep>[
    _step('teachSolRule', SolitaireLessonFrame(code: start.code)),
    _step(
      'teachSolPlan',
      SolitaireLessonFrame(code: start.code, from: _survivorStart(path)),
      {'piece': L.t(solitairePieceKeys[survivor]!)},
    ),
  ];
  var x = start;
  for (var i = 0; i < path.length; i++) {
    final (f, t) = path[i];
    final move =
        '${L.t(solitairePieceKeys[x.cells[f]!]!)} ${solitaireSquareName(f)}×${solitaireSquareName(t)}';
    x = x.play(f, t);
    out.add(
      _step(keys[i], SolitaireLessonFrame(code: x.code, from: f, to: t), {
        'n': '${i + 1}',
        'move': move,
      }),
    );
  }
  return out;
}

/// Клетка, с которой начинает выжившая фигура.
int _survivorStart(List<(int, int)> path) {
  var at = path.last.$2;
  for (var i = path.length - 1; i >= 0; i--) {
    if (path[i].$2 == at) at = path[i].$1;
  }
  return at;
}

/// Разбор ступени: первые доски подхода с тем же зерном, что у «Начать».
List<LessonStep> solitaireLessonForLevel(
  SolitaireCorpus corpus,
  int level, {
  required int seed,
}) {
  final deck = solitaireDeckFor(
    corpus,
    level,
    seed: seed,
    count: solitaireLessonExamples,
  );
  return [for (final p in deck) ...solitaireLessonSteps(p)];
}

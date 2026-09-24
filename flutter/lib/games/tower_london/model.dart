/// ПРАВИЛА «ЛОНДОНСКОЙ БАШНИ» — перенос из живого экрана
/// (`app/games/tower-london.tsx`).
///
/// 🔴 ЧЕМ ОНА ОТЛИЧАЕТСЯ ОТ ХАНОЙСКОЙ. Там ход ограничен РАЗМЕРОМ диска, здесь —
/// ВМЕСТИМОСТЬЮ стержня: [3,2,1] на трёх шарах и [4,3,1] на четырёх (с L11).
/// Шары равноправны, и задача не «перенести башню», а СОБРАТЬ ЗАДАННОЕ
/// положение за наименьшее число ходов: игра на планирование, а не на рекурсию.
///
/// ⚠️ ГЕНЕРАТОР ЗАДАЧ НЕ ПЕРЕНОСИЛСЯ. Он раздаёт задачи случайным блужданием и
/// проверяет длину плана поиском в ширину; задачи выгружены живым TS и лежат в
/// `assets/levels/tower_london.json` вместе с минимумом ходов.
library;

import 'dart:convert';

/// Цвет шара: R, G, B и Y (четвёртый — с одиннадцатого уровня).
typedef Peg = List<String>;

class TolState {
  TolState(this.pegs, this.caps);

  factory TolState.fromJson(List<dynamic> pegs, List<int> caps) =>
      TolState(pegs.map((p) => (p as List).cast<String>()).toList(), [...caps]);

  /// Три стержня, снизу вверх.
  final List<Peg> pegs;

  /// Вместимость каждого стержня — именно она ограничивает ход.
  final List<int> caps;

  TolState copy() => TolState(pegs.map((p) => [...p]).toList(), [...caps]);

  /// Ключ положения: по нему сверяется цель и ходит поиск.
  String get key => pegs.map((p) => p.join()).join('|');

  bool canMove(int from, int to) {
    if (from == to) return false;
    if (from < 0 || to < 0 || from >= pegs.length || to >= pegs.length) return false;
    if (pegs[from].isEmpty) return false;
    return pegs[to].length < caps[to];
  }

  TolState? move(int from, int to) {
    if (!canMove(from, to)) return null;
    final next = copy();
    next.pegs[to].add(next.pegs[from].removeLast());
    return next;
  }

  List<({int from, int to})> legalMoves() {
    final out = <({int from, int to})>[];
    for (var from = 0; from < pegs.length; from += 1) {
      if (pegs[from].isEmpty) continue;
      for (var to = 0; to < pegs.length; to += 1) {
        if (canMove(from, to)) out.add((from: from, to: to));
      }
    }
    return out;
  }
}

/// Одна задача: откуда, куда и минимум ходов (посчитан при выгрузке).
class TolPuzzle {
  const TolPuzzle({required this.start, required this.goal, required this.minMoves, required this.caps});

  factory TolPuzzle.fromJson(Map<String, dynamic> j) {
    final caps = (j['caps'] as List).cast<int>();
    return TolPuzzle(
      start: TolState.fromJson(j['start'] as List, caps),
      goal: TolState.fromJson(j['goal'] as List, caps),
      minMoves: j['minMoves'] as int,
      caps: caps,
    );
  }

  final TolState start;
  final TolState goal;
  final int minMoves;
  final List<int> caps;
}

class TolLevel {
  const TolLevel({required this.level, required this.targetMoves, required this.balls, required this.puzzles});

  factory TolLevel.fromJson(Map<String, dynamic> j) => TolLevel(
        level: j['level'] as int,
        targetMoves: j['targetMoves'] as int,
        balls: j['balls'] as int,
        puzzles: (j['puzzles'] as List).map((p) => TolPuzzle.fromJson(p as Map<String, dynamic>)).toList(),
      );

  final int level;
  final int targetMoves;
  final int balls;
  final List<TolPuzzle> puzzles;
}

class TolLevelSet {
  TolLevelSet(this.levels, this.rounds);

  factory TolLevelSet.fromJsonString(String raw) {
    final j = jsonDecode(raw) as Map<String, dynamic>;
    return TolLevelSet(
      (j['levels'] as List).map((e) => TolLevel.fromJson(e as Map<String, dynamic>)).toList(),
      (j['rounds'] as num?)?.toInt() ?? 5,
    );
  }

  final List<TolLevel> levels;

  /// Сколько задач в партии. Партия засчитывается целиком, а не по одной задаче.
  final int rounds;

  TolLevel byLevel(int level) {
    if (levels.isEmpty) throw StateError('уровней нет');
    if (level <= levels.length) return levels[level - 1];
    return levels.last;
  }

  /// Уровень с заданной длиной плана и числом шаров — для ШАГА ЗАРЯДКИ.
  ///
  /// 🔴 ЗАЧЕМ ОТДЕЛЬНАЯ ДВЕРЬ. В вебе шаг не берёт уровень лестницы, а СОБИРАЕТ
  /// задачу по сложности: `frontend/app/games/tower-london.tsx:175` —
  /// лёгкий 3 хода, средний 5, трудный 7, шаров всегда три. Генератор мы не
  /// переносили, задачи лежат набором; значит по тем же числам надо ВЫБРАТЬ
  /// готовый уровень, а не выдумывать свой.
  ///
  /// ⚠️ Точного совпадения может не быть (набор даёт планы 2…8): берём
  /// БЛИЖАЙШИЙ по длине плана среди уровней с нужным числом шаров, а если и
  /// таких нет — ближайший вообще. Молча отдать уровень лестницы было бы хуже
  /// всего: шаг выглядел бы работающим и играл чужую сложность.
  TolLevel byTarget(int targetMoves, int balls) {
    if (levels.isEmpty) throw StateError('уровней нет');
    final same = levels.where((l) => l.balls == balls).toList();
    final pool = same.isNotEmpty ? same : levels;
    var best = pool.first;
    for (final l in pool) {
      if ((l.targetMoves - targetMoves).abs() < (best.targetMoves - targetMoves).abs()) best = l;
    }
    return best;
  }
}

/// Партия пройдена, если ЛИШНИХ ходов (сверх минимума, по всем задачам) не
/// больше, чем задач. То есть в среднем не больше одного лишнего хода на задачу.
bool tolPassed(int extraMoves, int rounds) => extraMoves <= rounds;

/// Счёт партии — та же формула, что в вебе.
int tolScore(int solved, int extraMoves, int errors, int seconds) {
  final v = solved * 200 - extraMoves * 30 - errors * 20 - seconds;
  return v < 0 ? 0 : v;
}

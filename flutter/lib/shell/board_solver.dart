library;

import 'dart:collection';

import 'board_puzzle.dart';
import 'lesson.dart';

/// 🔴 ОДИН РЕШАТЕЛЬ НА ВСЕ НАШИ ИГРЫ С ДОСКОЙ.
///
/// Тот же приём, что дал разбор 37 режимам Тэтхэма одной интеграцией: там общим
/// был движок, здесь общим становится ПОИСК. Игра отдаёт три метода
/// ([BoardPuzzle]), и дальше этот код решает её, ничего про неё не зная.
///
/// ⚠️ ПОИСК В ШИРИНУ, А НЕ «УМНЫЙ». Ширина даёт КРАТЧАЙШЕЕ решение, а для разбора
/// это важнее скорости: показывать человеку путь длиннее необходимого — значит
/// учить плохому. Умный поиск потребовал бы от каждой игры оценку позиции, то
/// есть ровно той ручной работы, которой мы и избегаем.
///
/// 🔴 И ГЛАВНОЕ ПРО ЧЕСТНОСТЬ: ЕСЛИ НЕ УЛОЖИЛИСЬ — ОТДАЁМ ПУСТО, А НЕ ПОЧТИ-РЕШЕНИЕ.
/// Пространство положений у сортировок растёт быстро, и без потолка поиск съел бы
/// телефон. Потолок есть, и при его достижении ответ — «решения не нашёл»: кнопки
/// разбора тогда просто нет. Показать неполный путь было бы хуже, чем не показать
/// ничего, — человек дошёл бы до тупика с нашей подачи.
class BoardSolver {
  BoardSolver._();

  /// Кратчайшая последовательность ходов до решения; пусто — не нашли.
  ///
  /// [maxStates] — потолок разобранных положений. По умолчанию столько, сколько
  /// разбирается на телефоне за доли секунды.
  static List<M> solve<S, M>(
    BoardPuzzle<S, M> game,
    S from, {
    int maxStates = 120000,
  }) {
    if (game.solved(from)) return const [];
    final startKey = game.keyOf(from);
    final seen = <String>{startKey};
    // Очередь хранит положение и путь до него. Путь копируется на каждом шаге —
    // это дороже по памяти, зато не надо тянуть обратные ссылки и разворачивать.
    final queue = Queue<(S, List<M>)>()..add((from, const []));
    var visited = 0;

    while (queue.isNotEmpty) {
      final (state, path) = queue.removeFirst();
      for (final move in game.movesFrom(state)) {
        final next = game.apply(state, move);
        if (next == null) continue;
        final key = game.keyOf(next);
        if (!seen.add(key)) continue;
        final route = [...path, move];
        if (game.solved(next)) return route;
        if (++visited >= maxStates) return const [];
        queue.add((next, route));
      }
    }
    return const [];
  }
}

/// РАЗБОР ДЛЯ ЛЮБОЙ ИГРЫ, ОТДАВШЕЙ ДОГОВОР ДОСКИ.
///
/// Шаг = один ход решения. В нагрузке шага едет положение ПОСЛЕ хода и сам ход:
/// рисует их игра — она одна знает, как выглядит её доска.
class BoardLesson<S, M> extends LessonSource {
  BoardLesson(this.game, this.from, {this.maxStates = 120000});

  final BoardPuzzle<S, M> game;
  final S from;
  final int maxStates;

  String? _reason;

  @override
  String? get unavailableReason => _reason;

  @override
  Future<List<LessonStep>> steps() async {
    final moves = BoardSolver.solve(game, from, maxStates: maxStates);
    if (moves.isEmpty) {
      _reason = game.solved(from)
          ? 'already-solved'
          : 'no-solution-within maxStates=$maxStates';
      return const [];
    }
    var state = from;
    final out = <LessonStep>[];
    for (final move in moves) {
      final next = game.apply(state, move);
      if (next == null) break;   // договор нарушен — лучше короткий разбор, чем ложный
      out.add(LessonStep(payload: (move: move, after: next)));
      state = next;
    }
    return out;
  }
}

/// РАЗБОР ИЗ ГОТОВОГО РЕШЕНИЯ — КОГДА ИСКАТЬ НЕЧЕГО.
///
/// 🔴 ПОЧЕМУ ЭТО ВАЖНЕЕ, ЧЕМ КАЖЕТСЯ. Часть наших игр ВЕЗЁТ эталонное решение прямо
/// в данных уровня: у «Соедини точки» это `solution` (путь каждой пары), у «Одной
/// линии» — `solutionEdgeIds`. Генератор посчитал его, когда собирал уровень.
/// Гонять по такому уровню поиск значило бы решать заново задачу, ответ на которую
/// лежит рядом, — и рисковать тем, что поиск найдёт ДРУГОЙ путь, не тот, по
/// которому уровень задуман.
///
/// ⚠️ Поэтому правило: есть готовое решение — берём его; нет — ищем [BoardSolver].
class StepsLesson extends LessonSource {
  StepsLesson(this._steps, {this.reason});

  final List<LessonStep> _steps;

  /// Почему решения нет, если список пуст.
  final String? reason;

  @override
  String? get unavailableReason => _steps.isEmpty ? (reason ?? 'no-solution-in-level') : null;

  @override
  Future<List<LessonStep>> steps() async => _steps;
}

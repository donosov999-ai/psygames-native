/// ЛЕСТНИЦА «НАЙДИ ХОД»: ТРИ ОСИ И РЕЙТИНГ ВНУТРИ.
///
/// Схема — `~/dev/psygames/chess-chat/FIND_MOVE_SCHEME.md` §4. Урок раздела
/// (план 12.09, Б6): рейтинг не заменяет лестницу. Лестница — порядок навыков,
/// рейтинг задачи Lichess — трудность внутри навыка.
///
/// Четыре группы по шесть ступеней. Группа открывает три новых приёма:
///   · первые три ступени — ТОЛЬКО новые приёмы, и приём назван над доской
///     («Вилка»): человек учится видеть его;
///   · следующие три — ВСЕ открытые приёмы, и приём скрыт («Найди выигрыш»):
///     узнать приём самому — это и есть навык.
/// Полоса рейтинга растёт на одну каждые четыре ступени; на ступенях знакомства
/// с новым приёмом она на одну ниже — новый приём не встречают сразу трудным.
library;

import 'dart:math';

import 'corpus.dart';

const int findMoveLevels = 24;

/// Задач в подходе.
const int findMoveDeck = 5;

/// Секунд на задачу. Одно число на всю лестницу: трудность растёт рейтингом
/// задачи, а не спешкой; подсказка появляется на половине.
const int findMoveSeconds = 60;

/// Верных БЕЗ подсказки, чтобы подняться; столько и меньше верных — спуск.
const int findMovePassClean = 4;
const int findMoveFailAtMost = 2;

class FindMoveStep {
  const FindMoveStep({
    required this.themes,
    required this.themeShown,
    required this.band,
    required this.maxMoves,
  });

  /// Номера приёмов в [findMoveThemes], из которых собирается подход.
  final List<int> themes;

  /// Назван ли приём над доской.
  final bool themeShown;

  /// Полоса рейтинга задачи (0 — ниже 1000).
  final int band;

  /// Сколько ходов человека самое большее.
  final int maxMoves;
}

FindMoveStep findMoveStep(int level) {
  final l = level.clamp(1, findMoveLevels);
  final group = (l - 1) ~/ 6;
  final within = (l - 1) % 6;
  final shown = within < 3;
  final themes = shown
      ? [for (var t = group * 3; t < group * 3 + 3; t++) t]
      : [for (var t = 0; t < group * 3 + 3; t++) t];
  final base = (l - 1) ~/ 4;
  return FindMoveStep(
    themes: themes,
    themeShown: shown,
    band: shown ? max(0, base - 1) : base,
    maxMoves: l <= 12 ? 2 : 3,
  );
}

/// Ступень, на которой открывается приём [theme].
int findMoveOpensAt(int theme) => (theme ~/ 3) * 6 + 1;

/// Подход ступени [level]: приёмы по кругу, из каждой полосы — ближайшая к
/// нужной, где этот приём есть. Одна и та же задача в подходе дважды не бывает.
List<FindMovePuzzle> findMoveDeckFor(
  FindMoveCorpus corpus,
  int level, {
  required int seed,
  int count = findMoveDeck,
}) {
  final step = findMoveStep(level);
  final rnd = Random(seed);
  final themes = [...step.themes]..shuffle(rnd);
  final out = <FindMovePuzzle>[];
  final used = <String>{};
  for (var i = 0; out.length < count && i < count * 4; i++) {
    final theme = themes[i % themes.length];
    final fit = corpus.puzzles
        .where(
          (p) =>
              p.theme == theme &&
              p.playerMoves <= step.maxMoves &&
              !used.contains(p.id),
        )
        .toList();
    if (fit.isEmpty) continue;
    // Ближайшая полоса: сначала нужная, потом на одну ниже, на одну выше…
    var best = fit;
    for (var d = 0; d < 6; d++) {
      final near = fit
          .where((p) => p.band == step.band - d || p.band == step.band + d)
          .toList();
      if (near.isNotEmpty) {
        final exact = near.where((p) => p.band <= step.band).toList();
        best = exact.isNotEmpty ? exact : near;
        break;
      }
    }
    final pick = best[rnd.nextInt(best.length)];
    used.add(pick.id);
    out.add(pick);
  }
  return out;
}

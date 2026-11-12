/// РАЗБОР ЗАРЯДКИ ПО НАВЫКАМ: где сегодня вышло лучше обычного, а где просело.
///
/// Порт `frontend/src/services/warmupBreakdown.ts` (VER 1, 04.09.2026) — чистая функция без
/// хранилища: её звал веб-экран «Зарядка завершена» (`app/warmup-complete.tsx`), а нативный
/// итог будет звать этот же код, когда движок зарядки уйдёт с WebView (задача 4191419c).
///
/// ⚠️ СРАВНИВАЕМ ИГРУ С САМОЙ СОБОЙ, А НЕ ИГРЫ МЕЖДУ СОБОЙ. Очки у «Шульте» и «Ханойской башни»
/// живут в разных шкалах: сложить их и назвать это «памятью» значит выдать за вывод разницу
/// масштабов. Поэтому у КАЖДОЙ игры считается отклонение от её собственного прошлого среднего в
/// процентах, и уже проценты усредняются по навыку — они сравнимы.
///
/// ⚠️ БЕЗ ИСТОРИИ ВЫВОДА НЕТ. Игра, сыгранная сегодня впервые, из разбора выпадает: «ты просел» по
/// одному замеру — шум. Порог держим явным ([kMinGames]), чтобы его было видно и можно было оспорить.
library;

/// Сколько прошлых партий нужно, чтобы среднее что-то значило (веб `МИНИМУМ_ПАРТИЙ`).
const int kMinGames = 2;

/// На сколько процентов надо разойтись, чтобы это называлось ростом или провалом (веб `ПОРОГ_ПРОЦЕНТОВ`).
const double kThresholdPercent = 8;

/// Партия для разбора: игра и очки.
class BreakdownGame {
  const BreakdownGame(this.gameType, this.score);

  final String gameType;
  final num score;
}

/// Итог навыка.
class SkillResult {
  const SkillResult({required this.skillKey, required this.delta, required this.games});

  final String skillKey;

  /// Отклонение от привычного уровня, проценты. Плюс — лучше обычного.
  final double delta;

  /// Сколько игр этого навыка попало в расчёт.
  final int games;
}

/// Разбор целиком.
class Breakdown {
  const Breakdown({required this.skills, required this.best, required this.worst, required this.noHistory});

  /// От лучшего навыка к худшему.
  final List<SkillResult> skills;

  /// Навык с наибольшим ростом — только если рост перешагнул порог.
  final SkillResult? best;

  /// Навык с наибольшим провалом — только если провал перешагнул порог.
  final SkillResult? worst;

  /// Сколько игр не удалось сравнить: сыграны впервые или почти впервые.
  final int noHistory;
}

/// [today] — партии этой зарядки; [past] — все партии ДО неё (порядок не важен);
/// [skillOf] — `game_type` → ключ навыка, неизвестная игра выпадает из расчёта.
Breakdown skillBreakdown(
  Iterable<BreakdownGame> today,
  Iterable<BreakdownGame> past,
  String? Function(String gameType) skillOf,
) {
  final pastByGame = <String, List<num>>{};
  for (final g in past) {
    if (!g.score.isFinite) continue;
    (pastByGame[g.gameType] ??= []).add(g.score);
  }

  final bySkill = <String, List<double>>{};
  var noHistory = 0;
  for (final g in today) {
    final skill = skillOf(g.gameType);
    final was = pastByGame[g.gameType];
    if (skill == null || skill.isEmpty || was == null || was.length < kMinGames) {
      noHistory += 1;
      continue;
    }
    final mean = was.fold<num>(0, (a, b) => a + b) / was.length;
    if (mean <= 0) {
      noHistory += 1;
      continue;
    }
    (bySkill[skill] ??= []).add(((g.score - mean) / mean) * 100);
  }

  // JS-сортировка устойчива, у Dart — нет: при равных отклонениях порядок первого появления навыка.
  final entries = [
    for (final e in bySkill.entries)
      SkillResult(skillKey: e.key, delta: e.value.fold<double>(0, (a, b) => a + b) / e.value.length, games: e.value.length),
  ];
  final order = {for (var i = 0; i < entries.length; i++) entries[i].skillKey: i};
  entries.sort((a, b) {
    final byDelta = b.delta.compareTo(a.delta);
    return byDelta != 0 ? byDelta : order[a.skillKey]!.compareTo(order[b.skillKey]!);
  });

  final best = entries.isNotEmpty && entries.first.delta >= kThresholdPercent ? entries.first : null;
  final last = entries.isNotEmpty ? entries.last : null;
  final worst = last != null && last.delta <= -kThresholdPercent ? last : null;
  return Breakdown(skills: entries, best: best, worst: worst, noHistory: noHistory);
}

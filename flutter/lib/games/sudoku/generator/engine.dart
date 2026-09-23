/// ДВИЖОК ПУТИ ГЕНЕРАТОРА: рейтинг игрока и выбор следующей задачи.
///
/// Решения Дениса 18.09.2026, на которых всё держится:
///   · трудность игрока — ОДНО число (рейтинг): победа поднимает, провал опускает;
///   · номер уровня — СЧЁТЧИК ПОБЕД: только растёт, конца нет. Не вытянул — следующая
///     задача легче, а номер не падает;
///   · поблажка зависит от выбранной сложности: «Полегче» облегчает после провала,
///     «Пожёстче» держит трудность, пока не пройдёшь, «Обычная» между ними.
///
/// ⚠️ ВЫБОР ОБЯЗАН ЗАВЕРШАТЬСЯ (§8.5). Пустой пул, единственный шаблон, длинный хвост
/// повторов и потолок рейтинга не должны подвешивать экран: перебор ограничен, а
/// запасной путь всегда есть. Проба меряет это на вырожденных пулах.
library;

import 'dart:math';

import 'contract.dart';

/// Режим поблажки — тот же выбор, что у прописанных дорог.
enum Leniency {
  /// «Полегче»: после провала генератор облегчает.
  easier,

  /// «Обычная»: облегчает после нескольких провалов подряд.
  normal,

  /// «Пожёстче»: не облегчает вовсе — для упёртых и перфекционистов.
  harder,
}

/// Шаблон — то, что рейтингуется. Разовая доска живёт одну партию, шаблон живёт всегда.
class Template {
  const Template({
    required this.id,
    required this.band,
    required this.rating,
    this.variant = 'none',
  });

  final String id;

  /// Полоса трудности (у нас — ступень техник или полоса банка).
  final int band;

  /// Рейтинг шаблона: начальный из нашей меры, дальше уточняется партиями.
  final double rating;

  /// Правило доски: по нему работает запрет «одно правило не подряд».
  final String variant;
}

/// Сколько провалов подряд терпит «Обычная», прежде чем облегчить.
const normalPatience = 2;

/// Насколько двигается рейтинг: шаг тем крупнее, чем меньше о человеке известно.
double stepFor(double uncertainty) => 8 + uncertainty / 10;

/// Ожидаемая доля успеха игрока против шаблона — логистика, как у Эло.
double expectedScore(double player, double template) =>
    1 / (1 + pow(10, (template - player) / 400));

/// Применить событие к состоянию. ИДЕМПОТЕНТНО: то же `eventId` второй раз ничего не
/// меняет — офлайн-устройства и повторные отправки не должны накручивать рейтинг.
AdaptiveState applyOutcome(AdaptiveState s, OutcomeEvent e, {required Template template}) {
  if (e.eventId == s.lastEventId) return s;
  if (e.progressionKind != 'adaptive') return s;   // партия прописанного пути — не наша

  final expected = expectedScore(s.skillRating, template.rating);
  final k = stepFor(s.ratingUncertainty);

  switch (e.outcome) {
    case Outcome.passed:
      s.skillRating += k * (1 - expected);
      s.adaptiveWins += 1;                          // номер только растёт
      s.ratingUncertainty = max(60, s.ratingUncertainty * 0.93);
    case Outcome.failed:
      s.skillRating += k * (0 - expected);
      s.ratingUncertainty = max(60, s.ratingUncertainty * 0.93);
    case Outcome.assisted:
      // Подсказки не повышают рейтинг (§8.4). И не понижают: человек доиграл, просто
      // не сам — наказывать за подсказку значит учить их не брать.
      break;
    case Outcome.aborted:
      // Звонок, уход в фон, случайный выход: не партия. Ничего не трогаем.
      return s;
  }

  s.recentTemplateIds.add(template.id);
  if (s.recentTemplateIds.length > 8) s.recentTemplateIds.removeAt(0);
  s.recentOutcomes.add(e.outcome.name);
  if (s.recentOutcomes.length > 8) s.recentOutcomes.removeAt(0);
  s.lastEventId = e.eventId;
  return s;
}

/// Сколько провалов подряд в хвосте исходов.
int failStreak(AdaptiveState s) {
  var n = 0;
  for (var i = s.recentOutcomes.length - 1; i >= 0; i--) {
    if (s.recentOutcomes[i] == Outcome.failed.name) {
      n++;
    } else {
      break;
    }
  }
  return n;
}

/// Целевой рейтинг следующей задачи с учётом поблажки выбранной сложности.
///
/// 🔴 НОМЕР ПРИ ЭТОМ НЕ ТРОГАЕТСЯ. Облегчение — это про ТРУДНОСТЬ, а счётчик побед живёт
/// отдельно и падать не умеет. Ровно это и просил Денис: «эффект прогресса остаётся,
/// даже если уровень по факту не вывез».
double targetRating(AdaptiveState s, Leniency mode) {
  final streak = failStreak(s);
  switch (mode) {
    case Leniency.harder:
      // Держим трудность: упёртый игрок проходит именно эту задачу.
      return s.skillRating + 40;
    case Leniency.easier:
      return streak > 0 ? s.skillRating - 60.0 * streak : s.skillRating + 20;
    case Leniency.normal:
      return streak >= normalPatience ? s.skillRating - 50.0 * (streak - normalPatience + 1) : s.skillRating + 20;
  }
}

/// Выбрать следующий шаблон.
///
/// Правила, в порядке силы:
///   1. ближе всего к целевому рейтингу;
///   2. то же ПРАВИЛО не идёт подряд — иначе человек играет одну и ту же игру;
///   3. недавно игранный шаблон хуже давно не игранного.
///
/// ⚠️ ЗАВИСАТЬ НЕЛЬЗЯ: если после всех запретов не осталось никого, запреты снимаются по
/// одному, а не ищутся бесконечно. Пустой пул возвращает `null`, и это честный ответ,
/// на котором экран показывает прописанную лестницу.
Template? pickNext(AdaptiveState s, List<Template> pool, Leniency mode) {
  if (pool.isEmpty) return null;
  final target = targetRating(s, mode);
  final lastVariant = pool
      .where((t) => s.recentTemplateIds.isNotEmpty && t.id == s.recentTemplateIds.last)
      .map((t) => t.variant)
      .firstOrNull;

  double penalty(Template t) {
    var p = (t.rating - target).abs();
    if (t.variant == lastVariant) p += 300;                        // не то же правило подряд
    final seen = s.recentTemplateIds.lastIndexOf(t.id);
    if (seen >= 0) p += 120 * (seen + 1) / s.recentTemplateIds.length;
    return p;
  }

  // Перебор ровно по длине пула: ни одного лишнего круга.
  Template best = pool.first;
  var bestPenalty = penalty(pool.first);
  for (final t in pool.skip(1)) {
    final p = penalty(t);
    if (p < bestPenalty) {
      best = t;
      bestPenalty = p;
    }
  }
  return best;
}

extension<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}

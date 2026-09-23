/// ДОГОВОР ГЕНЕРАТОРА — ДАННЫЕ, А НЕ ТИПЫ ОДНОГО СТЕКА.
///
/// 🔴 ПОЧЕМУ ИМЕННО ТАК. Замер 23.09.2026: на веб-хук `usePersistentLevel` стоят 79
/// экранов, а на `LevelLadder` (Dart) — уже 28 перенесённых, и «Судоку» входит туда
/// целиком. Если бы договор генератора был описан типами TypeScript, каждая игра
/// ВЫПАДАЛА БЫ из генератора в момент переноса, а пилот оказался бы пилотом той версии
/// судоку, которой через неделю не будет.
/// Поэтому здесь ровно то, что кладётся в хранилище и уходит в событие; обе половины
/// приложения читают и пишут одно и то же. Полный договор — §8.8
/// `~/dev/psygames/sudoku-chat/GENERATOR_LEVELS.md`.
///
/// ⚠️ ВАРИАНТ В (решение Дениса 18.09): это ОТДЕЛЬНЫЙ путь рядом с прописанными 92
/// ступенями. Ключи прописанных уровней здесь не упоминаются вовсе — ни на чтение, ни
/// на запись. Проба `generator_isolation_test.dart` требует, чтобы после сотни
/// адаптивных партий старые ключи остались байт в байт прежними.
library;

import 'dart:convert';

/// Версия правил выбора. Растёт, когда меняется сам алгоритм, — иначе рейтинги,
/// набранные по старым правилам, молча смешались бы с новыми.
const generatorAlgorithmVersion = 1;

/// Исход партии. Четыре, а не «победа/поражение»: брошенная партия и партия с
/// подсказками — это не провал и не победа, и рейтинг они двигают по-разному.
enum Outcome {
  /// Прошёл: поднимает рейтинг и добавляет победу в счётчик.
  passed,

  /// Не вытянул: рейтинг опускается, номер НЕ падает (решение Дениса 18.09).
  failed,

  /// Бросил, ушёл в фон, позвонили: не трогает ни рейтинг, ни счётчик.
  aborted,

  /// С подсказками: рейтинг не повышает.
  assisted,
}

Outcome outcomeFromName(String s) =>
    Outcome.values.firstWhere((o) => o.name == s, orElse: () => Outcome.aborted);

/// Идентичность задания: рейтингуется ШАБЛОН, а не разовая доска.
///
/// Рейтинговать случайную доску нельзя — она живёт одну партию. Стабильная единица —
/// правило плюс полоса параметров; конкретная доска получается из шаблона по зерну.
class TaskId {
  const TaskId({
    required this.gameId,
    required this.templateId,
    required this.difficultyBand,
    required this.generatorVersion,
    required this.seed,
  });

  final String gameId;
  final String templateId;
  final int difficultyBand;
  final int generatorVersion;
  final String seed;

  Map<String, Object?> toJson() => {
        'game_id': gameId,
        'template_id': templateId,
        'difficulty_band': difficultyBand,
        'generator_version': generatorVersion,
        'seed': seed,
      };

  static TaskId fromJson(Map<String, Object?> j) => TaskId(
        gameId: j['game_id'] as String,
        templateId: j['template_id'] as String,
        difficultyBand: (j['difficulty_band'] as num).toInt(),
        generatorVersion: (j['generator_version'] as num).toInt(),
        seed: j['seed'] as String,
      );

  @override
  String toString() => '$gameId/$templateId/band$difficultyBand';
}

/// Событие исхода — то, что двигает состояние игрока. Идемпотентно по `eventId`:
/// повторное применение того же события ничего не меняет.
class OutcomeEvent {
  const OutcomeEvent({
    required this.eventId,
    required this.task,
    required this.outcome,
    this.errors = 0,
    this.hints = 0,
    this.seconds = 0,
    this.progressionKind = 'adaptive',
    required this.at,
  });

  final String eventId;
  final TaskId task;
  final Outcome outcome;
  final int errors;
  final int hints;
  final int seconds;

  /// `adaptive` — путь генератора, `fixed` — прописанные лестницы. Разделение явное,
  /// чтобы адаптивная партия никогда не открыла ступень прописанного пути.
  final String progressionKind;
  final DateTime at;

  Map<String, Object?> toJson() => {
        'event_id': eventId,
        'task': task.toJson(),
        'outcome': outcome.name,
        'errors': errors,
        'hints': hints,
        'seconds': seconds,
        'progression_kind': progressionKind,
        'at': at.toUtc().toIso8601String(),
      };

  static OutcomeEvent fromJson(Map<String, Object?> j) => OutcomeEvent(
        eventId: j['event_id'] as String,
        task: TaskId.fromJson((j['task'] as Map).cast<String, Object?>()),
        outcome: outcomeFromName(j['outcome'] as String),
        errors: (j['errors'] as num?)?.toInt() ?? 0,
        hints: (j['hints'] as num?)?.toInt() ?? 0,
        seconds: (j['seconds'] as num?)?.toInt() ?? 0,
        progressionKind: j['progression_kind'] as String? ?? 'adaptive',
        at: DateTime.parse(j['at'] as String),
      );
}

/// Состояние игрока на пути генератора: своё, отдельное от прописанных уровней.
class AdaptiveState {
  AdaptiveState({
    this.algorithmVersion = generatorAlgorithmVersion,
    this.adaptiveWins = 0,
    this.skillRating = 1200,
    this.ratingUncertainty = 350,
    List<String>? recentTemplateIds,
    List<String>? recentOutcomes,
    this.lastEventId,
  })  : recentTemplateIds = recentTemplateIds ?? <String>[],
        recentOutcomes = recentOutcomes ?? <String>[];

  int algorithmVersion;

  /// 🔴 СЧЁТЧИК ПОБЕД, А НЕ УРОВЕНЬ: только растёт, конца нет (решение Дениса 18.09).
  /// Не вытянул — следующая задача будет легче, а номер останется: эффект прогресса
  /// сохраняется, даже если трудность не выросла.
  int adaptiveWins;

  /// Трудность игрока одним числом. Победа поднимает, провал опускает.
  double skillRating;

  /// Неуверенность (RD у Glicko): у новичка широкая, с партиями сужается.
  double ratingUncertainty;

  /// Хвост шаблонов — чтобы одно правило не шло подряд.
  final List<String> recentTemplateIds;

  /// Хвост исходов — по нему считается поблажка выбранной сложности.
  final List<String> recentOutcomes;

  /// Последнее применённое событие: защита от двойного применения.
  String? lastEventId;

  Map<String, Object?> toJson() => {
        'algorithm_version': algorithmVersion,
        'adaptive_wins': adaptiveWins,
        'skill_rating': skillRating,
        'rating_uncertainty': ratingUncertainty,
        'recent_template_ids': recentTemplateIds,
        'recent_outcomes': recentOutcomes,
        'last_event_id': lastEventId,
      };

  static AdaptiveState fromJson(Map<String, Object?> j) => AdaptiveState(
        algorithmVersion: (j['algorithm_version'] as num?)?.toInt() ?? generatorAlgorithmVersion,
        adaptiveWins: (j['adaptive_wins'] as num?)?.toInt() ?? 0,
        skillRating: (j['skill_rating'] as num?)?.toDouble() ?? 1200,
        ratingUncertainty: (j['rating_uncertainty'] as num?)?.toDouble() ?? 350,
        recentTemplateIds: (j['recent_template_ids'] as List?)?.cast<String>().toList(),
        recentOutcomes: (j['recent_outcomes'] as List?)?.cast<String>().toList(),
        lastEventId: j['last_event_id'] as String?,
      );

  String encode() => jsonEncode(toJson());

  static AdaptiveState decode(String? raw) {
    if (raw == null || raw.isEmpty) return AdaptiveState();
    try {
      return AdaptiveState.fromJson(jsonDecode(raw) as Map<String, Object?>);
    } catch (_) {
      // Битое состояние не должно ронять игру: начинаем заново, прописанные уровни
      // от этого не страдают — они живут в других ключах.
      return AdaptiveState();
    }
  }
}

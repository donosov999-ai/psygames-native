import 'dart:convert';
import 'dart:math' as math;

import 'sessions.dart' show Session, jsNum, jsTruthy;
import 'shared_level_store.dart' show decodeLevelStars;
import 'shared_state.dart';
import 'streak_calendar_model.dart' show computeStreak, dayKey, dayOf;

/// ПРОВЕРКА ДОСТИЖЕНИЙ НА DART — перенос `runAchievementsCheck` / `checkNewAchievements` из
/// `frontend/src/services/achievements.ts` для учёта партий [SessionStore] (задача 0f3d3910, шаг а, срез 4).
/// Сверяется с образцом веба `test/fixtures/session_store_reference.json`.
///
/// Каждая партия: условия 32 достижений по журналу и контексту (история зарядок и её серия, оценки, серия
/// вызова дня, серия дыхания, звёзды «Слепых шахмат» и «Детского мата», серия «чисто»); новые открываются
/// в `psygames_achievements_unlocked` с местной датой, награда по категории — в баланс (только баланс, не
/// «заработано», как у веба). Список достижений и категорий — `assets/achievements.json`, каталог игр —
/// `assets/catalog.json` (как у экранов на Dart).

/// Награда за открытие по категории — `ACHIEVEMENT_REWARD` веба.
const achievementReward = {'volume': 50, 'breadth': 75, 'milestone': 60, 'streak': 100, 'quality': 100};

const _polyglotGames = {
  'word_pairs', 'vocab_srs', 'semantic_sort', 'cloze', 'lexical_decision', //
  'phoneme_pairs', 'pseudoword_echo', 'listening_span', 'phonemic_fluency',
};

/// Данные проверки: порядок и категории достижений, каталог игр.
typedef AchievementsCatalog = ({
  List<({String id, String category})> achievements,
  List<Map<String, Object?>> games,
  List<String> categoryOrder,
});

List<Object?> _list(String? raw) {
  try {
    final v = raw == null ? null : jsonDecode(raw);
    return v is List ? v : const [];
  } catch (_) {
    return const [];
  }
}

Map<String, Object?>? _map(String? raw) {
  try {
    final v = raw == null ? null : jsonDecode(raw);
    return v is Map ? v.cast<String, Object?>() : null;
  } catch (_) {
    return null;
  }
}

int _maxStarredLevel(SharedState state, String game, String pid) {
  final stars = decodeLevelStars(state.get('psygames_${game}_stars_$pid'));
  return stars.entries.where((e) => e.value > 0).fold(0, (m, e) => math.max(m, e.key));
}

/// Проверить и открыть новые достижения после партии. Возвращает id открытых.
Future<List<String>> checkAchievements(
  SharedState state, {
  required List<Session> sessions,
  required String? profileId,
  required AchievementsCatalog catalog,
  required DateTime local,
}) async {
  final warmupHistory = _list(state.get('psygames_warmup_history'));
  final assessmentHistory = _list(state.get('psygames_assessment_history'));
  final currentStreak = computeStreak(warmupHistory, dayOf(local));
  final pid = profileId != null && profileId.isNotEmpty ? profileId : null;
  final challenge = pid == null ? null : (_map(state.get('psygames_daily_challenge_streak_$pid')) ?? const {});
  final breathing = pid == null ? null : _map(state.get('psygames_breathing_streak_$pid'));
  final breathingStreak = breathing == null ? 0 : jsNum(breathing['streak'] ?? 0).toInt();
  final chessBlind = pid == null ? 0 : _maxStarredLevel(state, 'chess_blind', pid);
  final scholars = pid == null ? 0 : _maxStarredLevel(state, 'scholars_mate', pid);
  final cleanRun = pid == null ? 0 : (int.tryParse(state.get('psygames_clean_run_$pid') ?? '') ?? 0);

  Map<String, Object?> details(Session s) =>
      s['details'] is Map ? (s['details']! as Map).cast<String, Object?>() : const {};
  int countOf(bool Function(Session) f) => sessions.where(f).length;
  final uniqueGames = {for (final s in sessions) s['game_type']};
  bool done(Object? h, String track) => h is Map && h['completed'] == true && h['track'] == track;

  bool pass(String id) => switch (id) {
    'challenge_7' => jsNum(challenge?['streak'] ?? 0) >= 7,
    'challenge_30' => jsNum(challenge?['streak'] ?? 0) >= 30,
    'challenge_20_total' => jsNum(challenge?['total'] ?? 0) >= 20,
    'breathing_10' => countOf((s) => s['game_type'] == 'breathing') >= 10,
    'breathing_30' => countOf((s) => s['game_type'] == 'breathing') >= 30,
    'breathing_streak_7' => breathingStreak >= 7,
    'chess_blind_5' => chessBlind >= 5,
    'chess_blind_10' => chessBlind >= 10,
    'scholars_mate_5' => scholars >= 5,
    'scholars_mate_10' => scholars >= 10,
    'polyglot_100' => countOf((s) => _polyglotGames.contains(s['game_type'])) >= 100,
    'clean_run_5' => cleanRun >= 5,
    'first_session' => sessions.isNotEmpty,
    'sessions_10' => sessions.length >= 10,
    'sessions_50' => sessions.length >= 50,
    'sessions_100' => sessions.length >= 100,
    'sessions_500' => sessions.length >= 500,
    'streak_3' => currentStreak >= 3,
    'streak_7' => currentStreak >= 7,
    'streak_30' => currentStreak >= 30,
    'streak_100' => currentStreak >= 100,
    'twenty_unique' => uniqueGames.length >= 20,
    'all_44_games' => uniqueGames.length >= 44,
    'first_warmup' => warmupHistory.any((h) => done(h, 'training')),
    'first_assessment' => assessmentHistory.isNotEmpty,
    'first_financial' => warmupHistory.any((h) => done(h, 'financial-battery')),
    'perfect_warmup' => warmupHistory.any((h) => done(h, 'training') && (h! as Map)['errors'] == 0),
    'fast_schulte' => sessions.any(
      (s) =>
          s['game_type'] == 'schulte_table' &&
          s['difficulty'] == '5x5' &&
          jsNum(s['time_seconds']) > 0 &&
          jsNum(s['time_seconds']) < 30,
    ),
    'flanker_low' => sessions.any(
      (s) =>
          s['game_type'] == 'flanker' &&
          details(s).containsKey('flanker_effect_ms') &&
          jsNum(details(s)['flanker_effect_ms']) < 30,
    ),
    'corsi_7' => sessions.any((s) => s['game_type'] == 'corsi' && jsNum(details(s)['span']) >= 7),
    'cpt_no_omission' => sessions.any(
      (s) => s['game_type'] == 'cpt' && details(s)['omission_errors'] == 0 && jsNum(details(s)['hits']) >= 10,
    ),
    _ => false,
  };

  final unlocked = [for (final u in _list(state.get('psygames_achievements_unlocked'))) u];
  final have = {
    for (final u in unlocked)
      if (u is Map) u['id'],
  };
  final games = catalog.games;
  final playedCategories = {
    for (final s in sessions)
      for (final g in games)
        if (g['id'] == s['game_type']) g['category'],
  };
  final playedIds = {for (final s in sessions) s['game_type']};
  final newly = <({String id, String category})>[];
  final today = dayKey(dayOf(local));
  for (final a in catalog.achievements) {
    if (have.contains(a.id)) continue;
    final ok = switch (a.id) {
      'all_categories' => catalog.categoryOrder.every(playedCategories.contains),
      'all_44_games' =>
        games
            .where((g) => !jsTruthy(g['hub']))
            .every((g) => playedIds.contains(jsTruthy(g['sessionType']) ? g['sessionType'] : g['id'])),
      _ => pass(a.id),
    };
    if (ok) {
      newly.add(a);
      unlocked.add({'id': a.id, 'date': today});
    }
  }
  if (newly.isEmpty) return const [];
  await state.set('psygames_achievements_unlocked', jsonEncode(unlocked));
  if (pid != null) {
    final reward = newly.fold<int>(0, (s, a) => s + (achievementReward[a.category] ?? 50));
    if (reward > 0) {
      final tokens = _map(state.get('psygames_tokens_v1')) ?? {};
      tokens[pid] = math.max(0, jsNum(tokens[pid]).toInt() + reward);
      await state.set('psygames_tokens_v1', jsonEncode(tokens));
    }
  }
  return [for (final a in newly) a.id];
}

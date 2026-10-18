import 'dart:convert';
import 'dart:math' as math;

import '../games/sudoku/roads.dart';
import 'shared_state.dart';

/// Finish ONLY an already confirmed, durable local intent after a storage error
/// or process death. This grants no new remote access, fetches nothing and sends
/// no ACK. A completed intent can retry its ACK later without touching a new game.
/// Call before any gameplay consumer, also when cloud is currently disabled.
Future<void> recoverSudokuSupportWrites(SharedState state) async {
  const prefix = 'psygames_cloud_support_journal_';
  const issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1';
  final uuid = RegExp(
    r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
  );
  Never fail() => throw StateError('support_local_recovery_required');
  final journals = <(String, Map<String, dynamic>)>[];
  for (final pair in state.snapshot().entries.where(
    (e) => e.key.startsWith(prefix),
  )) {
    try {
      if (utf8.encode(pair.value).length > 5 * 1024 * 1024) fail();
      final env = Map<String, dynamic>.from(jsonDecode(pair.value) as Map);
      final owner = env['owner_id'];
      if (env['version'] != 1 ||
          env['issuer'] != issuer ||
          owner is! String ||
          !uuid.hasMatch(owner)) {
        fail();
      }
      final key = '$prefix${base64Url.encode(utf8.encode('$issuer|$owner'))}';
      if (key != pair.key ||
          env['entries'] is! List ||
          (env['entries'] as List).length > 100) {
        fail();
      }
      final ids = <String>{};
      for (final entry in env['entries'] as List) {
        if (entry is! Map ||
            !['prepared', 'completed', 'acked'].contains(entry['phase']) ||
            entry['restart'] is! bool ||
            (entry['resume'] != null && entry['resume'] is! String)) {
          fail();
        }
        final r = entry['record'];
        if (r is! Map ||
            r['owner_id'] != owner ||
            r['app_id'] != 'psygames' ||
            r['game_id'] != 'sudoku' ||
            r['operation'] != 'unlock_at_least' ||
            r['profile'] is! String ||
            !RegExp(r'^[a-z][a-z0-9-]{0,63}$')
                .hasMatch(r['profile'] as String) ||
            r['road'] is! String ||
            sudokuRoadOf(r['road'] as String) == null ||
            r['target_level'] is! int ||
            (r['target_level'] as int) < 1 ||
            (r['target_level'] as int) > 180 ||
            r['grant_revision'] is! int ||
            (r['grant_revision'] as int) < 1 ||
            r['id'] is! String ||
            !uuid.hasMatch(r['id'] as String) ||
            r['grant_id'] is! String ||
            !uuid.hasMatch(r['grant_id'] as String) ||
            !ids.add(r['id'] as String)) {
          fail();
        }
        final road = sudokuRoadOf(r['road'] as String)!;
        if (r['key_scope'] != sudokuLevelKey(r['profile'] as String, road)) {
          fail();
        }
      }
      journals.add((pair.key, env));
    } catch (_) {
      fail();
    }
  }
  int level(String key) {
    final raw = state.get(key);
    if (raw == null) return 1;
    if (!RegExp(r'^[1-9][0-9]*$').hasMatch(raw)) fail();
    final value = int.tryParse(raw);
    if (value == null || value > 9007199254740991) fail();
    return value;
  }

  for (final (key, env) in journals) {
    // Terminal values can also exist ONLY in the preferences cache after a
    // failed platform write. Re-confirm the whole receipt before skipping it
    // or allowing gameplay, without rewriting any completed gameplay keys.
    final receipt = jsonEncode(env);
    await state.set(key, receipt);
    if (state.get(key) != receipt) fail();
    for (final entry in env['entries'] as List) {
      if (entry['phase'] != 'prepared') continue;
      final r = entry['record'] as Map;
      final profile = r['profile'] as String;
      final road = sudokuRoadOf(r['road'] as String)!;
      final resumeKey = 'psygames_resume_sudoku_$profile';
      final original = entry['resume'];
      final restart = entry['restart'] == true;
      final currentResume = state.get(resumeKey);
      if (currentResume != original && !(restart && currentResume == null)) {
        fail();
      }
      final levelKey = sudokuLevelKey(profile, road);
      final bestKey =
          'psygames_sudoku_best_$profile${road == SudokuRoad.normal ? '' : '_${road.name}'}';
      var reached = math.max(level(levelKey), r['target_level'] as int);
      for (final inherited in roadsHarderThan(road)) {
        reached = math.max(reached, level(sudokuLevelKey(profile, inherited)));
      }
      final best = math.max(level(bestKey), reached);
      // Original resume bytes stay in the durable journal before any removal.
      // Also re-confirm a same-process intent whose failed platform write may
      // have updated only SharedPreferences' in-memory cache.
      final prepared = jsonEncode(env);
      await state.set(key, prepared);
      if (state.get(key) != prepared) fail();
      if (state.get(resumeKey) != currentResume) fail();
      if (restart && currentResume != null) {
        await state.remove(resumeKey);
        if (state.get(resumeKey) != null) fail();
      }
      final expectedResume = restart ? null : original;
      for (final patch in {levelKey: reached, bestKey: best}.entries) {
        if (state.get(resumeKey) != expectedResume) fail();
        final target = math.max(level(patch.key), patch.value);
        await state.set(patch.key, '$target');
        if (level(patch.key) < target) fail();
      }
      if (state.get(resumeKey) != expectedResume) fail();
      entry['phase'] = 'completed';
      final encoded = jsonEncode(env);
      await state.set(key, encoded);
      if (state.get(key) != encoded) fail();
    }
  }
}

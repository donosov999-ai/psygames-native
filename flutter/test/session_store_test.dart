import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/achievements_check.dart';
import 'package:psygames_flutter/shell/session_store.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/training_history.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// 🔴 УЧЁТ ПАРТИЙ НА DART = УЧЁТ ВЕБА НА ТОЙ ЖЕ ПОСЛЕДОВАТЕЛЬНОСТИ (задача 0f3d3910, шаг а, срез 1).
///
/// Образец `test/fixtures/session_store_reference.json` пишет настоящий `saveSession` веба
/// (`frontend/src/__tests__/session-store-reference.test.ts`): после каждой партии — хранилище целиком.
/// Здесь та же последовательность через [SessionStore], сверяются ключи среза: журнал партий и серия
/// «чисто». Следующие срезы добавляют свои ключи сюда, образец не переписывается.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final fixture = jsonDecode(File('test/fixtures/session_store_reference.json').readAsStringSync()) as Map;
  final rules = StatsRules.fromJson((jsonDecode(File('assets/stats_rules.json').readAsStringSync()) as Map).cast());

  /// Ключи, которые уже ведёт Dart: срез 1 — журнал и серия «чисто», срез 2 — начисление,
  // Срез 3 — рекорд питомца и вызов дня.
  const jsonKeys = {
    SessionStore.sessionsKey,
    'psygames_earn_v1',
    'psygames_tokens_v1',
    'psygames_earned_total_v1',
    'psygames_achievements_unlocked', // срез 4 — достижения
  };
  bool isJson(String key) => jsonKeys.contains(key) || key.startsWith('psygames_daily_challenge_');
  bool inSlice(String key) => isJson(key) || key.startsWith('psygames_clean_run_') || key == SessionStore.petRecordKey;

  Object? decoded(String key, String? raw) => isJson(key) && raw != null ? jsonDecode(raw) : raw;

  final ach = jsonDecode(File('assets/achievements.json').readAsStringSync()) as Map;
  final cat = jsonDecode(File('assets/catalog.json').readAsStringSync()) as Map;
  final AchievementsCatalog catalog = (
    achievements: [
      for (final a in (ach['achievements'] as List).cast<Map>()) (id: '${a['id']}', category: '${a['category']}'),
    ],
    games: [for (final g in (cat['games'] as List).cast<Map>()) g.cast<String, Object?>()],
    categoryOrder: [for (final c in (cat['categories'] as List).cast<Map>()) '${c['id']}'],
  );

  // Часы образца: миг и пояс, на которых веб считал начисление.
  final nowMs = (fixture['now'] as num).toInt();
  final tz = (fixture['tzOffsetMinutes'] as num).toInt();
  DateTime wall(int ms) => DateTime.fromMillisecondsSinceEpoch(ms - tz * 60000, isUtc: true);

  for (final c in (fixture['cases'] as List).cast<Map>()) {
    test('🔴 ${c['name']}: хранилище после каждой партии — как у веба', () async {
      SharedPreferences.setMockInitialValues({...(c['storage'] as Map).cast<String, Object>()});
      final state = await SharedState.open();
      final store = SessionStore(
        state,
        legacy: rules.legacyGameTypes,
        achievements: catalog,
        nowMs: () => nowMs,
        wall: wall,
      );
      var i = 0;
      for (final step in (c['steps'] as List).cast<Map>()) {
        i++;
        await store.save(
          (step['session'] as Map).cast<String, Object?>(),
          profileId: c['profile'] as String,
          warmupStep: c['warmup'] == true,
        );
        final want = (step['storage'] as Map).cast<String, Object?>();
        for (final key in want.keys.where(inSlice)) {
          expect(
            decoded(key, state.get(key)),
            decoded(key, want[key] as String?),
            reason: '${c['name']}, партия $i: $key',
          );
        }
        final extra = [
          for (final k in state.snapshot().keys)
            if (inSlice(k) && !want.containsKey(k)) k,
        ];
        expect(extra, isEmpty, reason: '${c['name']}, партия $i: Dart пишет лишние ключи');
      }
    });
  }

  test('выключен до шага (б): партии по-прежнему пишет веб', () => expect(SessionStore.enabled, isFalse));

  test('повтор по id возвращает null, новая партия — записанную с id, меткой и профилем', () async {
    SharedPreferences.setMockInitialValues({});
    final state = await SharedState.open();
    final store = SessionStore(state, legacy: const {});
    final saved = await store.save({'game_type': 'corsi', 'score': 1, 'errors': 0}, profileId: 'nzt48');
    expect(saved?['id'], isA<String>());
    expect(saved?['timestamp'], isA<String>());
    expect(saved?['profile_id'], 'nzt48');
    expect(await store.save({'id': saved!['id'], 'game_type': 'corsi', 'score': 1}, profileId: 'nzt48'), isNull);
  });

  group('поток saved — подписка зарядки (срез 5)', () {
    Map<String, Object?> owner(String attempt) => {'run_id': 'run1', 'step_idx': 2, 'attempt_id': attempt};

    test('🔴 новая партия приходит ПОСЛЕ начисления; повтор без владельца — тишина', () async {
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      final store = SessionStore(state, legacy: const {});
      final got = <SavedSession>[];
      final tokensAtEvent = <String?>[];
      final sub = SessionStore.saved.listen((e) {
        got.add(e);
        tokensAtEvent.add(state.get('psygames_tokens_v1'));
      });
      addTearDown(sub.cancel);
      await store.save({'id': 'x1', 'game_type': 'corsi', 'score': 100, 'errors': 0}, profileId: 'nzt48');
      await store.save({'id': 'x1', 'game_type': 'corsi', 'score': 100, 'errors': 0}, profileId: 'nzt48');
      expect(got, hasLength(1));
      expect(got.single.replay, isFalse);
      expect(got.single.session['id'], 'x1');
      expect(tokensAtEvent.single, isNotNull, reason: 'подписчик видит уже начисленное');
    });

    test('🔴 повтор того же владельца шага — replay с записью из журнала; чужой владелец — тишина', () async {
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      final store = SessionStore(state, legacy: const {});
      final got = <SavedSession>[];
      final sub = SessionStore.saved.listen(got.add);
      addTearDown(sub.cancel);
      await store.save(
        {
          'id': 'w1', 'game_type': 'stroop', 'score': 7, //
          'details': {'warmup_owner': owner('a1')},
        },
        profileId: 'nzt48',
        warmupStep: true,
      );
      final tokens = state.get('psygames_tokens_v1');
      await store.save(
        {
          'id': 'w1', 'game_type': 'stroop', 'score': 99, //
          'details': {'warmup_owner': owner('a1')},
        },
        profileId: 'nzt48',
        warmupStep: true,
      );
      await store.save(
        {
          'id': 'w1', 'game_type': 'stroop', 'score': 99, //
          'details': {'warmup_owner': owner('a2')},
        },
        profileId: 'nzt48',
        warmupStep: true,
      );
      expect([for (final e in got) e.replay], [false, true]);
      expect(got.last.session['score'], 7, reason: 'шаг дозакрывается по записи из журнала, не по повтору');
      expect(state.get('psygames_tokens_v1'), tokens, reason: 'повтор не начисляет');
    });

    test('упавший подписчик не роняет сохранение', () async {
      SharedPreferences.setMockInitialValues({});
      final state = await SharedState.open();
      final store = SessionStore(state, legacy: const {});
      final errors = <Object>[];
      await runZonedGuarded(() async {
        final sub = SessionStore.saved.listen((_) => throw StateError('подписчик'));
        addTearDown(sub.cancel);
        final saved = await store.save({'id': 'y1', 'game_type': 'corsi', 'score': 1}, profileId: 'nzt48');
        expect(saved?['id'], 'y1');
      }, (e, _) => errors.add(e));
      expect(state.get(SessionStore.sessionsKey), contains('y1'));
    });
  });
}

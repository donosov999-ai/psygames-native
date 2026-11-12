import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
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

  /// Ключи, которые уже ведёт Dart: срез 1 — журнал и серия «чисто», срез 2 — начисление.
  const jsonKeys = {SessionStore.sessionsKey, 'psygames_earn_v1', 'psygames_tokens_v1', 'psygames_earned_total_v1'};
  bool inSlice(String key) => jsonKeys.contains(key) || key.startsWith('psygames_clean_run_');

  Object? decoded(String key, String? raw) => jsonKeys.contains(key) && raw != null ? jsonDecode(raw) : raw;

  // Часы образца: миг и пояс, на которых веб считал начисление.
  final nowMs = (fixture['now'] as num).toInt();
  final tz = (fixture['tzOffsetMinutes'] as num).toInt();
  DateTime wall(int ms) => DateTime.fromMillisecondsSinceEpoch(ms - tz * 60000, isUtc: true);

  for (final c in (fixture['cases'] as List).cast<Map>()) {
    test('🔴 ${c['name']}: хранилище после каждой партии — как у веба', () async {
      SharedPreferences.setMockInitialValues({...(c['storage'] as Map).cast<String, Object>()});
      final state = await SharedState.open();
      final store = SessionStore(state, legacy: rules.legacyGameTypes, nowMs: () => nowMs, wall: wall);
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
}

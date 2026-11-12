import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'earn.dart';
import 'sessions.dart';
import 'shared_state.dart';

/// УЧЁТ ПАРТИЙ НА DART — ОДИН ПИСАТЕЛЬ (задача 0f3d3910, вариант Б d6a60b02, шаг а).
///
/// Перенос `saveSession` из `frontend/src/services/api.ts` срезами, каждый сверяется с образцом веба
/// `test/fixtures/session_store_reference.json` (`session-store-reference.test.ts`): та же
/// последовательность партий → то же хранилище. Пока [enabled] выключен, партии по-прежнему пишет веб
/// (`SessionReport` → `__psySaveSession`): включение — шаг (б), когда перенесены все срезы, иначе
/// начисление, вызов дня и достижения потерялись бы.
///
/// Срез 1 (здесь): журнал `psygames_sessions` — запись, повтор по `id` не пишется, старые имена игр
/// мигрируют при записи (веб пишет журнал, прочитанный через `migrateSession`); серия «чисто»
/// `psygames_clean_run_<профиль>` (`cleanRun.ts`): чистая партия — ошибок 0 и счёт > 0; партия с
/// разбором (`lesson`, `solver_used`) серию не двигает.
/// Срез 2: начисление (`earn.ts` → [recordRound]): журнал `psygames_earn_v1`, баланс, «заработано».
/// Дальше: рекорд для питомца, вызов дня, достижения, облако, замки уровней.
class SessionStore {
  SessionStore(this.state, {required this.legacy, int Function()? nowMs, EarnWall? wall})
    : _nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch), // wall-clock: метка начисления
      _wall = wall ?? ((ms) => DateTime.fromMillisecondsSinceEpoch(ms));

  final int Function() _nowMs;
  final EarnWall _wall;

  /// Пишет ли Dart партии сам. Выключен до шага (б).
  static bool enabled = false;

  final SharedState state;

  /// Старые имена игр → новые (`stats_rules.json`, как у чтения).
  final Map<String, String> legacy;

  static const sessionsKey = 'psygames_sessions';
  static String cleanRunKey(String profile) => 'psygames_clean_run_$profile';

  /// Чтение и запись журнала — одной очередью: два сохранения подряд иначе читают один журнал, и второе
  /// затирает первое (`inWriteQueue` веба).
  static Future<void> _queue = Future.value();

  /// Сохранить партию. Вернёт записанную партию или `null`, если партия с таким `id` уже в журнале.
  ///
  /// `profileId` — активный профиль (у веба `__psygames_active_profile_id`); партия со своим
  /// `profile_id` пишется под ним.
  ///
  /// `warmupStep` — партия шага зарядки (у веба `__psygames_warmup_active`): начисление без множителя.
  Future<Session?> save(Session session, {String? profileId, bool warmupStep = false}) {
    final stored = <String, Object?>{
      ...session,
      'id': jsTruthy(session['id']) ? session['id'] : newId(),
      'timestamp': jsTruthy(session['timestamp'])
          ? session['timestamp']
          : DateTime.now().toUtc().toIso8601String(), // wall-clock: метка партии
      'profile_id': jsTruthy(session['profile_id']) ? session['profile_id'] : (profileId ?? state.activeProfile),
    };
    final run = _queue.then((_) => _write(stored, warmupStep));
    _queue = run.then((_) {}, onError: (_) {});
    return run;
  }

  Future<Session?> _write(Session stored, bool warmupStep) async {
    final log = readSessions(state, legacy);
    if (log.any((s) => jsTruthy(s['id']) && s['id'] == stored['id'])) return null;
    await state.set(sessionsKey, jsonEncode([...log, stored]));
    final pid = stored['profile_id'];
    if (jsTruthy(pid)) {
      final d = stored['details'];
      final lesson = d is Map && (d['lesson'] == true || d['solver_used'] == true);
      if (!lesson) {
        final clean = jsNum(stored['errors']) == 0 && jsNum(stored['score']) > 0;
        await _tickCleanRun('$pid', clean);
      }
      await recordRound(
        state,
        profileId: '$pid',
        game: '${stored['game_type'] ?? ''}',
        score: stored['score'],
        errors: stored['errors'],
        warmupStep: warmupStep,
        lesson: lesson,
        nowMs: _nowMs(),
        wall: _wall,
      );
    }
    return stored;
  }

  Future<void> _tickCleanRun(String pid, bool clean) async {
    final prev = int.tryParse(state.get(cleanRunKey(pid)) ?? '') ?? 0;
    await state.set(cleanRunKey(pid), '${clean ? prev + 1 : 0}');
  }

  /// `makeId` веба: uuid v4.
  static String newId() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'game_preset.dart';
import 'warmup_owner.dart';
import '../synapse/synapse_feed.dart';

/// Route metadata captured before asynchronous game initialization. An old
/// game's completion must not borrow the owner of the currently open game.
class SessionLaunch {
  SessionLaunch._(this.params, this.warmupOwner) : reportId = _reportId(warmupOwner);

  factory SessionLaunch.capture() {
    final params = Map<String, String>.unmodifiable(GamePreset.params);
    return SessionLaunch._(
      params,
      params['wu'] == '1' ? WarmupOwner.fromQuery(params) : null,
    );
  }

  final Map<String, String> params;
  final WarmupOwner? warmupOwner;

  bool get isWarmup => params['wu'] == '1';
  bool get isTransit => (params['ladderGame'] ?? '').isNotEmpty;

  /// Stable UUID only for an owned warmup attempt. Ordinary reports keep their
  /// existing per-report identity generation in the bridge.
  final String? reportId;

  static String? _reportId(WarmupOwner? owner) {
    if (owner == null) return null;
    final attempt = owner.attemptId;
    if (RegExp(
      r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    ).hasMatch(attempt)) {
      return attempt;
    }
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
        '${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}

/// ПАРТИЯ, СЫГРАННАЯ НАТИВНО, ОБЯЗАНА ДОЕХАТЬ ДО ВЕБ-ПОЛОВИНЫ.
///
/// 🔴 ЧТО БЫЛО СЛОМАНО. Перенесённые экраны писали только УРОВЕНЬ
/// (`psygames_<игра>_level_<профиль>`) и больше ничего. А в приложении на записи
/// партии (`psygames_sessions`) держится почти всё остальное:
///   · зарядка двигает шаг по подписке `setSessionListener` — нативная игра её не
///     вызывала, и серия вставала намертво. Замер раздела «Зарядки» 23.09.2026:
///     104 шага из 891 в составах зарядок ведут в перенесённую игру, каждый девятый.
///     Человек проходит игру, а серия стоит на том же месте;
///   · счётчик «завершённых партий» читает те же записи — 36 нативных игр давали
///     статистике НОЛЬ;
///   · токены, достижения, серия дней, вызов дня — всё оттуда же.
///
/// 🔴 ПОЧЕМУ НЕ ПЕРЕПИСАТЬ `saveSession` НА DART. Он делает семь вещей разом:
/// запись, серию чистых прогонов, вызов дня, токены, подписчиков, отправку на
/// сервер и очередь неотправленного. Вторая реализация разошлась бы с первой
/// молча и в ту же неделю. Поэтому нативная половина НЕ хранит партии сама — она
/// отдаёт результат туда, где `saveSession` уже написан, и он делает всё сам.
///
/// ⚠️ Отсюда следствие: отчёт уходит В ОБОЛОЧКУ гибрида. В пробах и в отдельной
/// сборке без WebView отправителя нет, и это законно — [send] просто молчит.
/// Молчание не прячется: [installed] говорит, есть ли приёмник, и проба на это
/// смотрит.
class SessionReport {
  SessionReport._();

  /// Кто принимает отчёт. Ставит оболочка гибрида; в пробах — подменяется.
  static Future<void> Function(String json)? sink;

  static bool get installed => sink != null;

  /// Отправить партию. `gameType` — то же имя, что у веб-версии: у обеих половин
  /// это ключ лестницы в нижнем подчёркивании (`digit_span`, `chess_blind`), и
  /// совпадение здесь не случайность, а условие: разойдутся — партия попадёт в
  /// статистику под другой игрой.
  static Future<void> send({
    required String gameType,
    required int score,
    required int timeSeconds,
    String? difficulty,
    String? mode,
    int? errors,
    Map<String, Object?>? details,
    SessionLaunch? launch,
    String? id,
  }) async {
    final f = sink;
    if (f == null) {
      SynapseFeed.expect(outcome: SynapseFeed.silent);   // партии не было — исход не переносится на следующую
      return;
    }
    // 🔴 Партия ступени чужой лестницы несёт метку ступени (`LevelTransition`): по ней
    // статистика отличит «Кошек» на 145-й ступени «Судоку» от обычной партии «Кошек».
    // Стоит здесь, а не в лестнице: «Бездна» шлёт партию мимо [LevelLadder].
    // Legacy callers retain send-time transit metadata, but never acquire a
    // warmup owner (or stable launch id) without an explicit captured launch.
    final snapshot = launch ?? SessionLaunch.capture();
    final marked = <String, Object?>{...?details};
    if (snapshot.isTransit) {
      marked['ladderGame'] = snapshot.params['ladderGame'];
      marked['ladderLevel'] =
          int.tryParse(snapshot.params['ladderLevel'] ?? '') ?? 0;
    }
    if (launch != null && launch.isWarmup) {
      // Even an incomplete owner is authoritative: never fill it from globals
      // or accept an unrelated owner supplied in game details.
      marked.remove('warmup_owner');
      final owner = launch.warmupOwner;
      if (owner != null) marked['warmup_owner'] = owner.toJson();
    }
    final body = <String, Object?>{
      'id': ?(id ?? launch?.reportId),
      'game_type': gameType,
      'score': score,
      'time_seconds': timeSeconds,
      'difficulty': ?difficulty,
      'mode': ?mode,
      'errors': ?errors,
      if (marked.isNotEmpty) 'details': marked,
    };
    await f(jsonEncode(body));
    // 🗨 Синапс (852e4b4a): реплика по фактам этой партии — не задерживая игру и не роняя её.
    unawaited(SynapseFeed.onSession(body).catchError((Object _) {}));
  }
}

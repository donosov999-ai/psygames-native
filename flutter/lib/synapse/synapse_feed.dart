import 'dart:convert';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:synapse_advisor/synapse_advisor.dart';

import '../shell/catalog.dart';
import '../shell/game_pet.dart' show GamePet;
import '../shell/l10n.dart';
import '../shell/profiles.dart';
import '../shell/sessions.dart';
import '../shell/shared_state.dart';
import '../shell/training_history.dart' show StatsRules;

/// СИНАПС ГОВОРИТ ПОСЛЕ ПАРТИИ — АДАПТЕР PSYGAMES К ЯДРУ `synapse_advisor` (задача 852e4b4a).
///
/// Ядро (`synapse_advisor.dart`, владелец mascot-claude-mac) решает, ЧТО сказать, только по фактам:
/// первая партия, лучше прошлой, рекорд, новый уровень, без ошибок, приём для навыка — или молчать.
/// Здесь — откуда факты берутся и куда реплика кладётся:
///   · факт — партия, которую [SessionReport.send] отдал в запись; исход и уровень до/после знает
///     [LevelLadder] (`win` — победа, `fail` — доиграна, разбор — урок). Экран без лестницы шлёт
///     партию без исхода — ядро на неё молчит (исход неизвестен), как велит схема владельца;
///   · история — сохранённые партии ЭТОГО профиля (те же, что считает «Прогресс», `sessions.dart`);
///   · реплики и память ядра — в общей памяти по профилю: [linesKey], [memoryKey].
/// Молчит всегда: питомец выключен (`pet_on`), урок, исход неизвестен. Показывает экран «Питомец»
/// (пузырь, «Следующая фраза», «Закрыть»); во время партии экрана питомца нет.
///
/// Языки: банк ядра — RU/EN; для остальных ядро отдаёт английский, пока помощник локализации не
/// переведёт банк (схема владельца, §2).
class SynapseFeed {
  SynapseFeed._();

  /// Общая память приложения. Ставит оболочка; без неё (пробы экранов, отдельная сборка) — молчание.
  static SharedState? state;

  /// Часы. Пробы подменяют.
  @visibleForTesting
  static DateTime Function() now = DateTime.now;

  static ({Outcome outcome, int? level, int? levelBefore})? _next;
  static Catalog? _catalog;
  static StatsRules? _rules;

  /// Сколько реплики ждут на экране питомца: после — устарели (ядро само молчит о той же новости 6 ч).
  static const fresh = Duration(hours: 12);

  static String linesKey(String profile) => '${SharedState.prefix}synapse_lines_$profile';
  static String memoryKey(String profile) => '${SharedState.prefix}synapse_memory_$profile';

  /// Исход «молчать»: снимает ожидание без партии (отчёт не ушёл).
  static const silent = Outcome.unknown;

  /// [LevelLadder]: исход партии, которая сейчас уйдёт в запись.
  static void expect({required Outcome outcome, int? level, int? levelBefore}) =>
      _next = (outcome: outcome, level: level, levelBefore: levelBefore);

  /// Профиль, под которым веб запишет партию (`ProfileContext`: сохранённый и доступный, иначе `free`).
  static String _profile(SharedState s) {
    final ps = Profiles.current;
    final id = s.get(Profiles.activeKey);
    if (ps.list.isEmpty) return id ?? 'free';
    final p = id == null ? null : ps.byId(id);
    return p != null && ps.accessible(s, p.id) ? p.id : 'free';
  }

  static int? _int(Object? v) => v is num && v.isFinite ? v.round() : null;

  /// Партия журнала → факт ядра. Сохранённая партия доиграна; `passed` — победа; разбор — урок.
  static SessionFact? factOf(Session x, StatsRules r, {Outcome? outcome, int? level, int? levelBefore, DateTime? at}) {
    final type = x['game_type'];
    if (type is! String || type.isEmpty) return null;
    final when = at ?? (x['timestamp'] is String ? DateTime.tryParse(x['timestamp']! as String) : null);
    if (when == null) return null;
    final details = x['details'] is Map ? (x['details']! as Map).cast<String, Object?>() : const <String, Object?>{};
    final lower = r.lowerIsBetter.contains(type);
    return SessionFact(
      gameId: type,
      outcome: details['lesson'] == true ? Outcome.lesson : outcome ?? (x['passed'] == true ? Outcome.won : Outcome.finished),
      at: when,
      // Где очки не двигаются вместе с результатом («Шульте»: клетки минус ошибки), меряем время.
      score: lower ? _int(x['time_seconds']) : _int(x['score']),
      higherIsBetter: !lower,
      unit: lower ? L.t('secShort') : null,
      timeSeconds: _int(x['time_seconds']),
      errors: _int(x['errors']),
      level: level ?? _int(details['level']),
      levelBefore: levelBefore,
      difficulty: x['difficulty']?.toString(),
      mode: x['mode']?.toString(),
      hintsUsed: _int(details['hintsUsed'] ?? details['hints']),
    );
  }

  static Future<void> _last = Future<void>.value();

  /// Последний расчёт реплик завершён — пробы ждут его, а не таймер.
  @visibleForTesting
  static Future<void> get settled => _last;

  /// Партия ушла в запись ([SessionReport.send] после приёмника). [body] — то, что ушло вебу.
  static Future<void> onSession(Map<String, Object?> body) => _last = _onSession(body);

  static Future<void> _onSession(Map<String, Object?> body) async {
    final next = _next;
    _next = null;
    final s = state;
    if (s == null || next == null || !GamePet.enabled(s)) return;
    final profile = _profile(s);
    final rules = _rules ??= await StatsRules.load();
    final catalog = _catalog ??= await Catalog.load();
    final at = now();
    final fact = factOf(body, rules, outcome: next.outcome, level: next.level, levelBefore: next.levelBefore, at: at);
    if (fact == null || !fact.counts) {
      await s.remove(linesKey(profile));
      return;
    }
    String norm(String id) => id.replaceAll('-', '_');
    CatalogEntry? entry;
    for (final g in catalog.games) {
      if (g.id != null && norm(g.id!) == norm(fact.gameId)) entry = g;
    }
    final allowed = Profiles.current.byId(profile)?.games;
    final game = GameInfo(id: fact.gameId, name: entry == null ? fact.gameId : L.t(entry.nameKey), category: entry?.category ?? '');
    final offer = [
      for (final g in catalog.games)
        if (g.id != null && !g.hub && !g.hidden && (allowed == null || allowed.contains(g.id)))
          GameInfo(id: g.id!, name: L.t(g.nameKey), category: g.category ?? ''),
    ];
    final history = [
      for (final x in readSessions(s, rules.legacyGameTypes))
        if (x['profile_id'] == profile) ?factOf(x, rules),
    ];
    final memory = AdvisorMemory.fromJson(s.get(memoryKey(profile)));
    final lines = Advisor(locale: L.locale).react(fact, history, game: game, catalog: offer, memory: memory, now: at);
    await s.set(memoryKey(profile), memory.toJson());
    if (lines.isEmpty) {
      await s.remove(linesKey(profile));
      return;
    }
    await s.set(
      linesKey(profile),
      jsonEncode({
        'at': at.toIso8601String(),
        'game': fact.gameId,
        'lines': [
          for (final l in lines) {'id': l.semanticId, 'kind': l.kind.name, 'text': l.text},
        ],
      }),
    );
  }

  /// Реплики для экрана питомца: свежие и не закрытые; иначе пусто (пузырь — приветствие веба).
  static List<String> linesFor(SharedState s) {
    if (!GamePet.enabled(s)) return const [];
    final raw = s.get(linesKey(_profile(s)));
    if (raw == null || raw.isEmpty) return const [];
    try {
      final j = (jsonDecode(raw) as Map).cast<String, Object?>();
      final at = DateTime.tryParse('${j['at']}');
      if (at == null || now().difference(at) > fresh) return const [];
      return [
        for (final l in (j['lines']! as List).cast<Map>())
          if (l['text'] is String) l['text'] as String,
      ];
    } catch (_) {
      return const [];
    }
  }

  /// «Закрыть» на экране питомца: реплики сняты до следующей партии.
  static Future<void> dismiss(SharedState s) => s.remove(linesKey(_profile(s)));

  @visibleForTesting
  static void resetForTest() {
    _next = null;
    _catalog = null;
    _rules = null;
    state = null;
    now = DateTime.now;
  }
}

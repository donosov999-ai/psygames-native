/// Модели ответа `ecosystem_coach_v2` — разбор без доверия: неизвестные поля пропускаются, кривые — пустые.
library;

/// Четыре приложения контура и их схемы ссылок (строго строчными — Android сравнивает с учётом регистра).
const coachApps = <String, String>{
  'psygames': 'com.psygames.app',
  'abstract-hub': 'com.abstracthub.app',
  'smart-alarm': 'com.odv999.smartalarm',
  'typerighting': 'pro.typefree.app',
  'fudao': 'com.odv999.fydao',
};

/// Области согласия ученика. `completion` обязательна.
const coachScopes = ['completion', 'metrics', 'errors', 'history'];

/// Области согласия Fudao (решение Дениса 11.11.2026): данные рождения, карты, переписка по разборам,
/// переданные записи дневника. `completion` обязательна, как у всех.
const coachFudaoScopes = ['completion', 'birth_data', 'charts', 'readings', 'diary_shared'];

/// Области согласия приложения: у Fudao свои, у остальных — общие четыре.
List<String> coachScopesFor(String appId) => appId == 'fudao' ? coachFudaoScopes : coachScopes;

/// Версия текста согласия coach/2 (одна на 4 приложения; перечень полей — у каждого свой).
const coachPolicyVersion = 'coach/2';

String _s(Object? v) => v is String ? v : '';
int _i(Object? v) => v is num ? v.toInt() : 0;
DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v) : null;
List<Object?> _l(Object? v) => v is List ? v : const [];
Map<String, Object?> _m(Object? v) => v is Map ? v.cast<String, Object?>() : const {};

class AppConsent {
  const AppConsent({required this.appId, required this.scopes, this.grantedAt, this.events = 0, this.lastAt});
  factory AppConsent.fromJson(Object? j) {
    final m = _m(j);
    return AppConsent(
      appId: _s(m['app_id']),
      scopes: [for (final s in _l(m['scopes'])) if (s is String) s],
      grantedAt: _t(m['granted_at']),
      events: _i(m['events']),
      lastAt: _t(m['last_at']),
    );
  }
  final String appId;
  final List<String> scopes;
  final DateTime? grantedAt;
  final int events;
  final DateTime? lastAt;
}

/// Строка сводки преподавателя (ученик) или ученика (его преподаватель).
class CoachLink {
  const CoachLink({required this.connectionId, required this.name, required this.apps, this.since});
  factory CoachLink.fromJson(Object? j, String nameKey) {
    final m = _m(j);
    return CoachLink(
      connectionId: _s(m['connection_id']),
      name: _s(m[nameKey]),
      since: _t(m['since']),
      apps: [for (final a in _l(m['apps'])) AppConsent.fromJson(a)],
    );
  }
  final String connectionId;
  final String name;
  final DateTime? since;
  final List<AppConsent> apps;
}

class CoachDashboard {
  const CoachDashboard({this.profileName, this.students = const [], this.coaches = const []});
  factory CoachDashboard.fromJson(Object? j) {
    final m = _m(j);
    final p = _m(m['profile']);
    return CoachDashboard(
      profileName: p.isEmpty ? null : _s(p['name']),
      students: [for (final s in _l(m['students'])) CoachLink.fromJson(s, 'student_name')],
      coaches: [for (final c in _l(m['coaches'])) CoachLink.fromJson(c, 'coach_name')],
    );
  }
  final String? profileName;
  final List<CoachLink> students;
  final List<CoachLink> coaches;
  bool get isCoach => profileName != null;
}

/// Тренировка ученика глазами преподавателя (поля — по областям согласия).
class CoachEventView {
  const CoachEventView({required this.id, required this.appId, required this.kind, this.mode, this.exerciseRef,
      this.occurredAt, this.receivedAt, this.metrics, this.errors});
  factory CoachEventView.fromJson(Object? j) {
    final m = _m(j);
    return CoachEventView(
      id: _s(m['id']),
      appId: _s(m['app_id']),
      kind: _s(m['kind']),
      mode: m['mode'] as String?,
      exerciseRef: m['exercise_ref'] as String?,
      occurredAt: _t(m['occurred_at']),
      receivedAt: _t(m['received_at']),
      metrics: m.containsKey('metrics') ? _m(m['metrics']) : null,
      errors: m.containsKey('errors') ? _m(m['errors']) : null,
    );
  }
  final String id, appId, kind;
  final String? mode, exerciseRef;
  final DateTime? occurredAt, receivedAt;

  /// null — область `metrics` / `errors` не разрешена учеником (не «пусто», а «не видно»).
  final Map<String, Object?>? metrics, errors;
}

/// Тренировка, которую приложение отправляет после завершения (формат §5 п.11 архитектуры).
/// В `metrics` — только числа, логические и короткие строки; никаких текстов пользователя.
class CoachEvent {
  const CoachEvent({required this.eventId, required this.kind, this.mode, this.exerciseRef, this.assignmentId,
      this.step, this.occurredAt, this.metrics = const {}, this.errors = const {}});
  final String eventId, kind;
  final String? mode, exerciseRef, assignmentId;
  final int? step;
  final DateTime? occurredAt;
  final Map<String, Object?> metrics, errors;

  Map<String, Object?> toJson() => {
        'event_id': eventId,
        'kind': kind,
        if (mode != null) 'mode': mode,
        if (exerciseRef != null) 'exercise_ref': exerciseRef,
        if (assignmentId != null) 'assignment_id': assignmentId,
        if (step != null) 'step': step,
        if (occurredAt != null) 'occurred_at': occurredAt!.toUtc().toIso8601String(),
        if (metrics.isNotEmpty) 'metrics': metrics,
        if (errors.isNotEmpty) 'errors': errors,
      };
}

/// Ответ на отправку тренировки: записана, повтор, или почему нет (`no_consent`, `history_not_granted`, `before_consent`).
class SubmitResult {
  const SubmitResult({required this.stored, this.duplicate = false, this.reason});
  factory SubmitResult.fromJson(Object? j) {
    final m = _m(j);
    return SubmitResult(stored: m['stored'] == true, duplicate: m['duplicate'] == true, reason: m['reason'] as String?);
  }
  final bool stored, duplicate;
  final String? reason;
}

class InvitePreview {
  const InvitePreview({required this.coachName, required this.appId, this.expiresAt});
  final String coachName, appId;
  final DateTime? expiresAt;
}

class CreatedInvite {
  const CreatedInvite({required this.code, required this.appId, this.expiresAt});
  final String code, appId;
  final DateTime? expiresAt;
}

/// Ошибка контура: `code` — сообщение сервера (`coach_*`) или `coach_unavailable`, если сервера/входа нет.
class CoachException implements Exception {
  const CoachException(this.code);
  final String code;
  @override
  String toString() => 'CoachException($code)';
}

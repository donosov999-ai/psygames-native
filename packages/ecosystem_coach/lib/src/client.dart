/// Клиент `ecosystem_coach_v2`. Транспорт — общий аккаунт ([AccountCoachTransport]) или подставной в пробах.
library;

import 'package:ecosystem_account/ecosystem_account.dart';

import 'model.dart';

/// Один вызов серверной функции кабинета. Ошибки сервера — [CoachException] с кодом `coach_*`.
abstract class CoachTransport {
  Future<Object?> call(String action, Map<String, Object?> payload);
}

/// Через общий аккаунт: тот же вход (Google / почта), тот же токен, белый список RPC.
class AccountCoachTransport implements CoachTransport {
  AccountCoachTransport(this.account);
  final EcosystemAccount account;

  @override
  Future<Object?> call(String action, Map<String, Object?> payload) async {
    if (account.accountId == null) throw const CoachException('coach_sign_in_required');
    try {
      return await account.rpc('ecosystem_coach_v2', {'p_action': action, 'p_payload': payload});
    } on Object catch (e) {
      final text = '$e';
      final code = RegExp(r'coach_[a-z_]+').firstMatch(text)?.group(0);
      throw CoachException(code ?? 'coach_unavailable');
    }
  }
}

class CoachClient {
  CoachClient(this.transport, {required this.appId}) {
    if (!coachApps.containsKey(appId)) throw ArgumentError('Unknown coach app: $appId');
  }
  final CoachTransport transport;

  /// Приложение, из которого открыт кабинет: в него идут приглашения и отправка тренировок.
  final String appId;

  Future<Map<String, Object?>> _call(String action, Map<String, Object?> payload) async {
    final r = await transport.call(action, payload);
    final m = r is Map ? r.cast<String, Object?>() : <String, Object?>{};
    final err = m['error'];
    if (err is String) throw CoachException(err);
    return m;
  }

  Future<CoachDashboard> dashboard({int page = 0}) async =>
      CoachDashboard.fromJson(await _call('dashboard', {if (page > 0) 'page': page}));

  Future<void> saveProfile(String name) => _call('profile_save', {'name': name.trim()});

  Future<CreatedInvite> createInvite() async {
    final m = await _call('invite_create', {'app_id': appId});
    return CreatedInvite(code: m['code'] as String, appId: appId, expiresAt: DateTime.tryParse('${m['expires_at']}'));
  }

  Future<InvitePreview> previewInvite(String code) async {
    final m = await _call('invite_preview', {'app_id': appId, 'code': code});
    return InvitePreview(coachName: '${m['coach_name'] ?? ''}', appId: appId, expiresAt: DateTime.tryParse('${m['expires_at']}'));
  }

  /// Принять приглашение. `consent` — явная галочка ученика; без неё сервер откажет.
  Future<String> acceptInvite({required String code, required String studentName, required List<String> scopes, required bool consent}) async {
    final m = await _call('invite_accept', {
      'app_id': appId,
      'code': code,
      'student_name': studentName.trim(),
      'consent': consent,
      'scopes': _withCompletion(scopes),
      'policy_version': coachPolicyVersion,
    });
    return m['connection_id'] as String;
  }

  Future<void> updateConsent({required String connectionId, required String app, required List<String> scopes}) =>
      _call('consent_update', {
        'connection_id': connectionId,
        'app_id': app,
        'scopes': _withCompletion(scopes),
        'policy_version': coachPolicyVersion,
        'consent': true,
      });

  Future<void> revokeConsent({required String connectionId, required String app}) =>
      _call('consent_revoke', {'connection_id': connectionId, 'app_id': app});

  Future<void> disconnect(String connectionId) => _call('disconnect', {'connection_id': connectionId});

  Future<List<CoachEventView>> studentEvents({required String connectionId, required String app, int page = 0}) async {
    final m = await _call('student_events', {'connection_id': connectionId, 'app_id': app, if (page > 0) 'page': page});
    return [for (final e in (m['events'] as List? ?? const [])) CoachEventView.fromJson(e)];
  }

  /// Отправить тренировку после её завершения. Без согласия сервер ничего не пишет — это не ошибка.
  Future<SubmitResult> submit(CoachEvent event) async =>
      SubmitResult.fromJson(await _call('result_submit', {'app_id': appId, 'event': event.toJson()}));

  static List<String> _withCompletion(List<String> scopes) =>
      {'completion', ...scopes.where(coachScopes.contains)}.toList();
}

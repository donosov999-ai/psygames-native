/// Ссылка-приглашение — одна форма на все приложения (как у Chess & Go): `<схема>://coach/invite?code=<48 hex>`.
library;

import 'model.dart';

class CoachInviteLink {
  const CoachInviteLink({required this.appId, required this.code});
  final String appId;
  final String code;

  static final _code = RegExp(r'^[0-9a-f]{48}$');

  Uri toUri() => Uri(scheme: coachApps[appId], host: 'coach', path: '/invite', queryParameters: {'code': code});

  /// Разбор входящей ссылки: только своя схема, хост `coach`, путь `/invite`, код 48 hex. Иначе null.
  static CoachInviteLink? parse(Uri uri, {required String appId}) {
    final scheme = coachApps[appId];
    if (scheme == null || uri.scheme != scheme || uri.host != 'coach' || uri.path != '/invite') return null;
    if (uri.userInfo.isNotEmpty || uri.hasPort || uri.fragment.isNotEmpty) return null;
    final code = uri.queryParameters['code'] ?? '';
    if (!_code.hasMatch(code) || uri.queryParameters.length != 1) return null;
    return CoachInviteLink(appId: appId, code: code);
  }
}

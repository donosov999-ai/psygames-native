import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';

/// Synthetic scope-bearing token. It is not signed and never used on a server.
Map<String, dynamic> fixtureSession({String id = 'test-user',
  String issuer = 'https://example.supabase.co/auth/v1', bool expired = false}) {
  final expires = DateTime.now().millisecondsSinceEpoch ~/ 1000 + (expired ? -60 : 3600);
  String part(Object value) => base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return {
    'access_token': '${part({'alg': 'HS256'})}.${part({'exp': expires, 'sub': id, 'iss': issuer})}.synthetic',
    'refresh_token': 'synthetic-$id', 'token_type': 'bearer', 'expires_in': 3600,
    'user': {'id': id, 'email': '$id@example.invalid', 'aud': 'authenticated'},
  };
}

String fixtureEnvelope(EcosystemAccount account, Map<String, dynamic> session) => jsonEncode({
  'schema': 1, 'app_id': account.appId, 'issuer': account.issuer,
  'account_id': session['user']['id'], 'session': session,
});

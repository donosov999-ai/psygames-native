import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ecosystem_account_test.dart' show Vault;

/// ecosystem.account/1-draft.6 (задача 739ccbcb): Fudao входит общим аккаунтом, но
/// не попадает в каскад удаления `all_ecosystem_apps` — он заморожен на четырёх продуктах.
void main() {
  EcosystemAccount make(String appId) => EcosystemAccount(
    appId: appId, url: 'https://example.supabase.co', publishableKey: 'synthetic-public',
    callback: Uri.parse('https://fydao.example/auth/callback'), vault: Vault(),
    transport: MockClient((r) async => http.Response('', 204, request: r)));

  test('fudao принимается, его хранилище — своё пространство имён', () {
    final a = make('fudao');
    addTearDown(a.dispose);
    expect(a.storageNamespace, startsWith('ecosystem.account.v2.fudao.'));
    expect(a.storageNamespace, isNot(contains('psygames')));
  });

  test('приложение вне списка — отказ (grovi ещё не допущен)', () {
    expect(() => make('grovi'), throwsArgumentError);
  });

  test('удаление общего аккаунта из fudao закрыто даже с подтверждением', () async {
    final a = make('fudao');
    addTearDown(a.dispose);
    await expectLater(
      a.deleteAccount(confirmAllApps: true),
      throwsA(isA<StateError>().having((e) => e.message, 'message', contains('fudao'))),
    );
  });
}

import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

void main() {
  late Vault vault;
  late EcosystemAccount account;
  final requests = <http.Request>[];
  Future<http.Response> Function(http.Request)? response;
  setUp(() async {
    vault = Vault();
    requests.clear();
    response = null;
    account = EcosystemAccount(
      appId: 'psygames',
      url: 'https://example.supabase.co',
      publishableKey: 'test-public',
      callback: Uri.parse('com.psygames.app://auth/callback'),
      vault: vault,
      transport: MockClient((r) async {
        requests.add(r);
        return response == null
            ? http.Response(
                '{"code":"ACCOUNT_DELETED"}',
                200,
                headers: {'content-type': 'application/json'},
              )
            : await response!(r);
      }),
    );
    vault.values['${account.storageNamespace}.session'] = fixtureEnvelope(
      account,
      fixtureSession(),
    );
    expect(await account.resume(consent: true), true);
  });
  tearDown(() async => account.dispose());
  test('confirmation required; no network or credential loss', () async {
    await expectLater(
      account.deleteAccount(confirmAllApps: false),
      throwsStateError,
    );
    expect(requests, isEmpty);
    expect(account.accountId, 'test-user');
  });
  test(
    'fixed endpoint, no owner parameter, ACK retires credentials only',
    () async {
      await account.deleteAccount(confirmAllApps: true);
      expect(
        requests.single.url.path,
        '/functions/v1/ecosystem-account-delete',
      );
      expect(jsonDecode(requests.single.body), {
        'confirm': 'DELETE_ACCOUNT',
        'scope': 'all_ecosystem_apps',
      });
      expect(account.active, false);
      expect(account.accountId, isNull);
      expect(
        vault.values.containsKey('${account.storageNamespace}.session'),
        false,
      );
    },
  );
  test('lost response has no success and retires unusable session', () async {
    response = (_) async => throw StateError('private upstream text');
    await expectLater(
      account.deleteAccount(confirmAllApps: true),
      throwsStateError,
    );
    expect(account.active, false);
    expect(
      vault.values.containsKey('${account.storageNamespace}.session'),
      false,
    );
  });
  test('HTTP200 without exact ACK is not deletion success', () async {
    response = (_) async => http.Response(
      '{"code":"not-confirmed"}',
      200,
      headers: {'content-type': 'application/json'},
    );
    await expectLater(
      account.deleteAccount(confirmAllApps: true),
      throwsStateError,
    );
  });
  test('late deletion cannot clear new login credentials or ACK it', () async {
    final pending = Completer<http.Response>(), started = Completer<void>();
    response = (_) {
      started.complete();
      return pending.future;
    };
    final deleting = account.deleteAccount(confirmAllApps: true);
    final failed = expectLater(deleting, throwsStateError);
    await started.future;
    account.suspend();
    final newer = fixtureEnvelope(account, fixtureSession(id: 'other-user'));
    vault.values['${account.storageNamespace}.session'] = newer;
    expect(await account.resume(consent: true), true);
    pending.complete(
      http.Response(
        '{"code":"ACCOUNT_DELETED"}',
        200,
        headers: {'content-type': 'application/json'},
      ),
    );
    await failed;
    expect(account.accountId, 'other-user');
    expect(
      jsonDecode(
        vault.values['${account.storageNamespace}.session']!,
      )['account_id'],
      'other-user',
    );
  });
  test('deletion in flight fences retained REST builders', () async {
    final pending = Completer<http.Response>(), started = Completer<void>();
    response = (_) {
      started.complete();
      return pending.future;
    };
    final retained = account.from('ecosystem_app_snapshots');
    final deleting = account.deleteAccount(confirmAllApps: true);
    await started.future;
    await expectLater(retained.select(), throwsStateError);
    pending.complete(
      http.Response(
        '{"code":"ACCOUNT_DELETED"}',
        200,
        headers: {'content-type': 'application/json'},
      ),
    );
    await deleting;
    expect(requests.length, 1);
  });
}

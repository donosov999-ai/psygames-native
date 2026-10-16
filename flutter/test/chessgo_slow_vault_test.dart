// Reviewer baseline source SHA256 e3af2ca775443af3316dde12ab389847413d13108d49df37d64eb9ee6ef3350f.
// Serialization alternative: B must wait for the delayed A write, not ACK early.
// Preserve persisted-B/zero-request assertions and add restart verification.
// ignore_for_file: avoid_print
import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

class SlowFinalWriteVault extends Vault {
  final delayed = Completer<void>();
  final release = Completer<void>();
  int writesA = 0;

  @override
  Future<void> write(String key, String value) async {
    final envelope = jsonDecode(value) as Map<String, dynamic>;
    if (envelope['account_id'] == 'A') {
      writesA++;
      // The auth-event write is first; flushCredentials' explicit write is second.
      if (writesA == 2) {
        delayed.complete();
        await release.future;
      }
    }
    await super.write(key, value);
  }
}

void main() {
  test('R3 late final credential write A must not overwrite acknowledged B', () async {
    final vault = SlowFinalWriteVault();
    var requests = 0;
    final account = EcosystemAccount(
      appId: 'abstract-hub',
      url: 'https://example.supabase.co',
      publishableKey: 'synthetic-public',
      callback: Uri.parse('com.abstracthub.app://auth/callback'),
      vault: vault,
      transport: MockClient((request) async {
        requests++;
        return http.Response('[]', 200, request: request,
            headers: {'content-type': 'application/json'});
      }),
    );
    addTearDown(account.dispose);
    addTearDown(() { if (!vault.release.isCompleted) vault.release.complete(); });
    final key = '${account.storageNamespace}.session';
    vault.values[key] = fixtureEnvelope(account, fixtureSession(id: 'A'));
    final oldRecovery = account.resume(consent: true, expectedAccountId: 'A');
    final oldRejected = expectLater(oldRecovery, throwsStateError);
    await vault.delayed.future;

    // Simulate the same explicit B login/cache preparation used by the upstream
    // identity-switch regression. Only synthetic envelope values are involved.
    vault.values[key] = fixtureEnvelope(account, fixtureSession(id: 'B'));
    var acknowledgedB = false;
    final recoveryB = account.resume(consent: true, expectedAccountId: 'B')
      .then((value) { acknowledgedB = value; return value; });
    await Future<void>.delayed(Duration.zero); // drain ready SDK/vault microtasks
    expect(acknowledgedB, false, reason: 'B cannot ACK while an older OS write is pending');
    expect(account.accountId, isNull, reason: 'a session awaiting durable commit is not ready');

    vault.release.complete();
    await oldRejected;
    expect(await recoveryB, true);
    expect(account.accountId, 'B');
    expect(requests, 0);
    final persisted = jsonDecode(vault.values[key]!) as Map;
    print('R3 active=${account.accountId} persisted=${persisted['account_id']} requests=$requests');
    expect(persisted['account_id'], 'B',
        reason: 'Stale A completion must not replace already acknowledged B credentials');
    final restarted = EcosystemAccount(appId: account.appId, url: account.url,
      publishableKey: 'synthetic-public', callback: account.callback, vault: vault,
      transport: MockClient((request) async { requests++; return http.Response('{}', 500); }));
    addTearDown(restarted.dispose);
    expect(await restarted.resume(consent: true, expectedAccountId: 'B'), true);
    expect(restarted.accountId, 'B');
    expect(requests, 0);
  });
}


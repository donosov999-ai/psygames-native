import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

// Smart Alarm R1/R2 semantics from original reviewer SHA
// 989e6e78ef2459532e3b3708e23a7df942c00c9e5aab3d1efb5911812979374c.
// Fixture storage adapted to the new authority-bound envelope. No live service.
void main() {
  EcosystemAccount make(Vault vault, http.Client transport, {String url = 'https://example.supabase.co'}) =>
    EcosystemAccount(appId: 'smart-alarm', url: url, publishableKey: 'synthetic-public',
      callback: Uri.parse('com.odv999.smartAlarm://auth/callback'), vault: vault, transport: transport);
  void cache(EcosystemAccount a, Vault vault, String id, {String? issuer, bool expired = false}) =>
    vault.values['${a.storageNamespace}.session'] = fixtureEnvelope(a,
      fixtureSession(id: id, issuer: issuer ?? a.issuer, expired: expired));
  http.Response ok(http.Request request, Object data) =>
    http.Response(jsonEncode(data), 200, request: request, headers: {'content-type': 'application/json'});

  test('R1 retained/prepared A query cannot dispatch after resume changes to B', () async {
    final vault = Vault();
    var requests = 0;
    final a = make(vault, MockClient((request) async { requests++; return ok(request, []); }));
    addTearDown(a.dispose);
    cache(a, vault, 'A');
    expect(await a.resume(consent: true), true);
    final oldBuilder = a.from('synthetic_results');
    final queryA = oldBuilder.select();
    cache(a, vault, 'B');
    expect(await a.resume(consent: true), true);
    expect(a.accountId, 'B');
    await expectLater(queryA, throwsStateError);
    await expectLater(oldBuilder.select(), throwsStateError);
    expect(requests, 0);
    // New explicit B-bound consent/recovery admits a new B query only.
    expect(await a.resume(consent: true, expectedAccountId: 'B'), true);
    await a.from('synthetic_results').select();
    expect(requests, 1);
  });

  test('host receipt for A cannot silently authorize restored account B', () async {
    final vault = Vault();
    var requests = 0;
    final a = make(vault, MockClient((r) async { requests++; return ok(r, []); }));
    addTearDown(a.dispose);
    cache(a, vault, 'A');
    expect(await a.resume(consent: true, expectedAccountId: 'A'), true);
    final queryA = a.from('synthetic_results').select();
    cache(a, vault, 'B');
    expect(await a.resume(consent: true, expectedAccountId: 'A'), false);
    expect(a.accountId, isNull);
    expect(a.active, false);
    expect(() => a.from('synthetic_results'), throwsStateError);
    await expectLater(queryA, throwsStateError);
    expect(requests, 0);
    expect(await a.resume(consent: true, expectedAccountId: 'B'), true);
    await a.from('synthetic_results').select();
    expect(requests, 1);
  });

  test('R2 old app-only credentials never migrate into another authority', () async {
    final vault = Vault()..values['ecosystem.account.v1.smart-alarm.session'] =
      jsonEncode(fixtureSession(id: 'A', issuer: 'https://old-project.supabase.co/auth/v1'));
    var requests = 0;
    final a = make(vault, MockClient((r) async { requests++; return ok(r, []); }),
      url: 'https://new-project.supabase.co');
    addTearDown(a.dispose);
    expect(await a.resume(consent: true), false);
    expect(a.accountId, isNull);
    expect(requests, 0);
    expect(vault.values.containsKey('${a.storageNamespace}.session'), false);
    expect(vault.values.length, 1); // No secret erased or silently copied.
  });

  for (final expired in [false, true]) {
    test('R2 foreign JWT issuer in current envelope rejected before SDK, expired=$expired', () async {
      final vault = Vault();
      var requests = 0;
      final a = make(vault, MockClient((r) async { requests++; return ok(r, []); }),
        url: 'https://new-project.supabase.co');
      addTearDown(a.dispose);
      cache(a, vault, 'A', issuer: 'https://old-project.supabase.co/auth/v1', expired: expired);
      expect(await a.resume(consent: true), false);
      expect(a.accountId, isNull);
      expect(requests, 0);
    });
  }

  test('same authority recovery works, different authority cannot read its slot', () async {
    final vault = Vault();
    var requests = 0;
    final transport = MockClient((r) async { requests++; return ok(r, []); });
    final a = make(vault, transport, url: 'https://old-project.supabase.co/');
    final same = make(vault, transport, url: 'https://old-project.supabase.co');
    final other = make(vault, transport, url: 'https://new-project.supabase.co');
    addTearDown(a.dispose); addTearDown(same.dispose); addTearDown(other.dispose);
    cache(a, vault, 'A');
    expect(a.storageNamespace, same.storageNamespace);
    expect(a.storageNamespace, isNot(other.storageNamespace));
    expect(await same.resume(consent: true, expectedAccountId: 'A'), true);
    expect(await other.resume(consent: true), false);
    expect(other.accountId, isNull);
    expect(requests, 0);
  });

  test('PKCE verifiers are separated by authority for the same app', () async {
    final vault = Vault();
    var requests = 0;
    final transport = MockClient((r) async {
      expect(r.url.path, '/auth/v1/otp'); requests++; return ok(r, {});
    });
    final a = make(vault, transport, url: 'https://old-project.supabase.co');
    final b = make(vault, transport, url: 'https://new-project.supabase.co');
    addTearDown(a.dispose); addTearDown(b.dispose);
    await a.requestLink('synthetic@example.invalid', consent: true);
    await b.requestLink('synthetic@example.invalid', consent: true);
    final keys = vault.values.keys.where((k) => k.contains('.pkce.')).toList();
    expect(keys.length, 2);
    expect(keys.where((k) => k.startsWith(a.storageNamespace)).length, 1);
    expect(keys.where((k) => k.startsWith(b.storageNamespace)).length, 1);
    expect(requests, 2);
    expect(() => a.from('synthetic_results'), throwsStateError);
  });

  test('envelope app/schema/subject mismatch is fail-closed without network', () async {
    for (final entry in <String, Object>{'app_id': 'psygames', 'schema': 2, 'account_id': 'B', 'issuer': 'https://other.invalid/auth/v1'}.entries) {
      final vault = Vault();
      var requests = 0;
      final a = make(vault, MockClient((r) async { requests++; return ok(r, []); }));
      addTearDown(a.dispose);
      final envelope = jsonDecode(fixtureEnvelope(a, fixtureSession(id: 'A')));
      envelope[entry.key] = entry.value;
      vault.values['${a.storageNamespace}.session'] = jsonEncode(envelope);
      expect(await a.resume(consent: true), false, reason: entry.key);
      expect(a.accountId, isNull);
      expect(requests, 0);
    }
  });

  test('late vault recovery A cannot replace a newer completed recovery B', () async {
    final vault = _DelayedVault();
    var requests = 0;
    final a = make(vault, MockClient((r) async { requests++; return ok(r, []); }));
    addTearDown(a.dispose);
    cache(a, vault, 'A');
    final savedA = vault.values['${a.storageNamespace}.session']!;
    vault.delayFirst = true;
    final recoveringA = a.resume(consent: true, expectedAccountId: 'A');
    await vault.started.future;
    cache(a, vault, 'B');
    expect(await a.resume(consent: true, expectedAccountId: 'B'), true);
    vault.first.complete(savedA);
    expect(await recoveringA, false);
    expect(a.accountId, 'B');
    expect(requests, 0);
  });

  for (final wrongIssuer in [true, false]) {
    test('refresh cannot replace bound identity, wrongIssuer=$wrongIssuer', () async {
      final vault = Vault();
      var requests = 0;
      final a = make(vault, MockClient((r) async {
        requests++;
        expect(r.url.path, '/auth/v1/token');
        return ok(r, fixtureSession(id: wrongIssuer ? 'A' : 'B',
          issuer: wrongIssuer ? 'https://foreign.invalid/auth/v1' : 'https://example.supabase.co/auth/v1'));
      }));
      addTearDown(a.dispose);
      cache(a, vault, 'A', expired: true);
      expect(await a.resume(consent: true, expectedAccountId: 'A'), false);
      expect(a.accountId, isNull);
      expect(() => a.from('synthetic_results'), throwsStateError);
      expect(requests, 1); // Approved refresh only; never a progress request.
    });
  }
}

class _DelayedVault extends Vault {
  bool delayFirst = false;
  final started = Completer<void>();
  final first = Completer<String?>();
  @override Future<String?> read(String key) {
    if (delayFirst) { delayFirst = false; started.complete(); return first.future; }
    return super.read(key);
  }
}

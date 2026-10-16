import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

EcosystemAccount make(Vault vault, http.Client transport) => EcosystemAccount(
  appId: 'smart-alarm',
  url: 'https://example.supabase.co',
  publishableKey: 'synthetic-public',
  callback: Uri.parse('com.odv999.smartalarm://auth/callback'),
  vault: vault,
  transport: transport,
);

final callback = Uri.parse(
  'com.odv999.smartalarm://auth/callback?code=synthetic',
);
http.Response ok(http.Request request, Object data) => http.Response(
  jsonEncode(data),
  200,
  request: request,
  headers: {'content-type': 'application/json'},
);

Future<void> requestAndDispose(Vault vault, http.Client transport) async {
  final requester = make(vault, transport);
  try {
    await requester.requestLink('synthetic@example.invalid', consent: true);
    expect(vault.values.keys.any((k) => k.contains('.pkce.')), true);
  } finally {
    await requester.dispose();
  }
}

void cache(
  EcosystemAccount account,
  Vault vault,
  String id, {
  bool expired = false,
}) {
  vault.values['${account.storageNamespace}.session'] = fixtureEnvelope(
    account,
    fixtureSession(id: id, expired: expired),
  );
}

String? saved(EcosystemAccount account, Vault vault) {
  final value = vault.values['${account.storageNamespace}.session'];
  return value == null
      ? null
      : (jsonDecode(value) as Map)['account_id'] as String?;
}

void release(Completer<void> gate) {
  if (!gate.isCompleted) gate.complete();
}

void main() {
  test('cold requestLink -> dispose -> new callback commits B without restoring A', () async {
    final vault = _TrackedVault();
    final paths = <String>[];
    final transport = MockClient((r) async {
      paths.add(r.url.path);
      if (r.url.path == '/auth/v1/token') {
        expect(r.url.queryParameters['grant_type'], 'pkce');
        final body = jsonDecode(r.body) as Map;
        expect(body['auth_code'], 'synthetic');
        final verifier = vault.values.entries
            .where((e) => e.key.contains('.pkce.'))
            .single
            .value;
        expect(
          body['code_verifier'] == verifier.split('/').first,
          true,
          reason:
              'exchange uses the original protected verifier; never print it',
        );
      }
      return ok(
        r,
        r.url.path == '/auth/v1/token' ? fixtureSession(id: 'B') : {},
      );
    });
    await requestAndDispose(vault, transport);
    final cold = make(vault, transport);
    addTearDown(cold.dispose);
    final key = '${cold.storageNamespace}.session';
    vault.values[key] = fixtureEnvelope(
      cold,
      fixtureSession(id: 'A', expired: true),
    );
    final reads = vault.reads;
    // Baseline RED used completeLink directly; this explicit opt-in is the fix.
    cold.prepareCallback(consent: true);
    expect(vault.reads, reads);
    expect(paths, ['/auth/v1/otp']);
    expect(cold.accountId, isNull);
    expect(saved(cold, vault), 'A');
    await cold.completeLink(callback);
    expect(cold.accountId, 'B');
    expect((jsonDecode(vault.values[key]!) as Map)['account_id'], 'B');
    expect(paths, ['/auth/v1/otp', '/auth/v1/token']);
    expect(
      vault.readKeys.every(
        (k) => k.startsWith('${cold.storageNamespace}.pkce.'),
      ),
      true,
    );
    expect(vault.values.keys.any((k) => k.contains('.pkce.')), false);
  });

  test('no explicit prepare stays OFF with intact verifier and zero callback network', () async {
    final vault = _TrackedVault();
    var requests = 0;
    final transport = MockClient((r) async {
      requests++;
      return ok(r, {});
    });
    await requestAndDispose(vault, transport);
    final cold = make(vault, transport);
    addTearDown(cold.dispose);
    cache(cold, vault, 'A', expired: true);
    await expectLater(cold.completeLink(callback), throwsStateError);
    expect(requests, 1); // OTP only; zero callback network.
    expect(vault.reads, 0);
    expect(cold.active, false);
    expect(saved(cold, vault), 'A');
    expect(vault.values.keys.any((k) => k.contains('.pkce.')), true);
  });

  test(
    'consent false retires a prepared lifecycle without vault or network',
    () async {
      final vault = _TrackedVault();
      var requests = 0;
      final cold = make(
        vault,
        MockClient((r) async {
          requests++;
          return ok(r, {});
        }),
      );
      addTearDown(cold.dispose);
      cache(cold, vault, 'A', expired: true);
      cold.prepareCallback(consent: true);
      expect(() => cold.prepareCallback(consent: false), throwsStateError);
      await expectLater(cold.completeLink(callback), throwsStateError);
      expect(cold.active, false);
      expect(cold.accountId, isNull);
      expect(vault.reads, 0);
      expect(requests, 0);
      expect(saved(cold, vault), 'A');
    },
  );

  test(
    'wrong callback is rejected before verifier read or SDK network',
    () async {
      final vault = _TrackedVault();
      var requests = 0;
      final cold = make(
        vault,
        MockClient((r) async {
          requests++;
          return ok(r, {});
        }),
      );
      addTearDown(cold.dispose);
      cold.prepareCallback(consent: true);
      for (final link in [
        'other.app://auth/callback?code=x',
        'com.odv999.smartalarm://other/callback?code=x',
        'com.odv999.smartalarm://auth/other?code=x',
        'com.odv999.smartalarm://auth/callback#access_token=x',
        'com.odv999.smartalarm://user@auth/callback?code=x',
        'com.odv999.smartalarm://auth:44/callback?code=x',
        'com.odv999.smartalarm://auth/callback?code=',
      ]) {
        await expectLater(cold.completeLink(Uri.parse(link)), throwsStateError);
      }
      expect(vault.reads, 0);
      expect(requests, 0);
      expect(cold.accountId, isNull);
    },
  );

  test(
    'missing verifier fails closed and never falls back to expired A',
    () async {
      final vault = _TrackedVault();
      var requests = 0;
      final cold = make(
        vault,
        MockClient((r) async {
          requests++;
          return ok(r, {});
        }),
      );
      addTearDown(cold.dispose);
      cache(cold, vault, 'A', expired: true);
      cold.prepareCallback(consent: true);
      await expectLater(
        cold.completeLink(callback),
        throwsA(isA<AuthException>()),
      );
      expect(cold.active, false);
      expect(cold.accountId, isNull);
      expect(requests, 0);
      expect(vault.readKeys, hasLength(1));
      expect(
        vault.readKeys.single.startsWith('${cold.storageNamespace}.pkce.'),
        true,
      );
      expect(saved(cold, vault), 'A');
    },
  );

  test(
    'OFF during pending exchange rejects late B with no session commit',
    () async {
      final vault = _TrackedVault();
      final started = Completer<void>(), reply = Completer<http.Response>();
      final paths = <String>[];
      final transport = MockClient((r) async {
        paths.add(r.url.path);
        if (r.url.path == '/auth/v1/otp') return ok(r, {});
        started.complete();
        return reply.future;
      });
      await requestAndDispose(vault, transport);
      final cold = make(vault, transport);
      addTearDown(cold.dispose);
      addTearDown(() {
        if (!reply.isCompleted) reply.complete(http.Response('{}', 500));
      });
      cache(cold, vault, 'A', expired: true);
      cold.prepareCallback(consent: true);
      final rejected = expectLater(
        cold.completeLink(callback),
        throwsStateError,
      );
      await started.future;
      cold.suspend();
      reply.complete(
        http.Response(
          jsonEncode(fixtureSession(id: 'B')),
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      await rejected;
      expect(cold.accountId, isNull);
      expect(cold.active, false);
      expect(saved(cold, vault), 'A');
      expect(paths, ['/auth/v1/otp', '/auth/v1/token']);
      expect(vault.values.keys.any((k) => k.contains('.pkce.')), true);
    },
  );

  test(
    'prepare retires active A and its builders without recovering cached A',
    () async {
      final vault = _TrackedVault();
      final paths = <String>[];
      final transport = MockClient((r) async {
        paths.add(r.url.path);
        return ok(
          r,
          r.url.path == '/auth/v1/token' ? fixtureSession(id: 'B') : {},
        );
      });
      await requestAndDispose(vault, transport);
      final account = make(vault, transport);
      addTearDown(account.dispose);
      cache(account, vault, 'A');
      expect(await account.resume(consent: true, expectedAccountId: 'A'), true);
      final retained = account.from('synthetic_results');
      final pending = retained.select();
      cache(account, vault, 'A', expired: true);
      final reads = vault.reads;
      account.prepareCallback(consent: true);
      expect(vault.reads, reads);
      expect(account.accountId, isNull);
      expect(() => account.from('synthetic_results'), throwsStateError);
      await expectLater(pending, throwsStateError);
      await expectLater(retained.select(), throwsStateError);
      await account.completeLink(callback);
      expect(account.accountId, 'B');
      expect(saved(account, vault), 'B');
      expect(paths, ['/auth/v1/otp', '/auth/v1/token']);
    },
  );

  test('B callback waits for durable final write before identity or success ACK', () async {
    // In PKCE exchange the explicit flush can precede the duplicate auth-event
    // write. Block the first durable B write rather than assuming event order.
    final vault = _SlowFinalVault('B', atWrite: 1);
    final transport = MockClient(
      (r) async =>
          ok(r, r.url.path == '/auth/v1/token' ? fixtureSession(id: 'B') : {}),
    );
    await requestAndDispose(vault, transport);
    final cold = make(vault, transport);
    addTearDown(cold.dispose);
    addTearDown(() => release(vault.release));
    cold.prepareCallback(consent: true);
    var acknowledged = false;
    final completing = cold.completeLink(callback).then((_) {
      acknowledged = true;
    });
    await vault.started.future;
    expect(acknowledged, false);
    expect(cold.accountId, isNull);
    release(vault.release);
    await completing;
    expect(acknowledged, true);
    expect(cold.accountId, 'B');
    expect(saved(cold, vault), 'B');
  });

  test(
    'replacement cold B drains old slow A write before committing B',
    () async {
      final vault = _SlowFinalVault('A');
      final paths = <String>[];
      final transport = MockClient((r) async {
        paths.add(r.url.path);
        return ok(
          r,
          r.url.path == '/auth/v1/token' ? fixtureSession(id: 'B') : {},
        );
      });
      await requestAndDispose(vault, transport);
      final old = make(vault, transport), cold = make(vault, transport);
      addTearDown(old.dispose);
      addTearDown(cold.dispose);
      addTearDown(() => release(vault.release));
      cache(old, vault, 'A');
      final obsolete = expectLater(
        old.resume(consent: true, expectedAccountId: 'A'),
        throwsStateError,
      );
      await vault.started.future;
      final reads = vault.reads;
      cold.prepareCallback(consent: true);
      expect(vault.reads, reads);
      expect(old.active, false);
      var acknowledged = false;
      final completing = cold.completeLink(callback).then((_) {
        acknowledged = true;
      });
      await Future<void>.delayed(Duration.zero);
      expect(acknowledged, false);
      expect(paths, ['/auth/v1/otp']);
      release(vault.release);
      await obsolete;
      await completing;
      expect(cold.accountId, 'B');
      expect(saved(cold, vault), 'B');
      await old.dispose();
      expect(cold.accountId, 'B');
      expect(paths, ['/auth/v1/otp', '/auth/v1/token']);
    },
  );

  test('OFF during an OS credential write cannot ACK or activate late B', () async {
    final vault = _SlowFinalVault('B', atWrite: 1);
    final transport = MockClient(
      (r) async =>
          ok(r, r.url.path == '/auth/v1/token' ? fixtureSession(id: 'B') : {}),
    );
    await requestAndDispose(vault, transport);
    final cold = make(vault, transport);
    addTearDown(cold.dispose);
    addTearDown(() => release(vault.release));
    cold.prepareCallback(consent: true);
    final rejected = expectLater(cold.completeLink(callback), throwsStateError);
    await vault.started.future;
    cold.suspend();
    release(vault.release);
    await rejected;
    expect(cold.accountId, isNull);
    expect(cold.active, false);
    expect(() => cold.from('synthetic_results'), throwsStateError);
    // An OS write already in progress cannot be unsent. OFF keeps encrypted
    // credentials for explicit opt-in, but must never ACK or restore identity.
    expect(vault.writes, 1);
  });

  test(
    'late retired callback cannot remove verifier or replace acknowledged C',
    () async {
      final vault = _TrackedVault();
      final started = Completer<void>(), reply = Completer<http.Response>();
      var exchanges = 0;
      final transport = MockClient((r) async {
        if (r.url.path == '/auth/v1/otp') return ok(r, {});
        exchanges++;
        if (exchanges == 1) {
          started.complete();
          return reply.future;
        }
        return ok(r, fixtureSession(id: 'C'));
      });
      await requestAndDispose(vault, transport);
      final old = make(vault, transport), cold = make(vault, transport);
      addTearDown(old.dispose);
      addTearDown(cold.dispose);
      addTearDown(() {
        if (!reply.isCompleted) reply.complete(http.Response('{}', 500));
      });
      old.prepareCallback(consent: true);
      final obsolete = expectLater(
        old.completeLink(callback),
        throwsStateError,
      );
      await started.future;
      cold.prepareCallback(consent: true);
      await cold.completeLink(callback.replace(query: 'code=newer-synthetic'));
      expect(cold.accountId, 'C');
      expect(saved(cold, vault), 'C');
      reply.complete(
        http.Response(
          jsonEncode(fixtureSession(id: 'B')),
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      await obsolete;
      expect(cold.accountId, 'C');
      expect(saved(cold, vault), 'C');
      expect(old.active, false);
      expect(exchanges, 2);
    },
  );

  test(
    'callback verifier remains pinned to app and issuer namespaces',
    () async {
      final vault = _TrackedVault();
      var requests = 0;
      final transport = MockClient((r) async {
        requests++;
        return ok(r, {});
      });
      await requestAndDispose(vault, transport);
      for (final scope in [
        ('psygames', 'https://example.supabase.co'),
        ('smart-alarm', 'https://foreign.supabase.co'),
      ]) {
        final foreign = EcosystemAccount(
          appId: scope.$1,
          url: scope.$2,
          publishableKey: 'synthetic-public',
          callback: callback.replace(query: ''),
          vault: vault,
          transport: transport,
        );
        addTearDown(foreign.dispose);
        foreign.prepareCallback(consent: true);
        await expectLater(
          foreign.completeLink(callback),
          throwsA(isA<AuthException>()),
        );
        expect(foreign.active, false);
        expect(foreign.accountId, isNull);
      }
      expect(requests, 1); // OTP only; foreign scopes cannot exchange.
      expect(
        vault.values.keys.where((k) => k.contains('.pkce.')),
        hasLength(1),
      );
    },
  );
}

class _TrackedVault extends Vault {
  final readKeys = <String>[];
  @override
  Future<String?> read(String key) {
    readKeys.add(key);
    return super.read(key);
  }
}

class _SlowFinalVault extends _TrackedVault {
  _SlowFinalVault(this.subject, {this.atWrite = 2});
  final String subject;
  final int atWrite;
  final started = Completer<void>(), release = Completer<void>();
  int writes = 0;
  @override
  Future<void> write(String key, String value) async {
    if (key.endsWith('.session') &&
        (jsonDecode(value) as Map)['account_id'] == subject) {
      writes++;
      if (writes == atWrite) {
        started.complete();
        await release.future;
      }
    }
    await super.write(key, value);
  }
}

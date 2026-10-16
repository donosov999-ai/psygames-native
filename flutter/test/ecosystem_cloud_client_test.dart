import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:ecosystem_cloud/ecosystem_cloud.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'support/account_fixtures.dart';

class _Vault implements AccountVault {
  final values = <String, String>{};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async {
    values[key] = value;
  }

  @override
  Future<void> remove(String key) async {
    values.remove(key);
  }
}

void main() {
  const owner = '11111111-1111-4111-8111-111111111111';
  const copyId = '22222222-2222-4222-8222-222222222222';
  const requestId = '33333333-3333-4333-8333-333333333333';
  late EcosystemAccount account;
  late AppCloudClient cloud;
  final requests = <http.Request>[];
  final payload = <String, dynamic>{
    'schema': 1,
    'data': {'psygames_pet_name': 'Synapse', 'psygames_tokens_v1': '75'},
  };
  final row = {
    'id': copyId,
    'request_id': requestId,
    'revision': 7,
    'created_at': '2026-10-16T02:00:00Z',
  };
  Map<String, dynamic> receipt({
    bool enabled = true,
    String app = 'psygames',
  }) => {
    'owner_id': owner,
    'app_id': app,
    'issuer': 'https://example.supabase.co/auth/v1',
    'policy_version': 1,
    'enabled': enabled,
    'accepted_at': '2026-10-16T02:00:00Z',
  };
  http.Response reply(http.Request r, Object body, {int status = 200}) =>
      http.Response(
        jsonEncode(body),
        status,
        request: r,
        headers: {'content-type': 'application/json'},
      );
  Future<void> setup({
    String app = 'psygames',
    Future<http.Response?> Function(http.Request)? custom,
  }) async {
    requests.clear();
    final vault = _Vault();
    account = EcosystemAccount(
      appId: app,
      url: 'https://example.supabase.co',
      publishableKey: 'fixture-public',
      callback: Uri.parse('com.psygames.app://auth/callback'),
      vault: vault,
      transport: MockClient((r) async {
        requests.add(r);
        final override = await custom?.call(r);
        if (override != null) return override;
        if (r.url.path.endsWith(AppCloudClient.consentsTable)) {
          if (r.method == 'POST') return reply(r, receipt(app: app));
          if (r.method == 'PATCH') {
            return reply(r, [receipt(enabled: false, app: app)]);
          }
          return reply(r, [receipt(app: app)]);
        }
        if (r.method == 'DELETE') return http.Response('', 204, request: r);
        if (r.method == 'POST') return reply(r, [row]);
        if (r.url.queryParameters['select'] == 'payload') {
          return reply(r, [
            {'payload': payload},
          ]);
        }
        return reply(r, [row]);
      }),
    );
    vault.values['${account.storageNamespace}.session'] = fixtureEnvelope(
      account,
      fixtureSession(id: owner),
    );
    expect(await account.resume(consent: true, expectedAccountId: owner), true);
    cloud = AppCloudClient(
      account: account,
      expectedAccountId: owner,
      validatePayload: (value) {
        final keys = (value['data'] as Map).keys;
        if (keys.any(
          (key) => key != 'psygames_pet_name' && key != 'psygames_tokens_v1',
        )) {
          throw const FormatException();
        }
      },
    );
  }

  Matcher error(CloudPortCode code) =>
      isA<CloudPortError>().having((e) => e.code, 'code', code);
  Future<void> enabled() async {
    cloud.allowHistoryRead();
    await cloud.acceptConsent();
    requests.clear();
  }

  tearDown(() async {
    cloud.suspend();
    await account.dispose();
  });

  test(
    'constructor/OFF perform no network and cannot read/accept consent',
    () async {
      await setup();
      expect(requests, isEmpty);
      await expectLater(cloud.versions(), throwsA(error(CloudPortCode.off)));
      await expectLater(
        cloud.acceptConsent(),
        throwsA(error(CloudPortCode.off)),
      );
      expect(requests, isEmpty);
    },
  );
  test('history permission is NOT upload consent', () async {
    await setup();
    cloud.allowHistoryRead();
    await cloud.versions();
    await expectLater(
      cloud.save(payload, baseRevision: 0, requestId: requestId),
      throwsA(error(CloudPortCode.consentRequired)),
    );
    expect(requests.map((r) => r.method), ['GET']);
  });
  test(
    'consent upsert binds exact owner/app/issuer/version before uploads',
    () async {
      await setup();
      cloud.allowHistoryRead();
      await cloud.acceptConsent();
      final sent = jsonDecode(requests.single.body) as Map;
      expect(sent, {
        'owner_id': owner,
        'app_id': 'psygames',
        'issuer': account.issuer,
        'policy_version': 1,
        'enabled': true,
      });
      expect(
        requests.single.url.queryParameters['on_conflict'],
        'owner_id,app_id',
      );
      expect(cloud.uploadsEnabled, true);
    },
  );
  test('all app metadata requests include owner AND app filters', () async {
    for (final app in AppCloudClient.apps) {
      await setup(app: app);
      cloud.allowHistoryRead();
      await cloud.versions();
      expect(requests.single.url.queryParameters['owner_id'], 'eq.$owner');
      expect(requests.single.url.queryParameters['app_id'], 'eq.$app');
      expect(requests.single.url.queryParameters['limit'], '10');
      cloud.suspend();
      await account.dispose();
    }
  });
  test('CAS accepts opaque revision gaps from interleaved apps, never assumes plus-one', () async {
    await setup();
    await enabled();
    final saved = await cloud.save(
      payload,
      baseRevision: 1,
      requestId: requestId,
    );
    expect(saved.revision, 7);
    final sent = jsonDecode(requests.single.body) as Map;
    expect(sent['base_revision'], 1);
    expect(sent['payload'], payload);
  });
  test('stale revision is a conflict, not a silent force-save/retry', () async {
    await setup(
      custom: (r) async =>
          r.url.path.endsWith(AppCloudClient.snapshotsTable) &&
              r.method == 'POST'
          ? reply(r, {
              'code': '40001',
              'message': 'cloud_revision_conflict',
            }, status: 400)
          : null,
    );
    await enabled();
    await expectLater(
      cloud.save(payload, baseRevision: 0, requestId: requestId),
      throwsA(error(CloudPortCode.conflict)),
    );
    expect(requests.length, 1);
  });
  test('retained retry reads original receipt by request ID without a second insert', () async {
    await setup(
      custom: (r) async =>
          r.url.path.endsWith(AppCloudClient.snapshotsTable) &&
              r.method == 'POST'
          ? reply(r, [])
          : null,
    );
    await enabled();
    final saved = await cloud.save(
      payload,
      baseRevision: 1,
      requestId: requestId,
    );
    expect(saved.revision, 7);
    expect(requests.map((r) => r.method), ['POST', 'GET']);
    expect(requests.last.url.queryParameters['request_id'], 'eq.$requestId');
  });
  test(
    'OFF rejects an in-flight response and permanently retires this client',
    () async {
      final wait = Completer<http.Response>();
      late http.Request request;
      await setup(
        custom: (r) async {
          request = r;
          return wait.future;
        },
      );
      cloud.allowHistoryRead();
      final pending = cloud.versions();
      final checked = expectLater(pending, throwsA(error(CloudPortCode.off)));
      await Future<void>.delayed(Duration.zero);
      cloud.suspend();
      wait.complete(reply(request, [row]));
      await checked;
      expect(() => cloud.allowHistoryRead(), throwsA(error(CloudPortCode.off)));
    },
  );
  test(
    'a changed/retired underlying identity cannot lend credentials',
    () async {
      await setup();
      cloud.allowHistoryRead();
      account.suspend();
      await expectLater(
        cloud.versions(),
        throwsA(error(CloudPortCode.accountChanged)),
      );
      expect(requests, isEmpty);
    },
  );
  test(
    'server revoke before deletion; other-app/local state is not touched',
    () async {
      await setup();
      await enabled();
      await cloud.deleteCopies();
      expect(requests.map((r) => r.method), ['PATCH', 'DELETE']);
      for (final r in requests) {
        expect(r.url.queryParameters['owner_id'], 'eq.$owner');
        expect(r.url.queryParameters['app_id'], 'eq.psygames');
      }
      expect(cloud.uploadsEnabled, false);
    },
  );
  test('failed revoke cannot pretend copies were deleted', () async {
    await setup(
      custom: (r) async => r.method == 'PATCH'
          ? reply(r, {'code': 'fixture'}, status: 503)
          : null,
    );
    await enabled();
    await expectLater(
      cloud.deleteCopies(),
      throwsA(error(CloudPortCode.network)),
    );
    expect(requests.map((r) => r.method), ['PATCH']);
    expect(cloud.uploadsEnabled, false);
  });
  test(
    'reject invalid/foreign payload and oversized UTF8 before any dispatch',
    () async {
      await setup();
      await enabled();
      for (final data in <Map<String, dynamic>>[
        {'schema': 1, 'app_id': 'abstract-hub', 'data': {}},
        {'schema': null, 'data': {}},
        {
          'schema': 1,
          'data': {'diary': 'private'},
        },
        {
          'schema': 1,
          'data': {
            'psygames_pet_name': List.filled(3 * 1024 * 1024, 'Ж').join(),
          },
        },
      ]) {
        await expectLater(
          cloud.save(data, baseRevision: 0, requestId: requestId),
          throwsA(error(CloudPortCode.invalidPayload)),
        );
      }
      expect(requests, isEmpty);
    },
  );
  test(
    'download runs host allowlist before returning the private copy',
    () async {
      await setup(
        custom: (r) async => reply(r, [
          {
            'payload': {
              'schema': 1,
              'data': {'diary': 'do-not-return'},
            },
          },
        ]),
      );
      cloud.allowHistoryRead();
      await expectLater(
        cloud.download(copyId),
        throwsA(error(CloudPortCode.invalidPayload)),
      );
    },
  );
  test('malformed/wrong request ACK is not a successful save', () async {
    await setup(
      custom: (r) async => r.url.path.endsWith(AppCloudClient.snapshotsTable)
          ? reply(r, [
              {...row, 'request_id': copyId},
            ])
          : null,
    );
    await enabled();
    await expectLater(
      cloud.save(payload, baseRevision: 0, requestId: requestId),
      throwsA(error(CloudPortCode.invalidPayload)),
    );
  });
  test(
    'recovery requires exact local receipt AND a still-enabled server receipt',
    () async {
      await setup(custom: (r) async => reply(r, [receipt(enabled: false)]));
      cloud.allowHistoryRead();
      await expectLater(
        cloud.recoverConsent(receipt(app: 'abstract-hub')),
        throwsA(error(CloudPortCode.invalidPayload)),
      );
      expect(requests, isEmpty);
      await expectLater(
        cloud.recoverConsent(receipt()),
        throwsA(error(CloudPortCode.consentRequired)),
      );
      expect(cloud.uploadsEnabled, false);
    },
  );
  test(
    'account deletion stays UNAVAILABLE rather than inventing a privileged API',
    () async {
      await setup();
      await expectLater(
        cloud.deleteAccount(),
        throwsA(error(CloudPortCode.unavailable)),
      );
      expect(requests, isEmpty);
    },
  );

  test('busy revoke stops uploads and fences a late accept ACK', () async {
    final pending = Completer<http.Response>();
    late http.Request request;
    await setup(
      custom: (r) async {
        request = r;
        return pending.future;
      },
    );
    cloud.allowHistoryRead();
    final accept = cloud.acceptConsent();
    final rejected = expectLater(
      accept,
      throwsA(error(CloudPortCode.consentRequired)),
    );
    await Future<void>.delayed(Duration.zero);
    await expectLater(
      cloud.revokeConsent(),
      throwsA(error(CloudPortCode.unavailable)),
    );
    pending.complete(reply(request, receipt()));
    await rejected;
    expect(cloud.uploadsEnabled, false);
    expect(requests.map((r) => r.method), ['POST']);
  });

  test('mutations fail fast rather than queueing a second save', () async {
    final pending = Completer<http.Response>();
    late http.Request request;
    await setup(
      custom: (r) async {
        if (r.url.path.endsWith(AppCloudClient.snapshotsTable) &&
            r.method == 'POST') {
          request = r;
          return pending.future;
        }
        return null;
      },
    );
    await enabled();
    final first = cloud.save(payload, baseRevision: 0, requestId: requestId);
    final rejected = expectLater(first, throwsA(error(CloudPortCode.off)));
    await Future<void>.delayed(Duration.zero);
    await expectLater(
      cloud.save(payload, baseRevision: 0, requestId: copyId),
      throwsA(error(CloudPortCode.unavailable)),
    );
    cloud.suspend();
    pending.complete(reply(request, [row]));
    await rejected;
    expect(requests.length, 1);
  });

  test(
    'observed identity mismatch permanently retires the old cloud capability',
    () async {
      await setup();
      cloud.allowHistoryRead();
      account.suspend();
      await expectLater(
        cloud.versions(),
        throwsA(error(CloudPortCode.accountChanged)),
      );
      expect(
        await account.resume(consent: true, expectedAccountId: owner),
        true,
      );
      await expectLater(cloud.versions(), throwsA(error(CloudPortCode.off)));
      expect(requests, isEmpty);
    },
  );

  test(
    'replacement connector cannot overtake an unsettled old mutation',
    () async {
      final pending = Completer<http.Response>();
      late http.Request request;
      await setup(
        custom: (r) async {
          if (r.method == 'POST' &&
              r.url.path.endsWith(AppCloudClient.snapshotsTable)) {
            request = r;
            return pending.future;
          }
          return null;
        },
      );
      await enabled();
      final first = cloud.save(payload, baseRevision: 0, requestId: requestId);
      final rejected = expectLater(first, throwsA(error(CloudPortCode.off)));
      await Future<void>.delayed(Duration.zero);
      cloud.suspend();
      expect(
        await account.resume(consent: true, expectedAccountId: owner),
        true,
      );
      final replacement = AppCloudClient(
        account: account,
        expectedAccountId: owner,
        validatePayload: (_) {}, // Synthetic fixture only.
      )..allowHistoryRead();
      addTearDown(replacement.suspend);
      await expectLater(
        replacement.acceptConsent(),
        throwsA(error(CloudPortCode.unavailable)),
      );
      expect(requests.map((r) => r.method), ['POST']);
      pending.complete(reply(request, [row]));
      await rejected;
      await replacement.acceptConsent();
      expect(replacement.uploadsEnabled, true);
      expect(requests.map((r) => r.method), ['POST', 'POST']);
    cloud.suspend(); // Delayed disposal of the already-retired old UI.
    expect(account.accountId, owner);
    await replacement.versions();
    expect(replacement.uploadsEnabled, true);
    },
  );

  test(
    'host validator receives detached recursively immutable upload JSON',
    () async {
      await setup();
      final checked = AppCloudClient(
        account: account,
        expectedAccountId: owner,
        validatePayload: (value) {
          final data = value['data'] as Map<String, dynamic>;
          expect(
            () => data['psygames_pet_name'] = 'changed',
            throwsUnsupportedError,
          );
          final values = data['psygames_tokens_v1'] as List;
          expect(() => values.add('injected'), throwsUnsupportedError);
        },
      )..allowHistoryRead();
      addTearDown(checked.suspend);
      await checked.acceptConsent();
      requests.clear();
      await checked.save(
        {
          'schema': 1,
          'data': {
            'psygames_pet_name': 'Synapse',
            'psygames_tokens_v1': ['75'],
          },
        },
        baseRevision: 0,
        requestId: requestId,
      );
      expect((jsonDecode(requests.single.body) as Map)['payload']['data'], {
        'psygames_pet_name': 'Synapse',
        'psygames_tokens_v1': ['75'],
      });
    },
  );

  test('download returns recursively immutable JSON', () async {
    await setup();
    cloud.allowHistoryRead();
    final result = await cloud.download(copyId);
    expect(() => result['schema'] = 2, throwsUnsupportedError);
    expect(
      () => (result['data'] as Map)['psygames_pet_name'] = 'changed',
      throwsUnsupportedError,
    );
    expect(payload['data']['psygames_pet_name'], 'Synapse');
  });
}

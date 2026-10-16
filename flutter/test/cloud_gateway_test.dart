import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:psygames_flutter/shell/cloud_backup.dart';
import 'package:psygames_flutter/shell/cloud_gateway.dart';
import 'package:psygames_flutter/shell/cloud_pilot.dart';
import 'package:psygames_flutter/shell/cloud_restore.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

void main() {
  const owner = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  final callback = Uri.parse('com.psygames.app://auth/callback?code=synthetic');
  late SharedState state;
  late Vault vault;
  late EcosystemAccount account;
  late PsyGamesCloudGateway gateway;
  late Directory dir;
  final requests = <http.Request>[];
  List<Map<String, dynamic>> copies = [];
  var failSave = false;
  var conflictSave = false;
  Future<http.Response>? pendingToken;
  Map<String, dynamic> snapshot() => jsonDecode(
    CloudSnapshot.capture({
      'psygames_pet_name': 'Synapse',
      'psygames_tokens_v1': '75',
      'psygames_sudoku_level_women': '79',
    }).encode(),
  );
  http.Response reply(http.Request r, Object value, {int status = 200}) =>
      http.Response(
        jsonEncode(value),
        status,
        request: r,
        headers: {'content-type': 'application/json'},
      );
  EcosystemAccount makeAccount() => EcosystemAccount(
    appId: 'psygames',
    url: 'https://example.supabase.co',
    publishableKey: 'synthetic-public',
    callback: Uri.parse('com.psygames.app://auth/callback'),
    vault: vault,
    transport: MockClient((r) async {
      requests.add(r);
      if (r.url.path == '/auth/v1/otp') return reply(r, {});
      if (r.url.path == '/auth/v1/token') {
        return pendingToken ?? reply(r, fixtureSession(id: owner));
      }
      if (r.url.path.endsWith('ecosystem_app_consents')) {
        final receipt = {
          'owner_id': owner,
          'app_id': 'psygames',
          'issuer': account.issuer,
          'policy_version': 1,
          'enabled': r.method != 'PATCH',
        };
        return reply(r, r.method == 'POST' ? receipt : [receipt]);
      }
      if (r.method == 'POST') {
        if (conflictSave) return reply(r, {'code': '40001'}, status: 409);
        if (failSave) return reply(r, {'code': 'fixture'}, status: 503);
        final body = jsonDecode(r.body) as Map;
        return reply(r, [
          {
            'id': id,
            'request_id': body['request_id'],
            'revision': 7,
            'created_at': '2026-10-16T00:00:00Z',
          },
        ]);
      }
      if (r.url.queryParameters['select'] == 'payload') {
        return reply(r, [
          {
            'payload': {'schema': 1, 'data': snapshot()},
          },
        ]);
      }
      return reply(r, copies);
    }),
  );
  PsyGamesCloudGateway makeGateway() => PsyGamesCloudGateway(
    state: state,
    account: account,
    restoreDirectory: () async => dir,
  );
  Future<void> login() async {
    await gateway.requestLink('synthetic@example.invalid');
    await gateway.completeLink(callback);
    await gateway.versions();
  }

  Future<void> enable() async {
    await state.set(
      CloudPilot.receiptKey,
      jsonEncode({
        'version': 1,
        'app_id': 'psygames',
        'issuer': gateway.issuer,
        'account_id': owner,
      }),
    );
    await state.set(CloudPilot.consentKey, '1');
    await gateway.enableBackup();
  }

  setUp(() async {
    SharedPreferences.setMockInitialValues({
      'psygames_tokens_v1': '75',
      'psygames_pet_name': 'Synapse',
    });
    state = await SharedState.open();
    vault = Vault();
    dir = await Directory.systemTemp.createTemp('psygames-cloud-gateway-test-');
    requests.clear();
    copies = [];
    failSave = false;
    conflictSave = false;
    pendingToken = null;
    account = makeAccount();
    gateway = makeGateway();
  });
  tearDown(() async {
    gateway.suspend();
    await account.dispose();
    await dir.delete(recursive: true);
    state.dispose();
  });

  test(
    'construction and unknown cold callback are network/vault/write inert',
    () async {
      final before = state.snapshot();
      expect(await gateway.hasPendingLogin(callback), false);
      await expectLater(
        gateway.completeLink(callback),
        throwsA(isA<Exception>()),
      );
      expect(requests, isEmpty);
      expect(vault.reads, 0);
      expect(state.snapshot(), before);
    },
  );
  test(
    'login and version preview never create upload consent or copies',
    () async {
      await login();
      expect(requests.map((r) => r.method), ['POST', 'POST', 'GET']);
      expect(state.get(CloudPilot.consentKey), isNull);
      await expectLater(gateway.enableBackup(), throwsA(isA<Exception>()));
      expect(state.get('psygames_tokens_v1'), '75');
    },
  );
  test(
    'cold SDK and controller use protected PKCE intent, never recover cached A',
    () async {
      await gateway.requestLink('synthetic@example.invalid');
      await account.dispose(); // Process death does not invoke gateway OFF.
      account = makeAccount();
      vault.values['${account.storageNamespace}.session'] = fixtureEnvelope(
        account,
        fixtureSession(id: 'old-A', expired: true),
      );
      gateway = makeGateway();
      final pilot = CloudPilot(state, gateway);
      await pilot.completeLink(callback);
      expect(pilot.stage, CloudPilotStage.history);
      expect(gateway.accountId, owner);
      expect(
        requests
            .where((r) => r.url.path == '/auth/v1/token')
            .single
            .url
            .queryParameters['grant_type'],
        'pkce',
      );
      expect(state.get(PsyGamesCloudGateway.intentKey), isNull);
      pilot.dispose();
    },
  );
  test('OFF prevents a late exchanged identity from enabling cloud', () async {
    final pending = Completer<http.Response>();
    pendingToken = pending.future;
    await gateway.requestLink('synthetic@example.invalid');
    final result = gateway.completeLink(callback);
    final rejected = expectLater(result, throwsA(isA<Exception>()));
    await Future<void>.delayed(Duration.zero);
    gateway.suspend();
    pending.complete(reply(requests.last, fixtureSession(id: owner)));
    await rejected;
    expect(gateway.accountId, isNull);
    expect(requests.where((r) => r.url.path.contains('ecosystem_')), isEmpty);
  });
  test('explicit upload wraps full host snapshot and never increments local balances', () async {
    await login();
    await enable();
    requests.clear();
    await gateway.save(keepLocalAfterConflict: false);
    expect(
      state.get(CloudBackup.consentKey),
      isNull,
      reason: 'Shared backup consent must not enable the legacy web sender',
    );
    final body = jsonDecode(requests.single.body) as Map;
    expect(body['base_revision'], 0);
    expect(body['payload']['schema'], 1);
    expect(body['payload']['data']['data']['psygames_pet_name'], 'Synapse');
    expect(body['payload']['data']['data']['psygames_tokens_v1'], '75');
    expect(
      (body['payload']['data']['data'] as Map).containsKey(
        CloudPilot.receiptKey,
      ),
      false,
    );
    expect(state.get('psygames_tokens_v1'), '75');
  });
  test('existing cloud history needs conscious keep-local action before first POST', () async {
    copies = [
      {
        'id': id,
        'request_id': id,
        'revision': 4,
        'created_at': '2026-10-16T00:00:00Z',
      },
    ];
    await login();
    await enable();
    requests.clear();
    await expectLater(
      gateway.save(keepLocalAfterConflict: false),
      throwsA(isA<CloudConflict>()),
    );
    expect(requests, isEmpty);
    await gateway.save(keepLocalAfterConflict: true);
    expect((jsonDecode(requests.last.body) as Map)['base_revision'], 4);
  });
  test(
    'network retry reuses exact request id/base/payload, no automatic retry',
    () async {
      await login();
      await enable();
      requests.clear();
      failSave = true;
      await expectLater(
        gateway.save(keepLocalAfterConflict: false),
        throwsA(isA<Exception>()),
      );
      final original = requests.single.body;
      await state.set('psygames_tokens_v1', '80');
      failSave = false;
      await gateway.save(keepLocalAfterConflict: false);
      expect(requests.length, 2);
      expect(requests.last.body, original);
      expect(state.get('psygames_tokens_v1'), '80');
    },
  );
  test('restore is prepared while OFF, then replaced once at startup without rewards', () async {
    await login();
    final copy = await gateway.download(
      CloudVersion(id, 7, DateTime.utc(2026)),
    );
    gateway.suspend();
    await gateway.prepareRestore(copy);
    expect(state.get('psygames_sudoku_level_women'), isNull);
    expect(await CloudRestore.applyPending(dir, state), true);
    expect(state.get('psygames_sudoku_level_women'), '79');
    expect(state.get('psygames_tokens_v1'), '75');
    expect(await CloudRestore.applyPending(dir, state), false);
    expect(
      await File('${dir.path}/${CloudRestore.safetyFileName}').exists(),
      true,
    );
  });

  test(
    'metadata refresh never accepts a peer revision as our CAS base',
    () async {
      await login();
      await enable();
      await gateway.save(keepLocalAfterConflict: false);
      copies = [
        {
          'id': id,
          'request_id': id,
          'revision': 11,
          'created_at': '2026-10-16T00:00:00Z',
        },
      ];
      await gateway.versions();
      requests.clear();
      conflictSave = true;
      await expectLater(
        gateway.save(keepLocalAfterConflict: false),
        throwsA(isA<CloudConflict>()),
      );
      expect(requests.length, 1);
      expect((jsonDecode(requests.single.body) as Map)['base_revision'], 7);
    },
  );
  test(
    'late old OFF neither stops replacement auth nor erases its intent',
    () async {
      await login();
      final old = gateway;
      old.suspend();
      gateway = makeGateway();
      await gateway.requestLink('synthetic@example.invalid');
      final intent = state.get(PsyGamesCloudGateway.intentKey);
      old.suspend();
      await Future<void>.delayed(Duration.zero);
      expect(state.get(PsyGamesCloudGateway.intentKey), intent);
      await gateway.completeLink(callback);
      expect(gateway.accountId, owner);
    },
  );
  test(
    'initially OFF cold host can cancel its persisted login intent',
    () async {
      await gateway.requestLink('synthetic@example.invalid');
      await account.dispose();
      account = makeAccount();
      gateway = makeGateway();
      gateway.suspend();
      expect(await gateway.hasPendingLogin(callback), false);
      expect(state.get(PsyGamesCloudGateway.intentKey), isNull);
      expect(requests.length, 1);
    },
  );

  test(
    'lost ACK plus metadata refresh resolves retained request without new UUID',
    () async {
      await login();
      await enable();
      requests.clear();
      failSave = true;
      await expectLater(
        gateway.save(keepLocalAfterConflict: false),
        throwsA(isA<Exception>()),
      );
      final original = requests.single.body;
      final write = jsonDecode(original) as Map;
      copies = [
        {
          'id': id,
          'request_id': write['request_id'],
          'revision': 7,
          'created_at': '2026-10-16T00:00:00Z',
        },
      ];
      await gateway.versions();
      failSave = false;
      await gateway.save(keepLocalAfterConflict: false);
      final posts = requests.where((r) => r.method == 'POST').toList();
      expect(posts.length, 2);
      expect(posts.last.body, original);
    },
  );
  test(
    'old pending callback cannot suspend replacement after its durable ACK',
    () async {
      await gateway.requestLink('synthetic@example.invalid');
      final pending = Completer<http.Response>();
      pendingToken = pending.future;
      final old = gateway;
      final future = old.completeLink(callback);
      final rejected = expectLater(future, throwsA(isA<Exception>()));
      await Future<void>.delayed(Duration.zero);
      final oldRequest = requests.last;
      pendingToken = null;
      gateway = makeGateway();
      await gateway.requestLink('synthetic@example.invalid');
      await gateway.completeLink(callback);
      expect(gateway.accountId, owner);
      pending.complete(
        reply(
          oldRequest,
          fixtureSession(id: '44444444-4444-4444-8444-444444444444'),
        ),
      );
      await rejected;
      expect(gateway.accountId, owner);
      await gateway.versions();
    },
  );
  test(
    'cold login intent accepts 30 minutes but rejects expired or future time',
    () async {
      final initial = DateTime.utc(2026, 10, 16);
      var clock = initial;
      gateway = PsyGamesCloudGateway(
        state: state,
        account: account,
        restoreDirectory: () async => dir,
        now: () => clock,
      );
      await gateway.requestLink('synthetic@example.invalid');
      clock = initial.add(const Duration(minutes: 30));
      expect(await gateway.hasPendingLogin(callback), true);
      clock = clock.add(const Duration(microseconds: 1));
      expect(await gateway.hasPendingLogin(callback), false);
      clock = initial.subtract(const Duration(seconds: 1));
      expect(await gateway.hasPendingLogin(callback), false);
    },
  );
}

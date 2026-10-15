import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:psygames_flutter/shell/cloud_backup.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'support/account_fixtures.dart';

class _Vault implements AccountVault {
  final data = <String, String>{};
  @override Future<String?> read(String key) async => data[key];
  @override Future<void> write(String key, String value) async { data[key] = value; }
  @override Future<void> remove(String key) async { data.remove(key); }
}

void main() {
  late SharedState state;
  late EcosystemAccount account;
  late CloudBackup backup;
  final row = {'id': 'copy-1', 'revision': 7, 'created_at': '2026-10-16T00:00:00Z'};

  Future<void> setup(Future<http.Response> Function(http.Request) respond) async {
    SharedPreferences.setMockInitialValues({
      'psygames_pet_name': 'Синапс',
      'psygames_tokens_v1': '{"nzt48":75}',
      'psygames_sudoku_level_women': '79',
    });
    state = await SharedState.open();
    final vault = _Vault();
    // Synthetic, unexpired fixture. No actual account, token, email or network.
    account = EcosystemAccount(appId: 'psygames', url: 'https://example.supabase.co',
      publishableKey: 'fixture-public', callback: Uri.parse('com.psygames.app://auth/callback'),
      vault: vault, transport: MockClient(respond));
    vault.data['${account.storageNamespace}.session'] = fixtureEnvelope(account, fixtureSession(id: 'owner-1'));
    backup = CloudBackup(state, account);
    await backup.start();
    expect(await account.resume(consent: true), true);
    await backup.enable();
  }
  http.Response response(http.Request request, Object body) =>
    http.Response(jsonEncode(body), 200, request: request, headers: {'content-type': 'application/json'});
  tearDown(() async { backup.dispose(); await account.dispose(); state.dispose(); });

  test('append preserves wallet/name/level verbatim; identical data is not reuploaded', () async {
    final requests = <http.Request>[];
    await setup((request) async {
      requests.add(request);
      if (request.method == 'GET') return response(request, []);
      final inserted = jsonDecode(request.body) as Map;
      expect(inserted['owner_id'], 'owner-1');
      expect(inserted['payload']['data']['psygames_pet_name'], 'Синапс');
      expect(inserted['payload']['data']['psygames_tokens_v1'], '{"nzt48":75}');
      expect(inserted['payload']['data']['psygames_sudoku_level_women'], '79');
      expect(inserted['payload']['data'].containsKey(CloudBackup.consentKey), false);
      return response(request, row);
    });
    await backup.save();
    await backup.save();
    expect(requests.map((r) => r.method), ['GET', 'POST']);
    expect(state.get(CloudBackup.revisionKey), '7');
    expect(state.get('psygames_tokens_v1'), '{"nzt48":75}');
    expect(state.get('psygames_sudoku_level_women'), '79');
  });

  test('unknown cloud revision requires explicit conflict decision', () async {
    var writes = 0;
    await setup((request) async {
      if (request.method == 'GET') return response(request, [row]);
      writes++;
      return response(request, {...row, 'revision': 8});
    });
    await expectLater(backup.save(), throwsA(isA<CloudConflict>()));
    expect(backup.conflict, true);
    expect(writes, 0);
    await backup.save(keepLocalAfterConflict: true);
    expect(writes, 1);
    expect(state.get(CloudBackup.revisionKey), '8');
    expect(backup.conflict, false);
  });

  test('OFF during pending read prevents upload, retry and late error state', () async {
    final started = Completer<void>();
    final reply = Completer<http.Response>();
    late http.Request request;
    var writes = 0;
    await setup((r) async {
      request = r;
      if (r.method != 'GET') writes++;
      started.complete(); return reply.future;
    });
    final save = backup.save();
    final cancelled = expectLater(save, throwsStateError);
    await started.future;
    await backup.disable();
    reply.complete(response(request, []));
    await cancelled;
    expect(writes, 0);
    expect(backup.error, isNull);
    expect(state.get(CloudBackup.consentKey), '0');
    expect(state.get('psygames_sudoku_level_women'), '79');
    expect(state.get('psygames_tokens_v1'), '{"nzt48":75}');
  });

  test('late downloaded copy after OFF is rejected before caller can restore', () async {
    final started = Completer<void>();
    final reply = Completer<http.Response>();
    late http.Request request;
    await setup((r) async { request = r; started.complete(); return reply.future; });
    final read = backup.download(CloudVersion.read(row));
    final cancelled = expectLater(read, throwsStateError);
    await started.future;
    await backup.disable();
    reply.complete(response(request, {'payload': {'schema': 1, 'createdAt': '2026-10-16T00:00:00Z', 'data': {}}}));
    await cancelled;
    expect(state.get('psygames_tokens_v1'), '{"nzt48":75}');
  });

  test('PsyGames automatic startup cannot reuse A consent for cached B', () async {
    var requests = 0;
    await setup((r) async { requests++; return response(r, []); });
    backup.dispose();
    account.suspend();
    await state.set(CloudBackup.accountKey, 'different-owner-A');
    // Setup's encrypted session belongs to owner-1 (B), not the consent owner.
    backup = CloudBackup(state, account);
    await backup.start();
    expect(account.accountId, isNull);
    expect(account.active, false);
    expect(backup.error, 'account');
    expect(requests, 0);
    expect(state.get('psygames_tokens_v1'), '{"nzt48":75}');
  });

  test('PsyGames missing consent owner cannot start account recovery/upload', () async {
    var requests = 0;
    await setup((r) async { requests++; return response(r, []); });
    backup.dispose();
    account.suspend();
    await state.remove(CloudBackup.accountKey);
    backup = CloudBackup(state, account);
    await backup.start();
    expect(account.accountId, isNull);
    expect(account.active, false);
    expect(backup.error, 'account');
    expect(requests, 0);
    expect(state.get('psygames_sudoku_level_women'), '79');
  });
}

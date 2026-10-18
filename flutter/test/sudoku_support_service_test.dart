import 'dart:async';
import 'dart:convert';

import 'package:ecosystem_account/ecosystem_account.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';
import 'package:psygames_flutter/shell/shared_state.dart';
import 'package:psygames_flutter/shell/sudoku_support_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'ecosystem_account_test.dart' show Vault;
import 'support/account_fixtures.dart';

const _a = '11111111-1111-4111-8111-111111111111';
const _b = '22222222-2222-4222-8222-222222222222';
const _level = 'psygames_sudoku_level_women';
const _best = 'psygames_sudoku_best_women';
const _resumeKey = 'psygames_resume_sudoku_women';
final _now = DateTime.utc(2026, 10, 18, 12);

class _State extends SharedState {
  _State(super.prefs);
  String? failKey;
  bool failRead = false;
  bool failSnapshot = false;
  Future<void> Function(String, String)? beforeSet;
  final writesSeen = <String>[];
  @override
  String? get(String key) {
    if (failRead) throw StateError('synthetic local read failure');
    return super.get(key);
  }

  @override
  Map<String, String> snapshot() {
    if (failSnapshot) throw StateError('synthetic namespace read failure');
    return super.snapshot();
  }

  @override
  Future<void> set(String key, String value) async {
    writesSeen.add(key);
    if (key == failKey) throw StateError('synthetic storage failure');
    await beforeSet?.call(key, value);
    await super.set(key, value);
  }
}

class _Fixture {
  late _State state;
  final vault = Vault();
  late EcosystemAccount account;
  late SudokuSupportService service;
  bool consent = true;
  bool failAck = false;
  bool emptyAck = false;
  bool reportExists = false;
  String owner = _a;
  final requests = <http.Request>[];
  final grant = <String, dynamic>{
    'id': 'grant-a',
    'owner_id': _a,
    'app_id': 'psygames',
    'profile': 'women',
    'road': 'normal',
    'enabled': true,
    'revision': 7,
    'expires_at': _now.add(const Duration(hours: 24)).toIso8601String(),
  };
  final correction = <String, dynamic>{
    'id': 'correction-a',
    'owner_id': _a,
    'app_id': 'psygames',
    'grant_id': 'grant-a',
    'grant_revision': 7,
    'profile': 'women',
    'road': 'normal',
    'game_id': 'sudoku',
    'operation': 'unlock_at_least',
    'target_level': 80,
    'status': 'pending',
    'key_scope': _level,
  };
  Future<void> Function(http.Request)? beforeRequest;

  http.Response reply(http.Request r, Object body, [int status = 200]) =>
      http.Response(
        jsonEncode(body),
        status,
        request: r,
        headers: {'content-type': 'application/json'},
      );

  Future<void> open({
    bool login = true,
    Map<String, Object> extra = const {},
  }) async {
    SharedPreferences.setMockInitialValues({
      _level: '78',
      _best: '78',
      'psygames_tokens_v1': '75',
      'psygames_pet_name': 'Synapse',
      'psygames_sudoku_stars_women': '{"77":3}',
      'psygames_sessions': '[{"won":false}]',
      'psygames_active_profile': 'women',
      'psygames_sudoku_road_women': 'normal',
      ...extra,
    });
    state = _State(await SharedPreferences.getInstance());
    account = EcosystemAccount(
      appId: 'psygames',
      url: 'https://example.supabase.co',
      publishableKey: 'synthetic-public',
      callback: Uri.parse('com.psygames.app://auth/callback'),
      vault: vault,
      transport: MockClient((r) async {
        requests.add(r);
        await beforeRequest?.call(r);
        if (r.url.path == '/auth/v1/user') {
          return reply(r, fixtureSession(id: owner)['user']!);
        }
        if (r.url.path == '/auth/v1/token') {
          return reply(r, fixtureSession(id: owner));
        }
        expect(r.url.path.startsWith('/rest/v1/'), true);
        expect(
          r.headers['Authorization'] ?? r.headers['authorization'],
          startsWith('Bearer '),
        );
        final table = r.url.path.split('/').last;
        if (table == 'psygames_support_reports') {
          expect(
            r.url.queryParameters['owner_id'],
            r.method == 'POST' ? isNull : 'eq.$owner',
          );
          final receipt = {'grant_id': 'grant-a', 'owner_id': owner};
          if (r.method == 'GET') return reply(r, reportExists ? [receipt] : []);
          reportExists = true;
          return reply(r, [receipt]);
        }
        if (r.method == 'GET') {
          final row = table == 'psygames_support_grants' ? grant : correction;
          expect(r.url.queryParameters['owner_id'], 'eq.$owner');
          expect(r.url.queryParameters['app_id'], 'eq.psygames');
          return reply(r, row['owner_id'] == owner ? [row] : []);
        }
        if (table == 'psygames_support_grants') {
          final body = jsonDecode(r.body) as Map<String, dynamic>;
          grant.addAll(body);
          if (r.method == 'POST') grant['app_id'] = 'psygames';
          return reply(r, [grant]);
        }
        expect(table, 'psygames_support_corrections');
        if (failAck) return reply(r, {'code': 'synthetic'}, 403);
        if (emptyAck) return reply(r, []);
        correction.addAll(jsonDecode(r.body) as Map<String, dynamic>);
        return reply(r, [correction]);
      }),
    );
    service = makeService();
    if (login) await switchOwner(_a);
    requests.clear();
  }

  SudokuSupportService makeService() => SudokuSupportService(
    state: state,
    account: account,
    backupEnabled: () => consent,
    now: () => _now,
  );

  Future<void> switchOwner(String id) async {
    owner = id;
    vault.values['${account.storageNamespace}.session'] = fixtureEnvelope(
      account,
      fixtureSession(id: id),
    );
    expect(await account.resume(consent: true, expectedAccountId: id), true);
  }

  Map<String, dynamic> get journal => jsonDecode(
    state
        .snapshot()
        .entries
        .singleWhere((e) => e.key.startsWith('psygames_cloud_support_'))
        .value,
  ) as Map<String, dynamic>;
  List<http.Request> get acks => requests
      .where(
        (r) =>
            r.method == 'PATCH' &&
            r.url.path.endsWith('psygames_support_corrections'),
      )
      .toList();
  Future<void> close() async {
    service.dispose();
    await account.dispose();
    state.dispose();
  }
}

String _resume() => jsonEncode({
  'v': 4,
  'savedAt': _now.millisecondsSinceEpoch - 1000,
  'state': {'mode': 'levels', 'level': 78, 'road': 'normal'},
});

void main() {
  late _Fixture f;
  setUp(() {
    f = _Fixture();
  });
  tearDown(() async {
    await f.close();
  });

  group('hasPendingLocalWrite', () {
    String key([String owner = _a]) =>
        'psygames_cloud_support_journal_${base64Url.encode(utf8.encode('${f.account.issuer}|$owner'))}';
    Map<String, dynamic> envelope(String phase, {String owner = _a}) => {
      'version': 1,
      'owner_id': owner,
      'issuer': f.account.issuer,
      'entries': [
        {
          'phase': phase,
          'restart': false,
          'resume': null,
          'record': {...f.correction, 'owner_id': owner},
        },
      ],
    };
    void expectReadOnly(bool expected) {
      final before = f.state.snapshot();
      final requests = f.requests.length;
      final writes = f.state.writesSeen.length;
      final reads = f.vault.reads;
      expect(f.service.hasPendingLocalWrite, expected);
      expect(f.service.hasPendingLocalWrite, expected);
      expect(f.state.snapshot(), before);
      expect(f.requests.length, requests);
      expect(f.state.writesSeen.length, writes);
      expect(f.vault.reads, reads);
    }

    test(
      'cold no-journal gate performs no auth, network, or persistence',
      () async {
        await f.open(login: false);
        expectReadOnly(false);
        expect(f.vault.reads, 0);
      },
    );

    for (final phase in ['prepared', 'completed', 'acked']) {
      test('$phase is gated only while gameplay writes are pending', () async {
        await f.open();
        await f.state.set(key(), jsonEncode(envelope(phase)));
        expectReadOnly(phase == 'prepared');
        f.consent = false;
        f.service.suspend();
        await f.service.drain();
        expect(f.service.ready, false); // Clears ordinary online UI identity.
        expectReadOnly(phase == 'prepared');
        f.account.suspend();
        f.service.dispose();
        f.service = f.makeService();
        expectReadOnly(phase == 'prepared'); // Conservative cold/OFF lookup.
      });
    }

    test('remote pending request and unconfirmed resume choice are not local intents', () async {
      await f.open(extra: {_resumeKey: _resume()});
      await f.service.refresh();
      expectReadOnly(false);
      await f.service.apply('correction-a');
      expect(f.service.needsResumeChoice, true);
      expectReadOnly(false);
    });

    test(
      'partial write stays gated across suspend/OFF until same-owner recovery',
      () async {
        await f.open();
        await f.service.refresh();
        f.state.failKey = _best;
        await f.service.apply('correction-a');
        expect(f.state.get(_level), '80');
        expect(f.state.get(_best), '78');
        expectReadOnly(true);
        f.consent = false;
        f.service.suspend();
        await f.service.drain();
        expectReadOnly(true);
        f.consent = true;
        f.state.failKey = null;
        await f.service.refresh();
        expect(f.service.error, isNull);
        expect(f.state.get(_best), '80');
        expectReadOnly(false);
      },
    );

    test('durable completed receipt with rejected ACK/revoked grant does not block a new board', () async {
      await f.open();
      await f.service.refresh();
      f.failAck = true;
      await f.service.apply('correction-a');
      expect(f.service.error, 'ack_uncertain');
      expect((f.journal['entries'] as List).single['phase'], 'completed');
      expectReadOnly(false);
      f.grant['enabled'] = false;
      await f.state.set(_resumeKey, 'new-board');
      await f.service.refresh();
      expect(f.service.error, 'ack_uncertain');
      expectReadOnly(false);
      expect(f.state.get(_resumeKey), 'new-board');
    });

    test('B checks only B journal; no-identity fallback retains A gate without auth recovery', () async {
      await f.open();
      await f.state.set(key(), jsonEncode(envelope('prepared')));
      expectReadOnly(true);
      await f.switchOwner(_b);
      expectReadOnly(false);
      await f.state.set(key(_b), jsonEncode(envelope('acked', owner: _b)));
      expectReadOnly(false);
      await f.state.set(key(_b), jsonEncode(envelope('prepared', owner: _b)));
      expectReadOnly(true);
      await f.state.remove(key(_b));
      await f.state.set(key(), 'malformed-A');
      expectReadOnly(false); // B must not parse another known owner's bytes.
      f.account.suspend();
      expectReadOnly(
        true,
      ); // Unknown identity cannot establish safe completion.
    });

    final malformed = <String, Object Function(Map<String, dynamic>)>{
      'invalid JSON': (_) => 'not-json',
      'null envelope': (_) => 'null',
      'wrong version': (env) => {...env, 'version': 2},
      'wrong owner': (env) => {...env, 'owner_id': _b},
      'wrong issuer': (env) => {
        ...env,
        'issuer': 'https://other.invalid/auth/v1',
      },
      'non-list entries': (env) => {...env, 'entries': {}},
      'unknown phase': (env) => {
        ...env,
        'entries': [
          {...((env['entries'] as List).single as Map), 'phase': 'unknown'},
        ],
      },
      'missing record': (env) => {
        ...env,
        'entries': [
          {...((env['entries'] as List).single as Map), 'record': {}},
        ],
      },
      'invalid restart': (env) => {
        ...env,
        'entries': [
          {...((env['entries'] as List).single as Map), 'restart': 'false'},
        ],
      },
      'invalid resume': (env) => {
        ...env,
        'entries': [
          {...((env['entries'] as List).single as Map), 'resume': 5},
        ],
      },
      'duplicate IDs': (env) => {
        ...env,
        'entries': [
          (env['entries'] as List).single,
          (env['entries'] as List).single,
        ],
      },
      'over limit': (env) => {
        ...env,
        'entries': List.filled(101, (env['entries'] as List).single),
      },
    };
    for (final example in malformed.entries) {
      test(
        'malformed ${example.key} fails closed even with acked phase',
        () async {
          await f.open();
          final raw = example.value(envelope('acked'));
          await f.state.set(key(), raw is String ? raw : jsonEncode(raw));
          expectReadOnly(true);
        },
      );
    }
    test(
      'unreadable owner storage or cold namespace fails closed without writes',
      () async {
        await f.open();
        final before = f.state.snapshot();
        f.state.failRead = true;
        expect(f.service.hasPendingLocalWrite, true);
        f.state.failRead = false;
        f.account.suspend();
        f.state.failSnapshot = true;
        expect(f.service.hasPendingLocalWrite, true);
        f.state.failSnapshot = false;
        expect(f.requests, isEmpty);
        expect(f.state.snapshot(), before);
      },
    );

    test('well-formed empty journal is not pending', () async {
      await f.open();
      await f.state.set(
        key(),
        jsonEncode({...envelope('acked'), 'entries': []}),
      );
      expectReadOnly(false);
    });
  });

  test(
    'cold / backup OFF is HTTP and storage inert for every entry point',
    () async {
      await f.open(login: false);
      final before = f.state.snapshot();
      await f.service.refresh();
      await f.service.enable(profile: 'women', road: 'normal');
      await f.service.revoke('grant-a');
      await f.service.apply('correction-a', restartSavedGame: true);
      expect(f.service.ready, false);
      expect(f.vault.reads, 0);
      expect(f.requests, isEmpty);
      await f.switchOwner(_a);
      f.consent = false;
      f.requests.clear();
      await f.service.refresh();
      await f.service.enable(profile: 'women', road: 'normal');
      await f.service.revoke('grant-a');
      await f.service.apply('correction-a', restartSavedGame: true);
      expect(f.requests, isEmpty);
      expect(f.state.snapshot(), before);
      expect(
        f.account.accountId,
        _a,
        reason: 'adapter OFF must not suspend shared SDK',
      );
    },
  );

  test('actual REST: own active grants, status-only report, two keys and filtered ACK', () async {
    await f.open();
    final before = CloudSnapshot.capture(f.state.snapshot()).data;
    await f.service.refresh();
    expect(f.service.error, isNull);
    expect(f.service.ready, true);
    expect(f.service.ownerId, _a);
    expect(f.service.grants.length, 1);
    final report = f.requests.singleWhere(
      (r) =>
          r.method == 'POST' && r.url.path.endsWith('psygames_support_reports'),
    );
    expect(report.method, 'POST');
    expect(report.url.queryParameters.containsKey('on_conflict'), false);
    expect(jsonDecode(report.body), {
      'grant_id': 'grant-a',
      'owner_id': _a,
      'grant_revision': 7,
      'level': 78,
      'best': 78,
      'resume_present': false,
    });
    f.state.writesSeen.clear();
    await f.service.apply('correction-a');
    expect(f.service.error, isNull);
    expect(CloudSnapshot.capture(f.state.snapshot()).data, {
      ...before,
      _level: '80',
      _best: '80',
    });
    expect(
      f.state.writesSeen.where((k) => !k.startsWith('psygames_cloud_support_')),
      [_level, _best],
    );
    final ack = f.acks.single;
    expect(ack.url.queryParameters, containsPair('id', 'eq.correction-a'));
    expect(ack.url.queryParameters, containsPair('owner_id', 'eq.$_a'));
    expect(ack.url.queryParameters, containsPair('status', 'eq.pending'));
    expect(jsonDecode(ack.body), {
      'status': 'applied',
      'resolved_at': _now.toIso8601String(),
    });
    expect((f.journal['entries'] as List).single['phase'], 'acked');
    expect(f.service.corrections.single['status'], 'applied');
  });

  test('existing report PATCH excludes immutable owner/grant fields', () async {
    await f.open();
    f.reportExists = true;
    await f.service.refresh();
    expect(f.service.error, isNull);
    final patch = f.requests.singleWhere((r) => r.method == 'PATCH');
    expect(patch.url.path, '/rest/v1/psygames_support_reports');
    expect(patch.url.queryParameters['owner_id'], 'eq.$_a');
    expect(patch.url.queryParameters['grant_id'], 'eq.grant-a');
    expect(jsonDecode(patch.body), {
      'grant_revision': 7,
      'level': 78,
      'best': 78,
      'resume_present': false,
    });
  });

  test(
    'suspend and drain await already-dispatched storage before gameplay',
    () async {
      await f.open();
      await f.service.refresh();
      final entered = Completer<void>();
      final release = Completer<void>();
      f.state.beforeSet = (key, _) async {
        if (key == _level) {
          entered.complete();
          await release.future;
        }
      };
      final applying = f.service.apply('correction-a');
      await entered.future;
      f.service.suspend();
      var drained = false;
      final drain = f.service.drain().then((_) {
        drained = true;
      });
      await Future<void>.delayed(Duration.zero);
      expect(drained, false);
      release.complete();
      await drain;
      await applying;
      expect(drained, true);
      expect(f.state.get(_level), '80');
      expect(f.state.get(_best), '78');
      expect(f.acks, isEmpty);
      expect(f.service.busy, false);
    },
  );

  test('late A ACK never clears B private journal or changes B callback state', () async {
    await f.open();
    await f.service.refresh();
    final entered = Completer<void>();
    final release = Completer<void>();
    f.beforeRequest = (r) async {
      if (r.method == 'PATCH' &&
          r.url.path.endsWith('psygames_support_corrections')) {
        entered.complete();
        await release.future;
      }
    };
    final applying = f.service.apply('correction-a');
    await entered.future;
    final original = f.journal;
    expect((original['entries'] as List).single['phase'], 'completed');
    f.service.suspend();
    await f.switchOwner(_b);
    final bKey =
        'psygames_cloud_support_journal_${base64Url.encode(utf8.encode('${f.account.issuer}|$_b'))}';
    const bBytes = '{"B":"private journal must survive"}';
    await f.state.set(bKey, bBytes);
    await f.state.set(_level, '20');
    final before = f.state.snapshot();
    release.complete();
    await applying;
    expect(f.state.snapshot(), before);
    expect(f.state.get(bKey), bBytes);
    expect(f.service.ownerId, _b);
    expect(f.service.error, isNull);
    expect(f.service.corrections, isEmpty);
  });

  test('completed IDs and original resume journal bounded at 100, only acked evicted', () async {
    await f.open();
    await f.service.refresh();
    await f.service.apply('correction-a');
    final journal = f.journal;
    final first = (journal['entries'] as List).single as Map;
    journal['entries'] = [
      for (var i = 0; i < 100; i++)
        {
          ...first,
          'record': {...first['record'] as Map, 'id': 'old-$i'},
        },
    ];
    final key = f.state.snapshot().keys.singleWhere(
      (k) => k.startsWith('psygames_cloud_support_'),
    );
    await f.state.set(key, jsonEncode(journal));
    f.correction['id'] = 'correction-new';
    f.correction['status'] = 'pending';
    await f.service.refresh();
    await f.service.apply('correction-new');
    expect(f.service.error, isNull);
    expect((f.journal['entries'] as List).length, 100);
    expect((f.journal['entries'] as List).first['record']['id'], 'old-1');
    expect(
      (f.journal['entries'] as List).last['record']['id'],
      'correction-new',
    );
  });

  test(
    'existing grant enable updates ONLY enabled/expiry, never blind upsert',
    () async {
      await f.open();
      await f.service.enable(profile: 'women', road: 'normal');
      final update = f.requests.singleWhere((r) => r.method == 'PATCH');
      expect(jsonDecode(update.body), {
        'enabled': true,
        'expires_at': _now.add(const Duration(hours: 24)).toIso8601String(),
      });
      expect(update.url.queryParameters['id'], 'eq.grant-a');
      await f.service.revoke('grant-a');
      expect(
        jsonDecode(f.requests.lastWhere((r) => r.method == 'PATCH').body),
        {'enabled': false},
      );
    },
  );

  test('explicit enable inserts only allowed owner fields when no matching grant exists', () async {
    await f.open();
    f.grant['owner_id'] = _b;
    await f.service.refresh();
    expect(f.requests.where((r) => r.method == 'POST'), isEmpty);
    await f.service.enable(profile: 'women', road: 'hard');
    final insert = f.requests.singleWhere((r) => r.method == 'POST');
    expect(jsonDecode(insert.body), {
      'owner_id': _a,
      'profile': 'women',
      'road': 'hard',
      'enabled': true,
      'expires_at': _now.add(const Duration(hours: 24)).toIso8601String(),
    });
    expect(
      insert.headers['Prefer'] ?? insert.headers['prefer'],
      isNot(contains('merge-duplicates')),
    );
  });

  for (final mutation in <String, Map<String, dynamic>>{
    'wrong owner': {'owner_id': _b},
    'wrong app': {'app_id': 'another'},
    'wrong grant': {'grant_id': 'another'},
    'wrong profile': {'profile': 'kids'},
    'wrong road': {'road': 'hard'},
    'wrong game': {'game_id': 'another'},
    'wrong operation': {'operation': 'reward'},
    'wrong key': {'key_scope': 'psygames_tokens_v1'},
    'superseded revision': {'grant_revision': 8},
    'float target': {'target_level': 80.0},
    'too high': {'target_level': 181},
    'zero': {'target_level': 0},
    'already resolved': {'status': 'rejected'},
  }.entries) {
    test('rejects ${mutation.key} with no local writes or ACK', () async {
      await f.open();
      f.correction.addAll(mutation.value);
      await f.service.refresh();
      final before = f.state.snapshot();
      await f.service.apply('correction-a');
      expect(f.service.error, isNotNull);
      expect(f.state.snapshot(), before);
      expect(f.acks, isEmpty);
    });
  }

  for (final change in ['expired', 'revoked', 'superseded']) {
    test('fresh grant rejects $change after preview', () async {
      await f.open();
      await f.service.refresh();
      if (change == 'expired') f.grant['expires_at'] = _now.toIso8601String();
      if (change == 'revoked') f.grant['enabled'] = false;
      if (change == 'superseded') f.grant['revision'] = 8;
      final before = f.state.snapshot();
      await f.service.apply('correction-a');
      expect(f.service.error, isNotNull);
      expect(f.state.snapshot(), before);
      expect(f.acks, isEmpty);
    });
  }

  test(
    'fresh correction re-read rejects changed target before local apply',
    () async {
      await f.open();
      await f.service.refresh();
      f.correction['target_level'] = 81;
      final before = f.state.snapshot();
      await f.service.apply('correction-a');
      expect(f.service.error, 'correction_changed');
      expect(f.state.snapshot(), before);
      expect(f.acks, isEmpty);
    },
  );

  test('resume choice makes NO writes; explicit restart journals original bytes first', () async {
    final resume = _resume();
    await f.open(extra: {_resumeKey: resume});
    await f.service.refresh();
    final before = f.state.snapshot();
    await f.service.apply('correction-a');
    expect(f.service.needsResumeChoice, true);
    expect(f.state.snapshot(), before);
    expect(f.acks, isEmpty);
    f.state.beforeSet = (key, _) async {
      if (key == _level || key == _best) {
        expect((f.journal['entries'] as List).single['resume'], resume);
      }
    };
    await f.service.apply('correction-a', restartSavedGame: true);
    expect(f.service.error, isNull);
    expect(f.state.get(_resumeKey), isNull);
    expect((f.journal['entries'] as List).single['resume'], resume);
  });

  test('resume CAS preserves a changed board while journal persistence was pending', () async {
    await f.open(extra: {_resumeKey: _resume()});
    await f.service.refresh();
    f.state.beforeSet = (key, _) async {
      if (key.startsWith('psygames_cloud_support_')) {
        await f.state.set(_resumeKey, 'new-board-bytes');
      }
    };
    await f.service.apply('correction-a', restartSavedGame: true);
    expect(f.service.error, 'resume_changed');
    expect(f.state.get(_resumeKey), 'new-board-bytes');
    expect(f.state.get(_level), '78');
    expect(f.acks, isEmpty);
  });

  test('partial write survives service recreation; refresh recovers monotonically then ACKs', () async {
    await f.open();
    await f.service.refresh();
    f.state.failKey = _best;
    await f.service.apply('correction-a');
    expect(f.service.error, 'operation_failed');
    expect(f.state.get(_level), '80');
    expect(f.state.get(_best), '78');
    expect((f.journal['entries'] as List).single['phase'], 'prepared');
    expect(f.acks, isEmpty);
    f.state.failKey = null;
    await f.state.set(_level, '90');
    f.service.dispose();
    f.service = f.makeService();
    await f.service.refresh();
    expect(f.service.error, isNull);
    expect(f.state.get(_level), '90');
    expect(f.state.get(_best), '90');
    expect(f.acks.length, 1);
  });

  test(
    'failed journal persistence blocks both own key writes and ACK',
    () async {
      await f.open();
      await f.service.refresh();
      f.state.beforeSet = (key, _) async {
        if (key.startsWith('psygames_cloud_support_')) {
          throw StateError('synthetic');
        }
      };
      await f.service.apply('correction-a');
      expect(f.state.get(_level), '78');
      expect(f.state.get(_best), '78');
      expect(f.acks, isEmpty);
    },
  );

  for (final empty in [false, true]) {
    test(
      'ambiguous ACK ($empty) retains receipt; retry never clears a new board',
      () async {
        await f.open();
        await f.service.refresh();
        f.failAck = !empty;
        f.emptyAck = empty;
        await f.service.apply('correction-a');
        expect(f.service.error, 'ack_uncertain');
        expect((f.journal['entries'] as List).single['phase'], 'completed');
        await f.state.set(_resumeKey, 'new-game');
        f.failAck = f.emptyAck = false;
        f.state.writesSeen.clear();
        await f.service.refresh();
        expect(f.service.error, isNull);
        expect(f.state.get(_resumeKey), 'new-game');
        expect(
          f.state.writesSeen.where(
            (k) => !k.startsWith('psygames_cloud_support_'),
          ),
          isEmpty,
        );
      },
    );
  }

  test(
    'ACK accepted but response lost is reconciled without duplicate ACK',
    () async {
      await f.open();
      await f.service.refresh();
      f.failAck = true;
      await f.service.apply('correction-a');
      f.correction['status'] = 'applied';
      f.requests.clear();
      await f.service.refresh();
      expect(f.service.error, isNull);
      expect(f.acks, isEmpty);
      expect((f.journal['entries'] as List).single['phase'], 'acked');
    },
  );

  test(
    'revoke after local completion preserves uncertain receipt and new board',
    () async {
      await f.open();
      await f.service.refresh();
      f.failAck = true;
      await f.service.apply('correction-a');
      f.grant['enabled'] = false;
      await f.state.set(_resumeKey, 'new-game');
      await f.service.refresh();
      expect(f.service.error, 'ack_uncertain');
      expect((f.journal['entries'] as List).single['phase'], 'completed');
      expect(f.state.get(_resumeKey), 'new-game');
    },
  );

  test(
    'late A fetch after B handoff cannot mutate B state or clear B journal',
    () async {
      await f.open();
      await f.service.refresh();
      final entered = Completer<void>();
      final release = Completer<void>();
      f.beforeRequest = (r) async {
        if (r.method == 'GET' &&
            r.url.queryParameters['id'] == 'eq.correction-a') {
          entered.complete();
          await release.future;
        }
      };
      final applying = f.service.apply('correction-a');
      await entered.future;
      f.service.suspend();
      await f.switchOwner(_b);
      await f.state.set(_level, '20');
      await f.state.set('psygames_cloud_support_B_sentinel', 'B-private');
      final before = f.state.snapshot();
      release.complete();
      await applying;
      expect(f.state.snapshot(), before);
      expect(f.service.ownerId, _b);
      expect(f.service.busy, false);
      expect(f.service.error, isNull);
      expect(f.acks, isEmpty);
    },
  );

  test('OFF during partial local write stops following key and ACK; shared SDK stays active', () async {
    await f.open();
    await f.service.refresh();
    f.state.beforeSet = (key, _) async {
      if (key == _level) {
        f.consent = false;
        f.service.suspend();
      }
    };
    await f.service.apply('correction-a');
    expect(f.state.get(_best), '78');
    expect(f.acks, isEmpty);
    expect(f.service.ready, false);
    expect(f.account.accountId, _a);
    expect((f.journal['entries'] as List).single['phase'], 'prepared');
  });
}

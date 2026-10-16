import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/cloud_snapshot.dart';

void main() {
  final now = DateTime.utc(2026, 10, 15, 12, 34, 56, 123, 456);
  final gameplay = <String, String>{
    'psygames_pet_name': 'Синапс 🐾',
    'psygames_pet_skin': 'robot',
    'psygames_pet_acc': '{ "hat": "crown" }',
    'psygames_pet_inventory_v1': '["crown","scarf"]',
    'psygames_tokens_v1': '{ "nzt48": 4321, "women": 0 }',
    'psygames_earn_v1': '{"nzt48":[{"points":25,"source":"game"}]}',
    'psygames_earned_total_v1': '{"nzt48":9876}',
    'psygames_abilities_v1': '{"nzt48":{"hint":3,"undo":2}}',
    'psygames_collection_v1': '["figure1","figure2"]',
    'psygames_sessions': '[{"id":"one","score":42}]',
    'psygames_one_line_level_nzt48': '7',
    'psygames_sudoku_revealed_boards': '{"board-1":true}',
    'psygames_active_profile': 'nzt48',
    'language': 'ru',
    'psygames.best.accuracy.sudoku': '98',
    'psygames.bestStreak.memory_matrix': '42',
  };
  const excluded = [
    'flutter.settings',
    'sb-project-auth-token',
    'access_token',
    'psygames_device_id',
    'psygames_cloud_session',
    'psygames_cloud_any_future_key',
    'psygames_sessions_outbox',
    'psygames_supabase_migrated_v2',
    'psygames_supabase_base',
    'psygames_legacy_import_v5',
    'psygames_migration_checkpoint',
    'psygames_sync_checkpoint',
    'psygames_auth',
    'psygames_auth_token',
    'psygames_access_token',
    'psygames_refresh_token',
    'psygames_accessToken',
    'psygames_api_key',
    'psygames_apiKey',
    'psygames_privateKey',
    'psygames_password',
    'psygames_client_secret',
    'psygames_credentials',
    'psygames_account_id',
    'psygames_consent_v1',
    'psygames_runtime_state',
    'psygames.device.id',
    'psygames.auth.token',
  ];

  String wire({Object? schema = 1, Object? createdAt, Object? data}) =>
      jsonEncode({
        'schema': schema,
        'createdAt': createdAt ?? now.toIso8601String(),
        'data': data ?? <String, String>{},
      });

  test(
    'capture copies pets, earned points, abilities and collection exactly',
    () {
      final snapshot = CloudSnapshot.capture(gameplay, now: now);
      expect(snapshot.schema, 1);
      expect(snapshot.createdAt, now);
      expect(snapshot.createdAt.isUtc, isTrue);
      expect(snapshot.data, gameplay);
      for (final key in gameplay.keys) {
        expect(CloudSnapshot.portableKey(key), isTrue, reason: key);
      }
    },
  );

  test('capture excludes auth, device, consent, transport and outbox', () {
    final snapshot = CloudSnapshot.capture({
      ...gameplay,
      for (final key in excluded) key: 'local-only',
    }, now: now);
    expect(snapshot.data, gameplay);
    for (final key in excluded) {
      expect(CloudSnapshot.portableKey(key), isFalse, reason: key);
    }
  });

  test('roundtrip preserves opaque strings and anti-cheat ledger', () {
    final snapshot = CloudSnapshot.capture(gameplay, now: now);
    final restored = CloudSnapshot.decode(snapshot.encode());
    expect(restored.schema, 1);
    expect(restored.createdAt, now);
    expect(restored.data, gameplay);
    expect(restored.encode(), snapshot.encode());
  });

  test('capture sorts keys deterministically and owns an immutable copy', () {
    final input = Map<String, String>.from(gameplay);
    final first = CloudSnapshot.capture(input, now: now);
    final reversed = {
      for (final key in input.keys.toList().reversed) key: input[key]!,
    };
    expect(CloudSnapshot.capture(reversed, now: now).encode(), first.encode());
    expect(first.data.keys, orderedEquals(input.keys.toList()..sort()));
    input['psygames_pet_name'] = 'Changed later';
    expect(first.data['psygames_pet_name'], gameplay['psygames_pet_name']);
    expect(() => first.data['language'] = 'en', throwsUnsupportedError);
    final restored = CloudSnapshot.decode(wire(data: reversed));
    expect(restored.data.keys, orderedEquals(first.data.keys));
    expect(() => restored.data.clear(), throwsUnsupportedError);
  });

  test('capture defaults creation time to current UTC', () {
    final before = DateTime.now().toUtc();
    final snapshot = CloudSnapshot.capture({});
    expect(snapshot.createdAt.isUtc, isTrue);
    expect(snapshot.createdAt.isBefore(before), isFalse);
    expect(snapshot.createdAt.isAfter(DateTime.now().toUtc()), isFalse);
  });

  test('downloaded excluded or foreign key rejects entire import', () {
    for (final key in [...excluded, 'foreign', '', '__proto__']) {
      expect(
        () => CloudSnapshot.decode(
          wire(data: {...gameplay, key: 'do-not-import'}),
        ),
        throwsFormatException,
        reason: key,
      );
    }
  });

  test('rejects malformed JSON, envelopes, missing and extra fields', () {
    for (final encoded in [
      '',
      '{',
      'null',
      '[]',
      'true',
      '1',
      '"snapshot"',
      '{}',
      jsonEncode({'schema': 1, 'data': {}}),
      jsonEncode({'schema': 1, 'createdAt': now.toIso8601String()}),
      jsonEncode({'createdAt': now.toIso8601String(), 'data': {}}),
      jsonEncode({
        'schema': 1,
        'createdAt': now.toIso8601String(),
        'data': {},
        'auth': 'x',
      }),
    ]) {
      expect(() => CloudSnapshot.decode(encoded), throwsFormatException);
    }
  });

  test('rejects unsupported schema and non-integer schema types', () {
    for (final schema in <Object?>[0, 2, -1, 1.0, '1', true, null, {}, []]) {
      expect(
        () => CloudSnapshot.decode(wire(schema: schema)),
        throwsFormatException,
      );
    }
  });

  test('rejects invalid creation times without normalizing overflow', () {
    for (final timestamp in <Object?>[
      123,
      true,
      {},
      [],
      '',
      'tomorrow',
      '2026-02-30T00:00:00.000Z',
      '2026-10-15T25:00:00.000Z',
      '2026-10-15T12:00:00',
    ]) {
      expect(
        () => CloudSnapshot.decode(wire(createdAt: timestamp)),
        throwsFormatException,
      );
    }
    expect(
      () => CloudSnapshot.decode('{"schema":1,"createdAt":null,"data":{}}'),
      throwsFormatException,
    );
  });

  test('rejects non-object data and non-string values, never coerces', () {
    for (final data in <Object?>['', [], 1, false]) {
      expect(
        () => CloudSnapshot.decode(wire(data: data)),
        throwsFormatException,
      );
    }
    expect(
      () => CloudSnapshot.decode(
        '{"schema":1,"createdAt":"2026-10-15T00:00:00Z","data":null}',
      ),
      throwsFormatException,
    );
    for (final value in <Object?>[null, 42, 1.5, true, [], {}]) {
      expect(
        () => CloudSnapshot.decode(wire(data: {'psygames_pet_name': value})),
        throwsFormatException,
      );
    }
  });

  test('allows exactly 10000 entries; rejects 10001 on capture and decode', () {
    final data = {
      for (var i = 0; i < CloudSnapshot.maxEntries; i++)
        'psygames_level_$i': '1',
    };
    expect(
      CloudSnapshot.decode(CloudSnapshot.capture(data, now: now).encode())
          .data
          .length,
      10000,
    );
    data['psygames_one_more'] = '1';
    expect(() => CloudSnapshot.capture(data, now: now), throwsFormatException);
    expect(() => CloudSnapshot.decode(wire(data: data)), throwsFormatException);
  });

  test('5 MiB bound counts UTF-8 bytes including JSON envelope', () {
    final overhead = utf8.encode(wire(data: {'psygames_pet_name': ''})).length;
    final atLimit = wire(
      data: {
        'psygames_pet_name': 'a' * (CloudSnapshot.maxDecodedBytes - overhead),
      },
    );
    expect(utf8.encode(atLimit).length, CloudSnapshot.maxDecodedBytes);
    expect(CloudSnapshot.decode(atLimit).data.length, 1);
    expect(() => CloudSnapshot.decode('$atLimit '), throwsFormatException);
    final unicode = wire(
      data: {'psygames_pet_name': 'я' * (CloudSnapshot.maxDecodedBytes ~/ 2)},
    );
    expect(unicode.length, lessThan(CloudSnapshot.maxDecodedBytes));
    expect(() => CloudSnapshot.decode(unicode), throwsFormatException);
    expect(
      () => CloudSnapshot.capture({
        'psygames_pet_name': 'a' * CloudSnapshot.maxDecodedBytes,
      }, now: now),
      throwsFormatException,
    );
  });
}

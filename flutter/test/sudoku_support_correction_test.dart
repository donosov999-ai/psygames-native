import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/games/sudoku/roads.dart';
import 'package:psygames_flutter/shell/resume_store.dart';
import 'package:psygames_flutter/shell/sudoku_support_correction.dart';

final _now = DateTime.utc(2026, 10, 16, 12);

SudokuSupportScope _scope({
  String ownerId = 'owner-a',
  String issuer = 'https://issuer.invalid',
  String appId = 'psygames',
  String profile = 'women',
  String road = 'normal',
}) => SudokuSupportScope(
  ownerId: ownerId,
  issuer: issuer,
  appId: appId,
  profile: profile,
  road: road,
);

SudokuSupportExpected _expected({
  SudokuSupportScope? scope,
  String correctionId = 'correction-a',
  String grantId = 'grant-a',
  int grantRevision = 7,
}) => SudokuSupportExpected(
  scope: scope ?? _scope(),
  correctionId: correctionId,
  grantId: grantId,
  grantRevision: grantRevision,
);

SudokuSupportQueuedRecord _queue({
  SudokuSupportScope? scope,
  String id = 'correction-a',
  String grantId = 'grant-a',
  int grantRevision = 7,
  String gameId = 'sudoku',
  String operation = 'unlock_at_least',
  int targetLevel = 79,
  String status = 'pending',
  String? keyScope,
}) {
  final s = scope ?? _scope();
  return SudokuSupportQueuedRecord(
    id: id,
    scope: s,
    grantId: grantId,
    grantRevision: grantRevision,
    gameId: gameId,
    operation: operation,
    targetLevel: targetLevel,
    status: status,
    keyScope:
        keyScope ??
        'psygames_sudoku_level_${s.profile}'
            '${s.road == 'normal' ? '' : '_${s.road}'}',
  );
}

SudokuSupportLiveGrant _grant({
  SudokuSupportScope? scope,
  String id = 'grant-a',
  int revision = 7,
  bool enabled = true,
  DateTime? expiresAt,
}) => SudokuSupportLiveGrant(
  id: id,
  scope: scope ?? _scope(),
  revision: revision,
  enabled: enabled,
  expiresAt: expiresAt ?? _now.add(const Duration(hours: 1)),
);

SudokuSupportCandidate _build({
  Map<String, String>? data,
  SudokuSupportExpected? expected,
  SudokuSupportQueuedRecord? queued,
  SudokuSupportLiveGrant? grant,
  DateTime? now,
}) => buildSudokuSupportCandidate(
  localPortable:
      data ??
      {'psygames_sudoku_level_women': '78', 'psygames_sudoku_best_women': '78'},
  expected: expected ?? _expected(),
  queued: queued ?? _queue(),
  liveGrant: grant ?? _grant(),
  now: now ?? _now,
);

String _resume({
  String mode = 'levels',
  int level = 78,
  Object? road = 'normal',
  Object? version = 4,
  Object? savedAt,
}) => jsonEncode({
  'v': version,
  'savedAt': savedAt ?? _now.millisecondsSinceEpoch - 1000,
  'state': {'mode': mode, 'level': level, 'road': ?road},
});

Matcher _error(SudokuSupportErrorCode code) =>
    isA<SudokuSupportCorrectionException>().having((e) => e.code, 'code', code);

void main() {
  test(
    '78 -> 79 returns only reached-level patches; all other bytes unchanged',
    () {
      final data = <String, String>{
        'psygames_sudoku_level_women': '78',
        'psygames_sudoku_best_women': '78',
        'psygames_wallet_v1': ' { "balance": 98 } ',
        'psygames_pet_v1': '{"xp":1}',
        'psygames_purchases': '["life"]',
        'psygames_history': '[{"lesson":true}]',
        'psygames_sudoku_stars_women': '{"77":3}',
        'psygames_sudoku_failstreak_women': '2',
        'psygames_sudoku_level_women_warmup': '78',
        'psygames_sudoku_practice_women': 'true',
        'psygames_leaderboard_personal_best_sudoku_level': '77',
        'psygames_sessions': '[{"passed":false}]',
        'psygames_tokens_v1': '12',
        'psygames_sudoku_road_women': 'easy',
        'psygames_sudoku_level_women_easy': '50',
        'psygames_sudoku_level_women_hard': '2',
        'psygames_sudoku_level_kids': '8',
        'psygames_resume_sudoku_kids': 'untouched',
        'psygames_resume_sudoku_killer_women': 'opaque',
        'psygames_resume_sudoku_women': '  null\n',
        'psygames_active_profile': 'kids',
        'language': 'ru',
        'psygames.bestStreak.sudoku': '4',
      };
      final original = Map<String, String>.of(data);
      final result = _build(data: data);
      expect(result.patches, {
        'psygames_sudoku_level_women': '79',
        'psygames_sudoku_best_women': '79',
      });
      expect(data, original);
      final candidate = {
        ...data,
        ...result.patches,
      }; // Test-only simulated merge.
      for (final entry in original.entries) {
        if (!result.patches.containsKey(entry.key)) {
          expect(candidate[entry.key], entry.value, reason: entry.key);
        }
      }
      expect(result.choiceNeeded, isFalse);
    },
  );

  test(
    'duplicate preparation is deterministic; replay after merge is a no-op',
    () {
      final data = {'psygames_sudoku_level_women': '78'};
      final first = _build(data: data);
      expect(_build(data: data).patches, first.patches);
      expect(_build(data: {...data, ...first.patches}).patches, isEmpty);
    },
  );

  test(
    'already higher own and best remain untouched, including above target cap',
    () {
      expect(
        _build(
          data: {
            'psygames_sudoku_level_women': '200',
            'psygames_sudoku_best_women': '250',
          },
        ).patches,
        isEmpty,
      );
    },
  );

  test('higher own repairs only missing best, never lowers own', () {
    expect(_build(data: {'psygames_sudoku_level_women': '90'}).patches, {
      'psygames_sudoku_best_women': '90',
    });
  });

  test('higher best is not lowered when own level increases', () {
    expect(
      _build(
        data: {
          'psygames_sudoku_level_women': '78',
          'psygames_sudoku_best_women': '100',
        },
      ).patches,
      {'psygames_sudoku_level_women': '79'},
    );
  });

  for (final profile in ['women', 'kids', 'nzt48', 'odv999', 'valya-2']) {
    for (final road in SudokuRoad.values) {
      test(
        'exact native keys, profile isolation and inheritance: $profile/${road.name}',
        () {
          final scope = _scope(profile: profile, road: road.name);
          final suffix = road == SudokuRoad.normal ? '' : '_${road.name}';
          final data = <String, String>{
            'psygames_sudoku_level_other': '100',
            sudokuRoadKey(profile): 'hard',
          };
          final result = _build(
            data: data,
            expected: _expected(scope: scope),
            queued: _queue(scope: scope),
            grant: _grant(scope: scope),
          );
          expect(result.patches, {
            sudokuLevelKey(profile, road): '79',
            'psygames_sudoku_best_$profile$suffix': '79',
          });
          // Each saved road observes only itself and harder roads AFTER correction.
          for (final resumedRoad in SudokuRoad.values) {
            final inherits = resumedRoad.index <= road.index;
            final resumed = _build(
              data: {
                ...data,
                'psygames_resume_sudoku_$profile': _resume(
                  level: inherits ? 79 : 1,
                  road: resumedRoad.name,
                ),
                sudokuRoadKey(profile): resumedRoad.name,
              },
              expected: _expected(scope: scope),
              queued: _queue(scope: scope),
              grant: _grant(scope: scope),
            );
            expect(resumed.choiceNeeded, isFalse);
          }
        },
      );
    }
  }

  test(
    'hard inheritance raises own best to inherited level, not other counters',
    () {
      expect(_build(data: {'psygames_sudoku_level_women_hard': '85'}).patches, {
        'psygames_sudoku_level_women': '79',
        'psygames_sudoku_best_women': '85',
      });
    },
  );

  test(
    'saved levels conflict returns explicit choice and preserves raw bytes',
    () {
      final raw = ' \n${_resume()}\n ';
      final data = {'psygames_resume_sudoku_women': raw};
      final result = _build(data: data);
      expect(result.choiceNeeded, isTrue);
      expect(result.resumeReasons, [SudokuSupportResumeReason.levelMismatch]);
      expect(data['psygames_resume_sudoku_women'], raw);
      expect(
        result.patches.keys,
        isNot(contains('psygames_resume_sudoku_women')),
      );
    },
  );

  test('inherited easy resume conflicts; untouched hard resume does not', () {
    final easy = _build(
      data: {
        'psygames_resume_sudoku_women': _resume(road: 'easy'),
        'psygames_sudoku_road_women': 'easy',
      },
    );
    expect(easy.resumeReasons, [SudokuSupportResumeReason.levelMismatch]);
    expect(
      _build(
        data: {
          'psygames_resume_sudoku_women': _resume(road: 'hard', level: 1),
          'psygames_sudoku_road_women': 'hard',
        },
      ).choiceNeeded,
      isFalse,
    );
  });

  test('matching, absent, null, legacy normal and side-mode resumes need no choice', () {
    for (final raw in <String?>[
      null,
      'null',
      ' \nnull ',
      _resume(level: 79),
      _resume(level: 79, road: null),
      for (final mode in ['free', 'killer', 'towers', 'unequal'])
        _resume(mode: mode),
    ]) {
      final data = <String, String>{
        'psygames_resume_sudoku_women': ?raw,
      };
      expect(_build(data: data).choiceNeeded, isFalse);
      if (raw != null) expect(data['psygames_resume_sudoku_women'], raw);
    }
  });

  test('malformed resumes are opaque choice-needed, never thrown away', () {
    for (final raw in [
      'bad json',
      '{}',
      '[]',
      '"private-marker"',
      'true',
      _resume(version: 3),
      _resume(version: 4.0),
      _resume(savedAt: '0'),
      _resume(savedAt: -1),
      _resume(savedAt: 1.5),
      _resume(savedAt: 9007199254740992),
      '{"v":4,"savedAt":0,"state":[]}',
      _resume(mode: 'unknown'),
      _resume(road: 'NORMAL'),
      _resume(road: 2),
      _resume(level: 0),
      _resume(level: 79).replaceFirst('"level":79', '"level":79.0'),
    ]) {
      final data = {'psygames_resume_sudoku_women': raw};
      final result = _build(data: data);
      expect(result.choiceNeeded, isTrue);
      expect(
        result.resumeReasons,
        contains(SudokuSupportResumeReason.uninspectableResume),
      );
      expect(data['psygames_resume_sudoku_women'], raw);
    }
  });

  test(
    'resume age is injected; exact TTL allowed, expired and future need choice',
    () {
      final threshold = _now
          .subtract(ResumeStore.maxAge)
          .millisecondsSinceEpoch;
      for (final ageCase in [
        (threshold, <SudokuSupportResumeReason>[]),
        (threshold - 1, [SudokuSupportResumeReason.expiredResume]),
        (
          _now.millisecondsSinceEpoch + 1,
          [SudokuSupportResumeReason.futureResumeTime],
        ),
      ]) {
        final result = _build(
          data: {
            'psygames_resume_sudoku_women': _resume(
              level: 79,
              savedAt: ageCase.$1,
            ),
          },
        );
        expect(result.resumeReasons, ageCase.$2);
      }
    },
  );

  test('resume road preference conflict is a choice, not a route patch', () {
    final result = _build(
      data: {'psygames_resume_sudoku_women': _resume(road: 'hard', level: 1)},
    );
    expect(result.resumeReasons, [SudokuSupportResumeReason.routeMismatch]);
    expect(result.patches.keys, isNot(contains('psygames_sudoku_road_women')));
  });

  final wrongScopes = <String, SudokuSupportScope>{
    'owner': _scope(ownerId: 'other'),
    'issuer': _scope(issuer: 'https://other.invalid'),
    'app': _scope(appId: 'other'),
    'profile': _scope(profile: 'kids'),
    'road': _scope(road: 'hard'),
  };
  for (final entry in wrongScopes.entries) {
    test('queue wrong ${entry.key} fails closed', () {
      expect(
        () => _build(queued: _queue(scope: entry.value)),
        throwsA(_error(SudokuSupportErrorCode.scopeOrGrantMismatch)),
      );
    });
    test('live grant wrong ${entry.key} fails closed', () {
      expect(
        () => _build(grant: _grant(scope: entry.value)),
        throwsA(_error(SudokuSupportErrorCode.scopeOrGrantMismatch)),
      );
    });
  }

  test('record ID, grant ID and exact revision are independently bound', () {
    for (final queued in [
      _queue(id: ''),
      _queue(id: 'other'),
      _queue(grantId: 'other'),
      _queue(grantRevision: 0),
      _queue(grantRevision: 8),
    ]) {
      expect(
        () => _build(queued: queued),
        throwsA(_error(SudokuSupportErrorCode.scopeOrGrantMismatch)),
      );
    }
    for (final grant in [_grant(id: 'other'), _grant(revision: 8)]) {
      expect(
        () => _build(grant: grant),
        throwsA(_error(SudokuSupportErrorCode.scopeOrGrantMismatch)),
      );
    }
  });

  test('invalid expectations, profile aliases and unsafe revision fail', () {
    for (final scope in [
      _scope(ownerId: ''),
      _scope(ownerId: 'has space'),
      _scope(issuer: ''),
      _scope(issuer: 'bad\nissuer'),
      _scope(appId: 'other'),
      _scope(profile: 'women_easy'),
      _scope(profile: '../women'),
      _scope(profile: 'Women'),
      _scope(profile: ''),
      _scope(profile: 'a' * 65),
      _scope(road: 'NORMAL'),
    ]) {
      expect(
        () => _build(expected: _expected(scope: scope)),
        throwsA(_error(SudokuSupportErrorCode.invalidExpectation)),
      );
    }
    for (final expected in [
      _expected(correctionId: ''),
      _expected(grantId: ''),
      _expected(grantRevision: 0),
      _expected(grantRevision: 9007199254740992),
    ]) {
      expect(
        () => _build(expected: expected),
        throwsA(_error(SudokuSupportErrorCode.invalidExpectation)),
      );
    }
  });

  test(
    'wrong game, operation, status, key scope and target bounds rejected',
    () {
      for (final queued in [
        _queue(gameId: 'sudoku_killer'),
        _queue(operation: 'set'),
        _queue(status: 'applied'),
        _queue(status: 'dismissed'),
        _queue(status: ''),
        _queue(keyScope: ''),
        _queue(keyScope: 'psygames_sudoku_level_women_normal'),
        _queue(keyScope: 'psygames_sudoku_best_women'),
        _queue(keyScope: 'psygames_sudoku_level_kids'),
        _queue(keyScope: 'psygames_sudoku_level_women_hard'),
        _queue(targetLevel: 0),
        _queue(targetLevel: -1),
        _queue(targetLevel: 181),
      ]) {
        expect(
          () => _build(queued: queued),
          throwsA(_error(SudokuSupportErrorCode.invalidQueue)),
        );
      }
    },
  );

  test('target bounds 1 and 180 accepted; missing level defaults to 1', () {
    expect(_build(data: {}, queued: _queue(targetLevel: 1)).patches, isEmpty);
    expect(_build(data: {}, queued: _queue(targetLevel: 180)).patches, {
      'psygames_sudoku_level_women': '180',
      'psygames_sudoku_best_women': '180',
    });
  });

  test('disabled, expired and exactly-expiring live grants rejected', () {
    for (final grant in [
      _grant(enabled: false),
      _grant(expiresAt: _now),
      _grant(expiresAt: _now.subtract(const Duration(microseconds: 1))),
    ]) {
      expect(
        () => _build(grant: grant),
        throwsA(_error(SudokuSupportErrorCode.inactiveGrant)),
      );
    }
    expect(
      _build(
        grant: _grant(expiresAt: _now.add(const Duration(microseconds: 1))),
      ).patches,
      isNotEmpty,
    );
  });

  test('non-UTC injected time or expiry fails without timezone coercion', () {
    final local = DateTime.fromMillisecondsSinceEpoch(
      _now.millisecondsSinceEpoch,
    );
    expect(
      () => _build(now: local),
      throwsA(_error(SudokuSupportErrorCode.invalidTime)),
    );
    expect(
      () => _build(grant: _grant(expiresAt: local)),
      throwsA(_error(SudokuSupportErrorCode.invalidTime)),
    );
  });

  test(
    'malformed own, best and inherited/easier levels are never normalized',
    () {
      for (final key in [
        'psygames_sudoku_level_women',
        'psygames_sudoku_best_women',
        'psygames_sudoku_level_women_hard',
        'psygames_sudoku_level_women_easy',
      ]) {
        for (final raw in [
          '0',
          '-1',
          '78.5',
          '078',
          '78x',
          ' 78',
          '78\n',
          '+78',
          '9007199254740992',
          '9999999999999999999999999',
          '',
        ]) {
          final data = {key: raw};
          expect(
            () => _build(data: data),
            throwsA(_error(SudokuSupportErrorCode.invalidLevel)),
          );
          expect(data, {key: raw});
        }
      }
    },
  );

  test('nonportable private/local/foreign keys fail without echoing input', () {
    for (final key in [
      'foreign',
      'psygames_auth',
      'psygames_accessToken',
      'psygames_cloud_consent',
      'psygames_apikey',
      'psygames_private-key',
      'psygames_sessions_outbox',
      'psygames_legacy_import_v1',
      'psygames_migration_v1',
      'psygames_sync_v1',
    ]) {
      expect(
        () => _build(data: {key: 'DO-NOT-ECHO'}),
        throwsA(_error(SudokuSupportErrorCode.nonPortableData)),
      );
    }
  });

  test('entry and UTF-8 limits apply before and after adding patches', () {
    final full = {for (var i = 0; i < 10000; i++) 'psygames_test_$i': 'x'};
    expect(
      () => _build(data: full),
      throwsA(_error(SudokuSupportErrorCode.dataTooLarge)),
    );
    expect(
      () => _build(data: {...full, 'psygames_extra': 'x'}),
      throwsA(_error(SudokuSupportErrorCode.dataTooLarge)),
    );
    expect(
      () => _build(data: {'psygames_history': 'я' * (3 * 1024 * 1024)}),
      throwsA(_error(SudokuSupportErrorCode.dataTooLarge)),
    );
    final data = {'psygames_history': ''};
    data['psygames_history'] =
        'x' * (5 * 1024 * 1024 - utf8.encode(jsonEncode(data)).length);
    expect(
      () => _build(data: data),
      throwsA(_error(SudokuSupportErrorCode.dataTooLarge)),
    );
  });

  test(
    'detached immutable output, immutable input supported, no retained aliases',
    () {
      final data = {
        'psygames_sudoku_level_women': '78',
        'psygames_resume_sudoku_women': _resume(),
      };
      final result = _build(data: Map.unmodifiable(data));
      data['psygames_sudoku_level_women'] = '100';
      data['psygames_resume_sudoku_women'] = 'null';
      expect(result.patches['psygames_sudoku_level_women'], '79');
      expect(result.choiceNeeded, isTrue);
      expect(
        () => result.patches['psygames_sudoku_level_women'] = '1',
        throwsUnsupportedError,
      );
      expect(() => result.resumeReasons.clear(), throwsUnsupportedError);
    },
  );

  test(
    'unexpected typed-map cast failures are sanitized, no parser/cause leaks',
    () {
      final malformed = <String, Object?>{'psygames_history': 42}
          .cast<String, String>();
      expect(
        () => _build(data: malformed),
        throwsA(_error(SudokuSupportErrorCode.invalidInput)),
      );
      try {
        _build(
          queued: _queue(scope: _scope(ownerId: 'DO-NOT-ECHO')),
        );
        fail('expected rejection');
      } on SudokuSupportCorrectionException catch (e) {
        expect(
          e.toString(),
          'SudokuSupportCorrectionException(scopeOrGrantMismatch)',
        );
        expect(e.toString(), isNot(contains('DO-NOT-ECHO')));
      }
    },
  );
}

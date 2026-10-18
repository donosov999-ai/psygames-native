import 'dart:convert';

import '../games/sudoku/resume.dart' show sudokuResumeVersion;
import '../games/sudoku/roads.dart'
    show
        SudokuRoad,
        roadsHarderThan,
        sudokuLevelKey,
        sudokuRoadKey,
        sudokuRoadOf;
import 'resume_store.dart' show ResumeStore;

/// Pure candidate preparation only: no persistence, SDK, clock reads, or ACK.
///
/// A future authenticated adapter must supply independently trusted expectations
/// and a fresh live grant. [issuer] on each scope is authenticated provenance,
/// not a column inferred from a queue row. This builder cannot verify that
/// provenance, consent, freshness, or atomic application on the caller's behalf.
final class SudokuSupportScope {
  const SudokuSupportScope({
    required this.ownerId,
    required this.issuer,
    required this.appId,
    required this.profile,
    required this.road,
  });

  final String ownerId;
  final String issuer;
  final String appId;
  final String profile;
  final String road;
}

final class SudokuSupportExpected {
  const SudokuSupportExpected({
    required this.scope,
    required this.correctionId,
    required this.grantId,
    required this.grantRevision,
  });

  final SudokuSupportScope scope;
  final String correctionId;
  final String grantId;
  final int grantRevision;
}

/// Explicit typed fields; decoding/coercing arbitrary server JSON is not here.
final class SudokuSupportQueuedRecord {
  const SudokuSupportQueuedRecord({
    required this.id,
    required this.scope,
    required this.grantId,
    required this.grantRevision,
    required this.gameId,
    required this.operation,
    required this.targetLevel,
    required this.status,
    required this.keyScope,
  });

  final String id;
  final SudokuSupportScope scope;
  final String grantId;
  final int grantRevision;
  final String gameId;
  final String operation;
  final int targetLevel;
  final String status;
  final String keyScope;
}

final class SudokuSupportLiveGrant {
  const SudokuSupportLiveGrant({
    required this.id,
    required this.scope,
    required this.revision,
    required this.enabled,
    required this.expiresAt,
  });

  final String id;
  final SudokuSupportScope scope;
  final int revision;
  final bool enabled;
  final DateTime expiresAt;
}

enum SudokuSupportErrorCode {
  invalidExpectation,
  scopeOrGrantMismatch,
  invalidQueue,
  inactiveGrant,
  invalidTime,
  nonPortableData,
  dataTooLarge,
  invalidLevel,
  invalidInput,
}

/// Only fixed codes escape; no identifiers, input bytes, causes or JSON errors.
final class SudokuSupportCorrectionException implements Exception {
  const SudokuSupportCorrectionException._(this.code);
  final SudokuSupportErrorCode code;

  @override
  String toString() => 'SudokuSupportCorrectionException(${code.name})';
}

enum SudokuSupportResumeReason {
  uninspectableResume,
  expiredResume,
  futureResumeTime,
  levelMismatch,
  routeMismatch,
}

final class SudokuSupportCandidate {
  SudokuSupportCandidate._(
    Map<String, String> patches,
    List<SudokuSupportResumeReason> resumeReasons,
  ) : patches = Map<String, String>.unmodifiable(patches),
      resumeReasons = List<SudokuSupportResumeReason>.unmodifiable(
        resumeReasons,
      );

  /// ONLY increased own-road level/best keys. No full snapshot or resume bytes.
  final Map<String, String> patches;
  final List<SudokuSupportResumeReason> resumeReasons;

  /// The caller must offer restore/restart; preparation chooses neither.
  /// False only means no routing/age conflict was found, NOT board validity.
  bool get choiceNeeded => resumeReasons.isNotEmpty;
}

const _maxSafeInteger = 9007199254740991;
const _maxEntries = 10000;
const _maxBytes = 5 * 1024 * 1024;
final _profilePattern = RegExp(r'^[a-z][a-z0-9-]{0,63}$');
final _integerPattern = RegExp(r'^[1-9][0-9]*$');
final _privateKey = RegExp(
  r'(^|[^a-z0-9])(auth|authentication|authorization|oauth|account|consent|device|runtime|transport|cloud|supabase|credential|credentials|password|passwd|secret|secrets|jwt|bearer|token|apikey|privatekey)([^a-z0-9]|$)',
);

Never _reject(SudokuSupportErrorCode code) =>
    throw SudokuSupportCorrectionException._(code);

bool _identifier(String value) =>
    value.isNotEmpty &&
    value.length <= 2048 &&
    !RegExp(r'[\s\x00-\x1f\x7f]').hasMatch(value);

bool _sameScope(SudokuSupportScope a, SudokuSupportScope b) =>
    a.ownerId == b.ownerId &&
    a.issuer == b.issuer &&
    a.appId == b.appId &&
    a.profile == b.profile &&
    a.road == b.road;

bool _portableKey(String key) {
  if (!(key.startsWith('psygames_') ||
      key.startsWith('psygames.') ||
      key == 'language')) {
    return false;
  }
  final normalized = key
      .replaceAllMapped(RegExp(r'([a-z0-9])([A-Z])'), (m) => '${m[1]}_${m[2]}')
      .toLowerCase();
  return !_privateKey.hasMatch(normalized) &&
      !RegExp(r'(api|private)[_.-]?key').hasMatch(normalized) &&
      normalized != 'psygames_sessions_outbox' &&
      ![
        'psygames_legacy_import',
        'psygames_migration_',
        'psygames_sync_',
      ].any(normalized.startsWith);
}

int _readLevel(Map<String, String> data, String key) {
  final raw = data[key];
  if (raw == null) return 1;
  final value = int.tryParse(raw);
  if (!_integerPattern.hasMatch(raw) ||
      value == null ||
      value < 1 ||
      value > _maxSafeInteger) {
    _reject(SudokuSupportErrorCode.invalidLevel);
  }
  return value;
}

int _effective(Map<String, String> data, String profile, SudokuRoad road) {
  var level = _readLevel(data, sudokuLevelKey(profile, road));
  for (final harder in roadsHarderThan(road)) {
    final inherited = _readLevel(data, sudokuLevelKey(profile, harder));
    if (inherited > level) level = inherited;
  }
  return level;
}

/// Inspect only ResumeStore v4 routing/age fields, never load/clear a resume.
List<SudokuSupportResumeReason> _resumeReasons(
  Map<String, String> data,
  String profile,
  DateTime now,
) {
  final raw = data['psygames_resume_sudoku_$profile'];
  if (raw == null) return [];
  Object? envelope;
  try {
    envelope = jsonDecode(raw);
  } on FormatException {
    return [SudokuSupportResumeReason.uninspectableResume];
  }
  if (envelope == null) return []; // Legacy empty slot: preserve verbatim.
  if (envelope is! Map<String, Object?> ||
      envelope['v'] is! int ||
      envelope['v'] != sudokuResumeVersion) {
    return [SudokuSupportResumeReason.uninspectableResume];
  }
  final savedAt = envelope['savedAt'];
  final state = envelope['state'];
  if (savedAt is! int ||
      savedAt < 0 ||
      savedAt > _maxSafeInteger ||
      state is! Map<String, Object?>) {
    return [SudokuSupportResumeReason.uninspectableResume];
  }
  final reasons = <SudokuSupportResumeReason>[];
  final age = now.millisecondsSinceEpoch - savedAt;
  if (age > ResumeStore.maxAge.inMilliseconds) {
    reasons.add(SudokuSupportResumeReason.expiredResume);
  }
  if (age < 0) reasons.add(SudokuSupportResumeReason.futureResumeTime);
  if (state['mode'] == 'levels') {
    final roadValue = state['road'] ?? 'normal'; // Native legacy fallback.
    final road = roadValue is String ? sudokuRoadOf(roadValue) : null;
    final level = state['level'];
    if (road == null || level is! int || level < 1 || level > _maxSafeInteger) {
      reasons.add(SudokuSupportResumeReason.uninspectableResume);
    } else {
      if (level != _effective(data, profile, road)) {
        reasons.add(SudokuSupportResumeReason.levelMismatch);
      }
      if (road.name != (data[sudokuRoadKey(profile)] ?? 'normal')) {
        reasons.add(SudokuSupportResumeReason.routeMismatch);
      }
    }
  } else if (!['free', 'killer', 'towers', 'unequal'].contains(state['mode'])) {
    reasons.add(SudokuSupportResumeReason.uninspectableResume);
  }
  return reasons;
}

/// Deterministic max(local, target) preparation for ONE pending record.
///
/// Both [now] and grant expiry must be UTC. A duplicate after patch application
/// yields no changes, but this is NOT a durable duplicate journal or an applied
/// ACK. Revalidate owner/consent/grant/local state before any future write.
SudokuSupportCandidate buildSudokuSupportCandidate({
  required Map<String, String> localPortable,
  required SudokuSupportExpected expected,
  required SudokuSupportQueuedRecord queued,
  required SudokuSupportLiveGrant liveGrant,
  required DateTime now,
}) {
  try {
    final scope = expected.scope;
    final road = sudokuRoadOf(scope.road);
    if (!_identifier(scope.ownerId) ||
        !_identifier(scope.issuer) ||
        scope.appId != 'psygames' ||
        !_profilePattern.hasMatch(scope.profile) ||
        road == null ||
        !_identifier(expected.correctionId) ||
        !_identifier(expected.grantId) ||
        expected.grantRevision < 1 ||
        expected.grantRevision > _maxSafeInteger) {
      _reject(SudokuSupportErrorCode.invalidExpectation);
    }
    if (!_sameScope(scope, queued.scope) ||
        !_sameScope(scope, liveGrant.scope) ||
        queued.id != expected.correctionId ||
        queued.grantId != expected.grantId ||
        liveGrant.id != expected.grantId ||
        queued.grantRevision != expected.grantRevision ||
        liveGrant.revision != expected.grantRevision) {
      _reject(SudokuSupportErrorCode.scopeOrGrantMismatch);
    }
    final levelKey = sudokuLevelKey(scope.profile, road);
    if (queued.gameId != 'sudoku' ||
        queued.operation != 'unlock_at_least' ||
        queued.status != 'pending' ||
        queued.keyScope != levelKey ||
        queued.targetLevel < 1 ||
        queued.targetLevel > 180) {
      _reject(SudokuSupportErrorCode.invalidQueue);
    }
    if (!now.isUtc || !liveGrant.expiresAt.isUtc) {
      _reject(SudokuSupportErrorCode.invalidTime);
    }
    if (!liveGrant.enabled || !liveGrant.expiresAt.isAfter(now)) {
      _reject(SudokuSupportErrorCode.inactiveGrant);
    }

    // Detach once. Never copy this entire map into a writer or return it.
    if (localPortable.length > _maxEntries) {
      _reject(SudokuSupportErrorCode.dataTooLarge);
    }
    final data = <String, String>{};
    for (final entry in localPortable.entries) {
      if (!_portableKey(entry.key)) {
        _reject(SudokuSupportErrorCode.nonPortableData);
      }
      data[entry.key] = entry.value;
    }
    if (utf8.encode(jsonEncode(data)).length > _maxBytes) {
      _reject(SudokuSupportErrorCode.dataTooLarge);
    }
    // Validate all own-road counters, including easier roads inspected by resume.
    for (final r in SudokuRoad.values) {
      _readLevel(data, sudokuLevelKey(scope.profile, r));
    }
    final bestKey =
        'psygames_sudoku_best_${scope.profile}'
        '${road == SudokuRoad.normal ? '' : '_${road.name}'}';
    final own = _readLevel(data, levelKey);
    final best = _readLevel(data, bestKey);
    final patches = <String, String>{};
    if (queued.targetLevel > own) {
      patches[levelKey] = '${queued.targetLevel}';
      data[levelKey] = '${queued.targetLevel}';
    }
    final reached = _effective(data, scope.profile, road);
    if (reached > best) {
      patches[bestKey] = '$reached';
      data[bestKey] = '$reached';
    }
    if (data.length > _maxEntries ||
        utf8.encode(jsonEncode(data)).length > _maxBytes) {
      _reject(SudokuSupportErrorCode.dataTooLarge);
    }
    return SudokuSupportCandidate._(
      patches,
      _resumeReasons(data, scope.profile, now),
    );
  } on SudokuSupportCorrectionException {
    rethrow;
  } catch (_) {
    _reject(SudokuSupportErrorCode.invalidInput);
  }
}

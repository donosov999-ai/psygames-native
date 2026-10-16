import 'dart:convert';

import 'shared_state.dart';

/// Portable, opaque gameplay state. Values are copied verbatim, not interpreted.
///
/// Restore means replacement of portable state, NEVER addition/merging of earned
/// points, inventories or sessions. Applying the replacement belongs to the
/// caller; this model performs no storage, wallet or session writes.
///
/// Wire format: JSON {schema: 1, createdAt: UTC ISO-8601 string, data: object}.
/// Capture filters local-only keys; decode rejects the ENTIRE downloaded snapshot
/// containing any excluded/foreign key, rather than partially restoring it.
class CloudSnapshot {
  CloudSnapshot._(this.createdAt, Map<String, String> data)
    : data = Map<String, String>.unmodifiable(data);

  static const int maxDecodedBytes = 5 * 1024 * 1024;
  static const int maxEntries = 10000;

  final int schema = 1;
  final DateTime createdAt;
  final Map<String, String> data;

  static final _privateParts = RegExp(
    r'(^|[^a-z0-9])(auth|authentication|authorization|oauth|account|consent|'
    r'device|runtime|transport|cloud|supabase|credential|credentials|password|'
    r'passwd|secret|secrets|jwt|bearer|token|apikey|privatekey)([^a-z0-9]|$)',
  );

  /// SharedState ownership is necessary but not sufficient for cloud portability.
  /// In particular, gameplay `tokens_v1` is NOT an authentication `token`.
  static bool portableKey(String key) {
    if (!SharedState.owns(key)) return false;
    final normalized = key
        .replaceAllMapped(
          RegExp(r'([a-z0-9])([A-Z])'),
          (match) => '${match[1]}_${match[2]}',
        )
        .toLowerCase();
    if (_privateParts.hasMatch(normalized)) return false;
    if (normalized == 'psygames_sessions_outbox' ||
        normalized.startsWith('psygames_legacy_import') ||
        normalized.startsWith('psygames_migration_') ||
        normalized.startsWith('psygames_sync_')) {
      return false;
    }
    // These are credential names without a separator between their words.
    return !RegExp(r'(api|private)[_.-]?key').hasMatch(normalized);
  }

  static CloudSnapshot capture(Map<String, String> input, {DateTime? now}) {
    final keys = input.keys.where(portableKey).toList()..sort();
    if (keys.length > maxEntries) {
      throw const FormatException('Too many snapshot entries');
    }
    final snapshot = CloudSnapshot._((now ?? DateTime.now()).toUtc(), {
      for (final key in keys) key: input[key]!,
    });
    // Do not emit snapshots that our own decoder would refuse.
    snapshot.encode();
    return snapshot;
  }

  String encode() {
    final encoded = jsonEncode({
      'schema': schema,
      'createdAt': createdAt.toIso8601String(),
      'data': data,
    });
    _checkSize(encoded);
    return encoded;
  }

  static CloudSnapshot decode(String encoded) {
    _checkSize(encoded);
    final payload = jsonDecode(encoded);
    if (payload is! Map<String, dynamic> ||
        payload.length != 3 ||
        !payload.containsKey('schema') ||
        !payload.containsKey('createdAt') ||
        !payload.containsKey('data')) {
      throw const FormatException('Invalid snapshot envelope');
    }
    if (payload['schema'] is! int || payload['schema'] != 1) {
      throw const FormatException('Unsupported snapshot schema');
    }
    final createdAt = _readCreatedAt(payload['createdAt']);
    final rawData = payload['data'];
    if (rawData is! Map<String, dynamic> || rawData.length > maxEntries) {
      throw const FormatException('Invalid snapshot data or entry count');
    }
    final keys = rawData.keys.toList()..sort();
    final data = <String, String>{};
    for (final key in keys) {
      final value = rawData[key];
      if (!portableKey(key) || value is! String) {
        // Never echo potentially sensitive keys/values in errors.
        throw const FormatException('Non-portable key or non-string value');
      }
      data[key] = value;
    }
    return CloudSnapshot._(createdAt, data);
  }

  static void _checkSize(String encoded) {
    // The limit applies to decoded JSON UTF-8 bytes, including the envelope,
    // not Dart UTF-16 character count or any transport compression/base64.
    if (encoded.length > maxDecodedBytes ||
        utf8.encode(encoded).length > maxDecodedBytes) {
      throw const FormatException('Snapshot exceeds 5 MiB');
    }
  }

  static DateTime _readCreatedAt(Object? value) {
    if (value is! String) {
      throw const FormatException('Invalid snapshot creation time');
    }
    final shape = RegExp(
      r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$',
    );
    final parsed = shape.hasMatch(value) ? DateTime.tryParse(value) : null;
    // DateTime.parse normalizes impossible dates (e.g. February 30); reject
    // those rather than silently coercing malformed input.
    if (parsed == null ||
        parsed.toIso8601String().substring(0, 19) != value.substring(0, 19)) {
      throw const FormatException('Invalid snapshot creation time');
    }
    return parsed;
  }
}

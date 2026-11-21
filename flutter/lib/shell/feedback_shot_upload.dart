import 'dart:async';
import 'dart:convert';
import 'dart:io';

// Only this write is bridged, not arbitrary HTTP. The bucket stays private.
class FeedbackShotUpload {
  FeedbackShotUpload._(this.id, this.uri, this.key, this.bytes, this.timeout);

  static const maxBytes = 4 * 1024 * 1024;
  static final _id = RegExp(r'^[a-f0-9]{32}$');
  static final _path = RegExp(r'^\d{4}-\d{2}-\d{2}/[a-f0-9]{32}\.jpg$');
  static final _key = RegExp(r'^sb_publishable_[A-Za-z0-9_-]{16,96}$');

  final String id;
  final Uri uri;
  final String key;
  final List<int> bytes;
  final Duration timeout;

  static FeedbackShotUpload? parse(Map<dynamic, dynamic> msg) {
    final id = msg['id'], path = msg['path'], key = msg['key'];
    final data = msg['bytes'], ms = msg['timeoutMs'];
    final host = switch (msg['base']) {
      'direct' => 'iuvvheeocobhiothfgei.supabase.co',
      'relay' => 'sb.asibots.pro',
      _ => null,
    };
    if (host == null ||
        id is! String ||
        id.length != 32 ||
        !_id.hasMatch(id) ||
        path is! String ||
        path.length != 47 ||
        !_path.hasMatch(path) ||
        key is! String ||
        !_key.hasMatch(key) ||
        data is! String ||
        data.isEmpty ||
        data.length > ((maxBytes + 2) ~/ 3) * 4 ||
        ms is! int ||
        ms < 1000 ||
        ms > 30000) {
      return null;
    }
    try {
      final bytes = base64Decode(data);
      if (bytes.isEmpty || bytes.length > maxBytes) return null;
      return FeedbackShotUpload._(
        id,
        Uri.https(host, '/storage/v1/object/feedback-shots/$path'),
        key,
        bytes,
        Duration(milliseconds: ms),
      );
    } on FormatException {
      return null;
    }
  }

  Future<String> send() => sendFeedbackShot(uri, key, bytes, timeout);
}

/// Kept separate so the real wire format and timeout can be tested locally.
Future<String> sendFeedbackShot(
  Uri uri,
  String key,
  List<int> bytes,
  Duration timeout,
) async {
  final client = HttpClient()..connectionTimeout = timeout;
  try {
    return await (() async {
      final req = await client.postUrl(uri);
      req.followRedirects = false;
      req.headers
        ..set('apikey', key)
        ..set(HttpHeaders.authorizationHeader, 'Bearer $key')
        ..set(HttpHeaders.contentTypeHeader, 'image/jpeg')
        ..set('x-upsert', 'false');
      req.contentLength = bytes.length;
      req.add(bytes);
      final res = await req.close();
      if (res.statusCode == 200 || res.statusCode == 201) return 'ok';
      if (res.statusCode == 400 || res.statusCode == 409) {
        // Older gateways can return either HTTP status. Recognize the storage
        // conflict, not an arbitrary 409, and never wait on an unbounded body.
        final data = <int>[];
        await for (final chunk in res) {
          if (data.length + chunk.length > 8192) break;
          data.addAll(chunk);
        }
        try {
          final info = jsonDecode(utf8.decode(data));
          if (info is Map &&
              [info['code'], info['error'], info['message']].any(
                (v) =>
                    v is String &&
                    (const {
                          'KeyAlreadyExists',
                          'ResourceAlreadyExists',
                          'Duplicate',
                        }.contains(v) ||
                        RegExp(
                          r'^(The resource already exists|Asset Already Exists)\.?$',
                          caseSensitive: false,
                        ).hasMatch(v)),
              )) {
            return 'err:KeyAlreadyExists';
          }
        } on FormatException {
          // Status by itself does not confirm the correct object.
        }
      }
      return res.statusCode >= 500 ||
              res.statusCode == 408 ||
              res.statusCode == 429
          ? 'err:network-http-${res.statusCode}'
          : 'err:http-${res.statusCode}';
    })().timeout(timeout);
  } on TimeoutException {
    return 'timeout';
  } catch (_) {
    return 'err:network-native';
  } finally {
    client.close(force: true);
  }
}

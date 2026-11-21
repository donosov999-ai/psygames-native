import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/feedback_shot_upload.dart';

void main() {
  final shot = <String, Object>{
    'id': 'a' * 32,
    'path': '2026-11-21/${'b' * 32}.jpg',
    'key': 'sb_publishable_${'a' * 24}',
    'base': 'direct',
    'bytes': base64Encode([255, 216, 1]),
    'timeoutMs': 10000,
  };

  test(
    'accepts only approved upload routes and exact private screenshot keys',
    () {
      final request = FeedbackShotUpload.parse(shot)!;
      expect(request.uri.scheme, 'https');
      expect(request.uri.host, 'iuvvheeocobhiothfgei.supabase.co');
      expect(
        request.uri.path,
        '/storage/v1/object/feedback-shots/${shot['path']}',
      );
      expect(request.bytes, [255, 216, 1]);
      expect(
        FeedbackShotUpload.parse({...shot, 'base': 'relay'})!.uri.host,
        'sb.asibots.pro',
      );
      for (final bad in [
        {'base': 'https://example.com'},
        {'path': '../private'},
        {'key': 'sb_secret_not-a-public-key'},
        {'bytes': '*not base64*'},
        {'timeoutMs': 120000},
      ]) {
        expect(FeedbackShotUpload.parse({...shot, ...bad}), isNull);
      }
    },
  );

  test(
    'writes once; same exact key then returns known conflict, never overwrites',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      final path = '/storage/v1/object/feedback-shots/${shot['path']}';
      final received = <List<int>>[];
      final headers = <(String, String?, String?, String?)>[];
      server.listen((req) async {
        headers.add((
          req.method,
          req.headers.value('content-type'),
          req.headers.value('x-upsert'),
          req.headers.value('apikey'),
        ));
        received.add(await req.fold<List<int>>([], (a, b) => a..addAll(b)));
        req.response.statusCode = received.length == 1 ? 200 : 409;
        if (received.length > 1) {
          req.response.write('{"code":"KeyAlreadyExists"}');
        }
        await req.response.close();
      });
      final uri = Uri.http('127.0.0.1:${server.port}', path);
      final key = shot['key'] as String;
      const deadline = Duration(seconds: 2);
      expect(await sendFeedbackShot(uri, key, [255, 216, 1], deadline), 'ok');
      expect(
        await sendFeedbackShot(uri, key, [255, 216, 1], deadline),
        'err:KeyAlreadyExists',
      );
      expect(received, [
        [255, 216, 1],
        [255, 216, 1],
      ]);
      expect(headers, List.filled(2, ('POST', 'image/jpeg', 'false', key)));
    },
  );

  test(
    'unknown conflict and missing response never confirm a screenshot',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      addTearDown(() => server.close(force: true));
      server.listen((req) async {
        await req.drain<void>();
        if (req.uri.path != '/conflict') return;
        req.response.statusCode = 409;
        req.response.write('{"code":"OtherConflict"}');
        await req.response.close();
      });
      final key = shot['key'] as String;
      final base = '127.0.0.1:${server.port}';
      expect(
        await sendFeedbackShot(Uri.http(base, '/conflict'), key, [
          1,
        ], const Duration(seconds: 2)),
        'err:http-409',
      );
      expect(
        await sendFeedbackShot(Uri.http(base, '/silent'), key, [
          1,
        ], const Duration(milliseconds: 60)),
        'timeout',
      );
    },
  );
}

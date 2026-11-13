import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:psygames_flutter/shell/hub_art.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'art map covers every real hub card and extra route in both themes',
    () async {
      final hubs =
          jsonDecode(File('assets/hubs.json').readAsStringSync()) as Map;
      final routes = <String>{
        for (final cards in (hubs['hubs'] as Map).values)
          for (final card in cards as List) card['route'] as String,
        ...(hubs['extra'] as Map).keys.cast<String>(),
      };
      final art = await HubArt.load();
      final mapped = (art['byRoute'] as Map).keys.cast<String>().toSet();
      expect(mapped.difference(routes), isEmpty);
      expect(routes.difference(mapped), isEmpty);
      final decoded = <String>{};
      for (final route in routes) {
        for (final theme in Brightness.values) {
          final asset = HubArt.resolve(art, route, theme);
          expect(asset, isNotNull, reason: '$route ${theme.name}');
          expect(asset, startsWith('assets/hub_art/${theme.name}/'));
          if (!decoded.add(asset!)) continue;
          final image = await ui.instantiateImageCodec(
            File(asset).readAsBytesSync(),
          );
          final frame = await image.getNextFrame();
          expect(frame.image.width, 256, reason: asset);
          expect(frame.image.height, 256, reason: asset);
          frame.image.dispose();
          image.dispose();
        }
      }
    },
  );

  test(
    'route query is preserved, no accidental mode alias or unknown default',
    () async {
      final art = await HubArt.load();
      final a = HubArt.resolve(
        art,
        '/games/spatial-lab?mode=net',
        Brightness.light,
      );
      final b = HubArt.resolve(
        art,
        '/games/spatial-lab?mode=twiddle',
        Brightness.light,
      );
      expect(a, isNotNull);
      expect(b, isNot(a));
      expect(HubArt.resolve(art, '/games/unmapped', Brightness.light), isNull);
      expect(
        HubArt.resolve({}, '/games/mental-rotation', Brightness.light),
        isNull,
      );
    },
  );

  test(
    'Mental Rotation uses accepted first drawing, never rejected v2 or v3',
    () async {
      final art = await HubArt.load();
      for (final theme in Brightness.values) {
        expect(
          HubArt.resolve(art, '/games/mental-rotation', theme),
          HubArt.mentalRotationPath(theme),
        );
      }
    },
  );
}

import 'dart:convert';

import 'package:flutter/services.dart';

/// Decorative covers only. Routes, progress and launch actions stay in hubs.json.
/// Query parameters are significant: two modes must not silently share a cover.
abstract final class HubArt {
  static const manifest = 'assets/hub_art/index.json';
  static const mentalRotation = 'mental-rotation.webp';

  static Future<Map<String, dynamic>> load() async {
    final bytes = await rootBundle.load(manifest);
    return jsonDecode(
      utf8.decode(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
      ),
    ) as Map<String, dynamic>;
  }

  static String? resolve(
    Map<String, dynamic> index,
    String route,
    Brightness brightness,
  ) {
    final entry = (index['byRoute'] as Map?)?[route] as Map?;
    final path = entry?[brightness.name];
    return path is String ? path : null;
  }

  static String mentalRotationPath(Brightness brightness) =>
      'assets/hub_art/${brightness.name}/$mentalRotation';
}

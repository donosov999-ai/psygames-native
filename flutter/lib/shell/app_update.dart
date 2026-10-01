library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// 🔴 ПРОВЕРКА ОБНОВЛЕНИЙ — ТЕМ ЖЕ ПРАВИЛОМ, ЧТО У ВЕБА (`frontend/src/services/appUpdates.ts`).
///
/// ⚠️ ИСТОЧНИК ЗАСТЫЛ. `psy-games.pro/play/version.json` отвечает `2.54.24` (замер 02.10.2026),
/// а приложение уже 2.56.4: раздел `/play` сняли 09.09, и выпуск этот файл больше не обновляет.
/// Кнопка поэтому всегда говорит «последняя версия». Перенесено как есть — чинить источник
/// (выпуск пишет файл или проверка идёт в магазин) отдельной задачей координатора.
class AppUpdate {
  static const versionUrl = 'https://psy-games.pro/play/version.json';

  /// Запрос свежей версии; пробы подменяют его, экран зовёт как есть.
  static Future<String?> Function() fetchLatest = _fetch;

  static Future<String?> _fetch() async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final req = await client.getUrl(Uri.parse('$versionUrl?ts=${DateTime.now().millisecondsSinceEpoch}'));
      final res = await req.close().timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final j = jsonDecode(await res.transform(utf8.decoder).join());
      final v = j is Map ? '${j['version'] ?? ''}' : '';
      return v.isEmpty ? null : v;
    } catch (_) {
      return null;
    } finally {
      client.close(force: true);
    }
  }

  /// `isNewer`: a > b по числам semver; нечисловое — не сравниваем.
  static bool isNewer(String a, String b) {
    final pa = a.split('.').map(int.tryParse).toList(), pb = b.split('.').map(int.tryParse).toList();
    if (pa.contains(null) || pb.contains(null)) return false;
    for (var i = 0; i < 3; i++) {
      final d = (i < pa.length ? pa[i]! : 0) - (i < pb.length ? pb[i]! : 0);
      if (d != 0) return d > 0;
    }
    return false;
  }

  /// `updateUrl`: в магазин своей платформы (решение Дениса 23.09.2026).
  static String storeUrl() => switch (defaultTargetPlatform) {
        TargetPlatform.iOS => 'https://apps.apple.com/app/id6779208225',
        TargetPlatform.android => 'https://play.google.com/store/apps/details?id=com.psygames.app',
        _ => 'https://psy-games.pro/#download',
      };
}

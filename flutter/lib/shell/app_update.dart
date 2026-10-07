library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

/// 🔴 ПРОВЕРКА ОБНОВЛЕНИЙ — ТЕМ ЖЕ ПРАВИЛОМ, ЧТО У ВЕБА (`frontend/src/services/appUpdates.ts`).
///
/// Источник — `https://psy-games.pro/releases.json`, строка НА КАЖДУЮ ПЛАТФОРМУ:
/// `{"android": "2.56.6", "ios": "", "desktop": ""}` (задача ea32be45, #166). Магазины выпускают
/// в разное время; пустая строка = «магазин её ещё не выпустил» = молчим, как веб.
/// ⚠️ Прежний `/play/version.json` застыл на 2.54.24 и всегда отвечал «у вас последняя».
/// Запрос — из Dart, а не из страницы: у сайта нет CORS для WebView.
class AppUpdate {
  static const versionUrl = 'https://psy-games.pro/releases.json';

  /// Запрос свежей версии; пробы подменяют его, экран зовёт как есть.
  static Future<String?> Function() fetchLatest = _fetch;

  /// `updatePlatform`: чью строку releases.json читать.
  static String platformKey() => switch (defaultTargetPlatform) {
        TargetPlatform.iOS => 'ios',
        TargetPlatform.android => 'android',
        _ => 'desktop',
      };

  /// `latestFor`: свежая версия ДЛЯ ПЛАТФОРМЫ; нет строки — '' (молчим).
  static String latestFor(Object? j, String platform) {
    final v = j is Map ? j[platform] : null;
    return v is String ? v.trim() : '';
  }

  static Future<String?> _fetch() async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final req = await client.getUrl(Uri.parse('$versionUrl?ts=${DateTime.now().millisecondsSinceEpoch}'));
      final res = await req.close().timeout(const Duration(seconds: 8));
      if (res.statusCode != 200) return null;
      final v = latestFor(jsonDecode(await res.transform(utf8.decoder).join()), platformKey());
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

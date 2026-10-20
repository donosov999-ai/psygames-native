import 'package:flutter/services.dart' show AssetBundle;

import 'asset_json.dart';
import 'l10n.dart';

/// Raw archive only: generated from the complete WHATS_NEW TS literal.
/// Never cache localized models or futures born in another widget's lifecycle.
class WhatsNewData {
  WhatsNewData._();

  static Future<Map<String, Object?>> load({AssetBundle? bundle}) async {
    final data = await loadJsonAsset('assets/whats_new.json', bundle: bundle);
    final entries = data['entries'];
    if (entries is! List || entries.isEmpty) {
      throw const FormatException('Missing release archive');
    }
    for (final e in entries) {
      if (e is! Map ||
          e['version'] is! String ||
          e['date'] is! String ||
          e['ru'] is! List ||
          e['en'] is! List ||
          !(e['ru'] as List).every((it) => it is String) ||
          !(e['en'] as List).every((it) => it is String)) {
        throw const FormatException('Invalid release archive');
      }
    }
    return data;
  }
}

/// Exact schema of frontend/app/whats-new.tsx; all non-RU notes remain EN.
/// UI strings are resolved now, not before asynchronous asset/package loading.
Map<String, Object?> whatsNewModel(
  Map<String, Object?> data, {
  required String version,
  required String primary,
}) => {
  'v': 1,
  'title': L.t('versionHistory'),
  'back': L.t('a11yBack'),
  'backIcon': L.locale == 'ar' ? 'arrow-forward' : 'arrow-back',
  'primary': primary,
  'check': '${L.t('updCheckBtn')} · v$version',
  'entries': [
    for (final e in (data['entries'] as List).cast<Map>())
      {
        'version': 'v${e['version']}',
        'date': e['date'],
        'items': e[L.locale == 'ru' ? 'ru' : 'en'],
      },
  ],
};

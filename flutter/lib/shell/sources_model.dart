import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import 'l10n.dart';
import 'shared_state.dart';
import 'web_theme.dart';

/// «ИСТОЧНИКИ» — МОДЕЛЬ ЭКРАНА НА DART (задача d6a60b02, вариант Б, первый экран).
///
/// Решение Дениса 07.10: логика экранов переезжает на Dart экран за экраном, WebView уходит. На время
/// переезда расчёт есть в двух местах — `sourcesModel` веба (`frontend/app/sources.tsx`) и этот; эталон
/// сверки — модель, выгруженная с настоящего веб-экрана (`flutter/test/fixtures/sources_model*.json`,
/// проба `sources_model_test.dart`). Данные не переписаны руками: `assets/sources.json` выгружает
/// `tools/embed-sources.mjs` из констант веба.
class SourcesData {
  SourcesData._();

  static Map<String, Object?>? _cache;

  /// Список источников и авторов записей из сборки (один раз за запуск).
  static Future<Map<String, Object?>> load() async =>
      _cache ??= (jsonDecode(await rootBundle.loadString('assets/sources.json')) as Map).cast<String, Object?>();
}

String _hex(int argb) => '#${(argb & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Та же модель, что отдаёт веб: строки на языке человека ([L]), цвет профиля — `primary`.
Map<String, Object?> sourcesModel(Map<String, Object?> data, {required String primary}) {
  String? opt(Object? key, Object? raw) => key is String && key.isNotEmpty ? L.t(key) : raw as String?;
  return {
    'v': 1,
    'title': L.t('sourcesTitle'),
    'back': L.t('back'),
    'intro': L.t('sourcesIntro'),
    'primary': primary,
    'cards': [
      for (final s in (data['sources'] as List? ?? const []).cast<Map>())
        {
          'name': opt(s['nameKey'], s['name']),
          'what': L.t('${s['key']}'),
          'license': s['license'],
          'credit': s['credit'] == null ? null : opt(s['creditKey'], s['credit']),
          'url': s['url'],
        },
    ],
    'voices': {
      'title': L.t('voiceCreditsTitle'),
      'rows': [
        for (final v in (data['voices'] as List? ?? const []).cast<Map>())
          {'author': v['author'], 'license': v['license'], 'count': '${v['count']}'},
      ],
    },
  };
}

/// Модель «Источников» для этого человека: язык — [L], цвет — профиля ([WebTheme.accent]).
Future<Map<String, Object?>> sourcesModelFor(SharedState state) async =>
    sourcesModel(await SourcesData.load(), primary: _hex(WebTheme.accent(state).toARGB32()));

import 'dart:convert';

import 'package:flutter/services.dart' show AssetBundle, rootBundle;

/// JSON-АССЕТ СБОРКИ — БАЙТАМИ И СВОИМ `utf8.decode`, А НЕ `rootBundle.loadString`.
///
/// `loadString` кэширует БУДУЩЕЕ строки (`CachingAssetBundle`), а от 50 КБ разбирает её в изоляте. В
/// пробах виджетов обе стороны вешают экран: будущее, рождённое в поддельном времени прошлой пробы, в
/// следующей не завершается (📍 07.10: «Прогресс» во второй пробе `native_tabs_shell_test` ждал
/// `catalog.json`, 36 КБ, вечно; поодиночке проба зелёная). У `load` кэша нет. Загрузчики варианта Б
/// (d6a60b02) держат разобранное значение у себя.
Future<Map<String, Object?>> loadJsonAsset(String path, {AssetBundle? bundle}) async {
  final b = await (bundle ?? rootBundle).load(path);
  return (jsonDecode(utf8.decode(b.buffer.asUint8List(b.offsetInBytes, b.lengthInBytes))) as Map).cast<String, Object?>();
}

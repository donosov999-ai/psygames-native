/// КРУПНЫЙ JSON-АССЕТ — БАЙТАМИ, А НЕ `loadString`.
///
/// 🔴 `AssetBundle.loadString` строку от 50 КБ отдаёт в `compute()` — отдельный
/// изолят; в пробах `testWidgets` время поддельное, изолят не дожидается, и загрузка
/// висит до таймаута в 10 минут. Так уже повисла чужая проба на `ru.json`
/// (`lib/shell/l10n.dart`). Словари раздела крупнее порога: переводы — 55 КБ,
/// таблица «коварных» — 124 КБ. Цена в приложении — синхронный разбор один раз
/// при открытии экрана.
library;

import 'dart:convert';

import 'package:flutter/services.dart' show AssetBundle, rootBundle;

Future<Object?> loadJsonAsset(String path, {AssetBundle? bundle}) async {
  final data = await (bundle ?? rootBundle).load(path);
  return jsonDecode(utf8.decode(data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes)));
}

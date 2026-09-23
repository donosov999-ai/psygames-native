import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// КАЖДЫЙ ФАЙЛ ИЗ `assets/` ОБЯЗАН ПОПАСТЬ В СБОРКУ.
///
/// 🔴 ЗАЧЕМ. Строка `- assets/words/` в pubspec берёт ТОЛЬКО файлы самой папки:
/// вложенные каталоги молча не попадают в сборку, и — вот в чём беда — сборка
/// при этом ЗЕЛЁНАЯ. Ни ошибки, ни предупреждения. Денис потерял на этом заход
/// 23.09.2026: получил 17,9 МБ вместо 101,5 и заметил только по размеру.
///
/// Проба спрашивает не «есть ли строка в pubspec», а «дошёл ли файл до
/// приложения»: список с диска сверяется с `AssetManifest.json` — тем самым
/// перечнем, по которому рисуется настоящая сборка. Забыли каталог — красная
/// строка с его именем, а не тихий недовес.
///
/// ⚠️ Проба нарочно НЕ знает про `words` и `levels` поимённо: она обходит
/// `assets/` целиком. Заведут каталог и забудут pubspec — поймает и его.
///
/// ⚠️ Имена здесь латиницей: Dart не допускает не-ASCII в идентификаторах
/// (`The non-ASCII character 'й' can't be used in identifiers`). Кириллица
/// живёт в комментариях и в тексте сообщений — там, где её читает человек.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('🔴 все файлы из assets/ дошли до сборки, включая вложенные каталоги', () async {
    final root = Directory('assets');
    expect(root.existsSync(), isTrue, reason: 'каталога assets/ нет — проба потеряла предмет');

    final onDisk = root
        .listSync(recursive: true)
        .whereType<File>()
        .map((f) => f.path.replaceAll(r'\', '/'))
        .where((p) => !p.split('/').last.startsWith('.'))
        .toList()
      ..sort();
    expect(onDisk, isNotEmpty, reason: 'в assets/ нет ни одного файла');

    // AssetManifest.loadFromAssetBundle — поддерживаемый способ прочитать
    // перечень сборки; со свежих версий Flutter манифест лежит двоичным
    // (), и чтение  строкой падает.
    final manifest = await AssetManifest.loadFromAssetBundle(rootBundle);
    final bundled = manifest.listAssets().toSet();

    final missing = onDisk.where((p) => !bundled.contains(p)).toList();
    expect(
      missing,
      isEmpty,
      reason: 'не объявлены в pubspec (каталоги указывают ПОИМЁННО, вложенные тоже): '
          '${missing.join(", ")}',
    );
  });

  test('🔴 словари анаграмм на месте и не пустые — десять языков', () async {
    const langs = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru'];
    for (final l in langs) {
      final raw = await rootBundle.loadString('assets/words/$l.json');
      final packs = jsonDecode(raw) as List;
      expect(packs, isNotEmpty, reason: '$l: набор пуст');
      final first = packs.first as Map<String, dynamic>;
      expect(first['base'], isA<String>(), reason: '$l: у пакета нет базы');
      expect(first['words'], isA<List>(), reason: '$l: у пакета нет слов');
    }
  });
}

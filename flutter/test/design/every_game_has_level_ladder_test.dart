import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 У ВСЕХ ИГР — ОБЩИЕ ФУНКЦИИ УРОВНЕЙ: карта уровней, «Уровень проще / сложнее» в паузе, звёзды.
///
/// Денис 12.11.2026: «все функции должны быть у всех 131 игр»; «либо всем 131, либо не делай».
/// Эти функции рисует каркас (`GameShell`, `shell/level_map.dart`) и пишет общая лестница
/// (`LevelLadder`) — у игры, которая её не держит, их нет вовсе.
///
/// 📍 Замер 12.11 (задача c345a8f1): по манифесту 131 через лестницу шли 127 игр; без неё — «Фрактал:
/// Бездна», «Дыхание», «Глаза и дыхание», «Гимнастика для глаз». Подключены тем же PR. Сторож держит
/// это состояние: новая папка игры с экраном на каркасе, но без лестницы — красный CI.
void main() {
  // Хабы — меню раздела, не игра.
  bool isHub(String dir) => dir.endsWith('_hub');

  test('каждая игра с экраном на каркасе держит общую лестницу уровней', () {
    final missing = <String>[];
    for (final dir in Directory('lib/games').listSync().whereType<Directory>()) {
      final name = dir.path.replaceAll(r'\', '/').split('/').last;
      if (isHub(name)) continue;
      final texts = [
        for (final f in dir.listSync(recursive: true).whereType<File>())
          if (f.path.endsWith('.dart')) f.readAsStringSync(),
      ];
      if (!texts.any((t) => t.contains('GameShell('))) continue; // движок без экрана (раннер, словари)
      if (!texts.any((t) => t.contains('LevelLadder('))) missing.add(name);
    }
    expect(
      missing,
      isEmpty,
      reason:
          'игра без LevelLadder — у неё нет карты уровней, «проще / сложнее» и звёзд; '
          'подключи общую лестницу (правило Дениса 12.11: все функции — у всех 131 игр)',
    );
  });
}

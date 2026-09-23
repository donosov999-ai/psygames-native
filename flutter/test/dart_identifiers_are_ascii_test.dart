import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ИМЕНА В DART — ТОЛЬКО ЛАТИНИЦЕЙ. Кириллица живёт в комментариях и в тексте.
///
/// 🔴 ЗАЧЕМ ГЕЙТ, А НЕ ПАМЯТЬ. За один переезд я споткнулся об это ТРИЖДЫ:
/// `The non-ASCII character 'й' (U+0439) can't be used in identifiers`. Правило
/// известно, компилятор его ловит — но ловит на сборке, то есть уже потратив
/// заход. Дешевле поймать пробой, которая называет файл и строку.
///
/// ⚠️ Проба смотрит ТОЛЬКО на объявления (`final`, `var`, `const`, `late`) — там,
/// где имя вводится. Комментарии, строки и подписи для человека она не трогает:
/// кириллица в них не ошибка, а смысл. Разбирать Dart целиком ради четырёх
/// ключевых слов было бы дороже самой беды.
void main() {
  test('🔴 объявления переменных в lib/ и test/ — без кириллицы в именах', () {
    final bad = <String>[];
    final decl = RegExp(r'\b(?:final|var|const|late)\s+([A-Za-z_$][\w$]*|\S+)');
    for (final dir in ['lib', 'test']) {
      for (final f in Directory(dir).listSync(recursive: true).whereType<File>()) {
        if (!f.path.endsWith('.dart')) continue;
        final lines = f.readAsLinesSync();
        for (var i = 0; i < lines.length; i++) {
          final line = lines[i];
          // Строки и комментарии отбрасываем: там кириллица законна.
          final code = line.split('//').first.replaceAll(RegExp(r"'[^']*'"), "''");
          for (final m in decl.allMatches(code)) {
            final name = m.group(1)!;
            if (RegExp(r'[^\x00-\x7F]').hasMatch(name)) {
              bad.add('${f.path}:${i + 1}: $name');
            }
          }
        }
      }
    }
    expect(bad, isEmpty,
        reason: 'имена латиницей — Dart не компилирует не-ASCII идентификаторы:\n${bad.join("\n")}');
  });
}

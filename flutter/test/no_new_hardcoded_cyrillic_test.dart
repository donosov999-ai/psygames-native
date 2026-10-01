import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ЗАШИТЫХ РУССКИХ СТРОК В КОДЕ НЕ СТАНОВИТСЯ БОЛЬШЕ — ХРАПОВИК ПО КАЖДОМУ ФАЙЛУ.
///
/// 📍 ПОВОД, 01.10.2026. После #95 нативная половина говорит на языке телефона — и на
/// английском телефоне живьём видно «Ханойская башня» (`hanoi/screen.dart`, `static const _title`):
/// заголовок зашит в код и словаря не видит. Замер в тот же день: литералов с кириллицей в
/// `flutter/lib` (без комментариев) — 915, у 40 с лишним папок. У веба то же правило давно
/// держит гейт `ci-i18n-hardcode-guard`; у Flutter его не было, поэтому долг только рос.
///
/// КАК УСТРОЕНО. База — `test/fixtures/hardcoded_cyrillic_baseline.json`: число литералов на файл.
/// Проба краснеет, если у файла их стало БОЛЬШЕ базы (или появился новый файл с кириллицей).
/// Меньше — хорошо: обновите базу, чтобы храповик защёлкнулся ниже:
///   flutter test test/no_new_hardcoded_cyrillic_test.dart --dart-define=UPDATE_CYRILLIC_BASELINE=true
/// Законные данные (слова языковых игр, регулярные выражения) лежат в базе как есть — их число
/// просто не должно расти; переносить данные в ассеты — отдельная работа раздела.
///
/// Что считается: строковый литерал в одинарных или двойных кавычках, внутри которого есть буква
/// кириллицы, на строке кода. Строки-комментарии (`//`, `///`, `*`, `/*`) и хвост после `//`
/// не считаются.
void main() {
  const update = bool.fromEnvironment('UPDATE_CYRILLIC_BASELINE');
  final baselineFile = File('test/fixtures/hardcoded_cyrillic_baseline.json');
  final literal = RegExp(r'''(['"])((?:(?!\1).)*[А-Яа-яЁё](?:(?!\1).)*)\1''');

  Map<String, int> measure() {
    final out = <String, int>{};
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      var n = 0;
      for (final line in f.readAsLinesSync()) {
        final t = line.trimLeft();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
        final code = line.split('//').first;
        n += literal.allMatches(code).length;
      }
      if (n > 0) out[f.path.replaceAll(r'\', '/')] = n;
    }
    return Map.fromEntries(out.entries.toList()..sort((a, b) => a.key.compareTo(b.key)));
  }

  test('зашитых русских строк ни в одном файле не стало больше базы', () {
    final now = measure();
    final total = now.values.fold<int>(0, (a, b) => a + b);
    if (update) {
      baselineFile.writeAsStringSync('${const JsonEncoder.withIndent(' ').convert(now)}\n');
      markTestSkipped('база перезаписана: $total литералов в ${now.length} файлах');
      return;
    }
    final base = (jsonDecode(baselineFile.readAsStringSync()) as Map<String, dynamic>)
        .map((k, v) => MapEntry(k, v as int));
    final grew = <String>[
      for (final e in now.entries)
        if (e.value > (base[e.key] ?? 0)) '${e.key}: было ${base[e.key] ?? 0}, стало ${e.value}',
    ];
    expect(grew, isEmpty,
        reason: 'новые зашитые русские строки — выносите в словарь L.t (ключ во все 12 языков в том же '
            'коммите). Всего сейчас $total.\n${grew.join('\n')}');
  });
}

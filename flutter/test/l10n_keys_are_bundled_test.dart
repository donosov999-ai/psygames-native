import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 КАЖДЫЙ КЛЮЧ, КОТОРЫЙ ЗОВЁТ ЭКРАН, ОБЯЗАН ЛЕЖАТЬ В СОБРАННОМ СЛОВАРЕ.
///
/// 📍 ЗАЧЕМ ЭТА ПРОБА ПОЯВИЛАСЬ (замер 24.09.2026). Словарь для нативной половины
/// вырезается из веб-словаря инструментом `tools/embed-l10n.mjs`: он ищет в
/// исходниках вызовы и забирает только названные ключи. Регулярка искала ТОЛЬКО
/// `L.t(` — и ключ, живущий исключительно в `L.f(` (это вариант со вставкой
/// чисел), молча не попадал в сборку. На экране вместо текста показался бы САМ
/// КЛЮЧ: `L.t` при промахе возвращает ключ, а не падает.
///
/// Поймано на `tolWonPreset` («Лондонская башня»). Три соседних экрана
/// (`levelDone` у «Лиц и имён», «Дворца памяти», «Пар слов») уцелели случайно —
/// тот же ключ зовётся у них ещё и через `L.t`.
///
/// ⚠️ ПОЧЕМУ ЭТОГО НЕ ВИДЕЛА НИ ОДНА ПРОБА ЭКРАНОВ: они сверяют текст с тем, что
/// экран показывает, а показывал он ключ — обе стороны совпадали. Ловится только
/// сверкой «что зовём» против «что собрано».
void main() {
  /// Комментарии отсекаем: в описании `L.f` стоит пример вызова, и без этого
  /// проба требовала бы ключ, которого не зовёт ни один экран.
  String withoutComments(String src) => src
      .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
      .replaceAll(RegExp(r'//.*$', multiLine: true), '');

  test('🔴 ни один зовущийся ключ не потерялся при сборке словаря', () {
    final call = RegExp(r"\bL\.[tf]\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'");
    final used = <String, String>{};   // ключ → где зовут
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      for (final m in call.allMatches(withoutComments(f.readAsStringSync()))) {
        used.putIfAbsent(m.group(1)!, () => f.path);
      }
    }
    expect(used.length, greaterThan(50), reason: 'вызовов словаря подозрительно мало — не сломан ли поиск');

    final ru = jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map<String, dynamic>;
    final missing = used.entries
        .where((e) => !ru.containsKey(e.key))
        .map((e) => '${e.key} (зовёт ${e.value})')
        .toList()
      ..sort();
    expect(missing, isEmpty,
        reason: 'ключ зовут, а в словаре его нет — экран покажет САМ КЛЮЧ.\n'
            'Завести в frontend/src/contexts/LanguageContext.tsx и прогнать '
            'node flutter/tools/embed-l10n.mjs');
  });

  test('во всех двенадцати языках собран ОДИН И ТОТ ЖЕ набор ключей', () {
    // ⚠️ В той же папке лежат НЕ словари, а данные упражнений
    // (`stop-signal.json`, `proofreading-scripts.json`, …). Перебирать папку
    // целиком нельзя: проба краснела бы на исправной сборке.
    const locales = ['ru', 'en', 'es', 'de', 'zh', 'hi', 'pt', 'fr', 'it', 'ja', 'ko', 'ar'];
    final ru = jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map<String, dynamic>;
    final drifted = <String>[];
    for (final code in locales) {
      final f = File('assets/l10n/$code.json');
      if (!f.existsSync()) {
        drifted.add('$code: словаря нет вовсе');
        continue;
      }
      final d = jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
      final absent = ru.keys.where((k) => !d.containsKey(k)).toList();
      if (absent.isNotEmpty) {
        drifted.add('$code: нет ${absent.length} ключей, например ${absent.first}');
      }
    }
    expect(drifted, isEmpty, reason: 'словари языков разъехались по составу');
  });
}

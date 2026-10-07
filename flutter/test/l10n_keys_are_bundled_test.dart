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

  test('🔴 ключ ВНУТРИ выражения — тернарника, switch, ?? — тоже обязан лежать в словаре', () {
    // 02.10.2026, «Самурай»/«Фрактал» (#213): `L.t(restart ? 'restartConfirmTitle' : 'exitConfirmTitle')`
    // — embed-l10n берёт только `L.t('литерал')`, оба ключа в словарь не попали, в заголовке диалога
    // стоял сырой ключ. Проба выше смотрит тоже только литерал первым аргументом — была слепа.
    // Второй случай того же класса за два дня (01.10 «Парные картинки», #121). Здесь вызов разбирается
    // до закрывающей скобки, и КАЖДЫЙ строковый литерал-идентификатор внутри сверяется со словарём.
    final ru = jsonDecode(File('assets/l10n/ru.json').readAsStringSync()) as Map<String, dynamic>;
    final head = RegExp(r'\bL\.[tf]\(');
    final literal = RegExp(r"'([a-zA-Z_][a-zA-Z0-9_]*)'");
    final missing = <String>{};
    var inside = 0;
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final src = withoutComments(f.readAsStringSync());
      for (final m in head.allMatches(src)) {
        var depth = 1, j = m.end;
        while (j < src.length && depth > 0) {
          final ch = src[j];
          if (ch == '(') depth++;
          if (ch == ')') depth--;
          j++;
        }
        final arg = src.substring(m.end, j - 1).trim();
        if (RegExp(r"^'[a-zA-Z_][a-zA-Z0-9_]*'(\s*,|$)").hasMatch(arg)) continue;   // простой случай — выше
        final keyPart = arg.split(RegExp(r",\s*\{")).first;   // L.f('k', {...}) — подстановки не ключи
        // Не ключи: куски внутри \${…} (составной ключ собирается списком `const …Keys`) и ключи карт ['…'].
        var expr = keyPart;
        for (var n = 0; n < 4; n++) {
          expr = expr.replaceAll(RegExp(r'\$\{[^{}]*\}'), r'$X');
        }
        expr = expr.replaceAll(RegExp(r"\[\s*'[^']*'\s*\]"), '[X]');
        // И аргументы вложенных вызовов — `LevelRules.textKey(id, rule, 'title')` строит ключ сам.
        for (var n = 0; n < 4; n++) {
          expr = expr.replaceAll(RegExp(r'[A-Za-z_][\w.]*\([^()]*\)'), 'X');
        }
        for (final k in literal.allMatches(expr)) {
          inside++;
          if (!ru.containsKey(k.group(1))) missing.add('${k.group(1)} (${f.path})');
        }
      }
    }
    expect(inside, greaterThan(0), reason: 'ни одного ключа внутри выражений — не сломан ли разбор');
    expect(missing.toList()..sort(), isEmpty,
        reason: 'ключ внутри выражения не собран — экран покажет САМ КЛЮЧ. Каждый ключ — своим L.t(\'…\')');
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

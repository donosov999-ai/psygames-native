import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 ЗАШИТЫХ ЦВЕТОВ В КОДЕ НЕ СТАНОВИТСЯ БОЛЬШЕ — ХРАПОВИК ДИЗАЙНА «АВРОРА».
///
/// 📍 ПОВОД, 28.10.2026. План обновления дизайна (Codex: `design-refresh-20261024`, координатор 28.10):
/// одна дизайн-система на всё приложение, владелец — каркас. Замер на main 2ed016951: `Color(0x…)` в
/// `lib/games` — 607, в `lib/shell` — 187, семантических цветов игр (верно, ошибка, выбор, подсветка) нет.
/// Если каждый раздел перекрасит свои экраны сам, общего дизайна не будет. Поэтому число зашитых цветов
/// может только падать: новый цвет игры — роль в `GameColors` каркаса (задачей каркасу), а не литерал.
///
/// КАК УСТРОЕНО. База — `test/fixtures/hardcoded_colors_baseline.json`:
///   · `games/<каталог>` — сумма по каталогу игры (цвет можно переложить внутри игры, но не добавить);
///   · `shell/...` и прочее — по файлу.
/// Краснеет, если где-то стало БОЛЬШЕ базы или появился новый носитель. Меньше — хорошо, защёлкните базу:
///   flutter test test/design/hardcoded_colors_ratchet_test.dart --dart-define=UPDATE_COLORS_BASELINE=true
/// Цвета стимулов (Струп и т. п.) законны и лежат в базе как есть — их число просто не растёт.
///
/// Что считается: `Color(0x`, `Color.fromARGB(`, `Color.fromRGBO(` на строке кода. Строки-комментарии
/// (`//`, `///`, `*`, `/*`) и хвост после `//` не считаются.
void main() {
  const update = bool.fromEnvironment('UPDATE_COLORS_BASELINE');
  final baselineFile = File('test/fixtures/hardcoded_colors_baseline.json');
  final color = RegExp(r'Color\(0x|Color\.fromARGB\(|Color\.fromRGBO\(');

  String keyOf(String path) {
    final p = path.replaceAll(r'\', '/');
    final m = RegExp(r'^lib/games/([^/]+)/').firstMatch(p);
    return m != null ? 'games/${m.group(1)}' : p.replaceFirst('lib/', '');
  }

  int count(File f) {
    var n = 0;
    for (final line in f.readAsLinesSync()) {
      final t = line.trimLeft();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
      n += color.allMatches(line.split('//').first).length;
    }
    return n;
  }

  Map<String, int> measure() {
    final out = <String, int>{};
    for (final f in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart') || f.path.endsWith('.g.dart')) continue;
      // Сама палитра ролей — единственное законное место цветов-литералов.
      if (f.path.replaceAll(r'\', '/').endsWith('lib/shell/game_colors.dart')) continue;
      final n = count(f);
      if (n > 0) out.update(keyOf(f.path), (v) => v + n, ifAbsent: () => n);
    }
    return Map.fromEntries(out.entries.toList()..sort((a, b) => a.key.compareTo(b.key)));
  }

  test('зашитых цветов ни в одной игре и ни в одном файле каркаса не стало больше базы', () {
    final now = measure();
    final total = now.values.fold<int>(0, (a, b) => a + b);
    if (update) {
      baselineFile.writeAsStringSync('${const JsonEncoder.withIndent(' ').convert(now)}\n');
      markTestSkipped('база перезаписана: $total цветов у ${now.length} носителей');
      return;
    }
    final base = (jsonDecode(baselineFile.readAsStringSync()) as Map<String, dynamic>).map(
      (k, v) => MapEntry(k, v as int),
    );
    final grew = <String>[
      for (final e in now.entries)
        if (e.value > (base[e.key] ?? 0)) '${e.key}: было ${base[e.key] ?? 0}, стало ${e.value}',
    ];
    expect(
      grew,
      isEmpty,
      reason:
          'новый зашитый цвет — возьмите роль из темы каркаса (GameColors / colorScheme) или поставьте задачу '
          'psygames-shell-claude-mac на новую роль. Всего сейчас $total.\n${grew.join('\n')}',
    );
  });

  test('счётчик видит все три записи цвета и не видит комментарии — проверка самой пробы', () {
    final tmp = Directory.systemTemp.createTempSync('colors_ratchet');
    addTearDown(() => tmp.deleteSync(recursive: true));
    final f = File('${tmp.path}/a.dart')
      ..writeAsStringSync('''
const a = Color(0xFF112233);
final b = Color.fromARGB(255, 1, 2, 3), c = Color.fromRGBO(1, 2, 3, 1);
// const d = Color(0xFF000000);
/// Color(0xFF000000) в документации
const e = Colors.red; // Color(0xFF000000)
''');
    expect(count(f), 3);
  });

  test('ключ носителя: игра — каталогом, каркас — файлом', () {
    expect(keyOf('lib/games/sudoku/screen.dart'), 'games/sudoku');
    expect(keyOf('lib/games/sudoku/modes/killer.dart'), 'games/sudoku');
    expect(keyOf('lib/shell/game_shell.dart'), 'shell/game_shell.dart');
  });
}

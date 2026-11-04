import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 У ВСЕХ ИГР ОДИН ИНТЕРФЕЙС: шапку, нижний тулбар, кнопку паузы и меню паузы рисует ОДИН
/// каркас `GameShell`, игра передаёт только содержимое (CHATS_RULES.md §1в).
///
/// Денис 04.11.2026: «у всех игр должен быть общий футер и баннер, только часть кнопок на нём
/// меняется; кнопка паузы и её меню отрисованы и тоже везде общие, в меню паузы состав кнопок
/// может меняться… моя цель — чтобы у всех 120 игр был общий интерфейс»; «чтобы каждый чат
/// не рисовал своё».
///
/// 📍 Замер 04.11 (main `5eaa54a85`): 96 файлов `screen.dart` в `lib/games`; без `GameShell`
/// только 6 хабов-меню (`*_hub`), игр среди них нет. Своих `AppBar`/нижних панелей в играх нет;
/// `Scaffold` — только заглушка загрузки. Нарушение одно: «Пауза / Зарядка» держала свою кнопку
/// «Пауза» рядом с жёлтой паузой каркаса — две паузы на экране; убрана тем же PR.
///
/// Сторож держит это состояние: новый экран со своей шапкой, панелью или паузой — красный CI.
void main() {
  // Хабы — меню раздела, не игра: список игр со своей шапкой раздела.
  bool isHub(String path) => RegExp(r'lib/games/\w+_hub/').hasMatch(path);

  List<(String, String)> gameFiles() => [
        for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>())
          if (f.path.endsWith('.dart') && !isHub(f.path.replaceAll(r'\', '/')))
            (f.path.replaceAll(r'\', '/'), f.readAsStringSync()),
      ];

  int lineOf(String text, int offset) => '\n'.allMatches(text.substring(0, offset)).length + 1;

  test('каждый экран игры собран на GameShell', () {
    final missing = [
      for (final (path, text) in gameFiles())
        if (RegExp(r'(^|/)(\w+_)?screen\.dart$').hasMatch(path) && !text.contains('GameShell(')) path,
    ];
    expect(missing, isEmpty, reason: 'экран игры без GameShell — своя рамка; собери на GameShell (CHATS_RULES.md §1в)');
  });

  test('своей шапки и нижней панели у игры нет', () {
    final bad = RegExp(r'\bAppBar\(|\bappBar:|\bbottomNavigationBar:|\bBottomAppBar\(|\bNavigationBar\(');
    final found = [
      for (final (path, text) in gameFiles())
        for (final m in bad.allMatches(text)) '$path:${lineOf(text, m.start)} ${m.group(0)}',
    ];
    expect(found, isEmpty, reason: 'шапку и низ рисует каркас; игре — title/hud/auxRow (CHATS_RULES.md §1в)');
  });

  test('Scaffold в игре — только заглушка загрузки, без своей обвязки', () {
    final chrome = RegExp(r'\b(appBar|bottomNavigationBar|floatingActionButton|drawer|endDrawer|bottomSheet|persistentFooterButtons):');
    final found = <String>[];
    for (final (path, text) in gameFiles()) {
      for (final m in RegExp(r'\bScaffold\(').allMatches(text)) {
        if (chrome.hasMatch(_call(text, m.end - 1))) found.add('$path:${lineOf(text, m.start)}');
      }
    }
    expect(found, isEmpty, reason: 'свой Scaffold с панелями вокруг игры — своя рамка (CHATS_RULES.md §1в)');
  });

  test('своей кнопки паузы у игры нет: пауза одна — жёлтая каркаса, меню общее', () {
    // Значок паузы на кнопке/действии игры = вторая пауза. Состав меню игра задаёт через
    // pauseActions, саму паузу не рисует.
    final pauseIcon = RegExp(r'Icons\.pause(_circle\w*|_rounded|_outlined)?\b');
    final button = RegExp(r'\b(AuxAction|IconButton|FilledButton|OutlinedButton|TextButton|ElevatedButton|FloatingActionButton)(\.\w+)?\(');
    final found = <String>[];
    for (final (path, text) in gameFiles()) {
      for (final m in button.allMatches(text)) {
        if (pauseIcon.hasMatch(_call(text, m.end - 1))) found.add('$path:${lineOf(text, m.start)}');
      }
    }
    expect(found, isEmpty, reason: 'вторая пауза на экране; паузу и её меню рисует каркас, игра — pauseActions (CHATS_RULES.md §1в)');
  });
}

/// Текст вызова от открывающей скобки до парной закрывающей.
String _call(String text, int open) {
  var depth = 0;
  for (var i = open; i < text.length; i++) {
    final c = text[i];
    if (c == '(') depth++;
    if (c == ')' && --depth == 0) return text.substring(open, i + 1);
  }
  return text.substring(open);
}

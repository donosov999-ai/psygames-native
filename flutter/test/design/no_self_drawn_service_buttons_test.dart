import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 СЛУЖЕБНЫЕ ДЕЙСТВИЯ — В НИЖНЕМ ТУЛБАРЕ КАРКАСА, А НЕ КНОПКАМИ В ПОЛЕ (стандарт игрового экрана,
/// Денис 31.10: «а то скачет у всех по-разному и каждый делает эту работу заново без шаблона»;
/// CHATS_RULES.md §1в).
///
/// 📍 Замер 31.10 (main 2b9849581): в 41 папке игр нашлись кнопки со значками служебных действий
/// вне `AuxAction`. 43 из 48 — законные: «Ещё раз» / «Дальше» на итоге, выход из тупика. Нарушения —
/// «Отменить», «Где ошибка», «Подсказка» под доской «Коней и ферзей» (перенесены в `AuxAction`);
/// сторож по подписям нашёл ещё 5: «Подсказка» у scholars_mate, solitaire_chess, find_move — перенесены
/// тем же PR; «Повторить звук» 4 игр на слух — в тулбар (Денис 31.10: «тянуться в низ экрана проще,
/// чем в центр»); fractal (подтверждение) — исключение ниже.
///
/// Правило: кнопка (`*Button`, `InkWell`, `GestureDetector`) с подписью служебного действия —
/// только `AuxAction` (нижний тулбар) или `PauseAction` (пауза). Исключения — ниже, с причиной.
void main() {
  // Подписи служебных действий: ключи словаря.
  const service = ['btn_undo', 'btn_hint', 'puzzleWhereError', 'puzzleShowSolution', 'replaySound'];

  // Законные исключения: файл → причина. Новое исключение — только с причиной.
  const allowed = {
    // «Подсказка» появляется в тупике рядом с текстом «застрял» — выход из тупика, а не ряд действий.
    'lib/games/hanoi/screen.dart': 'тупик',
    // Подтверждение «Показать решение?» — сама кнопка уже AuxAction, в поле только «Отмена / Показать».
    'lib/games/fractal/screen.dart': 'подтверждение действия тулбара',
  };

  test('служебные кнопки игр — только AuxAction / PauseAction', () {
    final button = RegExp(r'\b(IconButton|FilledButton|OutlinedButton|TextButton|ElevatedButton|InkWell|GestureDetector)(\.\w+)?\(');
    final label = RegExp("'(${service.join('|')})'");
    final found = <String>[];
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      final path = f.path.replaceAll(r'\', '/');
      if (!path.endsWith('.dart') || allowed.containsKey(path)) continue;
      final text = f.readAsStringSync();
      for (final m in button.allMatches(text)) {
        final call = _call(text, m.end - 1);
        // Внутренний вызов кнопки целиком: подпись служебного действия в нём — нарушение,
        // если сама кнопка не лежит внутри AuxAction/PauseAction (их кнопки рисует каркас).
        if (!label.hasMatch(call)) continue;
        final before = text.substring(0, m.start);
        final opener = [before.lastIndexOf('AuxAction('), before.lastIndexOf('PauseAction(')].reduce((a, b) => a > b ? a : b);
        if (opener >= 0 && _call(text, text.indexOf('(', opener)).length > m.start - opener) continue;
        found.add('$path:${'\n'.allMatches(before).length + 1}');
      }
    }
    expect(found, isEmpty, reason: 'служебная кнопка в поле — перенеси в auxRow: AuxBar(AuxAction…) (CHATS_RULES.md §1в)');
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

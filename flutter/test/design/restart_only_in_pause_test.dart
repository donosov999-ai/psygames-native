import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// 🔴 «ЗАНОВО» ВНИЗУ — ТОЛЬКО ДУБЛЬ ПАУЗЫ (стандарт игрового экрана, Денис 30.10).
///
/// 📍 ПОВОД, 31.10.2026. В 2.56.51 «Заново» убрали из нижнего тулбара «Авроры» у 41 игры
/// (`AuxAction(inPause: true)`), а 8 пропустили: поиск ловил кнопку, записанную в одну строку,
/// а у corsi, counter, faces_names, memory_palace, schulte, sdmt, visual_search она в несколько строк.
/// Денис: «почему 40 а не все». Поэтому проверка — по коду всех игр, а не по списку.
///
/// Правило: кнопка перезапуска нижнего ряда (`Icons.refresh` / `Icons.replay` + подпись `restart`)
/// помечена `inPause: true`. Пауза сама даёт «Заново» каждой игре (свой пункт или общий каркаса),
/// поэтому внизу под «Авророй» его не показываем. Classic не меняется — флаг действует только там.
void main() {
  test('у всех игр «Заново» нижнего ряда помечено inPause', () {
    final restart = RegExp(r"Icons\.(refresh|replay)\b[\s\S]*'restart'|'restart'[\s\S]*Icons\.(refresh|replay)\b");
    final missing = <String>[];
    var checked = 0;
    for (final f in Directory('lib/games').listSync(recursive: true).whereType<File>()) {
      if (!f.path.endsWith('.dart')) continue;
      final text = f.readAsStringSync();
      for (final m in RegExp(r'\bAuxAction\(').allMatches(text)) {
        final call = _call(text, m.end - 1);
        if (!restart.hasMatch(call)) continue;
        checked++;
        if (!call.contains('inPause: true')) {
          final line = '\n'.allMatches(text.substring(0, m.start)).length + 1;
          missing.add('${f.path}:$line');
        }
      }
    }
    expect(checked, greaterThan(40), reason: 'поиск кнопок «Заново» сломан — нашёл слишком мало');
    expect(missing, isEmpty, reason: '«Заново» внизу без inPause: true — под «Авророй» оно только в паузе');
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
